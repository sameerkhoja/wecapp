import React from "react";
import { createRoot } from "react-dom/client";
import App from "../apps/mobile/App";
import "./web.css";
createRoot(document.getElementById("root")!).render(<App />);

if ((import.meta as any).env.PROD && "serviceWorker" in navigator)
  navigator.serviceWorker.register("/sw.js").catch(() => {});
