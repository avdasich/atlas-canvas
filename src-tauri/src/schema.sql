PRAGMA journal_mode = WAL;
PRAGMA synchronous = FULL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS preferences (
    key TEXT PRIMARY KEY,
    json TEXT NOT NULL CHECK(json_valid(json))
);

CREATE TABLE IF NOT EXISTS scenes (
    country_id TEXT PRIMARY KEY,
    schema_version INTEGER NOT NULL,
    scene_json TEXT NOT NULL CHECK(json_valid(scene_json)),
    has_content INTEGER NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS scene_revisions (
    id INTEGER PRIMARY KEY,
    country_id TEXT NOT NULL,
    scene_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS revisions_country ON scene_revisions(country_id, id);

CREATE TABLE IF NOT EXISTS legacy_migrations (
    country_id TEXT PRIMARY KEY,
    legacy_key TEXT NOT NULL,
    original_json TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    original_name TEXT NOT NULL,
    internal_path TEXT NOT NULL,
    preview_path TEXT NOT NULL,
    bytes INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
