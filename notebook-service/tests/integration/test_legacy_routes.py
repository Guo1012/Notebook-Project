"""旧 POC route 保留测试：响应结构不变、不出现在 v1 OpenAPI、不触碰 POC 数据。"""
from __future__ import annotations

import pytest

from app.repository import LocalNotebookRepository


@pytest.fixture()
def legacy_repo(tmp_path, monkeypatch):
    """把旧 route 的模块级 repository 指向临时目录，避免写真实 POC 数据。"""
    import app.api.legacy as legacy_module

    repo = LocalNotebookRepository(tmp_path / "legacy-notebooks")
    monkeypatch.setattr(legacy_module, "repository", repo)
    return repo


def test_legacy_create_and_get_preserve_old_response_shape(client, legacy_repo):
    content = {"nbformat": 4, "cells": []}
    response = client.post("/api/notebooks", json={"content": content})
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"notebookId", "revision", "content"}
    assert body["revision"] == 1
    assert body["content"] == content

    response = client.get(f"/api/notebooks/{body['notebookId']}")
    assert response.status_code == 200
    assert response.json() == body


def test_legacy_list_returns_created_notebook(client, legacy_repo):
    content = {
        "nbformat": 4,
        "metadata": {"lumen": {"title": "List me"}},
        "cells": [],
    }
    notebook_id = client.post("/api/notebooks", json={"content": content}).json()["notebookId"]
    response = client.get("/api/notebooks")
    assert response.status_code == 200
    assert response.json()["items"][0]["notebookId"] == notebook_id
    assert response.json()["items"][0]["title"] == "List me"


def test_legacy_get_not_found_keeps_old_error_shape(client):
    response = client.get("/api/notebooks/nb_000000000000")
    assert response.status_code == 404
    assert response.json() == {"detail": "Notebook not found"}


def test_legacy_put_conflict_keeps_old_error_shape(client, legacy_repo):
    content = {"nbformat": 4, "cells": []}
    nb_id = client.post("/api/notebooks", json={"content": content}).json()["notebookId"]
    client.put(f"/api/notebooks/{nb_id}", json={"baseRevision": 1, "content": content})

    response = client.put(
        f"/api/notebooks/{nb_id}",
        json={"baseRevision": 1, "content": content},
    )
    assert response.status_code == 409
    assert response.json() == {
        "detail": {"message": "Revision conflict", "currentRevision": 2}
    }


def test_legacy_rename_updates_title_and_revision(client, legacy_repo):
    content = {
        "nbformat": 4,
        "metadata": {"lumen": {"title": "Old title"}},
        "cells": [],
    }
    notebook_id = client.post(
        "/api/notebooks", json={"content": content}
    ).json()["notebookId"]

    response = client.patch(
        f"/api/notebooks/{notebook_id}", json={"title": "  New title  "}
    )

    assert response.status_code == 200
    assert response.json()["title"] == "New title"
    assert response.json()["revision"] == 2
    assert response.json()["content"]["metadata"]["lumen"]["title"] == "New title"
    assert client.get("/api/notebooks").json()["items"][0]["title"] == "New title"


def test_legacy_delete_removes_notebook(client, legacy_repo):
    notebook_id = client.post(
        "/api/notebooks", json={"content": {"nbformat": 4, "cells": []}}
    ).json()["notebookId"]

    response = client.delete(f"/api/notebooks/{notebook_id}")

    assert response.status_code == 204
    assert client.get(f"/api/notebooks/{notebook_id}").status_code == 404
    assert client.get("/api/notebooks").json() == {"items": []}


def test_legacy_rename_and_delete_not_found(client, legacy_repo):
    missing = "nb_000000000000"
    assert client.patch(
        f"/api/notebooks/{missing}", json={"title": "New title"}
    ).status_code == 404
    assert client.delete(f"/api/notebooks/{missing}").status_code == 404


def test_legacy_validation_error_keeps_default_422_shape(client):
    response = client.post("/api/notebooks", json={})
    assert response.status_code == 422
    body = response.json()
    assert set(body) == {"detail"}
    assert isinstance(body["detail"], list)


def test_legacy_routes_not_in_openapi(client):
    spec = client.get("/openapi.json").json()
    assert "/api/notebooks" not in spec["paths"]
    assert "/api/notebooks/{notebook_id}" not in spec["paths"]
