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
  confirm dialog, a copy button, a pager and a write-only secret field.
  English and German.
- **Update button:** the admin's update button and the "Updates" settings of
  every Meldgrove app, following the contract of the
  [Meldgrove Updater](https://github.com/meldgrove/updater#the-apps-update-button).
  React apps use the components; apps without React use two custom elements.

## React apps

Peer dependencies: `react` and `react-dom` 19, `radix-ui`, `lucide-react`,
`sonner`; `cmdk` (command), `react-day-picker` (calendar) and `recharts`
(chart) only for those components.

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
import them.

### Language

Texts are English unless an `UIProvider` above the components says otherwise:

```tsx
import { UIProvider } from "@meldgrove/ui/i18n";

<UIProvider locale="de">{children}</UIProvider>;
```

### Toasts

Components report through [sonner](https://sonner.emilkowal.ski). Mount the
toaster once; it follows the class `dark` on `<html>`:

```tsx
import { Toaster } from "@meldgrove/ui/sonner";
```

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

The Meldgrove brand palette is not chosen yet; the tokens hold the neutral
palette the apps used so far.

## Update button

The app serves the four admin routes of the updater contract (status,
`check`, `install`, `channel`). The components do the rest: polling, the
popover, the confirmation, following an installation through the restart,
reloading when the new version answers, and stopping when the session ends.

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
- An app with its own API helper passes `transport` instead of `url` (see
  `UpdatesTransport` in `@meldgrove/ui/updates`).
- `@meldgrove/ui/updates/core` has the logic without React, for tests.

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

Apps without Tailwind can use `tokens.css` for the same colors.

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md). `npm run dev` opens a demo page with
every component in light and dark, English and German, and with an app
accent.

## License

[Apache License 2.0](LICENSE).
