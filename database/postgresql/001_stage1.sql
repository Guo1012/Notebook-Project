CREATE TABLE users (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notebooks (
    notebook_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(user_id),
    title TEXT NOT NULL,
    current_revision INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notebooks_owner_updated ON notebooks(owner_user_id, updated_at DESC);

CREATE TABLE notebook_revisions (
    notebook_id TEXT NOT NULL REFERENCES notebooks(notebook_id) ON DELETE CASCADE,
    revision INTEGER NOT NULL,
    content_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (notebook_id, revision)
);

CREATE TABLE user_runtimes (
    runtime_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(user_id),
    profile TEXT NOT NULL,
    state TEXT NOT NULL,
    desired_state TEXT NOT NULL,
    provider TEXT NOT NULL,
    provider_ref TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    failure_reason TEXT
);

CREATE UNIQUE INDEX unique_active_user_runtime
ON user_runtimes(owner_user_id)
WHERE state IN ('QUEUED','REQUESTED','PROVISIONING','STARTING','READY','STOPPING');

CREATE INDEX idx_user_runtimes_state ON user_runtimes(state, updated_at);

CREATE TABLE user_files (
    file_id TEXT PRIMARY KEY,
    owner_user_id TEXT NOT NULL REFERENCES users(user_id),
    original_name TEXT NOT NULL,
    storage_name TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size BIGINT NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_files_owner_uploaded
ON user_files(owner_user_id, uploaded_at DESC);
