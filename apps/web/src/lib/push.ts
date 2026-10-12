import { isNative, nativePushToken } from "./native";
/**
 * v1.0 notifications: Web Push where the browser supports it, in-app updates everywhere.
 * Followed voyages are polled while the app is open, so nobody misses the after-movie.
 */
import { apiEnabled, fetchNotices, fetchPushKey, subscribePush, type Notice } from "./api";
import { pushToast } from "./catalogNotify";

const FOLLOW = "voyajes.follow.v1";
type Follow = { id: string; title: string; seen: number; push?: boolean };

export function follows(): Follow[] {
  try {
    return JSON.parse(localStorage.getItem(FOLLOW) || "[]");
  } catch {
    return [];
  }
}
function saveFollows(list: Follow[]) {
  try {
    localStorage.setItem(FOLLOW, JSON.stringify(list.slice(0, 50)));
  } catch {
    /* ignore */
  }
}
export const isFollowing = (id: string) => follows().some((f) => f.id === id);
export function follow(id: string, title: string, push = false) {
  const prev = follows().find((f) => f.id === id);
  saveFollows([{ id, title, seen: prev?.seen ?? Date.now(), push: push || prev?.push }, ...follows().filter((f) => f.id !== id)]);
}

export const pushSupported = () =>
  typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

const urlB64 = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

/** Ask once, from a tap. Returns how the guest will hear back. */
export async function notifyMe(id: string, title: string): Promise<"push" | "in-app"> {
  follow(id, title);
  if (isNative()) {
    // Store apps: ask for native notification permission and register with FCM/APNs once configured.
    // Delivery from the API to native tokens is not wired yet (needs Firebase) — the in-app inbox covers it.
    const tok = await nativePushToken();
    if (tok) localStorage.setItem("voyajes.nativePushToken", tok);
    return "in-app";
  }
  if (!pushSupported() || !apiEnabled()) return "in-app";
  try {
    const key = await fetchPushKey();
    if (!key.publicKey) return "in-app";
    if ((await Notification.requestPermission()) !== "granted") return "in-app";
    const reg = await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, r) => setTimeout(() => r(new Error("no sw")), 4000))]);
    const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key.publicKey) }));
    await subscribePush(id, sub.endpoint);
    follow(id, title, true);
    return "push";
  } catch {
    return "in-app";
  }
}

export const INBOX_EVENT = "voyajes:notice";

/** In-app fallback: poll followed voyages; new notices become toasts + a window event. */
export async function pollFollowed(): Promise<Notice[]> {
  if (!apiEnabled()) return [];
  const list = follows();
  const fresh: Notice[] = [];
  for (const f of list.slice(0, 10)) {
    try {
      const { notices } = await fetchNotices(f.id, f.seen);
      if (!notices.length) continue;
      f.seen = Math.max(f.seen, ...notices.map((n) => n.created_at));
      for (const n of notices.slice(0, 2)) {
        fresh.push(n);
        pushToast({ title: n.title, body: n.body, kind: "info" });
        window.dispatchEvent(new CustomEvent(INBOX_EVENT, { detail: { voyageId: f.id, notice: n } }));
      }
    } catch {
      /* offline — try later */
    }
  }
  saveFollows(list);
  return fresh;
}

export function startInboxPolling(ms = 45000): () => void {
  void pollFollowed();
  const t = setInterval(() => void pollFollowed(), ms);
  const vis = () => document.visibilityState === "visible" && void pollFollowed();
  document.addEventListener("visibilitychange", vis);
  return () => {
    clearInterval(t);
    document.removeEventListener("visibilitychange", vis);
  };
}
