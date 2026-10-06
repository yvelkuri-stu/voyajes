import { NavLink, Outlet, Link } from "react-router-dom";
import { Logo } from "./Logo";
import { brand } from "@voyajes/core";
import { useAuthSession } from "../hooks/useAuthSession";
import { NotificationBell } from "./NotificationBell";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/create", label: "Create" },
  { to: "/themes", label: "Themes" },
  { to: "/share", label: "Share" },
];

export function Layout() {
  const { session, signOut } = useAuthSession();

  return (
    <div className="app-shell">
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
          <Link to="/signin" className="btn btn-ghost" style={{ padding: "8px 14px" }}>
            Sign in
          </Link>
        )}
      </header>
      <p
        className="muted"
        style={{
          textAlign: "center",
          margin: 0,
          padding: "8px 16px",
          fontSize: "0.8rem",
          borderBottom: "1px solid var(--border-subtle)",
          background: "rgba(232,74,255,0.06)",
        }}
      >
        {brand.tagline} · 14 templates · social export presets · browser WebM
      </p>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
