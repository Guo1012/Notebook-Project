# Lumen backend API v1

Stage 1 fixes the public backend contracts. All `/api/*` endpoints use the
`lumen_session` HttpOnly cookie. Errors use FastAPI's `detail` envelope with a
stable `code` and human-readable `message`.

## Authentication

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/bootstrap` (disabled unless `LUMEN_ALLOW_BOOTSTRAP=true`)

## Notebooks

- `GET /api/notebooks`
- `POST /api/notebooks`
- `GET /api/notebooks/{notebookId}`
- `PUT /api/notebooks/{notebookId}`
- `PATCH /api/notebooks/{notebookId}`
- `DELETE /api/notebooks/{notebookId}`

`PUT` requires `baseRevision`. A stale revision returns HTTP 409 with code
`REVISION_CONFLICT`. A notebook owned by another user is returned as 404 to
avoid leaking its existence.

## User runtime

- `PUT /api/runtime` ensures the signed-in user has one active runtime.
- `GET /api/runtime` returns the signed-in user's active runtime.
- `DELETE /api/runtime` changes desired state to `STOPPED` and returns 202.

The Stage 1 runtime is a durable desired-state record only. Provider allocation,
kernel creation, gateway proxying, quotas and lifecycle controllers are added in
later stages.

## User files

- `GET /api/files`
- `POST /api/files` using multipart field `files`
- `GET /api/files/{fileId}`
- `DELETE /api/files/{fileId}`

Files are stored below the authenticated user's server-side directory. File IDs
and generated storage names prevent client filenames from controlling paths.

SQLite is the executable local-development store. The production PostgreSQL
schema and its active-runtime partial unique index are defined in
`database/postgresql/001_stage1.sql`; switching repository drivers is deferred
until the deployment database is provisioned.

## Environment

- `LUMEN_SESSION_SECRET` must be a high-entropy shared secret in production.
- `LUMEN_COOKIE_SECURE=true` is the production default.
- `LUMEN_DB_PATH` selects the Notebook/Auth SQLite database for local work.
- `LUMEN_RUNTIME_DB_PATH` selects the Runtime SQLite database for local work.
