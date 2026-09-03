# Jupyter 概念验证前端 & 文件服务

## portal-web: 测试演示前端

**门户前端**，负责：

- 展示 notebook
- 编辑 cell
- 点击 Save
- 点击 Run
- 显示 runtime 状态
- 显示 outputs

由React实现的最简前端实现，用于概念验证和接通示例。

## notebook-service: 文件服务端

**Document plane**，负责：

- 创建 notebookId
- 保存 `.ipynb` 内容
- 维护 revision
- 作为 notebook authoritative state（权威状态）

`notebook-service/app/main.py`核心内容：

- `POST /api/notebooks`
- `GET /api/notebooks/{notebook_id}`
- `PUT /api/notebooks/{notebook_id}`

`LocalNotebookRepository(DATA_DIR)` 负责底层存储，`DATA_DIR` 指向 `data/notebooks`
