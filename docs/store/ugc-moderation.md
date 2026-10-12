# User-generated content: what reviewers check, and what Voyajes has

Apple guideline **1.2** and Google Play's **User Generated Content** policy both ask for the same five things.

| Requirement | Voyajes 1.1.0 | Where |
|---|---|---|
| Terms that forbid objectionable content, accepted by users | `/terms` ("Be kind…" rules, zero tolerance for abuse) | linked from Home footer, Share page, party camera |
| A way to **filter** objectionable content | Hosts approve/reject guest photos, hide comments; 3 distinct reports auto-hide a comment until reviewed | Manage panel on the share page |
| A way to **report** content | ⚑ Report on every voyage, photo and comment | API `POST /voyages/:id/report` |
| A way to **block** abusive users | Hosts block a device from posting | Manage panel → Block |
| Act on reports within 24 h + contact info | Takedown promise on `/terms`; owner takedown API `/admin/*` (needs `.secrets/admin-secret`) | `docs/domain.md`, `apps/api` |

### Before you submit
1. Make sure the contact on `/terms` and `/privacy` is an inbox you read (reviewers sometimes write to it).
2. Apple sometimes asks that people **agree to the terms before posting**. The party camera and comment box say "By posting you agree to the Terms"; if a reviewer pushes back, add a one-time checkbox there.
3. In App Review notes, paste: *"Guests can post photos/comments only inside a voyage they were invited to by link. Hosts moderate (approve photos, hide comments, block devices); anyone can report with ⚑; we act on reports within 24 hours. Demo: open the app → Make an invitation → Share link → open the link in a private window to act as a guest."*
4. Have a published demo voyage ready and put its link in the review notes.
