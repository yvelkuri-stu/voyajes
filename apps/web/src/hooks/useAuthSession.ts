import { useEffect, useState } from "react";
import { clearSession, getSession, type AuthSession } from "../lib/auth";

export function useAuthSession() {
  const [session, setSessionState] = useState<AuthSession | null>(() => getSession());

  useEffect(() => {
    const sync = () => setSessionState(getSession());
    window.addEventListener("voyajes-auth-change", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("voyajes-auth-change", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return {
    session,
    signOut: () => clearSession(),
  };
}
