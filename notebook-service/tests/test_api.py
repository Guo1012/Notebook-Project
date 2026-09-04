import importlib

from fastapi.testclient import TestClient


NOTEBOOK = {"nbformat": 4, "nbformat_minor": 5, "metadata": {}, "cells": []}


def test_auth_and_notebook_revision_flow(tmp_path, monkeypatch):
    monkeypatch.setenv("LUMEN_DB_PATH", str(tmp_path / "notebooks.db"))
    monkeypatch.setenv("LUMEN_ALLOW_BOOTSTRAP", "true")
    monkeypatch.setenv("LUMEN_COOKIE_SECURE", "false")
    module = importlib.import_module("app.main")
    module.user_files = module.UserFileRepository(module.database, tmp_path / "files")
    client = TestClient(module.app)

    assert client.get("/api/notebooks").status_code == 401
    assert client.post("/api/auth/bootstrap", json={"username": "alice", "password": "secret", "displayName": "Alice"}).status_code == 201
    assert client.post("/api/auth/login", json={"username": "alice", "password": "secret"}).status_code == 200

    created = client.post("/api/notebooks", json={"title": "First", "content": NOTEBOOK})
    assert created.status_code == 201
    notebook = created.json()
    assert notebook["revision"] == 1

    saved = client.put(f'/api/notebooks/{notebook["notebookId"]}', json={"baseRevision": 1, "title": "First", "content": NOTEBOOK})
    assert saved.status_code == 200
    assert saved.json()["revision"] == 2

    conflict = client.put(f'/api/notebooks/{notebook["notebookId"]}', json={"baseRevision": 1, "content": NOTEBOOK})
    assert conflict.status_code == 409
    assert conflict.json()["detail"]["code"] == "REVISION_CONFLICT"

    uploaded = client.post("/api/files", files={"files": ("data.csv", b"x,y\n1,2\n", "text/csv")})
    assert uploaded.status_code == 201
    file_record = uploaded.json()[0]
    assert client.get("/api/files").json()["items"][0]["name"] == "data.csv"
    assert client.get(f'/api/files/{file_record["id"]}').content == b"x,y\n1,2\n"
    assert client.delete(f'/api/files/{file_record["id"]}').status_code == 204


def test_notebooks_are_isolated_by_owner(tmp_path, monkeypatch):
    monkeypatch.setenv("LUMEN_DB_PATH", str(tmp_path / "owners.db"))
    monkeypatch.setenv("LUMEN_ALLOW_BOOTSTRAP", "true")
    monkeypatch.setenv("LUMEN_COOKIE_SECURE", "false")
    module = importlib.import_module("app.main")
    module.database = module.Database(tmp_path / "owners.db")
    module.users = module.UserRepository(module.database)
    module.notebooks = module.NotebookRepository(module.database)
    module.user_files = module.UserFileRepository(module.database, tmp_path / "files")
    client = TestClient(module.app)

    for username in ("alice", "bob"):
        client.post("/api/auth/bootstrap", json={"username": username, "password": "secret", "displayName": username.title()})
    client.post("/api/auth/login", json={"username": "alice", "password": "secret"})
    notebook_id = client.post("/api/notebooks", json={"title": "Private", "content": NOTEBOOK}).json()["notebookId"]
    client.post("/api/auth/login", json={"username": "bob", "password": "secret"})
    assert client.get(f"/api/notebooks/{notebook_id}").status_code == 404
