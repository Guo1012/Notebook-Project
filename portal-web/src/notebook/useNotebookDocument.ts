import { useCallback, useEffect, useState } from 'react'
import type { nbformat } from '@jupyterlab/nbformat'

import {
  getNotebook,
  saveNotebook,
} from './api'

import type {
  NotebookDocumentState,
} from './types'


export function useNotebookDocument(
  notebookId: string,
) {
  const [document, setDocument] =
    useState<NotebookDocumentState | null>(null)

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] =
    useState<string | null>(null)

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)

        const notebook =
          await getNotebook(notebookId)

        setDocument({
          ...notebook,
          dirty: false,
        })
      } catch (e) {
        setError(String(e))
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [notebookId])


  const updateCellSource = useCallback(
    (
      cellIndex: number,
      source: string,
    ) => {
      setDocument((old) => {
        if (!old) {
          return old
        }

        const cells = [...old.content.cells]

        const currentCell = cells[cellIndex]

        cells[cellIndex] = {
          ...currentCell,
          source,
        } as nbformat.ICell

        return {
          ...old,
          dirty: true,
          content: {
            ...old.content,
            cells,
          },
        }
      })
    },
    [],
  )


  const save = useCallback(async () => {
    if (!document || !document.dirty) {
      return
    }

    try {
      setSaving(true)
      setError(null)

      const saved = await saveNotebook({
        notebookId: document.notebookId,
        revision: document.revision,
        content: document.content,
      })

      setDocument({
        ...saved,
        dirty: false,
      })
    } catch (e) {
      if (String(e).includes('REVISION_CONFLICT')) {
        setError(
          'Notebook 已在其他位置被修改，当前版本无法直接保存。',
        )
      } else {
        setError(String(e))
      }
    } finally {
      setSaving(false)
    }
  }, [document])

  const saveExecutionResult = useCallback(
    async (
      cellId: string,
      outputs: nbformat.IOutput[],
      executionCount: number | null,
    ) => {
      if (!document) {
        throw new Error('Notebook not loaded')
      }

      try {
        setSaving(true)
        setError(null)

        const cells = [...document.content.cells]

        const index = cells.findIndex(
          (cell) => cell.id === cellId,
        )

        if (index < 0) {
          throw new Error(
            `Cell not found: ${cellId}`,
          )
        }

        const cell = cells[index]

        if (cell.cell_type !== 'code') {
          throw new Error(
            'Only code cells can receive outputs',
          )
        }

        cells[index] = {
          ...cell,
          outputs,
          execution_count: executionCount,
        }

        const nextContent = {
          ...document.content,
          cells,
        }

        const saved = await saveNotebook({
          notebookId: document.notebookId,
          revision: document.revision,
          content: nextContent,
        })

        setDocument({
          ...saved,
          dirty: false,
        })
      } catch (e) {
        if (
          String(e).includes(
            'REVISION_CONFLICT',
          )
        ) {
          setError(
            'Notebook 已在其他位置被修改，当前版本无法直接保存。',
          )
        } else {
          setError(String(e))
        }

        throw e
      } finally {
        setSaving(false)
      }
    },
    [document],
  )

  return {
    document,
    loading,
    saving,
    error,
    updateCellSource,
    save,
    saveExecutionResult,
  }
}