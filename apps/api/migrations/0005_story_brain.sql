-- v1.1 "Story Brain": time capsules (voyage stays sealed until unlock_at; guests notified on open)
ALTER TABLE voyages ADD COLUMN unlock_at INTEGER;
ALTER TABLE voyages ADD COLUMN unlock_notified INTEGER;
