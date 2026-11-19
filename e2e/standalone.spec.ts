import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The built standalone elements (dist/standalone, `npm run build` first) on a
 * page without React, as the Django apps use them.
 */
const bundle = readFileSync(new URL("../dist/standalone/meldgrove-updates.js", import.meta.url), "utf8");

const status = {
  app: { version: "0.2.0" },
  reachable: true,
  updater: {
    updater: "0.2.0",
    mode: "host",
    channel: "stable",
    channelLocked: null,
    installed: "0.2.0",
    available: {
      version: "0.2.1",
      preview: false,
      publishedAt: "2026-11-17T10:00:00Z",
      url: "https://github.com/meldgrove/ui/releases",
      notes: ["Faster search in long lists", "Fix the sign-in loop behind a proxy"],
      changes: 2,
      installsAt: "2026-11-20T03:00:00Z",
      failed: null,
    },
    attention: null,
    installing: null,
    last: null,
    checking: false,
    checkedAt: "2026-11-19T09:55:00Z",
    error: null,
    automatic: true,
    cooldown: "3d",
    window: "02:00-05:00",
    timezone: "Europe/Berlin",
  },
  error: null,
};

const page = (theme: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<style>body { font-family: Georgia, serif; margin: 0; background: ${theme === "dark" ? "#111" : "#f6f7f5"}; }
header { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #ccc; }
main { max-width: 720px; margin: 24px auto; }</style>
<script type="module" src="/static/meldgrove-updates.js"></script></head>
<body><header>Admin
<meldgrove-update-button url="/admin/updates/" app-name="Meldgrove IAM" project="iam" theme="${theme}" csrf-token="test-token" guide-url="https://github.com/meldgrove/iam"></meldgrove-update-button>
</header><main>
<meldgrove-updates-settings url="/admin/updates/" app-name="Meldgrove IAM" project="iam" theme="${theme}" csrf-token="test-token"></meldgrove-updates-settings>
</main></body></html>`;

for (const theme of ["light", "dark"]) {
  test(`standalone elements, ${theme}`, async ({ page: browser }) => {
    const posts: { url: string; csrf: string | undefined }[] = [];
    await browser.clock.setFixedTime(new Date("2026-11-19T10:00:00Z"));
    await browser.route("http://app.test/static/meldgrove-updates.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await browser.route("http://app.test/admin/updates/**", (route) => {
      const request = route.request();
      if (request.method() === "POST")
        posts.push({ url: request.url(), csrf: request.headers()["x-csrftoken"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(status) });
    });
    await browser.route("http://app.test/", (route) =>
      route.fulfill({ contentType: "text/html", body: page(theme) }),
    );
    await browser.goto("http://app.test/");

    const button = browser
      .locator("meldgrove-update-button")
      .getByRole("button", { name: "Update available · 0.2.1" });
    await expect(button).toBeVisible();
    const settings = browser.locator("meldgrove-updates-settings");
    await expect(settings.getByText("Installed version")).toBeVisible();
    await button.click();
    await expect(browser.getByText("Faster search in long lists")).toBeVisible();
    await expect(browser).toHaveScreenshot(`standalone-${theme}.png`);

    // POSTs carry the CSRF token.
    await browser.getByRole("button", { name: "Check now" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ url: "http://app.test/admin/updates/check/", csrf: "test-token" });
  });
}
