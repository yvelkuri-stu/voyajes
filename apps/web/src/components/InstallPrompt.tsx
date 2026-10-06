import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "voyajes.installHint.dismissed";

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia?.("(display-mode: standalone)")?.matches;
  const ios = "standalone" in navigator && (navigator as Navigator & { standalone?: boolean }).standalone;
  return Boolean(mq || ios);
}

/**
 * Light install hint: uses beforeinstallprompt when Chromium offers it;
 * otherwise shows a short iOS / desktop tip once.
 */
export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
      setIosHint(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS Safari never fires beforeinstallprompt — soft tip after a beat.
    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    let timer: number | undefined;
    if (isIos && isSafari) {
      timer = window.setTimeout(() => {
        setIosHint(true);
        setVisible(true);
      }, 2800);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBip);
      if (timer) window.clearTimeout(timer);
    };
  }, []);

  if (!visible) return null;

  const dismiss = () => {
    setVisible(false);
    setDeferred(null);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    dismiss();
  };

  return (
    <div className="install-hint" role="status">
      <div className="install-hint-body">
        <strong>Install Voyajes</strong>
        <p className="muted">
          {iosHint
            ? "On iPhone/iPad: Share → Add to Home Screen for an app-like icon."
            : "Add to your home screen for quick access and a full-screen vibe."}
        </p>
      </div>
      <div className="install-hint-actions">
        {deferred && (
          <button type="button" className="btn btn-primary" onClick={install}>
            Install
          </button>
        )}
        <button type="button" className="btn btn-ghost" onClick={dismiss}>
          Not now
        </button>
      </div>
    </div>
  );
}
