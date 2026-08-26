# Clean Gate Postmortem

Date: 2026-08-26
Repository: `mateopalau/mcp-doctor`
Affected release: `v0.1.0` at `b048ae983c7a4f7b33a92aa2e140c90da676008d`

## What occurred

The local factory gate passed and published `v0.1.0`, but the first GitHub
Actions run for the published source failed. The workflow installed
dependencies, ran lint and typecheck, ran tests, and only then ran the build.
The CLI tests execute `dist/cli.js`, while `dist/` is generated only by the
build.

## Root cause

The final gate and GitHub Actions did not share one ordered verification
contract. A previous local build left an ignored `dist/cli.js` in the working
directory, so the local test stage passed. A clean GitHub checkout had no
ignored build output and failed with `Cannot find module .../dist/cli.js`.
This was a reproducible environment difference, not flaky CI behavior.

## Contributing factors

- Integration tests invoke the published package entry point directly.
- The workflow placed `test` before `build`.
- There was no checked-in ordered verification manifest.
- A generated `mcp-doctor-0.1.0.tgz` artifact was tracked in source control.
- The standalone package needed explicit workspace and package-manager
  isolation.

## Correction

- `scripts/verification.json` is now the ordered gate definition.
- `pnpm verify` executes lint, typecheck, build, test, and `pnpm audit` and
  stops at the first failure with the stage and command in its diagnostic.
- GitHub Actions performs `pnpm install --frozen-lockfile` and then invokes
  `pnpm verify`.
- pnpm 11.23.0 is pinned, parent workspace inheritance is disabled, and
  generated tarballs are ignored and no longer tracked.
- Tests now verify the compiled CLI entry point and report an actionable
  build-output failure when `dist/cli.js` is absent.

## Regression coverage

The verification contract tests cover the manifest order, workflow
invocation, package-manager pin, generated-artifact policy, and compiled CLI
smoke path. The full suite contains 31 tests and is run after the build gate.

## New systemic guarantee

For this repository, a release verification is valid only after a frozen
install followed by the canonical `pnpm verify` sequence. A local workspace
artifact cannot satisfy the source-control or compiled-entrypoint checks in a
fresh checkout.

The OSS Agent Factory source and its durable publication state machine are not
present in this checkout. Therefore this repository change does not claim to
implement `FINAL_GATE → PUBLISH → REMOTE_VERIFY → TAG → COMPLETE`; the
factory must consume `pnpm verify` and must keep `COMPLETE` behind exact-SHA
remote verification before that broader guarantee can be reported as closed.
