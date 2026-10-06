import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { completeOAuthCallback } from "../lib/auth";

function readNext(): string {
  try {
    const n = sessionStorage.getItem("voyajes.auth.next");
    if (n && n.startsWith("/") && !n.startsWith("//") && !n.startsWith("/signin") && !n.startsWith("/auth")) {
      return n;
    }
  } catch {
    /* ignore */
  }
  return "/create";
}

export function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [ok, setOk] = useState<boolean | null>(null);
  const [nextPath, setNextPath] = useState("/create");

  useEffect(() => {
    const dest = readNext();
    setNextPath(dest);
    const result = completeOAuthCallback(window.location.search);
    setOk(result.ok);
    setMessage(result.message);
    if (result.ok) {
      try {
        sessionStorage.removeItem("voyajes.auth.next");
      } catch {
        /* ignore */
      }
      const t = window.setTimeout(() => navigate(dest, { replace: true }), 1600);
      return () => window.clearTimeout(t);
    }
  }, [navigate]);

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1 className="display" style={{ margin: "0 0 12px", fontSize: "1.5rem" }}>
          {ok === null ? "Almost there…" : ok ? "Welcome aboard" : "Sign-in hiccup"}
        </h1>
        <p className="muted" style={{ margin: "0 0 20px" }}>
          {message}
        </p>
        {ok === false && (
          <Link to={`/signin?next=${encodeURIComponent(nextPath)}`} className="btn btn-primary">
            Try again
          </Link>
        )}
        {ok === true && (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Redirecting to <code>{nextPath}</code>…{" "}
            <Link to={nextPath}>go now</Link>
          </p>
        )}
      </div>
    </div>
  );
}
