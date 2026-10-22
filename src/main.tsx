import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { ThemeBoot } from "@/components/ThemeToggle";
import App from "@/app/App";
import "@fontsource-variable/vazirmatn";
import "@/styles/globals.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeBoot />
    <App />
  </StrictMode>,
);
