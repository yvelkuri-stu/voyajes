import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./styles/global.css";
import "./styles/layout.css";
import "./styles/safe-area.css";
import { initNative } from "./lib/native";
void initNative();

const basename = (import.meta.env.BASE_URL || "/").replace(/\/$/, "") || "/";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={basename === "/" ? undefined : basename}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
