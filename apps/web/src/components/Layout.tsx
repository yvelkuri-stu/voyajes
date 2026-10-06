import { NavLink, Outlet } from "react-router-dom";
import { Logo } from "./Logo";
import { brand } from "@voyajes/core";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/create", label: "Create" },
  { to: "/themes", label: "Themes" },
  { to: "/share", label: "Share" },
];

export function Layout() {
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
        <span className="usage-chip" title="Free plan stub">
          Free · 2 GB
        </span>
        <button type="button" className="btn btn-ghost" style={{ padding: "8px 14px" }}>
          Sign in
        </button>
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
        {brand.tagline} · Import & preview live — video encode still stubbed
      </p>
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}
