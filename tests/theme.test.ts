import { test } from "node:test";
import assert from "node:assert/strict";
import { runInNewContext } from "node:vm";
import { isTheme, resolveTheme, themeInitScript, THEME_STORAGE_KEY } from "../lib/theme";

test("theme preferences accept only explicit light/dark values and otherwise follow the system", () => {
  for (const value of [null, undefined, "system", "garbage", {}, "DARK"]) {
    assert.equal(isTheme(value), false);
    assert.equal(resolveTheme(value, true), "dark");
    assert.equal(resolveTheme(value, false), "light");
  }
  assert.equal(resolveTheme("light", true), "light");
  assert.equal(resolveTheme("dark", false), "dark");
});

test("pre-paint bootstrap restores preferences, follows system and tolerates blocked storage", () => {
  for (const [saved, systemDark, expected] of [["light", true, "light"], ["dark", false, "dark"], [null, true, "dark"], ["invalid", false, "light"], ["blocked", false, "light"]] as const) {
    const dataset: Record<string, string> = {};
    runInNewContext(themeInitScript, {
      localStorage: { getItem: (key: string) => { assert.equal(key, THEME_STORAGE_KEY); if (saved === "blocked") throw new Error("Denied"); return saved; } },
      window: { matchMedia: (query: string) => { assert.equal(query, "(prefers-color-scheme: dark)"); return { matches: systemDark }; } },
      document: { documentElement: { dataset } },
    });
    assert.equal(dataset.theme, expected);
  }
});
