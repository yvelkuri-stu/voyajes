-- Media fallback when the account has no R2 yet: chunked blobs in D1.
CREATE TABLE blob_chunks (
  key TEXT NOT NULL,
  idx INTEGER NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (key, idx)
);
CREATE TABLE blob_meta (
  key TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  chunks INTEGER NOT NULL
);
