# Contributing

This guide covers the development setup, the checks a change must pass, and
how releases work. `AGENTS.md` has the code rules.

## Development setup

Node.js 26 (22 or later works) and, for screenshot baselines, Docker.

```sh
npm ci
npm run dev        # demo page at http://localhost:5180
```

The demo shows every component and the update button in each state. Query
parameters switch the look: `?theme=dark`, `?locale=de`, `?accent=green`.

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

```sh
npm run build && npm pack           # meldgrove-ui-0.0.0.tgz
cd ../handbook && npm install ../ui/meldgrove-ui-0.0.0.tgz --workspace @handbook/web
```

Put the app's `package.json` and lock file back before committing there.

## Releases

Maintainers start a release in **Actions > Release > Run workflow** on
`main`, with the part to raise (patch, minor, major) and optionally "Dry
run". The workflow checks that CI passed, stages `@meldgrove/ui` on npm
with provenance, then pushes the tag `vX.Y.Z` and creates the GitHub
Release with notes from the pull request titles. `package.json` stays at
`0.0.0`; the tags hold the version.

A staged version is not public yet. A maintainer approves it with 2FA, and
only then do the apps get it:

```sh
npm login                  # once, if npm whoami says you are not logged in
npm stage list @meldgrove/ui
npm stage approve <id>     # or reject <id>
```

| Change                                   | Below 1.0.0 | From 1.0.0 |
| ---------------------------------------- | ----------- | ---------- |
| Apps must change code (label `breaking`) | minor       | major      |
| Features                                 | patch       | minor      |
| Fixes, dependencies                      | patch       | patch      |

npm stages through trusted publishing (OIDC): the package's settings on
npmjs.com trust `meldgrove/ui`, workflow `release.yml`, which may only
stage (`npm stage publish`; "Allow npm publish" stays off). No token is
stored.

Apps depend on `^X.Y.Z`. Dependabot opens a pull request in each app for
every release (the apps' configuration gives `@meldgrove/ui` a group of its
own, without the 7-day cooldown). To get them at once, use "Check for
updates" on each app's Dependabot page.
