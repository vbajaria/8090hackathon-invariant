export type Theme = "light" | "dark";
export const THEME_STORAGE_KEY = "invariant-theme";

export function isTheme(value: unknown): value is Theme {
  return value === "light" || value === "dark";
}

export function resolveTheme(saved: unknown, systemDark: boolean): Theme {
  return isTheme(saved) ? saved : systemDark ? "dark" : "light";
}

// Static, trusted code only. Runs in <head> before paint; blocked storage is harmless.
export const themeInitScript = `(() => {
  let saved;
  try { saved = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}); } catch {}
  const theme = saved === "light" || saved === "dark" ? saved
    : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  document.documentElement.dataset.theme = theme;
})();`;
