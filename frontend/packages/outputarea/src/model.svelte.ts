import type { DisplayOutput, NotebookOutput, StreamOutput } from '@lumen/nbformat';

const isStream = (output: NotebookOutput): output is StreamOutput => output.output_type === 'stream';
const isDisplay = (output: NotebookOutput): output is DisplayOutput =>
  output.output_type === 'display_data' || output.output_type === 'execute_result' || output.output_type === 'update_display_data';

const textOf = (value: string | string[]): string => (Array.isArray(value) ? value.join('') : value);

function displayIdOf(output: NotebookOutput): string | undefined {
  if (!isDisplay(output)) return undefined;
  const id = output.transient?.display_id;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/**
 * Normalize a raw notebook output list the way JupyterLab's `OutputAreaModel` does:
 *
 * 1. Consecutive `stream` chunks with the same `name` are merged into a single
 *    entry (a long-running stdout/stderr print arrives as many tiny chunks).
 * 2. `update_display_data` entries resolve against the earlier output carrying
 *    the same `transient.display_id` and replace its data in place, instead of
 *    being appended as a duplicate (e.g. `display(obj, display_id="x")`).
 *
 * Pure and idempotent, so it is safe to run over an already-consolidated list.
 */
export function consolidateOutputs(outputs: NotebookOutput[]): NotebookOutput[] {
  const result: NotebookOutput[] = [];

  for (const output of outputs) {
    if (output.output_type === 'update_display_data') {
      const id = displayIdOf(output);
      const target = id !== undefined ? result.findIndex((o) => displayIdOf(o) === id) : -1;
      if (target !== -1) {
        const prev = result[target] as DisplayOutput;
        result[target] = { ...prev, data: output.data, metadata: output.metadata ?? prev.metadata } as DisplayOutput;
      } else {
        // Orphaned update with no earlier display: render it as plain display_data.
        result.push({ ...output, output_type: 'display_data' } as DisplayOutput);
      }
      continue;
    }

    if (isStream(output) && result.length > 0) {
      const last = result[result.length - 1];
      if (isStream(last) && last.name === output.name) {
        result[result.length - 1] = { ...last, text: textOf(last.text) + textOf(output.text) };
        continue;
      }
    }

    result.push(output);
  }

  return result;
}

/**
 * Reactive (Svelte 5) equivalent of JupyterLab's `OutputAreaModel`: holds the
 * consolidated output list plus its trusted flag. Mutating it from a component
 * re-renders any view reading `.items`.
 */
export class OutputAreaModel {
  private _items = $state<NotebookOutput[]>([]);
  trusted = $state(false);

  get items(): readonly NotebookOutput[] {
    return this._items;
  }

  get length(): number {
    return this._items.length;
  }

  /** Replace the whole output list (consolidating streams + display updates). */
  set(outputs: NotebookOutput[]): void {
    this._items = consolidateOutputs(outputs);
  }

  /** Append one output, merging streams and resolving display updates incrementally. */
  add(output: NotebookOutput): void {
    this._items = consolidateOutputs([...this._items, output]);
  }

  clear(): void {
    this._items = [];
  }

  fromJSON(outputs: NotebookOutput[]): void {
    this.set(outputs);
  }

  toJSON(): NotebookOutput[] {
    return this._items.map((output) => ({ ...output }));
  }
}
