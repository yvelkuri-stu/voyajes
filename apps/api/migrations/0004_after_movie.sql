-- v1.0 "After-Movie": crowd votes, after-movie state, notifications (Web Push + in-app inbox).
ALTER TABLE voyages ADD COLUMN aftermovie_at INTEGER;      -- when the after-movie was released to guests
ALTER TABLE voyages ADD COLUMN aftermovie_key TEXT;        -- optional rendered MP4/WebM (host upload)

CREATE TABLE IF NOT EXISTS votes (
  voyage_id TEXT NOT NULL,
  drop_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (voyage_id, drop_id, device_id)
);
CREATE INDEX IF NOT EXISTS idx_votes_voyage ON votes (voyage_id, drop_id);

CREATE TABLE IF NOT EXISTS notices (
  id TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  kind TEXT NOT NULL,           -- aftermovie | update
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notices_voyage ON notices (voyage_id, created_at);

CREATE TABLE IF NOT EXISTS push_subs (
  endpoint_hash TEXT NOT NULL,
  voyage_id TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  device_id TEXT,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (endpoint_hash, voyage_id)
);
CREATE INDEX IF NOT EXISTS idx_push_voyage ON push_subs (voyage_id);
