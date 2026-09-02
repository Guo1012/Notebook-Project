import { NotebookPage } from './notebook/NotebookPage'

import { testJupyterGateway } from './runtime/jupyterGatewayTest'

function App() {
  return (
    <>
    <NotebookPage
      notebookId="nb_e3b520ca7c36"
    />

    <button
  onClick={async () => {
    try {
      await testJupyterGateway(
        'rt_b7cc67dead18',
      )
    } catch (error) {
      console.error(
        '[Gateway Test] failed:',
        error,
      )
    }
  }}
>
  Test Runtime Gateway
</button>

    </>
  )
}

export default App