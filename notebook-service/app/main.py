import os
from fastapi import Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse

from .auth import COOKIE_NAME, CurrentUser, create_session_token, require_user
from .database import Database
from .files import FileNotFound, FileTooLarge, UserFileRepository
from .models import BootstrapUserRequest, CreateNotebookRequest, FileListResponse, LoginRequest, NotebookListResponse, NotebookResponse, NotebookSummary, RenameNotebookRequest, SaveNotebookRequest, UploadedFileResponse, UserResponse
from .repository import NotebookNotFound, NotebookRepository, RevisionConflict, UserRepository, UsernameExists

app = FastAPI(title="Lumen Backend API", version="1.0.0")
database = Database()
users = UserRepository(database)
notebooks = NotebookRepository(database)
user_files = UserFileRepository(database)

def user_response(user: CurrentUser) -> UserResponse:
    return UserResponse(id=user.user_id, username=user.username, displayName=user.display_name)

def not_found() -> HTTPException:
    return HTTPException(status_code=404, detail={"code": "NOTEBOOK_NOT_FOUND", "message": "Notebook not found"})

@app.get("/healthz")
def healthz(): return {"status": "ok"}

@app.post("/api/auth/bootstrap", response_model=UserResponse, status_code=201)
def bootstrap(req: BootstrapUserRequest):
    if os.getenv("LUMEN_ALLOW_BOOTSTRAP", "false").lower() != "true": raise HTTPException(status_code=404, detail="Not found")
    try: return user_response(users.create(req.username, req.displayName, req.password))
    except UsernameExists: raise HTTPException(status_code=409, detail={"code": "USERNAME_EXISTS", "message": "Username already exists"})

@app.post("/api/auth/login", response_model=UserResponse)
def login(req: LoginRequest, response: Response):
    user = users.authenticate(req.username, req.password)
    if user is None: raise HTTPException(status_code=401, detail={"code": "INVALID_CREDENTIALS", "message": "Invalid username or password"})
    response.set_cookie(COOKIE_NAME, create_session_token(user), httponly=True, secure=os.getenv("LUMEN_COOKIE_SECURE", "true").lower() == "true", samesite="lax", max_age=28_800, path="/")
    return user_response(user)

@app.post("/api/auth/logout", status_code=204)
def logout(response: Response): response.delete_cookie(COOKIE_NAME, path="/")

@app.get("/api/auth/me", response_model=UserResponse)
def me(user: CurrentUser = Depends(require_user)): return user_response(user)

@app.get("/api/notebooks", response_model=NotebookListResponse)
def list_notebooks(user: CurrentUser = Depends(require_user)):
    return NotebookListResponse(items=[NotebookSummary(notebookId=r["notebookId"], title=r["title"], revision=r["revision"], cellCount=len(r["content"].get("cells", [])), createdAt=r["createdAt"], updatedAt=r["updatedAt"]) for r in notebooks.list(user.user_id)])

@app.post("/api/notebooks", response_model=NotebookResponse, status_code=201)
def create_notebook(req: CreateNotebookRequest, user: CurrentUser = Depends(require_user)):
    return NotebookResponse(**notebooks.create(user.user_id, req.title, req.content))

@app.get("/api/notebooks/{notebook_id}", response_model=NotebookResponse)
def get_notebook(notebook_id: str, user: CurrentUser = Depends(require_user)):
    try: return NotebookResponse(**notebooks.get(user.user_id, notebook_id))
    except NotebookNotFound: raise not_found()

@app.put("/api/notebooks/{notebook_id}", response_model=NotebookResponse)
def save_notebook(notebook_id: str, req: SaveNotebookRequest, user: CurrentUser = Depends(require_user)):
    try: return NotebookResponse(**notebooks.save(user.user_id, notebook_id, req.baseRevision, req.content, req.title))
    except NotebookNotFound: raise not_found()
    except RevisionConflict as error: raise HTTPException(status_code=409, detail={"code": "REVISION_CONFLICT", "message": "Revision conflict", "currentRevision": error.current_revision})

@app.patch("/api/notebooks/{notebook_id}", response_model=NotebookResponse)
def rename_notebook(notebook_id: str, req: RenameNotebookRequest, user: CurrentUser = Depends(require_user)):
    try: return NotebookResponse(**notebooks.rename(user.user_id, notebook_id, req.title))
    except NotebookNotFound: raise not_found()

@app.delete("/api/notebooks/{notebook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notebook(notebook_id: str, user: CurrentUser = Depends(require_user)):
    try: notebooks.delete(user.user_id, notebook_id)
    except NotebookNotFound: raise not_found()

@app.get("/api/files", response_model=FileListResponse)
def list_files(user: CurrentUser = Depends(require_user)):
    return FileListResponse(items=[UploadedFileResponse(**item) for item in user_files.list(user.user_id)])

@app.post("/api/files", response_model=list[UploadedFileResponse], status_code=201)
async def upload_files(files: list[UploadFile] = File(...), user: CurrentUser = Depends(require_user)):
    try: return [UploadedFileResponse(**(await user_files.save(user.user_id, upload))) for upload in files]
    except FileTooLarge: raise HTTPException(status_code=413, detail={"code": "FILE_TOO_LARGE", "message": "Uploaded file exceeds size limit"})

@app.get("/api/files/{file_id}")
def download_file(file_id: str, user: CurrentUser = Depends(require_user)):
    try:
        path, record = user_files.resolve(user.user_id, file_id)
        return FileResponse(path, filename=record["name"], media_type=record["type"])
    except FileNotFound: raise HTTPException(status_code=404, detail={"code": "FILE_NOT_FOUND", "message": "File not found"})

@app.delete("/api/files/{file_id}", status_code=204)
def delete_file(file_id: str, user: CurrentUser = Depends(require_user)):
    try: user_files.delete(user.user_id, file_id)
    except FileNotFound: raise HTTPException(status_code=404, detail={"code": "FILE_NOT_FOUND", "message": "File not found"})
