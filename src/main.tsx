import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@fontsource/caveat/latin-700.css";

import App from "./App";
import "./film.css";
import "./observe.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
