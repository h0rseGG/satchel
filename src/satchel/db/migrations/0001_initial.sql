-- Satchel v3 schema, version 1 (SPEC 3.1).
-- NEVER edit this file once shipped: add 0002_*.sql instead (SPEC 3.2).
-- STRICT tables make SQLite enforce column types, so a bug can't store "1" as text
-- where a number belongs.

CREATE TABLE meta (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
) STRICT;

CREATE TABLE types (
    id         TEXT PRIMARY KEY,
    label      TEXT NOT NULL,
    plural     TEXT NOT NULL,
    person     INTEGER NOT NULL DEFAULT 0 CHECK (person IN (0, 1)),
    builtin    INTEGER NOT NULL DEFAULT 0 CHECK (builtin IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE type_fields (
    id         TEXT PRIMARY KEY,
    type_id    TEXT NOT NULL REFERENCES types (id) ON DELETE CASCADE,
    label      TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('text', 'long_text', 'number', 'date', 'link', 'url')),
    link_type  TEXT REFERENCES types (id) ON DELETE SET NULL,
    removed    INTEGER NOT NULL DEFAULT 0 CHECK (removed IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0
) STRICT;

CREATE TABLE files (
    id         TEXT PRIMARY KEY,
    -- A file outlives its entity (SET NULL): nothing gets lost by deleting an entity.
    entity_id  TEXT REFERENCES entities (id) ON DELETE SET NULL,
    name       TEXT NOT NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('image', 'text')),
    mime       TEXT NOT NULL,
    size       INTEGER NOT NULL,
    width      INTEGER,
    height     INTEGER,
    caption    TEXT NOT NULL DEFAULT '',
    data       BLOB NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE entities (
    id               TEXT PRIMARY KEY,
    -- RESTRICT: a type in use can't be deleted until its entities are moved.
    type_id          TEXT REFERENCES types (id) ON DELETE RESTRICT,
    name             TEXT NOT NULL,
    summary          TEXT NOT NULL DEFAULT '',
    body             TEXT NOT NULL DEFAULT '',
    is_candidate     INTEGER NOT NULL DEFAULT 0 CHECK (is_candidate IN (0, 1)),
    thread_state     TEXT CHECK (thread_state IN ('open', 'closed')),
    portrait_file_id TEXT REFERENCES files (id) ON DELETE SET NULL,
    created_at       TEXT NOT NULL,
    updated_at       TEXT NOT NULL
) STRICT;
CREATE INDEX entities_type ON entities (type_id);

CREATE TABLE entity_aliases (
    entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    alias     TEXT NOT NULL,
    PRIMARY KEY (entity_id, alias)
) STRICT;

CREATE TABLE entity_tags (
    entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    tag       TEXT NOT NULL,
    PRIMARY KEY (entity_id, tag)
) STRICT;

CREATE TABLE field_values (
    entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    field_id  TEXT NOT NULL REFERENCES type_fields (id) ON DELETE CASCADE,
    value     TEXT NOT NULL,
    PRIMARY KEY (entity_id, field_id)
) STRICT;

CREATE TABLE sessions (
    id         TEXT PRIMARY KEY,
    number     INTEGER NOT NULL UNIQUE,
    date       TEXT NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    recap      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;

CREATE TABLE notes (
    id            TEXT PRIMARY KEY,
    text          TEXT NOT NULL,
    session_id    TEXT REFERENCES sessions (id) ON DELETE SET NULL,
    reviewed_at   TEXT,
    original_text TEXT,
    created_at    TEXT NOT NULL,
    updated_at    TEXT NOT NULL
) STRICT;
CREATE INDEX notes_session ON notes (session_id);
CREATE INDEX notes_created ON notes (created_at);
CREATE INDEX notes_unreviewed ON notes (reviewed_at) WHERE reviewed_at IS NULL;

CREATE TABLE note_links (
    note_id   TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    entity_id TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    how       TEXT NOT NULL CHECK (how IN ('typed', 'auto', 'confirmed')),
    PRIMARY KEY (note_id, entity_id)
) STRICT;
CREATE INDEX note_links_entity ON note_links (entity_id);

CREATE TABLE note_tags (
    note_id TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag     TEXT NOT NULL,
    PRIMARY KEY (note_id, tag)
) STRICT;
CREATE INDEX note_tags_tag ON note_tags (tag);

CREATE TABLE pins (
    entity_id  TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    note_id    TEXT NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (entity_id, note_id)
) STRICT;

CREATE TABLE relationships (
    id         TEXT PRIMARY KEY,
    from_id    TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    to_id      TEXT NOT NULL REFERENCES entities (id) ON DELETE CASCADE,
    type       TEXT NOT NULL,
    directed   INTEGER NOT NULL DEFAULT 1 CHECK (directed IN (0, 1)),
    notes      TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
) STRICT;
CREATE INDEX relationships_from ON relationships (from_id);
CREATE INDEX relationships_to ON relationships (to_id);

CREATE TABLE profile (
    section    TEXT PRIMARY KEY,
    text       TEXT NOT NULL DEFAULT '',
    updated_at TEXT NOT NULL
) STRICT;

-- Full-text search. Rows are keyed by note_id/entity_id, not rowid: VACUUM (and so
-- VACUUM INTO, used by Pack kit) may renumber the rowids of tables with text keys.
CREATE VIRTUAL TABLE notes_fts USING fts5 (
    note_id UNINDEXED,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);
CREATE VIRTUAL TABLE entities_fts USING fts5 (
    entity_id UNINDEXED,
    name,
    aliases,
    tags,
    summary,
    body,
    tokenize = 'unicode61 remove_diacritics 2'
);

-- Built-in types, fixed ids (must match satchel.core.model.BUILTIN_TYPES; a test checks).
INSERT INTO types (id, label, plural, person, builtin, sort_order, created_at, updated_at) VALUES
    ('type-npc',       'NPC',       'NPCs',       1, 1, 0, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-location',  'Location',  'Locations',  0, 1, 1, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-faction',   'Faction',   'Factions',   0, 1, 2, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-item',      'Item',      'Items',      0, 1, 3, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-character', 'Character', 'Characters', 1, 1, 4, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-thread',    'Thread',    'Threads',    0, 1, 5, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
    ('type-other',     'Other',     'Other',      0, 1, 6, '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z');
