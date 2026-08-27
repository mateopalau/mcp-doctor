# Security hardening and v0.1.2 release plan

## Baseline

- Work only in `mcp-doctor`, starting from verified `main` commit `866fb03355aa34ad3e33417f387b721ad612b667`.
- Preserve `v0.1.0` (`b048ae983c7a4f7b33a92aa2e140c90da676008d`) and `v0.1.1` unchanged.
- Audit found no confirmed real secret. Pattern matches were limited to synthetic fixture/test assertions and documentation examples.
- Current package dry-run contains 62 files, including development metadata, tests, sources, workflow, plans, and `.factory-project.json`.
- The historical `v0.1.0` tarball contains 76 files, including `.factory/**`, `.factory-project.json`, internal plans/results, and a nested tarball.
- `main` currently has no branch protection, required checks, or ruleset. `pnpm audit --audit-level high` currently reports no known vulnerabilities.

## Implementation steps

1. Harden runtime boundaries:
   - bound file/stdin input size;
   - sanitize terminal control characters in human output and error paths without changing machine-readable JSON semantics;
   - keep runtime offline, read-only, and free of subprocess/network/telemetry behavior;
   - add adversarial tests for nested secrets, malformed input, terminal injection, unicode, long input, and redaction.
2. Remove literal secret-shaped values from tracked fixtures by generating deterministic synthetic values inside tests, keeping detector coverage without a broad scanner allowlist.
3. Add a deterministic repository secret scanner that scans current tracked files and reachable Git history without printing matches; classify only exact test-generated artifacts/documentation examples and fail on unknown or real-looking matches.
4. Make the scanner a canonical verification gate and add regression tests for the verification contract.
5. Add an npm package `files` allowlist and package smoke/contents regression test so development metadata, fixtures, sources, plans, and generated state cannot ship.
6. Add Dependabot weekly updates and harden Actions:
   - top-level least-privilege permissions;
   - full commit-SHA pins verified against official release tags;
   - full-history checkout for historical secret scanning;
   - CodeQL only if it can be configured with verified official action SHAs and a useful TypeScript signal.
7. Update `SECURITY.md` and publish a concise audit record with limitations and exact evidence boundaries; never claim absolute security.
8. Run all required gates plus clean-checkout install, scanner, package smoke, and remote checks. Request explicit authorization before any push.
9. Open a PR from `codex/security-hardening-v0.1.2`; configure and verify main protection; require the exact candidate commit's Actions checks to be green before merge.
10. Merge through the PR, verify main's exact SHA and remote CI, create `v0.1.2` only on that verified green commit, and verify both tag refs through the GitHub API.

## Verification evidence required

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm verify`
- `pnpm audit --audit-level high`
- clean checkout with `pnpm install --frozen-lockfile`
- repository/history secret scan with zero real or unknown findings
- package dry-run allowlist and clean-install `--help` smoke test
- GitHub API evidence for branch protection, workflow pins, secret scanning/push protection state, PR candidate SHA/checks, merged main SHA/checks, and `v0.1.0`/`v0.1.1`/`v0.1.2` tag refs
