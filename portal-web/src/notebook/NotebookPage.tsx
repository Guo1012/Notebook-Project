import type { nbformat } from '@jupyterlab/nbformat'

import { useNotebookDocument } from './useNotebookDocument'


function sourceToText(
  source: string | string[],
): string {
  return Array.isArray(source)
    ? source.join('')
    : source
}


export function NotebookPage({
  notebookId,
}: {
  notebookId: string
}) {
  const {
    document,
    loading,
    saving,
    error,
    updateCellSource,
    save,
  } = useNotebookDocument(notebookId)

  if (loading) {
    return <p>Loading...</p>
  }

  if (!document) {
    return <p>Notebook not found</p>
  }

  return (
    <main
      style={{
        width: '900px',
        margin: '40px auto',
      }}
    >
      <header>
        <h1>Notebook POC</h1>

        <div>
          Notebook: {document.notebookId}
        </div>

        <div>
          Revision: {document.revision}
        </div>

        <div>
          State:{' '}
          {document.dirty
            ? 'Unsaved'
            : 'Saved'}
        </div>

        <button
          disabled={!document.dirty || saving}
          onClick={save}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        {error && (
          <p style={{ color: 'red' }}>
            {error}
          </p>
        )}
      </header>

      <hr />

      {document.content.cells.map(
        (
          cell: nbformat.ICell,
          index: number,
        ) => {
          const source =
            sourceToText(cell.source)

          if (cell.cell_type === 'markdown') {
            return (
              <section
                key={cell.id ?? index}
                style={{ margin: '24px 0' }}
              >
                <strong>
                  Markdown Cell
                </strong>

                <textarea
                  value={source}
                  onChange={(event) =>
                    updateCellSource(
                      index,
                      event.target.value,
                    )
                  }
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: 100,
                  }}
                />
              </section>
            )
          }

          if (cell.cell_type === 'code') {
            return (
              <section
                key={cell.id ?? index}
                style={{ margin: '24px 0' }}
              >
                <strong>
                  Code Cell
                </strong>

                <textarea
                  value={source}
                  onChange={(event) =>
                    updateCellSource(
                      index,
                      event.target.value,
                    )
                  }
                  style={{
                    display: 'block',
                    width: '100%',
                    minHeight: 120,
                    fontFamily: 'monospace',
                  }}
                />

                {cell.outputs?.length > 0 && (
                  <pre
                    style={{
                      background: '#eee',
                      padding: 12,
                    }}
                  >
                    {JSON.stringify(
                      cell.outputs,
                      null,
                      2,
                    )}
                  </pre>
                )}
              </section>
            )
          }

          return (
            <section key={cell.id ?? index}>
              Unsupported cell:
              {cell.cell_type}
            </section>
          )
        },
      )}
    </main>
  )
}