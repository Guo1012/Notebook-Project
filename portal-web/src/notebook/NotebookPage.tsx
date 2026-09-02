import type { nbformat } from '@jupyterlab/nbformat'
import { useState } from 'react'

import { useNotebookDocument } from './useNotebookDocument'

import {
  runtimeManager,
} from '../runtime/runtimeManager'

import {
  productJupyterClient,
} from '../runtime/productJupyterClient'

import type {
  RuntimeInfo,
} from '../runtime/runtimeClient'


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
    saveExecutionResult,
  } = useNotebookDocument(notebookId)

  const [
    runtime,
    setRuntime,
  ] = useState<RuntimeInfo | null>(null)

  const [
    runningCellId,
    setRunningCellId,
  ] = useState<string | null>(null)


  if (loading) {
    return <p>Loading...</p>
  }

  if (!document) {
    return <p>Notebook not found</p>
  }


  /*
   * 从这里开始，本次 render 中
   * notebookDocument 一定非 null。
   *
   * 同时避免后面的 async function
   * 因闭包而丢失 TypeScript 的 null narrowing。
   */
  const notebookDocument = document


  async function runCell(
    cellId: string,
    source: string,
  ) {
    try {
      setRunningCellId(cellId)

      /*
       * 1. 保证 Notebook 有 READY Runtime
       */
      const readyRuntime =
        await runtimeManager.ensureReady(
          notebookDocument.notebookId,

          (nextRuntime) => {
            setRuntime(nextRuntime)
          },
        )


      /*
       * 2. 通过 Runtime Gateway
       *    连接动态 Jupyter Runtime，
       *    执行当前 Cell source
       */
      const result =
        await productJupyterClient.execute(
          readyRuntime.runtimeId,
          source,
        )


      /*
       * 3. 把 Kernel 返回的 outputs
       *    写回 Notebook Document，
       *    并保存为新的 revision
       */
      await saveExecutionResult(
        cellId,
        result.outputs,
        result.executionCount,
      )

    } catch (error) {
      console.error(
        'Run cell failed:',
        error,
      )
    } finally {
      setRunningCellId(null)
    }
  }


  async function stopRuntime() {
    try {
      await runtimeManager.stop()

      /*
       * Runtime 已经销毁，
       * 本地 Jupyter Client 连接也一起释放。
       */
      productJupyterClient.dispose()

      setRuntime(null)

    } catch (error) {
      console.error(
        'Stop runtime failed:',
        error,
      )
    }
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
          Notebook:{' '}
          {notebookDocument.notebookId}
        </div>

        <div>
          Revision:{' '}
          {notebookDocument.revision}
        </div>

        <div>
          State:{' '}
          {notebookDocument.dirty
            ? 'Unsaved'
            : 'Saved'}
        </div>

        <div>
          Runtime:{' '}
          {runtime
            ? `${runtime.state} (${runtime.runtimeId})`
            : 'Disconnected'}
        </div>


        <button
          disabled={!runtime}
          onClick={stopRuntime}
        >
          Stop Runtime
        </button>


        <button
          disabled={
            !notebookDocument.dirty
            || saving
          }
          onClick={save}
        >
          {saving
            ? 'Saving...'
            : 'Save'}
        </button>


        {error && (
          <p style={{ color: 'red' }}>
            {error}
          </p>
        )}
      </header>


      <hr />


      {notebookDocument.content.cells.map(
        (
          cell: nbformat.ICell,
          index: number,
        ) => {
          const source =
            sourceToText(cell.source)


          /*
           * Markdown Cell
           */
          if (
            cell.cell_type === 'markdown'
          ) {
            return (
              <section
                key={cell.id ?? index}
                style={{
                  margin: '24px 0',
                }}
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


          /*
           * Code Cell
           */
          if (
            cell.cell_type === 'code'
          ) {
            return (
              <section
                key={cell.id ?? index}
                style={{
                  margin: '24px 0',
                }}
              >
                <strong>
                  Code Cell
                </strong>


                <button
                  disabled={
                    !cell.id
                    || runningCellId !== null
                  }
                  onClick={() => {
                    if (!cell.id) {
                      return
                    }

                    runCell(
                      cell.id,
                      source,
                    )
                  }}
                >
                  {
                    runningCellId
                      === cell.id
                      ? 'Running...'
                      : 'Run'
                  }
                </button>


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
                    fontFamily:
                      'monospace',
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


          /*
           * 当前 POC 暂未支持的 Cell 类型
           */
          return (
            <section
              key={cell.id ?? index}
            >
              Unsupported cell:{' '}
              {cell.cell_type}
            </section>
          )
        },
      )}
    </main>
  )
}