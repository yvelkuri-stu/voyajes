import { Routes, Route, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { FreshUndoToast } from "./components/StartFresh";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Create } from "./pages/Create";
import { Themes } from "./pages/Themes";
import { Share, ShareBootstrap } from "./pages/Share";
import { SignIn } from "./pages/SignIn";
import { AuthCallback } from "./pages/AuthCallback";
import { Terms, Privacy } from "./pages/Legal";
import { Credits } from "./pages/Credits";
import { LiveCamera } from "./pages/LiveCamera";
import { TvMode } from "./pages/TvMode";
import { YearInVoyages } from "./pages/YearInVoyages";
import { createRouteKey, FRESH_EVENT } from "./lib/startFresh";

/** Remount Create when Home/Share set a fresh nonce so wipe cannot race old state. */
function CreateRoute() {
  const location = useLocation();
  // Re-read on every navigation (search/key change) so a new freshNonce remounts Create.
  void location.search;
  void location.key;
  const [, bump] = useState(0);
  useEffect(() => {
    const on = () => bump((n) => n + 1);
    window.addEventListener(FRESH_EVENT, on);
    return () => window.removeEventListener(FRESH_EVENT, on);
  }, []);
  const key = createRouteKey();
  return (
    <>
      <Create key={key} />
      <FreshUndoToast />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      {/* v1.0 full-screen surfaces: party camera (from the QR card) and TV mode */}
      <Route path="live/:id" element={<LiveCamera />} />
      <Route path="tv/:id" element={<TvMode />} />
      <Route path="year" element={<YearInVoyages />} />
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<CreateRoute />} />
        <Route path="themes" element={<Themes />} />
        <Route path="share" element={<ShareBootstrap />} />
        <Route path="v/:id" element={<Share />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="auth/callback" element={<AuthCallback />} />
        <Route path="terms" element={<Terms />} />
        <Route path="privacy" element={<Privacy />} />
        <Route path="credits" element={<Credits />} />
      </Route>
    </Routes>
  );
}
