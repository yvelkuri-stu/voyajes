import { NavLink, Outlet, Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { brand } from "@voyajes/core";
import { useAuthSession } from "../hooks/useAuthSession";
import { usePrefs } from "../hooks/usePrefs";
import { NotificationBell } from "./NotificationBell";
import { InstallPrompt } from "./InstallPrompt";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/create", label: "Create" },
  { to: "/themes", label: "Themes" },
  { to: "/share", label: "Share" },
];

export function Layout() {
  const { session, signOut } = useAuthSession();
  const { prefs, setKidsMode, setReduceMotion } = usePrefs();
  const location = useLocation();

  const continueTo = `/signin?next=${encodeURIComponent(
    location.pathname.startsWith("/signin") || location.pathname.startsWith("/auth")
      ? "/create"
      : `${location.pathname}${location.search}`,
  )}`;

  return (
    <div className={`app-shell${prefs.kidsMode ? " is-kids" : ""}`}>
      <header className="topnav">
        <NavLink to="/" style={{ display: "flex", alignItems: "center" }}>
          <Logo />
        </NavLink>
        <nav className="topnav-links" aria-label="Primary">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.end}
              className={({ isActive }) =>
                `nav-link${isActive ? " active" : ""}`
              }
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
          : `${brand.tagline} · 14 templates · social export presets · browser WebM`}
      </p>
      <main className="main">
        <Outlet />
      </main>
      <InstallPrompt />
    </div>
  );
}
