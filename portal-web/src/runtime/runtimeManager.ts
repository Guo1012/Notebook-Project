import {
  createRuntime,
  deleteRuntime,
  getRuntime,
  type RuntimeInfo,
} from './runtimeClient'


function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}


export class RuntimeManager {
  private current:
    RuntimeInfo | null = null


  async ensureReady(
    notebookId: string,
    onUpdate?: (
      runtime: RuntimeInfo
    ) => void,
  ): Promise<RuntimeInfo> {

    let runtime =
      await createRuntime(notebookId)

    this.current = runtime
    onUpdate?.(runtime)

    const deadline =
      Date.now() + 60_000

    while (
      runtime.state !== 'READY'
    ) {
      if (
        runtime.state === 'FAILED'
        || runtime.state === 'STOPPED'
      ) {
        throw new Error(
          `Runtime entered ${runtime.state}`,
        )
      }

      if (Date.now() > deadline) {
        throw new Error(
          'Runtime startup timeout',
        )
      }

      await sleep(500)

      runtime =
        await getRuntime(
          runtime.runtimeId,
        )

      this.current = runtime
      onUpdate?.(runtime)
    }

    return runtime
  }


  async stop(): Promise<void> {
    if (!this.current) {
      return
    }

    await deleteRuntime(
      this.current.runtimeId,
    )

    this.current = null
  }


  getCurrent():
    RuntimeInfo | null {
    return this.current
  }
}


export const runtimeManager =
  new RuntimeManager()