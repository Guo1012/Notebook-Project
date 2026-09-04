# @lumen/notebook

完整的 Svelte 5 Jupyter Notebook SDK。Notebook、Cell、CodeEditor、Circuit 和 UI 由 Lumen 实现，不依赖 `@jupyterlab/*` 或 Lumino UI。

通用的非 UI 基础能力直接复用官方 Lumino：`algorithm`、`commands`、`coreutils`、`disposable`、`signaling`、`messaging`、`polling` 和 `properties`。Svelte 取代的是 `@lumino/widgets` 与 `@lumino/virtualdom` 的 UI 职责。

## 安装

```bash
npm install @lumen/notebook
```

发布后这一个命令会自动安装其 `@lumen/*` 运行时依赖；这些兄弟包是内部可复用层，不需要使用者逐个安装。

## 完整编辑器

```svelte
<script lang="ts">
  import {
    JupyterKernel,
    NotebookEditor,
    NotebookModel,
    SessionContext
  } from '@lumen/notebook';
  import notebookJson from './demo.ipynb?raw';

  const model = new NotebookModel(notebookJson);
  const session = new SessionContext(new JupyterKernel({
    baseUrl: 'http://127.0.0.1:8888',
    kernelName: 'python3'
  }));
</script>

<NotebookEditor {model} {session} showTableOfContents onsave={() => save(model.toJSON())} />
```

`NotebookEditor` 包含 Code/Markdown/Raw/Circuit 编辑、输出渲染、Cell 增删移动、运行/中断/重启、撤销/重做、搜索替换、目录、状态栏、快捷键和大文档 `content-visibility` 优化。

## 只读渲染

```svelte
<script lang="ts">
  import { NotebookRenderer } from '@lumen/notebook';
</script>

<NotebookRenderer notebook={ipynbJson} trusted={false} />
```

## 文档、LSP 与协作

- `NotebookModel` / `DocumentContext`：nbformat、dirty、历史与 Jupyter Contents 保存。
- `JupyterKernel` / `SessionContext`：标准 Kernel REST 和 Channels WebSocket。
- `NotebookLspAdapter`：把多个代码 Cell 映射成虚拟 LSP 文档，并把补全和诊断映射回 CodeMirror。
- `NotebookCollaboration`：`NotebookModel` 与 Yjs `SharedNotebook` 双向同步。
- `RenderMimeRegistry`：可扩展 MIME renderer 选择。

Circuit 功能保留在 SDK；Agent/聊天功能仍属于主应用，不会被 `@lumen/notebook` 强制带入。
