import { test, expect } from "@playwright/test";

const key = "invariant-theme";
const root = (page: import("@playwright/test").Page) => page.locator("html");

test("theme toggle follows system, persists override, syncs tabs and remains accessible on mobile", async ({ page, context }, info) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root(page)).toHaveAttribute("data-theme", "light");
  await expect(page.getByRole("button", { name: "Switch to dark mode" })).toBeVisible();
  await page.screenshot({ path: info.outputPath("light-dashboard.png"), fullPage: true });
  await page.getByRole("button", { name: "Switch to dark mode" }).focus();
  await page.keyboard.press("Enter");
  await expect(root(page)).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(key => localStorage.getItem(key), key)).toBe("dark");
  await page.reload();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await expect(root(page)).toHaveAttribute("data-theme", "dark");
  await page.screenshot({ path: info.outputPath("dark-dashboard.png"), fullPage: true });

  const other = await context.newPage();
  await other.emulateMedia({ colorScheme: "light" });
  await other.goto("/");
  await expect(root(other)).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(root(other)).toHaveAttribute("data-theme", "light");
  await other.close();

  await page.getByRole("button", { name: /New verification/ }).first().click();
  await expect(page.getByLabel("Run name", { exact: true })).toBeVisible();
  await page.getByLabel("Run name", { exact: true }).focus();
  await expect.poll(() => page.getByLabel("Run name", { exact: true }).evaluate(el => getComputedStyle(el).borderColor)).toBe("rgb(8, 120, 73)");
  await page.getByRole("button", { name: "Software Factory connection details" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close connection settings" }).click();
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    for (const theme of ["light", "dark"] as const) {
      if (await root(page).getAttribute("data-theme") !== theme) {
        await page.getByRole("button", { name: `Switch to ${theme} mode` }).click();
      }
      await expect(page.getByRole("button", { name: `Switch to ${theme === "light" ? "dark" : "light"} mode` })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("invalid or blocked storage falls back to system and toggling still works", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.addInitScript(key => {
    localStorage.setItem(key, "invalid");
    const get = Storage.prototype.getItem;
    const set = Storage.prototype.setItem;
    Storage.prototype.getItem = function (name) { if (name === key) throw new DOMException("Blocked", "SecurityError"); return get.call(this, name); };
    Storage.prototype.setItem = function (name, value) { if (name === key) throw new DOMException("Blocked", "SecurityError"); return set.call(this, name, value); };
  }, key);
  await page.goto("/");
  await expect(root(page)).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(root(page)).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "dark" });
  await page.emulateMedia({ colorScheme: "light" });
  await expect(root(page)).toHaveAttribute("data-theme", "dark");
});

test("workflow graph and evidence remain usable in both themes with real verification", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/");
  await page.getByRole("button", { name: /New verification/ }).first().click();
  await page.getByLabel("Run name", { exact: true }).fill(`Theme coverage ${Date.now()}`);
  await page.getByRole("button", { name: /Create verification run/ }).click();
  await expect(page.getByText("Behavioral drift detected", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByText("Explore the live verification graph", { exact: false }).click();
  await expect(page.locator(".react-flow.light")).toBeVisible();
  await expect(page.locator(".graph-state").first()).toBeVisible();
  await page.getByRole("button", { name: "Switch to dark mode" }).click();
  await expect(page.locator(".react-flow.dark")).toBeVisible();
  await page.getByRole("button", { name: /Inspect evidence/ }).click();
  await expect(page.getByText("BEHAVIORAL DRIFT: DETECTED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Switch to light mode" }).click();
  await expect(page.getByText("BEHAVIORAL DRIFT: DETECTED", { exact: true })).toBeVisible();
});
