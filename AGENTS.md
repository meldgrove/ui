# AGENTS.md

`@meldgrove/ui` is the shared interface of the Meldgrove apps: the theme
(tokens and the Tailwind CSS 4 theme), the shadcn/ui components, a few
Meldgrove components, and the update button with the "Updates" settings.
Apps install it from npm; a release reaches them as a Dependabot pull
request. `README.md` is the user documentation; `CONTRIBUTING.md` has the
setup, checks and releases.

## Layout

```
src/
  tokens.css       design tokens (plain CSS), light and dark; the accent --mg-accent
  theme.css        Tailwind theme: tokens, dark variant, @theme mapping, base styles
  styles.css       theme.css plus the package's files as Tailwind sources (apps import this)
  components/      one file per component, published as @meldgrove/ui/<name>
  lib/             cn (utils), i18n (UIProvider, catalogs), format, portal, theme
  hooks/           use-mobile
  updates/         the update button: types, state (pure logic), transport,
                   controller (behaviour without React), react (provider),
                   update-button, updates-settings, element (custom elements)
  frame/           parts of the app frame (components/app-frame.tsx): search,
                   breadcrumbs, shortcuts, keys, texts; not exported on their own
  test/            test setup and fixtures
demo/              the demo page (npm run dev), also the subject of the screenshots
  templates/       the template demo (npm run dev:templates): the app frame with fake app content
e2e/               Playwright screenshots of the demo and the standalone elements
scripts/           build, package check, screenshot baselines
```

## Rules

- **Apps depend on this.** Every export is public API. A change that makes
  apps change code is `breaking` (label on the pull request): the next
  release starts a new series.
- **No app knowledge.** Components take texts, links and data as props; no
  app names, routes or roles in here.
- **The update button follows the updater contract**
  (https://github.com/meldgrove/updater#the-apps-update-button). Behaviour
  lives in `updates/state.ts` (pure functions) and `updates/controller.ts`
  (timers, requests); the React files only render the snapshot. Change the
  tests with the behaviour.
- **Texts in English and German.** Every catalog (`defineMessages`) has both;
  TypeScript checks the keys.
- **Client components** start with `"use client";` (Next.js apps import them).
- **Imports** are relative with the file extension (`./button.tsx`); the
  build rewrites them to `.js`.
- **Portals** (popover, tooltip, dialogs, menus, select) pass
  `container={usePortalContainer()}`, so the standalone elements can keep
  them inside their shadow root.
- **Look changes** update the screenshot baselines in the same pull request
  (`npm run test:visual:update`, Docker), and the reviewer looks at them.
- Keep components close to shadcn/ui; note deviations in a comment.
- Strict TypeScript, no `any`. Prettier (110 columns), ESLint.

## Writing

- Concise, plain language; short sentences. Docs say "Simon" and "AI"
  instead of pronouns such as I, you or we.
- Dates as DD.MM.YYYY.
