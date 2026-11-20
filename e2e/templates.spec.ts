import { expect, test, type Page } from "@playwright/test";

// The template demo (demo/templates) without its controls (?embed=1): the app frame as apps get it.
const BASE = "http://localhost:5181/";
const NOW = new Date("2026-11-20T10:00:00Z");

async function open(page: Page, query: string, path: string) {
  await page.clock.setFixedTime(NOW);
  await page.goto(`${BASE}?embed=1${query}#${path}`);
  await expect(page.locator("[data-update-state=loading]")).toHaveCount(0);
}

const pages: [string, string, string][] = [
  ["overview", "", "/"],
  ["breadcrumbs", "&app=crm", "/organizations/leipzig-community-foundation"],
  ["history-dark", "&app=logbook&theme=dark", "/timeline/LOG-48/history"],
  ["german", "&locale=de", "/requests/REQ-142/history"],
  ["settings", "", "/settings"],
];

for (const [name, query, path] of pages) {
  test(`app frame, ${name}`, async ({ page }) => {
    await open(page, query, path);
    await expect(page).toHaveScreenshot(`frame-${name}.png`);
  });
}

test("app frame, search with results", async ({ page }) => {
  await open(page, "", "/");
  await page.keyboard.press("Control+k");
  await page.keyboard.type("van");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("option", { name: /Van booking/ })).toBeVisible();
  await expect(dialog).toHaveScreenshot("search.png");
});

test("app frame, keyboard shortcuts", async ({ page }) => {
  await open(page, "", "/");
  await page.keyboard.press("Control+/");
  const dialog = page.getByRole("dialog", { name: "Keyboard shortcuts" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveScreenshot("shortcuts.png");
  await page.keyboard.press("Escape");
  await page.keyboard.press("g");
  await expect(page.locator("[data-slot=go-hint]")).toHaveScreenshot("go-hint.png");
  await page.keyboard.press("r");
  await expect(page).toHaveURL(/#\/requests$/);
});

test("app frame, user menu", async ({ page }) => {
  await open(page, "", "/");
  await page.getByRole("button", { name: /^Jane Doe/ }).click();
  const menu = page.getByRole("menu");
  await expect(menu).toBeVisible();
  await expect(menu).toHaveScreenshot("user-menu.png");
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("app frame, sidebar and the way back", async ({ page }) => {
    await open(page, "", "/requests/REQ-142/history");
    await expect(page).toHaveScreenshot("frame-phone.png");
    await page.getByRole("button", { name: "Show or hide the sidebar" }).click();
    await expect(page).toHaveScreenshot("frame-phone-sidebar.png");
    await page.getByRole("link", { name: "My requests" }).click();
    await expect(page).toHaveURL(/#\/mine$/);
    await expect(page.locator("[data-mobile=true]")).toHaveCount(0);
  });

  test("sign-in page", async ({ page }) => {
    await open(page, "", "/sign-in");
    await expect(page).toHaveScreenshot("sign-in-phone.png");
  });
});

test("sign-in page", async ({ page }) => {
  await open(page, "", "/sign-in");
  await expect(page).toHaveScreenshot("sign-in.png");
});
