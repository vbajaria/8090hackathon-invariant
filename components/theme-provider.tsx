"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { isTheme, resolveTheme, THEME_STORAGE_KEY, type Theme } from "@/lib/theme";

const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void } | null>(null);

function savedTheme(): Theme | null {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    return isTheme(saved) ? saved : null;
  } catch { return null; }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>("dark");
  const preference = useRef<Theme | null>(null);
  const apply = (next: Theme) => {
    document.documentElement.dataset.theme = next;
    setTheme(next);
  };

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    preference.current = savedTheme();
    apply(resolveTheme(preference.current, media.matches));
    const systemChanged = () => {
      if (!preference.current) apply(resolveTheme(null, media.matches));
    };
    const storageChanged = (event: StorageEvent) => {
      if (event.key !== THEME_STORAGE_KEY && event.key !== null) return;
      preference.current = savedTheme();
      apply(resolveTheme(preference.current, media.matches));
    };
    media.addEventListener("change", systemChanged);
    window.addEventListener("storage", storageChanged);
    return () => {
      media.removeEventListener("change", systemChanged);
      window.removeEventListener("storage", storageChanged);
    };
  }, []);

  const toggleTheme = () => {
    const next = theme === "dark" ? "light" : "dark";
    preference.current = next;
    apply(next);
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* Still works for this tab. */ }
  };

  return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme requires ThemeProvider");
  return theme;
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const label = `Switch to ${theme === "dark" ? "light" : "dark"} mode`;
  return <button className="icon-button theme-toggle" aria-label={label} title={label} onClick={toggleTheme}>
    {theme === "dark" ? <Sun size={17} /> : <Moon size={17} />}
  </button>;
}
