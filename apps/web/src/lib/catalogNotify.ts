/**
 * Catalog / app update notifications.
 * Compares localStorage last-seen catalog version vs live manifest.
 * Soft-prompts for browser Notification permission; always supports in-app toast/bell.
 */

import manifest from "../../public/catalog-manifest.json";
import { assetUrl } from "./assetUrl";

const LS_LAST_SEEN = "voyajes.catalog.lastSeenVersion";
const LS_NOTIF_PROMPTED = "voyajes.notif.softPrompted";
const LS_APP_VERSION_SEEN = "voyajes.app.lastSeenVersion";

export const APP_VERSION = "0.2.2";
export const BUNDLED_CATALOG_VERSION = String(
  (manifest as { catalogVersion?: string }).catalogVersion ?? "0",
);

export type CatalogUpdateInfo = {
  catalogVersion: string;
  previousVersion: string | null;
  isNew: boolean;
  templateCount: number;
  packCount: number;
  etag?: string;
};

export type InAppToast = {
  id: string;
  title: string;
  body: string;
  kind: "catalog" | "app" | "info";
  createdAt: number;
};

type Listener = () => void;

let toasts: InAppToast[] = [];
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

export function subscribeToasts(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): InAppToast[] {
  return toasts;
}

export function pushToast(toast: Omit<InAppToast, "id" | "createdAt">): InAppToast {
  const full: InAppToast = {
    ...toast,
    id: `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  };
  toasts = [full, ...toasts].slice(0, 8);
  emit();
  return full;
}

export function dismissToast(id: string) {
  toasts = toasts.filter((t) => t.id !== id);
  emit();
}

export function clearToasts() {
  toasts = [];
  emit();
}

export function getLastSeenCatalogVersion(): string | null {
  try {
    return localStorage.getItem(LS_LAST_SEEN);
  } catch {
    return null;
  }
}

export function markCatalogSeen(version: string) {
  try {
    localStorage.setItem(LS_LAST_SEEN, version);
  } catch {
    /* ignore */
  }
}

export function getLastSeenAppVersion(): string | null {
  try {
    return localStorage.getItem(LS_APP_VERSION_SEEN);
  } catch {
    return null;
  }
}

export function markAppSeen(version: string) {
  try {
    localStorage.setItem(LS_APP_VERSION_SEEN, version);
  } catch {
    /* ignore */
  }
}

export async function fetchLiveCatalogVersion(
  signal?: AbortSignal,
): Promise<CatalogUpdateInfo> {
  const url = assetUrl("/catalog-manifest.json") ?? "/catalog-manifest.json";
  let catalogVersion = BUNDLED_CATALOG_VERSION;
  let etag: string | undefined;
  let packCount = (manifest as { packs?: unknown[] }).packs?.length ?? 0;
  let templateCount = 0;
  try {
    const packs = (manifest as { packs?: Array<{ kind?: string }> }).packs ?? [];
    templateCount = packs.filter((p) => p.kind === "template").length;
  } catch {
    /* ignore */
  }

  try {
    const res = await fetch(url, {
      cache: "no-cache",
      signal,
      headers: { Accept: "application/json" },
    });
    if (res.ok) {
      const data = (await res.json()) as {
        catalogVersion?: string;
        etag?: string;
        packs?: Array<{ kind?: string }>;
      };
      if (data.catalogVersion) catalogVersion = data.catalogVersion;
      etag = data.etag;
      if (Array.isArray(data.packs)) {
        packCount = data.packs.length;
        templateCount = data.packs.filter((p) => p.kind === "template").length;
      }
    }
  } catch {
    /* fall back to bundled */
  }

  const previousVersion = getLastSeenCatalogVersion();
  const isNew =
    previousVersion === null
      ? false // first visit: seed without alarming
      : previousVersion !== catalogVersion;

  if (previousVersion === null) {
    markCatalogSeen(catalogVersion);
  }

  return {
    catalogVersion,
    previousVersion,
    isNew,
    templateCount,
    packCount,
    etag,
  };
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export function softPromptedAlready(): boolean {
  try {
    return localStorage.getItem(LS_NOTIF_PROMPTED) === "1";
  } catch {
    return false;
  }
}

export function markSoftPrompted() {
  try {
    localStorage.setItem(LS_NOTIF_PROMPTED, "1");
  } catch {
    /* ignore */
  }
}

/** Soft permission prompt — never forces. Returns final permission. */
export async function requestNotificationPermissionSoft(): Promise<
  NotificationPermission | "unsupported"
> {
  const perm = notificationPermission();
  if (perm === "unsupported" || perm === "granted" || perm === "denied") {
    return perm;
  }
  markSoftPrompted();
  try {
    const result = await Notification.requestPermission();
    return result;
  } catch {
    return "denied";
  }
}

export function fireBrowserNotification(title: string, body: string) {
  if (notificationPermission() !== "granted") return;
  try {
    const n = new Notification(title, {
      body,
      icon: undefined,
      tag: "voyajes-catalog",
    });
    window.setTimeout(() => n.close(), 8000);
  } catch {
    /* ignore */
  }
}

export async function checkForUpdates(opts?: {
  softPrompt?: boolean;
  signal?: AbortSignal;
}): Promise<{ catalog: CatalogUpdateInfo; appUpdate: boolean }> {
  const catalog = await fetchLiveCatalogVersion(opts?.signal);
  const lastApp = getLastSeenAppVersion();
  const appUpdate = lastApp !== null && lastApp !== APP_VERSION;
  if (lastApp === null) markAppSeen(APP_VERSION);

  if (catalog.isNew) {
    const title = "New Voyajes templates";
    const body = `Catalog ${catalog.catalogVersion} · ${catalog.templateCount} templates available`;
    pushToast({ title, body, kind: "catalog" });
    if (opts?.softPrompt && !softPromptedAlready() && notificationPermission() === "default") {
      // Soft in-app prompt only — actual Notification.requestPermission is user-gesture driven
      pushToast({
        title: "Get notified?",
        body: "Enable browser notifications when new templates land. You can allow from the bell.",
        kind: "info",
      });
      markSoftPrompted();
    } else {
      fireBrowserNotification(title, body);
    }
  }

  if (appUpdate) {
    pushToast({
      title: "Voyajes updated",
      body: `App ${APP_VERSION} is ready · refresh if anything looks stale`,
      kind: "app",
    });
    fireBrowserNotification("Voyajes updated", `Now on ${APP_VERSION}`);
  }

  return { catalog, appUpdate };
}
