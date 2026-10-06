import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { completeOAuthCallback } from "../lib/auth";

export function AuthCallback() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Finishing sign-in…");
  const [ok, setOk] = useState<boolean | null>(null);

  useEffect(() => {
    const result = completeOAuthCallback(window.location.search);
    setOk(result.ok);
    setMessage(result.message);
    if (result.ok) {
      const t = window.setTimeout(() => navigate("/", { replace: true }), 2200);
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
          <Link to="/signin" className="btn btn-primary">
            Try again
          </Link>
        )}
        {ok === true && (
          <p className="muted" style={{ fontSize: "0.85rem" }}>
            Redirecting home… <Link to="/">go now</Link>
          </p>
        )}
      </div>
    </div>
  );
}
