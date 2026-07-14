import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./stores/theme.store";
// Fonts auto-hébergées (bundlées par Vite) : pas d'appel à Google Fonts —
// pas de fuite d'IP vers un tiers, et compatible CSP font-src 'self'.
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-sans/700.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
