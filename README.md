# Meldgrove UI

The shared interface of the [Meldgrove](https://github.com/meldgrove) apps:
one theme, the components every app uses, and the update button. Apps take
the parts they need; an improvement here reaches every app with its next
dependency update.

```sh
npm install @meldgrove/ui
```

- **Theme:** design tokens (`tokens.css`) and the Tailwind CSS 4 theme
  (`styles.css`), light and dark, with one accent color per app if wanted.
- **Components:** the [shadcn/ui](https://ui.shadcn.com) components of the
  apps (style `new-york`, Radix UI, lucide icons), plus page states, a
  confirm dialog, a copy button, a pager, a secret input and a write-only
  secret field. English and German.
- **Update button:** the admin's update button and the "Updates" settings of
  every Meldgrove app, following the contract of the
  [Meldgrove Updater](https://github.com/meldgrove/updater#the-apps-update-button).
  React apps use the components; apps without React use two custom elements.

## React apps

Peer dependencies: `react` and `react-dom` 19, `radix-ui`, `lucide-react`,
`sonner`; `cmdk` (command and the app frame's search), `react-day-picker`
(calendar) and `recharts` (chart) only for those components.

In the app's stylesheet, after Tailwind:

```css
@import "tailwindcss";
@import "@meldgrove/ui/styles.css";
```

Components have one entry point each, named like the file in shadcn/ui:

```tsx
import { Button } from "@meldgrove/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@meldgrove/ui/card";
import { cn } from "@meldgrove/ui/utils";
```

Client components carry `"use client"`, so Next.js server components can
import them; no `transpilePackages` is needed. `styles.css` lists every
component as a Tailwind source. An app that wants only the classes of the
components it uses imports `@meldgrove/ui/theme.css` instead and adds
`@source` lines for those files in `node_modules/@meldgrove/ui/dist/components`.

`SidebarInset` renders a `<div>`; the app's page content brings its own
`<main>`. Apps with the [app frame](#app-frame) get both from it.

### Language

Texts are English unless an `UIProvider` above the components says otherwise:

```tsx
import { UIProvider } from "@meldgrove/ui/i18n";

<UIProvider locale="de">{children}</UIProvider>;
```

### Secrets

Every field for a secret (password, API key, token, private key) is hidden
until the person shows it with the eye button. Apps use `SecretInput` for it,
never an `Input` or `Textarea`:

```tsx
import { SecretInput } from "@meldgrove/ui/secret-input";

<SecretInput id="password" autoComplete="current-password" value={password} onChange={…} />
// A secret shown once after it was created: the copy button copies it hidden.
<SecretInput aria-label="Token" value={token} readOnly copyable />
```

It takes the props of an `<input>` (not `type`); `className` styles the box,
`inputClassName` the text field. A pasted multi-line value, such as the JSON
key of a Google service account, loses its line breaks, which JSON does not
need. `SecretField` (`@meldgrove/ui/secret-field`) builds on it for secrets
the server keeps write-only: keep, replace or remove.

### Toasts

Components report through [sonner](https://sonner.emilkowal.ski). Mount the
toaster once; it follows the class `dark` on `<html>`:

```tsx
import { Toaster } from "@meldgrove/ui/sonner";
```

## App frame

Every Meldgrove app shows its pages in the same frame. Changing it here
changes every app.

- **Sidebar:** the app's name at the top, then the search, the navigation as
  text (no icons) and the person at the bottom. ⌘B or Ctrl+B, or a click on
  its edge, hides it completely. On phones it is a sheet that closes once a
  page is chosen.
- **Header:** the breadcrumbs (at most three steps; on phones only "‹ back")
  and, at the right, `headerEnd`: the update button for admins.
- **User menu:** Appearance (light, dark, device setting), Settings, Keyboard
  shortcuts and Sign out. Settings opens the person's settings page
  (`settingsHref`) in every app. Things about the person's account, such as
  a link to the sign-in provider's account page, go on that page as a card,
  not in the header.
- **Keys:** ⌘K or Ctrl+K and "/" open the search. "G then a letter" opens a
  main page. Ctrl+/ lists every shortcut (Ctrl on a Mac too). Shortcuts with
  single letters can be turned off on the settings page (WCAG 2.1.4).

```tsx
import { AppFrame, type FrameLink, type NavGroup } from "@meldgrove/ui/app-frame";
import { useThemePreference } from "@meldgrove/ui/theme";
import { UpdateButton } from "@meldgrove/ui/updates";

const nav: NavGroup[] = [
  {
    items: [
      { label: "Overview", href: "/", shortcut: "o" },
      { label: "Requests", href: "/requests", shortcut: "r", badge: openCount },
    ],
  },
  { label: "Admin", items: [{ label: "Forms", href: "/admin/forms" }] },
];

const [theme, setTheme] = useThemePreference();

<AppFrame
  app={{ name: "Helpdesk", icon: <LifeBuoy />, description: organizationName }}
  nav={nav}
  pathname={pathname}
  link={AppLink}
  navigate={(href) => router.navigate({ to: href })}
  user={{ name, email, detail: roleLabel, image }}
  theme={theme}
  onThemeChange={setTheme}
  settingsHref="/settings"
  onSignOut={signOut}
  breadcrumbs={[{ label: "Requests", href: "/requests" }, { label: "REQ-142" }]}
  headerEnd={isAdmin ? <UpdateButton /> : null}
  search={{ find: (query, signal) => api.search(query, { signal }) }}
>
  <Outlet />
</AppFrame>;
```

- **`link`:** the router's link. Next.js passes its `Link` as it is. Other
  routers use a small adapter that passes every other prop on to the `<a>`:
  `const AppLink: FrameLink = ({ href, ...props }) => <Link to={href} activeOptions={{ exact: true }} {...props} />;`
  For TanStack Router, `exact` matters: otherwise it marks every link whose
  path the address starts with as active (`aria-current="page"`), so a
  breadcrumb's parent and the "/" item would be announced as the current page.
- **`nav`:** the app filters it by role before it passes it in. The item
  whose `href` the path starts with is marked (the longest one; "/" and
  `exact` items only on themselves; `match` adds paths that belong to an
  item, such as `["/e"]` for entries of a timeline at "/"). `shortcut` is for main pages people open
  often, with a letter they can guess, each letter once (the console says so
  otherwise); none for admin pages, which the search reaches as fast. "o" is
  the start page in every app. There is no fixed number: a page whose obvious
  letter is taken gets no key rather than a letter nobody guesses.
- **`breadcrumbs`:** from the sidebar section to the page, without the app.
  A record appears by its short number where it has one (REQ-142), else by
  its name; long labels are cut.
- **`search`:** without `find`, the search offers the app's pages.
  `find(query, signal)` adds records (`href`, `title`, optional `reference`
  and `kind`); `allResultsHref(query)` adds "Show all results".
- **`theme`:** `useThemePreference()` keeps the choice in the browser and
  sets the class `dark`. An app that saves it with the person passes its own
  value. To avoid a light flash on load, the app sets the class in a small
  script before React starts.
- **`shortcuts`:** default: the person's choice in this browser
  (`useShortcutsPreference`). An app that saves it with the person passes it.
- **Next.js:** the frame takes functions and a component (`link`,
  `navigate`, `onSignOut`), which cannot cross from a server component. Put
  it in a client component of the app; the server layout passes data only,
  with `defaultSidebarOpen` from the cookie `sidebar_state`. Vite apps leave
  that out; the frame reads the cookie.
- **`sidebarOpen`:** for an app that decides itself whether the sidebar is
  open on wide screens, e.g. folded on article pages. ⌘B or Ctrl+B and the
  toggle call `onSidebarOpenChange`; the app keeps the choice. Phones are
  not affected: there the sidebar is a sheet.
- `SidebarInset` is inside the frame; the page brings its `Page` (below), not
  another `<main>`.

### Pages

`Page` is the content area (centred, at most 80 rem; `wide` for full width),
`PageHeader` the title with description and actions:

```tsx
import { Page, PageHeader } from "@meldgrove/ui/page";

<Page>
  <PageHeader
    title="Requests"
    description="Every request, newest first."
    actions={<Button>New request</Button>}
  />
  …
</Page>;
```

The main action of a page sits in its header; the frame has no button for it.

### Sign-in page

```tsx
import { SignInPage } from "@meldgrove/ui/sign-in-page";

<SignInPage
  app={{ name: "Helpdesk", icon: <LifeBuoy /> }}
  tagline="Send requests and follow them up."
  organization={organizationName}
  repositoryUrl="https://github.com/meldgrove/helpdesk"
>
  <Button onClick={signIn}>Sign in with your organization account</Button>
</SignInPage>;
```

What the app is for sits on the left on wide screens, the sign-in on the
right, and below it "Helpdesk is part of Meldgrove" with a link to the
repository. The app's buttons and messages go in `children`.

### Settings page

```tsx
import { AboutCard, AppearanceCard, KeyboardShortcutsCard } from "@meldgrove/ui/settings-cards";

<AppearanceCard value={theme} onChange={setTheme} />
<KeyboardShortcutsCard />
<AboutCard appName="Helpdesk" repositoryUrl="https://github.com/meldgrove/helpdesk" />
```

`KeyboardShortcutsCard` without props keeps the choice in the browser, and
the frame follows it. A private repository (CRM) links to
`https://github.com/meldgrove` instead.

## Colors

Every component uses the semantic tokens of shadcn/ui (`--primary`,
`--muted`, …), set in `tokens.css` for light (`:root`) and dark (`.dark`).
The accent (`--mg-accent`, `--mg-accent-foreground`) colors primary buttons,
links, the active sidebar item and the update dot.

- **One look for all apps** (the default): set nothing. A change of the
  palette in this package reaches every app.
- **An accent per app:** set the two variables after the import, for light
  and for dark:

  ```css
  :root {
    --mg-accent: oklch(0.5 0.13 160);
    --mg-accent-foreground: oklch(0.985 0 0);
  }
  .dark {
    --mg-accent: oklch(0.75 0.13 160);
    --mg-accent-foreground: oklch(0.2 0.02 160);
  }
  ```

The Meldgrove apps use the neutral palette in the tokens, with no accent of
their own (chosen on 23.11.2026).

## Fonts

The theme sets no font family on purpose: the apps use the system fonts of
each device (Tailwind's default `--font-sans` and `--font-mono` stacks) and
load no font file.

## Update button

The app serves the four admin routes of the updater contract (status,
`check`, `install`, `channel`). The components do the rest: polling, the
popover, the confirmation, following an installation through the restart,
reloading every page of the app when the new version answers, and stopping
when the session ends.

```tsx
import { UpdateButton, UpdatesProvider, UpdatesSettingsCard } from "@meldgrove/ui/updates";

// For app admins only (everyone else gets 404 from the routes).
<UpdatesProvider
  appName="Meldgrove Handbook"
  project="handbook"
  url="/api/admin/updates"
  guideUrl="https://github.com/meldgrove/handbook/blob/main/docs/deployment.md#automatic-updates"
>
  <UpdateButton /> {/* in the top bar */}
  <UpdatesSettingsCard /> {/* in the admin settings; or <UpdatesSettings /> without the card */}
</UpdatesProvider>;
```

- `url` is the status route; the others are `<url>/check`, `<url>/install`
  and `<url>/channel` (a trailing slash carries over).
- `project` names the updater's systemd unit in the hint after 15 minutes
  (`journalctl -u meldgrove-updater-<project>`).
- No page keeps old code after an update. The page that followed the
  installation tells the app's other pages in the browser
  (`BroadcastChannel` `meldgrove.updates.<project>`), and they reload with
  it. A page that missed it (asleep, in another browser, an automatic
  install) reloads once the update service answers without an installation
  and the app names another version than in the page's first status.
  Unsaved input is lost on that reload, unless the app guards it with a
  `beforeunload` handler.
- 401, 403, 404 (what the routes answer non-admins) and sign-in pages end
  the session for the page: no more automatic requests. `onSignedOut(reason)`
  lets the app react: `"signed-out"` (401 or a sign-in page; for example,
  show the sign-in page) or `"forbidden"` (403 or 404; signed in, but no
  longer an app admin).
- An app with its own API helper passes `transport` instead of `url` (see
  `UpdatesTransport` in `@meldgrove/ui/updates`).
- `initialResponse`: a status the server already has, so the settings show
  at once.
- `dateLocale`: full dates in another format, e.g. `de-DE` for 19.11.2026
  (default `en-GB` for English, `de-DE` for German). Relative times ("2 hours
  ago") follow `locale`, so an English page with German dates stays English.
  `timeZone`: an IANA time zone such as `Europe/Berlin` (default: the
  browser's).
- Read once when the provider mounts: `project`, `url`, `transport`,
  `storageKey`/`storage`, `initialResponse`. The others follow changes.
- In Next.js, put the provider in a client component of the app when it gets
  functions (`transport`, `notify`, `onSignedOut`). The status is read from
  sessionStorage only after hydration, so server and client render the same.
- `@meldgrove/ui/updates/core` has the logic without React, for tests and
  views of the app's own.

### Server routes

`@meldgrove/ui/updates/server` serves the four routes on the app's server:
it asks the updater, sends `UPDATER_TOKEN`, and answers with the status the
components expect (refusals as 409, the updater's own 5xx as 5xx, an updater
that does not answer as `reachable: false`). It uses only `fetch`,
`Request` and `Response`, so it fits Hono and Next.js route handlers, and
it needs no React. The app checks the admin session and its CSRF protection
first; everyone else gets the app's usual 404.

```ts
import { createUpdatesHandler } from "@meldgrove/ui/updates/server";

const updates = createUpdatesHandler(() => ({
  url: config().UPDATER_URL, // empty: no updater, no call
  token: config().UPDATER_TOKEN, // the updater's API_TOKEN
  appVersion: config().APP_VERSION ?? null,
  logger, // optional: pino or console
}));

// Hono
router.get("/admin/updates", (c) => (requireAdmin(c), updates.respond("status")));
router.post("/admin/updates/check", (c) => (requireAdmin(c), updates.respond("check")));
router.post("/admin/updates/install", (c) => (requireAdmin(c), updates.respond("install", c.req.raw)));
router.post("/admin/updates/channel", (c) => (requireAdmin(c), updates.respond("channel", c.req.raw)));

// Next.js: app/api/admin/updates/install/route.ts
export async function POST(request: Request) {
  return (await refuseUnlessAdmin(request)) ?? updates.respond("install", request);
}
```

- `respond` checks the body (`{"version"}` of the contract's pattern,
  `{"channel": "stable" | "preview"}`) and answers 400 otherwise. Answers
  are never cached (`Cache-Control: no-store`).
- The updater answers 401 when its `API_TOKEN` is set and the app sends
  none or another token; the error names `UPDATER_TOKEN`.
- `@meldgrove/ui/updates/testing` has `startFakeUpdater({ token? })`, an
  updater API on a free local port that records each call, and
  `updaterStatus(overrides)`, for the app's own route tests in Node.

The settings section warns while the updater takes requests without a
token (updater 0.2.4 and later report `apiToken` in their status). The
button names each stage of an installation, including the database backup
the server takes first (`backing-up`, updater 0.2.4 and later).

## Apps without React

`dist/standalone/meldgrove-updates.js` defines `<meldgrove-update-button>`
and `<meldgrove-updates-settings>`: the same components, rendered into a
shadow root with their own styles (React included, about 150 kB gzipped).
Copy the file from the package into the app's static files and load it for
admins:

```html
<script type="module" src="/static/meldgrove-updates.js"></script>

<meldgrove-update-button
  url="/admin/updates/"
  app-name="Meldgrove IAM"
  project="iam"
  locale="en"
  theme="system"
  guide-url="https://github.com/meldgrove/iam/blob/main/docs/deployment.md#automatic-updates"
></meldgrove-update-button>

<meldgrove-updates-settings
  url="/admin/updates/"
  app-name="Meldgrove IAM"
  project="iam"
></meldgrove-updates-settings>
```

| Attribute                    | Meaning                                                                                |
| ---------------------------- | -------------------------------------------------------------------------------------- |
| `url`                        | The status route; elements with the same `url` share one status                        |
| `app-name`, `project`        | As for React apps                                                                      |
| `locale`                     | `en` (default) or `de`                                                                 |
| `theme`                      | `class` (default: dark while `<html>` has the class `dark`), `system`, `light`, `dark` |
| `guide-url`                  | The deployment guide's section on automatic updates                                    |
| `csrf-token`                 | Sent as `csrf-header` with every POST; without it, the cookie `csrf-cookie`            |
| `csrf-cookie`, `csrf-header` | Default `csrftoken` and `X-CSRFToken` (Django)                                         |
| `date-locale`                | Format of full dates, e.g. `de-DE`; default `en-GB` for English                        |
| `time-zone`                  | IANA time zone of dates, e.g. `Europe/Berlin`; default the browser's                   |
| `storage-key`                | sessionStorage prefix; default `meldgrove.updates.<project>`                           |
| `plain`                      | On the settings: no card of their own, for a section of the app                        |

The elements work under a strict Content Security Policy (`style-src
'self'`, `script-src 'self'`): their styles are constructed style sheets.
An app's accent (`--mg-accent` on `:root`) reaches them. The React peer
dependencies are optional, so `npm install @meldgrove/ui` in an app without
React installs only a few small packages.

`dist/standalone/meldgrove-secret-input.js` (about 3 kB, no React) adds the
eye button to a password field, as `SecretInput` has it. The field stays a
plain input of the form:

```html
<script type="module" src="/static/meldgrove-secret-input.js"></script>

<meldgrove-secret-input locale="en">
  <input type="password" name="token" id="id_token" autocomplete="off" />
</meldgrove-secret-input>
```

The field must say `type="password"`, so it is hidden before the script
loads. The button takes its colors from `tokens.css`.

Apps without Tailwind can use `tokens.css` for the same colors. It switches
to dark with the class `dark` on `<html>`; an app that follows the device
sets that class from `prefers-color-scheme` in a small script.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm run dev:templates` opens the
app frame with fake content of three apps. `npm run dev` opens a demo page with
every component in light and dark, English and German, and with an app
accent.

## License

[Apache License 2.0](LICENSE).
