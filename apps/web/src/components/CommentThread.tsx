import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addComment,
  buildCommentTree,
  listComments,
  toggleCommentReaction,
  type CommentNode,
} from "../lib/commentStore";
import { QUICK_REACTIONS, rememberEmoji } from "../lib/emoji";
import { getSession } from "../lib/auth";
import { EmojiPicker } from "./EmojiPicker";

type Props = {
  shareId: string;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function CommentItem({
  node,
  shareId,
  depth,
  onChanged,
}: {
  node: CommentNode;
  shareId: string;
  depth: number;
  onChanged: () => void;
}) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [reactOpen, setReactOpen] = useState(false);

  const submitReply = (e: FormEvent) => {
    e.preventDefault();
    if (!replyBody.trim()) return;
    const session = getSession();
    addComment({
      shareId,
      parentId: node.id,
      author: session?.displayName ?? "Anonymous voyager",
      body: replyBody,
    });
    setReplyBody("");
    setReplyOpen(false);
    onChanged();
  };

  const react = (emoji: string) => {
    rememberEmoji(emoji);
    toggleCommentReaction(shareId, node.id, emoji);
    setReactOpen(false);
    onChanged();
  };

  const reactionEntries = Object.entries(node.reactions).sort((a, b) => b[1] - a[1]);

  return (
    <li className={`comment-item depth-${Math.min(depth, 4)}`}>
      <div className="comment-card">
        <div className="comment-meta">
          <strong>{node.author}</strong>
          <span className="muted">{formatWhen(node.createdAt)}</span>
        </div>
        <p className="comment-body">{node.body}</p>
        <div className="comment-reactions">
          {reactionEntries.map(([emoji, count]) => (
            <button
              key={emoji}
              type="button"
              className={`comment-react-chip${
                node.myReactions.includes(emoji) ? " is-mine" : ""
              }`}
              onClick={() => react(emoji)}
              aria-label={`${emoji} ${count}`}
            >
              {emoji} <span>{count}</span>
            </button>
          ))}
          <div className="comment-react-wrap">
            <button
              type="button"
              className="btn-linkish"
              onClick={() => setReactOpen((o) => !o)}
              aria-expanded={reactOpen}
            >
              React
            </button>
            {reactOpen && (
              <div className="comment-react-pop">
                {QUICK_REACTIONS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    className="emoji-cell"
                    onClick={() => react(e)}
                  >
                    {e}
                  </button>
                ))}
                <EmojiPicker onSelect={react} label="＋" />
              </div>
            )}
          </div>
          {depth < 3 && (
            <button
              type="button"
              className="btn-linkish"
              onClick={() => setReplyOpen((o) => !o)}
            >
              Reply
            </button>
          )}
        </div>
        {replyOpen && (
          <form className="comment-reply-form" onSubmit={submitReply}>
            <div className="comment-compose-row">
              <input
                value={replyBody}
                onChange={(e) => setReplyBody(e.target.value)}
                placeholder="Write a reply… emoji OK"
                aria-label="Reply body"
              />
              <EmojiPicker
                onSelect={(emoji) => setReplyBody((b) => b + emoji)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={!replyBody.trim()}>
              Post reply
            </button>
          </form>
        )}
      </div>
      {node.replies.length > 0 && (
        <ul className="comment-replies">
          {node.replies.map((r) => (
            <CommentItem
              key={r.id}
              node={r}
              shareId={shareId}
              depth={depth + 1}
              onChanged={onChanged}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function CommentThread({ shareId }: Props) {
  const [tick, setTick] = useState(0);
  const [author, setAuthor] = useState(() => getSession()?.displayName ?? "");
  const [body, setBody] = useState("");

  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const session = getSession();
    if (session?.displayName) setAuthor(session.displayName);
  }, []);

  const tree = useMemo(() => {
    void tick;
    return buildCommentTree(listComments(shareId));
  }, [shareId, tick]);

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    addComment({
      shareId,
      parentId: null,
      author: author.trim() || "Anonymous voyager",
      body,
    });
    setBody("");
    refresh();
  };

  return (
    <section className="comment-thread" aria-label="Comments">
      <div className="comment-thread-head">
        <h3 style={{ margin: 0 }}>Comments</h3>
        <span className="muted" style={{ fontSize: "0.78rem" }}>
          Demo · localStorage only
        </span>
      </div>
      <p className="muted comment-sync-note">
        Threads live in this browser for now. Cloud sync (and cross-device
        replies) needs a backend API later — schema is ready.
      </p>

      <form className="comment-compose" onSubmit={onSubmit}>
        <label className="comment-author-field">
          <span className="muted">Display name</span>
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="Your name"
            aria-label="Comment author"
          />
        </label>
        <div className="comment-compose-row">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Say something about this voyage… emoji welcome ✨"
            rows={3}
            aria-label="Comment body"
          />
          <EmojiPicker onSelect={(emoji) => setBody((b) => b + emoji)} />
        </div>
        <button type="submit" className="btn btn-primary" disabled={!body.trim()}>
          Post comment
        </button>
      </form>

      {tree.length === 0 ? (
        <p className="muted" style={{ fontSize: "0.9rem" }}>
          No comments yet — be the first.
        </p>
      ) : (
        <ul className="comment-list">
          {tree.map((n) => (
            <CommentItem
              key={n.id}
              node={n}
              shareId={shareId}
              depth={0}
              onChanged={refresh}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
