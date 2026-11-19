import { expect, test, type Page } from "@playwright/test";

const NOW = new Date("2026-11-19T10:00:00Z");

async function open(page: Page, query: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`/${query}`);
  // Every update button has its status.
  await expect(page.locator("[data-update-state=loading]")).toHaveCount(0);
  // The settings card has its status (any language).
  await expect(page.locator("dl").first()).toBeVisible();
}

const variants: [string, string][] = [
  ["light", ""],
  ["dark", "?theme=dark"],
  ["german", "?locale=de"],
  ["accent", "?accent=green"],
  ["accent-dark", "?accent=green&theme=dark"],
];

for (const [name, query] of variants) {
  test(`demo page, ${name}`, async ({ page }) => {
    await open(page, query);
    await expect(page).toHaveScreenshot(`page-${name}.png`, { fullPage: true });
  });
}

for (const state of ["available", "attention", "failed", "installing"]) {
  test(`update popover, ${state}`, async ({ page }) => {
    await open(page, "");
    await page.locator(`[data-demo-update=${state}] button`).click();
    const popover = page.locator("[data-slot=popover-content]");
    await expect(popover).toBeVisible();
    await expect(popover).toHaveScreenshot(`popover-${state}.png`);
  });
}

test("update popover in dark and German", async ({ page }) => {
  await open(page, "?theme=dark&locale=de");
  await page.locator("[data-demo-update=available] button").click();
  const popover = page.locator("[data-slot=popover-content]");
  await expect(popover).toContainText("Update verfügbar");
  await expect(popover).toHaveScreenshot("popover-available-dark-de.png");
});

test("confirm dialog before an install", async ({ page }) => {
  await open(page, "");
  await page.locator("[data-demo-update=available] button").click();
  await page.getByRole("button", { name: "Install now" }).click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Install 0.2.1 now?");
  await expect(dialog).toHaveScreenshot("confirm-install.png");
});
