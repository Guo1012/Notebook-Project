# @lumen/notebook architecture

`@lumen/notebook` 是顶层聚合包。依赖保持从应用层向基础层单向流动：

```text
NotebookEditor / NotebookController
├── docregistry ── services ── @lumino/signaling
├── cells ── codeeditor(Svelte shell over @jupyterlab/codeeditor + @jupyterlab/codemirror)
│   └── outputarea ── rendermime(marked + DOMPurify + MathJax)
├── documentsearch / toc / settings / translation adapters over official Jupyter packages
├── ui-components / @lumino/commands / apputils
├── NotebookLspAdapter ── lsp
└── NotebookCollaboration ── ydoc
                         └── nbformat
```

核心边界：

| 层 | 职责 |
| --- | --- |
| `NotebookEditor` | 可编辑 Notebook、工具栏、命令、搜索、目录、状态与大文档渲染 |
| `docregistry` | Cell 模型、dirty、历史、序列化、保存/恢复上下文 |
| `services` | Jupyter Contents REST、Kernel REST/WebSocket、Session 生命周期 |
| `cells/outputarea/rendermime` | 自有 Svelte Cell、输出区域和 MIME 展示层 |
| `codeeditor` | 自有 Svelte 外壳，内部复用 `@jupyterlab/codeeditor` 与 `@jupyterlab/codemirror` |
| `lsp/ydoc` | LSP 虚拟文档映射和 Yjs 双向协作 |
| Lumino 基础包 | algorithm、commands、coreutils、disposable、signaling、messaging、polling、properties |
| Lumen 基础/UI | apputils、DOM/拖拽适配、Svelte UI 与轻量 Widget 生命周期 |

不重新实现 Lumino 的纯 TypeScript 基础能力，也不重新实现 JupyterLab 的编辑器抽象、CodeMirror 适配、nbformat 标准类型或 services 协议能力；页面渲染和生命周期仍由 Svelte 管理。

自研边界集中在渲染层：`notebook`、`cells`、`outputarea`、`rendermime`、`ui-components`，以及少量用于把官方 Jupyter 类型转换成渲染友好结构的 adapter。

Agent、聊天、路由、JupyterHub/KubeSpawner 和具体部署逻辑不属于 SDK。主站可以把这些能力放在 `NotebookEditor` 外围。Circuit 是保留的 Lumen 扩展，通过合法 nbformat code cell 的 `metadata.lumen.cell_type = "circuit"` 持久化。
