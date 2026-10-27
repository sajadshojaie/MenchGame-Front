import { useLayoutEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "manch-theme";

export function savedDark(): boolean {
  try {
    return window.localStorage.getItem(THEME_KEY) === "dark";
  } catch {
    return false;
  }
}

export function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeBoot() {
  useLayoutEffect(() => {
    applyTheme(savedDark());
  }, []);
  return null;
}

export function ThemeToggle({
  menuItem = false,
  onToggle,
}: {
  menuItem?: boolean;
  onToggle?: () => void;
}) {
  const [dark, setDark] = useState(false);

  useLayoutEffect(() => {
    const next = savedDark();
    applyTheme(next);
    setDark(next);
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    applyTheme(next);
    window.localStorage.setItem(THEME_KEY, next ? "dark" : "light");
    setDark(next);
    onToggle?.();
  }

  return (
    <button
      type="button"
      className={
        menuItem
          ? "flex min-h-11 w-full items-center justify-start gap-3 rounded-xl px-3 py-2 text-right text-sm font-semibold text-slate-700 hover:bg-slate-100 dark:text-slate-100 dark:hover:bg-white/10"
          : "icon-btn"
      }
      onClick={toggle}
      aria-label={dark ? "حالت روشن" : "حالت تاریک"}
      role={menuItem ? "menuitem" : undefined}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
      {menuItem ? (dark ? "حالت روشن" : "حالت تاریک") : null}
    </button>
  );
}
