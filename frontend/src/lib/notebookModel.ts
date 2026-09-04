import type {
  CellStatus,
  CellType,
  CircuitData,
  DisplayOutput,
  MimeBundle,
  Notebook,
  NotebookCell,
  NotebookJSON,
  NotebookMetadata,
  NotebookOutput
} from './types';

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const sourceToString = (value: unknown): string => {
  if (Array.isArray(value)) return value.map(String).join('');
  return typeof value === 'string' ? value : '';
};

const validCellType = (value: unknown): CellType => {
  return value === 'markdown' || value === 'raw' || value === 'circuit' ? value : 'code';
};

const validStatus = (value: unknown): CellStatus =>
  value === 'running' || value === 'success' || value === 'error' ? value : 'idle';

const defaultCircuit = (): CircuitData => ({
  version: 1,
  wires: 2,
  gates: [
    { id: 'h-0', type: 'h', wire: 0, column: 0 },
    { id: 'cx-0', type: 'x', wire: 1, column: 1, controls: [0] },
    { id: 'm-0', type: 'measure', wire: 1, column: 2 }
  ]
});

const normalizeOutputs = (value: unknown): NotebookOutput[] => {
  if (!Array.isArray(value)) return [];
  const outputs: NotebookOutput[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    if (item.output_type === 'stream') {
      outputs.push({
        output_type: 'stream',
        name: item.name === 'stderr' ? 'stderr' : 'stdout',
        text: sourceToString(item.text)
      });
    } else if (item.output_type === 'error') {
      outputs.push({
        output_type: 'error',
        ename: String(item.ename ?? 'Error'),
        evalue: String(item.evalue ?? ''),
        traceback: Array.isArray(item.traceback) ? item.traceback.map(String) : item.traceback == null ? [] : [String(item.traceback)]
      });
    } else if (item.output_type === 'display_data' || item.output_type === 'execute_result' || item.output_type === 'update_display_data') {
      const output: DisplayOutput = {
        output_type: item.output_type,
        data: isRecord(item.data) ? clone(item.data) as MimeBundle : {},
        metadata: isRecord(item.metadata) ? clone(item.metadata) : {}
      };
      if (output.output_type === 'execute_result') {
        output.execution_count = typeof item.execution_count === 'number' ? item.execution_count : null;
      }
      if (isRecord(item.transient)) output.transient = clone(item.transient) as Record<string, import('./types').JSONValue>;
      outputs.push(output);
    }
  }
  return outputs;
};

const serializeOutput = (output: NotebookOutput): UnknownRecord => {
  if (output.output_type === 'stream') {
    return { output_type: 'stream', name: output.name, text: clone(output.text) };
  }
  if (output.output_type === 'error') {
    return { output_type: 'error', ename: output.ename, evalue: output.evalue, traceback: clone(output.traceback) };
  }
  // update_display_data and transient are wire-protocol concepts and are not valid
  // persisted nbformat outputs. Store the final value as display_data instead.
  if (output.output_type === 'update_display_data') {
    return { output_type: 'display_data', data: clone(output.data), metadata: clone(output.metadata ?? {}) };
  }
  return {
    output_type: output.output_type,
    data: clone(output.data),
    metadata: clone(output.metadata ?? {}),
    ...(output.output_type === 'execute_result' ? { execution_count: output.execution_count ?? null } : {})
  };
};

const normalizeCell = (value: unknown, index: number): NotebookCell => {
  const cell = isRecord(value) ? value : {};
  // v1 used `type`, `output` and `executionCount`; nbformat uses the underscored fields.
  const metadata = isRecord(cell.metadata) ? clone(cell.metadata) : {};
  const lumen = isRecord(metadata.lumen) ? metadata.lumen : {};
  const declaredType = cell.cell_type ?? cell.type;
  const cellType = lumen.cell_type === 'circuit' ? 'circuit' : validCellType(declaredType);
  const legacyOutput = typeof cell.output === 'string' ? cell.output : undefined;
  const outputs = normalizeOutputs(cell.outputs);

  if (legacyOutput !== undefined && outputs.length === 0) {
    outputs.push({ output_type: 'stream', name: 'stdout', text: legacyOutput });
  }

  const normalized: NotebookCell = {
    id: typeof cell.id === 'string' ? cell.id : `cell-${crypto.randomUUID()}`,
    cell_type: cellType,
    metadata,
    source: sourceToString(cell.source),
    label: typeof cell.label === 'string' ? cell.label : typeof lumen.label === 'string' ? lumen.label : undefined,
    status: validStatus(cell.status ?? lumen.status),
    isNew: typeof cell.isNew === 'boolean' ? cell.isNew : lumen.is_new === true
  };

  if (cellType === 'code' || cellType === 'circuit') {
    const count = cell.execution_count ?? cell.executionCount;
    normalized.execution_count = typeof count === 'number' ? count : null;
    normalized.outputs = outputs;
  }
  if (cellType === 'circuit') {
    normalized.circuit = isRecord(lumen.circuit)
      ? (clone(lumen.circuit) as unknown as CircuitData)
      : isRecord(cell.circuit)
        ? (clone(cell.circuit) as unknown as CircuitData)
        : defaultCircuit();
  }
  if ((cellType === 'markdown' || cellType === 'raw') && isRecord(cell.attachments)) {
    normalized.attachments = clone(cell.attachments) as NotebookCell['attachments'];
  }

  if (!normalized.id) normalized.id = `cell-${index}-${crypto.randomUUID()}`;
  return normalized;
};

/**
 * Svelte-facing equivalent of JupyterLab's NotebookModel serializer.
 * It returns plain objects so Svelte can deeply proxy cells and outputs.
 */
export class NotebookModel {
  static fromString(value: string): Notebook {
    return NotebookModel.fromJSON(JSON.parse(value));
  }

  static fromJSON(value: unknown): Notebook {
    const json = isRecord(value) ? value : {};
    const metadata = (isRecord(json.metadata) ? clone(json.metadata) : {}) as NotebookMetadata & {
      lumen?: UnknownRecord;
    };
    const lumen = isRecord(metadata.lumen) ? metadata.lumen : {};
    delete metadata.lumen;
    const now = new Date().toISOString();
    const cells = (Array.isArray(json.cells) ? json.cells : []).map(normalizeCell);

    return {
      id: typeof json.id === 'string' ? json.id : typeof lumen.id === 'string' ? lumen.id : `notebook-${crypto.randomUUID()}`,
      revision: typeof json.revision === 'number' ? json.revision : 0,
      title: typeof json.title === 'string' ? json.title : typeof lumen.title === 'string' ? lumen.title : '未命名 Notebook',
      createdAt: typeof json.createdAt === 'string' ? json.createdAt : typeof lumen.created_at === 'string' ? lumen.created_at : now,
      updatedAt: typeof json.updatedAt === 'string' ? json.updatedAt : typeof lumen.updated_at === 'string' ? lumen.updated_at : now,
      nbformat: 4,
      nbformat_minor: typeof json.nbformat_minor === 'number' ? json.nbformat_minor : 5,
      metadata,
      cells: cells.length ? cells : [NotebookModel.createCell('code', true)]
    };
  }

  static toJSON(notebook: Notebook): NotebookJSON {
    const metadata = clone(notebook.metadata) as NotebookJSON['metadata'];
    metadata.lumen = {
      id: notebook.id,
      title: notebook.title,
      created_at: notebook.createdAt,
      updated_at: notebook.updatedAt
    };

    return {
      nbformat: 4,
      // Cell ids are part of nbformat 4.5. Since Lumen always writes ids, ensure
      // the declared minor version matches the emitted document.
      nbformat_minor: Math.max(5, notebook.nbformat_minor),
      metadata,
      cells: notebook.cells.map((cell) => {
        const cellMetadata = clone(cell.metadata);
        cellMetadata.lumen = {
          ...(isRecord(cellMetadata.lumen) ? cellMetadata.lumen : {}),
          ...(cell.label ? { label: cell.label } : {}),
          ...(cell.isNew ? { is_new: true } : {})
        };
        if (cell.cell_type === 'circuit') {
          cellMetadata.lumen = {
            ...(isRecord(cellMetadata.lumen) ? cellMetadata.lumen : {}),
            cell_type: 'circuit',
            circuit: clone(cell.circuit ?? defaultCircuit())
          };
        }
        const json: UnknownRecord = {
          id: cell.id,
          // Keep the file valid nbformat: custom cell kinds live in metadata.
          cell_type: cell.cell_type === 'circuit' ? 'code' : cell.cell_type,
          metadata: cellMetadata,
          source: cell.source
        };
        if (cell.cell_type === 'code' || cell.cell_type === 'circuit') {
          json.execution_count = cell.execution_count ?? null;
          json.outputs = (cell.outputs ?? []).map(serializeOutput);
        }
        if ((cell.cell_type === 'markdown' || cell.cell_type === 'raw') && cell.attachments) json.attachments = clone(cell.attachments);
        return json;
      }) as NotebookJSON['cells']
    };
  }

  static createCell(type: CellType, empty = false): NotebookCell {
    const defaults: Record<CellType, string> = {
      markdown: '# 欢迎使用 Lumen Notebook\n\n在这里记录你的想法、公式与实验过程。',
      code: 'name = "Lumen"\nprint(f"Hello, {name}!")',
      raw: '这是一段不会被 Kernel 执行或 Markdown 渲染的原始文本。',
      circuit: ''
    };
    const cell: NotebookCell = {
      id: `cell-${crypto.randomUUID()}`,
      cell_type: type,
      metadata: {},
      source: empty ? '' : defaults[type],
      status: 'idle',
      isNew: empty
    };
    if (type === 'code' || type === 'circuit') {
      cell.execution_count = null;
      cell.outputs = [];
    }
    if (type === 'circuit') cell.circuit = defaultCircuit();
    return cell;
  }
}
