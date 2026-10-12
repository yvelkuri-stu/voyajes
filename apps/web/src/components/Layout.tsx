import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation, useSearchParams } from "react-router-dom";
import { Logo } from "./Logo";
import { useAuthSession } from "../hooks/useAuthSession";
import { usePrefs } from "../hooks/usePrefs";
import { NotificationBell } from "./NotificationBell";
import { startInboxPolling } from "../lib/push";
import { InboxToast } from "./AfterMovie";
import { InstallPrompt } from "./InstallPrompt";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/create", label: "Story", mode: "voyage" as const },
  { to: "/create?mode=invitation", label: "Invitation", mode: "invitation" as const },
];

export function Layout() {
  const { session, signOut } = useAuthSession();
  const { prefs } = usePrefs();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [inviteGuest, setInviteGuest] = useState(false);

  // v1.0 in-app notifications (fallback for browsers without Web Push)
  useEffect(() => startInboxPolling(), []);

  // Share.tsx sets body.invite-guest for invitation guest views (no ?host=1)
  useEffect(() => {
    const sync = () =>
      setInviteGuest(document.body.classList.contains("invite-guest"));
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { attributes: true, attributeFilter: ["class"] });
    return () => obs.disconnect();
  }, [location.pathname, location.search]);

  const onSharePath = /^\/v\//.test(location.pathname);
  const hostView = searchParams.get("host") === "1";
  // Hide chrome for immersive guest invites; voyage shares keep the shell
  const hideChrome = inviteGuest || (onSharePath && !hostView && inviteGuest);

  const continueTo = `/signin?next=${encodeURIComponent(
    location.pathname.startsWith("/signin") || location.pathname.startsWith("/auth")
      ? "/create"
      : `${location.pathname}${location.search}`,
  )}`;

  return (
    <div
      className={`app-shell${prefs.kidsMode ? " is-kids" : ""}${prefs.reduceMotion ? " is-still" : ""}${
        prefs.minimalistMode ? " is-minimalist" : ""
      }${hideChrome ? " is-invite-guest" : ""}`}
    >
      {!hideChrome && <div className="ai-ambient" aria-hidden="true" />}
      {!hideChrome && (
        <header className="topnav">
          <NavLink to="/" style={{ display: "flex", alignItems: "center" }}>
            <Logo />
          </NavLink>
          <nav className="topnav-links" aria-label="Primary">
            {links.map((l) => (
              <NavLink
                key={l.label}
                to={l.to}
                end={l.end}
                className={() => {
                  const invite = new URLSearchParams(location.search).get("mode") === "invitation";
                  const onCreate = location.pathname === "/create";
                  let active = false;
                  if ("mode" in l && l.mode === "invitation") {
                    active = onCreate && invite;
                  } else if ("mode" in l && l.mode === "voyage") {
                    active = onCreate && !invite;
                  } else if (l.end) {
                    active = location.pathname === "/";
                  } else {
                    active = location.pathname === l.to || location.pathname.startsWith(l.to + "/");
                  }
                  return `nav-link${active ? " active" : ""}`;
                }}
              >
                {l.label}
              </NavLink>
            ))}
          </nav>
          <NotificationBell />
          {session ? (
            <div className="auth-nav">
              <span className="auth-nav-name" title={`${session.provider} · stub session`}>
                {session.displayName}
                {session.stub ? " · stub" : ""}
              </span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ padding: "8px 14px" }}
                onClick={signOut}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link to={continueTo} className="btn btn-ghost" style={{ padding: "8px 14px" }}>
              Continue
            </Link>
          )}
        </header>
      )}
      <main className={`main${hideChrome ? " main-immersive" : ""}`}>
        <Outlet />
      </main>
      {!hideChrome && <InstallPrompt />}
      {hideChrome && <InboxToast />}
    </div>
  );
}
