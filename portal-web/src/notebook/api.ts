import type {
  NotebookResponse,
} from './types'

export async function getNotebook(
  notebookId: string,
): Promise<NotebookResponse> {
  const response = await fetch(
    `/api/notebooks/${notebookId}`,
  )

  if (!response.ok) {
    throw new Error(
      `Failed to load notebook: ${response.status}`,
    )
  }

  return response.json()
}


export async function saveNotebook(
  notebook: NotebookResponse,
): Promise<NotebookResponse> {
  const response = await fetch(
    `/api/notebooks/${notebook.notebookId}`,
    {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        baseRevision: notebook.revision,
        content: notebook.content,
      }),
    },
  )

  if (response.status === 409) {
    throw new Error('REVISION_CONFLICT')
  }

  if (!response.ok) {
    throw new Error(
      `Failed to save notebook: ${response.status}`,
    )
  }

  return response.json()
}