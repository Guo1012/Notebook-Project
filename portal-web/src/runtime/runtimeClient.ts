export type RuntimeState =
  | 'REQUESTED'
  | 'PROVISIONING'
  | 'STARTING'
  | 'READY'
  | 'FAILED'
  | 'STOPPED'


export interface RuntimeInfo {
  runtimeId: string
  notebookId: string
  profile: string
  state: RuntimeState
  provider: string
  providerRef: string | null
}


export async function createRuntime(
  notebookId: string,
): Promise<RuntimeInfo> {
  const response = await fetch(
    '/runtime-api/v1/runtimes',
    {
      method: 'POST',

      headers: {
        'Content-Type': 'application/json',
      },

      body: JSON.stringify({
        notebookId,
        profile: 'python-base',
      }),
    },
  )

  if (!response.ok) {
    throw new Error(
      `Create runtime failed: ${response.status}`,
    )
  }

  return response.json()
}


export async function getRuntime(
  runtimeId: string,
): Promise<RuntimeInfo> {
  const response = await fetch(
    `/runtime-api/v1/runtimes/${runtimeId}`,
  )

  if (!response.ok) {
    throw new Error(
      `Get runtime failed: ${response.status}`,
    )
  }

  return response.json()
}


export async function deleteRuntime(
  runtimeId: string,
): Promise<RuntimeInfo> {
  const response = await fetch(
    `/runtime-api/v1/runtimes/${runtimeId}`,
    {
      method: 'DELETE',
    },
  )

  if (!response.ok) {
    throw new Error(
      `Delete runtime failed: ${response.status}`,
    )
  }

  return response.json()
}