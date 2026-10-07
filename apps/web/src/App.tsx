import { Routes, Route, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Create } from "./pages/Create";
import { Themes } from "./pages/Themes";
import { Share, ShareBootstrap } from "./pages/Share";
import { SignIn } from "./pages/SignIn";
import { AuthCallback } from "./pages/AuthCallback";
import { createRouteKey } from "./lib/startFresh";

/** Remount Create when Home/Share set a fresh nonce so wipe cannot race old state. */
function CreateRoute() {
  const location = useLocation();
  // Re-read on every navigation (search/key change) so a new freshNonce remounts Create.
  void location.search;
  void location.key;
  const key = createRouteKey();
  return <Create key={key} />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<CreateRoute />} />
        <Route path="themes" element={<Themes />} />
        <Route path="share" element={<ShareBootstrap />} />
        <Route path="v/:id" element={<Share />} />
        <Route path="signin" element={<SignIn />} />
        <Route path="auth/callback" element={<AuthCallback />} />
      </Route>
    </Routes>
  );
}
