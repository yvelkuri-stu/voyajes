-- v0.9 "One Link": share previews, moderation, event basics.
-- Designed so v1.0 (recap loop, crowd votes, notifications) can add tables without touching these.
ALTER TABLE voyages ADD COLUMN cover_key TEXT;          -- 1200x630 themed JPG for og:image
ALTER TABLE voyages ADD COLUMN preview_key TEXT;        -- short 9:16 MP4 for og:video (optional)
ALTER TABLE voyages ADD COLUMN status TEXT NOT NULL DEFAULT 'live'; -- live | removed (admin takedown)
ALTER TABLE voyages ADD COLUMN removed_reason TEXT;
ALTER TABLE voyages ADD COLUMN removed_at INTEGER;
ALTER TABLE rsvps ADD COLUMN plus_ones INTEGER NOT NULL DEFAULT 0;
ALTER TABLE comments ADD COLUMN hidden INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS updates (
  id TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_updates_voyage ON updates (voyage_id, created_at);

CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  target_type TEXT NOT NULL,   -- voyage | comment | drop | clip
  target_id TEXT,
  reason TEXT NOT NULL,        -- spam | nudity | harassment | violence | hate | other
  note TEXT,
  device_id TEXT,
  status TEXT NOT NULL DEFAULT 'open', -- open | actioned | dismissed
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reports_voyage ON reports (voyage_id, status);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports (status, created_at);

CREATE TABLE IF NOT EXISTS blocks (
  voyage_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (voyage_id, device_id)
);
