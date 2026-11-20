# Contributing

This guide covers the development setup, the checks a change must pass, and
how releases work. `AGENTS.md` has the code rules.

## Development setup

Node.js 26 (22 or later works) and, for screenshot baselines, Docker.

```sh
npm ci
npm run dev            # demo page at http://localhost:5180
npm run dev:templates  # template demo at http://localhost:5181
```

The demo shows every component and the update button in each state. Query
parameters switch the look: `?theme=dark`, `?locale=de`, `?accent=green`.

The template demo shows the app frame, the sign-in page and the settings
cards with the fake content of three apps (Helpdesk, CRM, Logbook), plus
dashboard proposals that are not in the package yet. `?embed=1` hides its
controls, `?locale=de` switches the frame to German.
`npm run build:templates -- <file.html>` writes it as one file to share.

## Checks

```sh
npm run lint
npm run format:check   # npm run format fixes it
npm run typecheck
npm test               # unit and component tests (Vitest)
npm run build          # dist/: components, CSS, standalone elements
npm run pack:check     # what npm publish would upload
npm run test:visual    # screenshots; needs a build
```

`npm run test:visual` compares with the baselines in `e2e/snapshots`. They
come from the Playwright container that CI uses, so fonts match:
`npm run test:visual:update` writes them again (Docker). A pull request that
changes the look updates them, and the reviewer looks at the new images.

## Trying a change in an app

A pushed branch, and so a pull request, can be installed in an app without
a release, once the branch has `scripts/prepare.mjs` (rebase an older
branch first). Replace `fix/my-change` with the branch:

```sh
cd handbook && npm install 'github:meldgrove/ui#fix/my-change' --workspace @handbook/web
```

npm downloads the branch, installs its dependencies and builds it
(`scripts/prepare.mjs`); `@meldgrove/ui` then has version `0.0.0`. npm keeps
the commit it found, so run the command again after new pushes. A commit
works too (`#<sha>`). For changes not pushed yet:

```sh
npm run build && npm pack           # meldgrove-ui-0.0.0.tgz
cd ../handbook && npm install ../ui/meldgrove-ui-0.0.0.tgz --workspace @handbook/web
```

Put the app's `package.json` and lock file back before committing there.

## Releases

Maintainers start a release in **Actions > Release > Run workflow** on
`main`, with the part to raise (patch, minor, major) and optionally "Dry
run". The workflow checks that CI passed, publishes `@meldgrove/ui` to npm
with provenance, then pushes the tag `vX.Y.Z` and creates the GitHub
Release with notes from the pull request titles. `package.json` stays at
`0.0.0`; the tags hold the version. No approval follows: the version is
public when the run ends.

| Change                                   | Below 1.0.0 | From 1.0.0 |
| ---------------------------------------- | ----------- | ---------- |
| Apps must change code (label `breaking`) | minor       | major      |
| Features                                 | patch       | minor      |
| Fixes, dependencies                      | patch       | patch      |

npm publishes through trusted publishing (OIDC): the package's settings on
npmjs.com trust `meldgrove/ui`, workflow `release.yml`, environment `npm`,
with "Allow npm publish" on. The environment allows only `main`, so a
workflow changed on another branch cannot publish. No token is stored.

Apps depend on `^X.Y.Z`. Dependabot opens a pull request in each app for
every release (the apps' configuration gives `@meldgrove/ui` a group of its
own, without the 7-day cooldown). To get them at once, use "Check for
updates" on each app's Dependabot page.
