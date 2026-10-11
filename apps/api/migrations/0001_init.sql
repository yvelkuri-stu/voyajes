-- Voyajes collaboration API (v0.7)
CREATE TABLE voyages (
  id TEXT PRIMARY KEY,
  host_hash TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  mode TEXT NOT NULL DEFAULT 'voyage',
  pack TEXT NOT NULL,
  drops_enabled INTEGER NOT NULL DEFAULT 0,
  drops_max INTEGER NOT NULL DEFAULT 10,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE media (
  key TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  role TEXT NOT NULL,            -- host | drop | rsvp
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX media_voyage ON media(voyage_id);
CREATE TABLE drops (
  id TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT,
  media_key TEXT NOT NULL,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'signed', -- signed | pending | accepted | rejected | added
  created_at INTEGER NOT NULL
);
CREATE INDEX drops_voyage ON drops(voyage_id, status);
CREATE TABLE reactions (
  voyage_id TEXT NOT NULL,
  emoji TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (voyage_id, emoji)
);
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  voyage_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX comments_voyage ON comments(voyage_id, created_at);
CREATE TABLE hearts (
  voyage_id TEXT NOT NULL,
  clip INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  PRIMARY KEY (voyage_id, clip, device_id)
);
CREATE TABLE rsvps (
  voyage_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  answer TEXT NOT NULL,          -- yes | no | maybe
  note TEXT,
  media_key TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (voyage_id, device_id)
);
CREATE TABLE rate (
  k TEXT PRIMARY KEY,
  n INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);
