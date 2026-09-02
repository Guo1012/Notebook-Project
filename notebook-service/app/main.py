from pathlib import Path

from fastapi import FastAPI, HTTPException

from .models import (
    CreateNotebookRequest,
    SaveNotebookRequest,
)
from .repository import (
    LocalNotebookRepository,
    NotebookNotFound,
    RevisionConflict,
)


app = FastAPI()

DATA_DIR = (
    Path(__file__).parent.parent
    / "data"
    / "notebooks"
)

repository = LocalNotebookRepository(DATA_DIR)


@app.post("/api/notebooks")
def create_notebook(req: CreateNotebookRequest):
    notebook_id, revision, content = repository.create(
        req.content
    )

    return {
        "notebookId": notebook_id,
        "revision": revision,
        "content": content,
    }


@app.get("/api/notebooks/{notebook_id}")
def get_notebook(notebook_id: str):
    try:
        revision, content = repository.get(
            notebook_id
        )
    except NotebookNotFound:
        raise HTTPException(
            status_code=404,
            detail="Notebook not found",
        )

    return {
        "notebookId": notebook_id,
        "revision": revision,
        "content": content,
    }


@app.put("/api/notebooks/{notebook_id}")
def save_notebook(
    notebook_id: str,
    req: SaveNotebookRequest,
):
    try:
        revision, content = repository.save(
            notebook_id,
            req.baseRevision,
            req.content,
        )
    except NotebookNotFound:
        raise HTTPException(
            status_code=404,
            detail="Notebook not found",
        )
    except RevisionConflict as error:
        raise HTTPException(
            status_code=409,
            detail={
                "message": "Revision conflict",
                "currentRevision": error.current_revision,
            },
        )

    return {
        "notebookId": notebook_id,
        "revision": revision,
        "content": content,
    }