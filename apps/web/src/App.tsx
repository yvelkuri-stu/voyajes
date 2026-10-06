import { Routes, Route } from "react-router-dom";
import { Layout } from "./components/Layout";
import { Home } from "./pages/Home";
import { Create } from "./pages/Create";
import { Themes } from "./pages/Themes";
import { Share } from "./pages/Share";

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="create" element={<Create />} />
        <Route path="themes" element={<Themes />} />
        <Route path="v/:id" element={<Share />} />
      </Route>
    </Routes>
  );
}
