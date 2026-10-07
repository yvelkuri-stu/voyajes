import { useEffect, useState } from "react";
import { NavLink, Outlet, Link, useLocation, useSearchParams } from "react-router-dom";
import { Logo } from "./Logo";
import { brand } from "@voyajes/core";
import { useAuthSession } from "../hooks/useAuthSession";
import { usePrefs } from "../hooks/usePrefs";
import { NotificationBell } from "./NotificationBell";
import { InstallPrompt } from "./InstallPrompt";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/create", label: "Create", mode: "voyage" as const },
  { to: "/create?mode=invitation", label: "Invitation", mode: "invitation" as const },
  { to: "/themes", label: "Themes" },
  { to: "/share", label: "Share" },
];

export function Layout() {
  const { session, signOut } = useAuthSession();
  const { prefs, setKidsMode, setReduceMotion, setMinimalistMode } = usePrefs();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [inviteGuest, setInviteGuest] = useState(false);

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
          <span className="usage-chip" title="Free plan stub">
            Free · 2 GB
          </span>
          <div className="prefs-nav" role="group" aria-label="Display prefs">
            <button
              type="button"
              className={`prefs-toggle prefs-toggle-mini${prefs.minimalistMode ? " is-on" : ""}`}
              aria-pressed={prefs.minimalistMode}
              title="Minimalist mode — content first, icon chrome, quieter panels (default for new sessions)"
              onClick={() => setMinimalistMode(!prefs.minimalistMode)}
            >
              <span aria-hidden>◇</span>
              <span className="prefs-toggle-label">
                {prefs.minimalistMode ? "Minimal" : "Classic"}
              </span>
            </button>
            <button
              type="button"
              className={`prefs-toggle${prefs.kidsMode ? " is-on" : ""}`}
              aria-pressed={prefs.kidsMode}
              title="Kids Mode — bigger buttons, safer templates, stickers"
              onClick={() => setKidsMode(!prefs.kidsMode)}
            >
              {prefs.kidsMode ? "Kids on" : "Kids"}
            </button>
            <button
              type="button"
              className={`prefs-toggle${prefs.reduceMotion ? " is-on" : ""}`}
              aria-pressed={prefs.reduceMotion}
              title="Reduce motion"
              onClick={() => setReduceMotion(!prefs.reduceMotion)}
            >
              {prefs.reduceMotion ? "Still" : "Motion"}
            </button>
          </div>
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
      {!hideChrome && (
        <p
          className="muted tagline-bar"
          style={{
            textAlign: "center",
            margin: 0,
            padding: "8px 16px",
            fontSize: "0.8rem",
            borderBottom: "1px solid var(--border-subtle)",
            background: prefs.kidsMode
              ? "rgba(61,220,151,0.1)"
              : "rgba(232,74,255,0.06)",
          }}
        >
          {prefs.kidsMode
            ? "Kids Mode · bigger taps · safer templates · sticker stamps · guardian comments"
            : prefs.minimalistMode
              ? `${brand.tagline} · Minimalist on — tap ◇ Classic anytime · library + icon chrome`
              : `${brand.tagline} · Try Minimalist (◇) for a calmer Create`}
        </p>
      )}
      <main className={`main${hideChrome ? " main-immersive" : ""}`}>
        <Outlet />
      </main>
      {!hideChrome && <InstallPrompt />}
    </div>
  );
}
