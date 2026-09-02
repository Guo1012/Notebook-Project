import {
  KernelManager,
  ServerConnection,
} from '@jupyterlab/services'


export async function testJupyterGateway(
  runtimeId: string,
) {
  const httpOrigin =
    window.location.origin

  const wsOrigin =
    httpOrigin.replace(
      /^http/,
      'ws',
    )

  const runtimePath =
    `/runtime-proxy/${runtimeId}/`

  const serverSettings =
    ServerConnection.makeSettings({
      baseUrl:
        `${httpOrigin}${runtimePath}`,

      wsUrl:
        `${wsOrigin}${runtimePath}`,

      // 浏览器不再知道
      // Jupyter Server token。
      token: '',
    })

  const kernelManager =
    new KernelManager({
      serverSettings,
    })

  await kernelManager.ready

  console.log(
    '[Gateway Test] KernelManager ready'
  )

  const kernel =
    await kernelManager.startNew({
      name: 'python3',
    })

  console.log(
    '[Gateway Test] kernel started:',
    kernel.id,
  )

  const future =
    kernel.requestExecute({
      code: `
x = 2026
print("gateway test:", x)
x + 1
      `,
    })

  future.onIOPub = (message) => {
    console.log(
      '[Gateway Test] IOPub:',
      message.header.msg_type,
      message.content,
    )
  }

  const reply =
    await future.done

  console.log(
    '[Gateway Test] execute reply:',
    reply.content,
  )

  return kernel
}