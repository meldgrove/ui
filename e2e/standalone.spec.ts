import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * The built standalone elements (dist/standalone, `npm run build` first) on a
 * page without React, as the Django apps use them.
 */
const bundle = readFileSync(new URL("../dist/standalone/meldgrove-updates.js", import.meta.url), "utf8");
const secretBundle = readFileSync(
  new URL("../dist/standalone/meldgrove-secret-input.js", import.meta.url),
  "utf8",
);

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

const css = (
  theme: string,
) => `body { font-family: Georgia, serif; margin: 0; background: ${theme === "dark" ? "#111" : "#f6f7f5"}; }
header { display: flex; justify-content: flex-end; align-items: center; gap: 8px; padding: 8px 16px; border-bottom: 1px solid #ccc; }
main { max-width: 720px; margin: 24px auto; }
label { display: block; margin-bottom: 4px; }
meldgrove-secret-input { max-width: 360px; }
input { font: inherit; padding: 6px 10px; border: 1px solid #bbb; border-radius: 6px; }
/* The app's own accent reaches the elements. */
:root { --mg-accent: oklch(0.5 0.13 160); --mg-accent-foreground: oklch(0.985 0 0); }
.dark { --mg-accent: oklch(0.75 0.13 160); --mg-accent-foreground: oklch(0.2 0.02 160); }`;

const page = (theme: string) => `<!doctype html>
<html lang="en"${theme === "dark" ? ' class="dark"' : ""}><head><meta charset="utf-8">
<link rel="stylesheet" href="/static/page.css">
<script type="module" src="/static/meldgrove-updates.js"></script>
<script type="module" src="/static/meldgrove-secret-input.js"></script></head>
<body><header>Admin
<meldgrove-update-button url="/admin/updates/" app-name="Meldgrove IAM" project="iam" csrf-token="test-token" guide-url="https://github.com/meldgrove/iam"></meldgrove-update-button>
</header><main>
<p><label for="id_token">Bearer token</label>
<meldgrove-secret-input><input type="password" name="token" id="id_token" value="tok-123"></meldgrove-secret-input></p>
<meldgrove-updates-settings url="/admin/updates/" app-name="Meldgrove IAM" project="iam" csrf-token="test-token"></meldgrove-updates-settings>
</main></body></html>`;

/** A strict policy, as IAM has: no inline styles or scripts. */
const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:";

for (const theme of ["light", "dark"]) {
  test(`standalone elements, ${theme}`, async ({ page: browser }) => {
    const posts: { url: string; csrf: string | undefined }[] = [];
    const errors: string[] = [];
    browser.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    browser.on("pageerror", (error) => errors.push(error.message));
    await browser.clock.setFixedTime(new Date("2026-11-19T10:00:00Z"));
    await browser.route("http://app.test/static/page.css", (route) =>
      route.fulfill({ contentType: "text/css", body: css(theme) }),
    );
    await browser.route("http://app.test/static/meldgrove-updates.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: bundle }),
    );
    await browser.route("http://app.test/static/meldgrove-secret-input.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: secretBundle }),
    );
    await browser.route("http://app.test/admin/updates/**", (route) => {
      const request = route.request();
      if (request.method() === "POST")
        posts.push({ url: request.url(), csrf: request.headers()["x-csrftoken"] });
      return route.fulfill({ contentType: "application/json", body: JSON.stringify(status) });
    });
    await browser.route("http://app.test/", (route) =>
      route.fulfill({
        contentType: "text/html",
        headers: { "Content-Security-Policy": CSP },
        body: page(theme),
      }),
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

    // The app's accent colors the primary button inside the shadow root.
    const install = browser.getByRole("button", { name: "Install now" });
    const background = await install.evaluate((element) => getComputedStyle(element).backgroundColor);
    expect(background).not.toMatch(/^oklch\(0\.(205|922) 0 0\)$/);
    expect(background).toContain("160");

    // POSTs carry the CSRF token.
    await browser.locator("meldgrove-update-button").getByRole("button", { name: "Check now" }).click();
    await expect.poll(() => posts.length).toBe(1);
    expect(posts[0]).toEqual({ url: "http://app.test/admin/updates/check/", csrf: "test-token" });
    // The password field shows its value only on request (with the popover closed).
    await browser.keyboard.press("Escape");
    const token = browser.getByLabel("Bearer token");
    await expect(token).toHaveAttribute("type", "password");
    await browser.getByRole("button", { name: "Show", exact: true }).click();
    await expect(token).toHaveAttribute("type", "text");
    await expect(token).toHaveValue("tok-123");

    // Nothing the policy refused, nothing that failed.
    expect(errors).toEqual([]);
  });
}
