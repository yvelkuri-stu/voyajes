import { useEffect, useRef, useState } from "react";
import { useAiActivity } from "../hooks/useAiActivity";
import { Link } from "react-router-dom";
import {
  APP_VERSION,
  BUNDLED_CATALOG_VERSION,
  checkForUpdates,
  clearToasts,
  dismissToast,
  getToasts,
  markAppSeen,
  markCatalogSeen,
  notificationPermission,
  requestNotificationPermissionSoft,
  subscribeToasts,
  type CatalogUpdateInfo,
  type InAppToast,
} from "../lib/catalogNotify";

export function NotificationBell() {
  const ai = useAiActivity();
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<InAppToast[]>(() => getToasts());
  const [catalog, setCatalog] = useState<CatalogUpdateInfo | null>(null);
  const [perm, setPerm] = useState(notificationPermission());
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeToasts(() => setToasts(getToasts())), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: MouseEvent | PointerEvent) => {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Capture so we close when tapping outside (incl. backdrop siblings)
    document.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  useEffect(() => {
    const ac = new AbortController();
    ai.begin("catalog");
    void checkForUpdates({ softPrompt: true, signal: ac.signal }).then((r) => {
      setCatalog(r.catalog);
      setPerm(notificationPermission());
      if (r.catalog?.isNew) ai.pulse("catalog", 1800);
      else ai.end();
    }).catch(() => ai.end());
    return () => {
      ac.abort();
      ai.end();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pulse once on mount
  }, []);

  const unread = toasts.length + (catalog?.isNew ? 1 : 0);

  const markAllSeen = () => {
    if (catalog) markCatalogSeen(catalog.catalogVersion);
    markAppSeen(APP_VERSION);
    clearToasts();
    setCatalog((c) => (c ? { ...c, isNew: false, previousVersion: c.catalogVersion } : c));
    setOpen(false);
  };

  const enableBrowser = async () => {
    const result = await requestNotificationPermissionSoft();
    setPerm(result);
  };

  return (
    <div className="notif-root" ref={rootRef}>
      <button
        type="button"
        className={`notif-bell${ai.kind === "catalog" ? " is-pulsing" : ""}`}
        aria-label={unread ? `Notifications (${unread})` : "Notifications"}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        title="Catalog & update notifications"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && <span className="notif-dot">{unread > 9 ? "9+" : unread}</span>}
      </button>

      {toasts[0] && !open && (
        <div className="notif-toast" role="status">
          <strong>{toasts[0].title}</strong>
          <span>{toasts[0].body}</span>
          <button type="button" className="btn btn-ghost" onClick={() => dismissToast(toasts[0].id)}>
            Dismiss
          </button>
        </div>
      )}

      {open && (
        <>
        <button
          type="button"
          className="notif-backdrop"
          aria-label="Close notifications"
          onClick={() => setOpen(false)}
        />
        <div className="notif-panel" role="dialog" aria-label="Notifications">
          <div className="notif-panel-head">
            <strong>Updates</strong>
            <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px" }} onClick={markAllSeen}>
              Mark seen
            </button>
          </div>
          <p className="muted" style={{ fontSize: "0.75rem", margin: "0 0 10px" }}>
            Catalog {catalog?.catalogVersion ?? BUNDLED_CATALOG_VERSION} · App {APP_VERSION}
            {perm === "granted" ? " · browser alerts on" : ""}
          </p>
          {catalog?.isNew ? (
            <div className="notif-item">
              <strong>New catalog packs</strong>
              <span className="muted">
                {catalog.catalogVersion} · {catalog.templateCount} templates · {catalog.packCount} packs
              </span>
              <Link to="/themes?tab=templates" className="btn btn-primary" style={{ marginTop: 8, width: "100%" }} onClick={() => setOpen(false)}>
                Browse templates
              </Link>
            </div>
          ) : (
            <div className="notif-item muted" style={{ fontSize: "0.85rem" }}>
              You&apos;re on the latest catalog · App {APP_VERSION}
            </div>
          )}
          {toasts.map((t) => (
            <div key={t.id} className="notif-item">
              <strong>{t.title}</strong>
              <span className="muted">{t.body}</span>
              <button type="button" className="btn btn-ghost" style={{ padding: "4px 8px", marginTop: 4 }} onClick={() => dismissToast(t.id)}>
                Dismiss
              </button>
            </div>
          ))}
          {perm === "default" && (
            <button type="button" className="btn btn-ghost" style={{ width: "100%", marginTop: 8 }} onClick={() => void enableBrowser()}>
              Enable browser notifications
            </button>
          )}
          {perm === "denied" && (
            <p className="muted" style={{ fontSize: "0.72rem", marginTop: 8 }}>
              Browser notifications blocked — in-app bell still works.
            </p>
          )}
          {perm === "unsupported" && (
            <p className="muted" style={{ fontSize: "0.72rem", marginTop: 8 }}>
              This browser has no Notification API — in-app toasts only.
            </p>
          )}
        </div>
        </>
      )}
    </div>
  );
}
