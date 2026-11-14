import { test, expect } from "@playwright/test";

test("a real browser creates a run, receives genuine drift, explores evidence and downloads both reports", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/");
  await expect(page.getByRole("button", { name: /New verification/ }).first()).toBeVisible();
  await page.getByRole("button", { name: /New verification/ }).first().click();
  await page.getByLabel("Run name", { exact: true }).fill(`E2E · actual regression ${Date.now()}`);
  await page.getByRole("button", { name: "Create verification run", exact: false }).click();
  await expect(page.getByText("Behavioral drift detected", { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByText("Explore the live verification graph", { exact: false }).click();
  await expect(page.locator(".react-flow")).toBeVisible();
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await page.getByRole("button", { name: /Inspect evidence/ }).click();
  await expect(page.getByText("BEHAVIORAL DRIFT: DETECTED", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Monthly extra principal payment/ }).click();
  await expect(page.getByText("Counterexamples", { exact: true })).toBeVisible();
  await expect(page.locator(".findings")).toContainText("0.01");
  for (const format of ["JSON", "Markdown"]) {
    const download = page.waitForEvent("download");
    await page.getByRole("link", { name: format, exact: false }).first().click();
    expect((await download).suggestedFilename()).toMatch(format === "JSON" ? /\.json$/ : /\.md$/);
  }
  await page.getByLabel("Behavioral classification").selectOption("UNKNOWN");
  await page.getByRole("button", { name: "Apply & re-verify", exact: true }).click();
  await expect(page.getByText("REVIEW REQUIRED", { exact: true })).toBeVisible({ timeout: 30000 });
  expect(errors).toEqual([]);
});

test("responsive navigation and connection dialog are accessible without exposing credentials", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: /New verification/ }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: "docs/screenshots/mobile-dashboard.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: "docs/screenshots/dashboard.png", fullPage: true });
  await page.getByRole("button", { name: "Software Factory connection details" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close connection settings" }).click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect(await page.locator("body").innerText()).not.toMatch(/sofa-ext-[a-zA-Z0-9_-]{15,}/);
});
