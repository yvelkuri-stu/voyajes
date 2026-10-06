/**
 * Share-page comments — localStorage demo today; schema shaped for a future API.
 *
 * Future endpoints (sketch):
 *   GET    /api/shares/:shareId/comments
 *   POST   /api/shares/:shareId/comments
 *   POST   /api/comments/:id/replies
 *   POST   /api/comments/:id/reactions  { emoji }
 *   DELETE /api/comments/:id/reactions/:emoji
 */

const LS_COMMENTS = "voyajes.comments.v1";
const LS_SHARE_REACTIONS = "voyajes.share.reactions.v1";

/** API-ready comment document (local demo omits server ids / auth). */
export type CommentDoc = {
  id: string;
  shareId: string;
  /** null = top-level thread root */
  parentId: string | null;
  author: string;
  /** Future: authenticated user id */
  authorId: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  /** emoji → local reaction count (server would track per-user) */
  reactions: Record<string, number>;
  /** emojis the current browser has toggled on (demo proxy for “me”) */
  myReactions: string[];
};

export type ShareReactionMap = Record<string, number>;

type CommentIndex = Record<string, CommentDoc[]>;
type ShareReactionIndex = Record<string, ShareReactionMap>;

function readComments(): CommentIndex {
  try {
    const raw = localStorage.getItem(LS_COMMENTS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as CommentIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeComments(index: CommentIndex): void {
  localStorage.setItem(LS_COMMENTS, JSON.stringify(index));
}

function readShareReactions(): ShareReactionIndex {
  try {
    const raw = localStorage.getItem(LS_SHARE_REACTIONS);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ShareReactionIndex;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeShareReactions(index: ShareReactionIndex): void {
  localStorage.setItem(LS_SHARE_REACTIONS, JSON.stringify(index));
}

function newId(prefix: string): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) {
    const bytes = new Uint8Array(10);
    crypto.getRandomValues(bytes);
    for (const b of bytes) suffix += alphabet[b % alphabet.length];
  } else {
    suffix = Math.random().toString(36).slice(2, 12);
  }
  return `${prefix}_${suffix}`;
}

export function listComments(shareId: string): CommentDoc[] {
  const list = readComments()[shareId] ?? [];
  return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function addComment(input: {
  shareId: string;
  parentId?: string | null;
  author: string;
  body: string;
}): CommentDoc {
  const now = new Date().toISOString();
  const doc: CommentDoc = {
    id: newId("cmt"),
    shareId: input.shareId,
    parentId: input.parentId ?? null,
    author: input.author.trim() || "Anonymous voyager",
    authorId: null,
    body: input.body.trim(),
    createdAt: now,
    updatedAt: now,
    reactions: {},
    myReactions: [],
  };
  const index = readComments();
  const list = index[input.shareId] ?? [];
  list.push(doc);
  index[input.shareId] = list;
  writeComments(index);
  return doc;
}

export function toggleCommentReaction(
  shareId: string,
  commentId: string,
  emoji: string,
): CommentDoc | null {
  const index = readComments();
  const list = index[shareId];
  if (!list) return null;
  const idx = list.findIndex((c) => c.id === commentId);
  if (idx < 0) return null;
  const prev = list[idx];
  const has = prev.myReactions.includes(emoji);
  const reactions = { ...prev.reactions };
  const count = reactions[emoji] ?? 0;
  if (has) {
    const next = count - 1;
    if (next <= 0) delete reactions[emoji];
    else reactions[emoji] = next;
  } else {
    reactions[emoji] = count + 1;
  }
  const myReactions = has
    ? prev.myReactions.filter((e) => e !== emoji)
    : [...prev.myReactions, emoji];
  const nextDoc: CommentDoc = {
    ...prev,
    reactions,
    myReactions,
    updatedAt: new Date().toISOString(),
  };
  list[idx] = nextDoc;
  index[shareId] = list;
  writeComments(index);
  return nextDoc;
}

export function getShareReactions(shareId: string): ShareReactionMap {
  return { ...(readShareReactions()[shareId] ?? {}) };
}

export function toggleShareReaction(
  shareId: string,
  emoji: string,
  currentlyOn: boolean,
): ShareReactionMap {
  const index = readShareReactions();
  const map = { ...(index[shareId] ?? {}) };
  const count = map[emoji] ?? 0;
  if (currentlyOn) {
    const next = count - 1;
    if (next <= 0) delete map[emoji];
    else map[emoji] = next;
  } else {
    map[emoji] = count + 1;
  }
  index[shareId] = map;
  writeShareReactions(index);
  return map;
}

/** Nested tree for UI rendering */
export type CommentNode = CommentDoc & { replies: CommentNode[] };

export function buildCommentTree(comments: CommentDoc[]): CommentNode[] {
  const byParent = new Map<string | null, CommentDoc[]>();
  for (const c of comments) {
    const key = c.parentId;
    const bucket = byParent.get(key) ?? [];
    bucket.push(c);
    byParent.set(key, bucket);
  }
  const walk = (parentId: string | null): CommentNode[] => {
    const kids = byParent.get(parentId) ?? [];
    return kids.map((c) => ({
      ...c,
      replies: walk(c.id),
    }));
  };
  return walk(null);
}

/** Shape a future API would accept/return (export for docs / typed clients). */
export type ApiCommentPayload = {
  shareId: string;
  parentId: string | null;
  body: string;
  author?: string;
};

export function toApiPayload(doc: CommentDoc): ApiCommentPayload & {
  id: string;
  createdAt: string;
  reactions: Record<string, number>;
} {
  return {
    id: doc.id,
    shareId: doc.shareId,
    parentId: doc.parentId,
    body: doc.body,
    author: doc.author,
    createdAt: doc.createdAt,
    reactions: doc.reactions,
  };
}
