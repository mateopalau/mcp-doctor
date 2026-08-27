# mcp-doctor security posture audit

Date: 2026-08-27

## Scope

This audit covers the public `mateopalau/mcp-doctor` repository, its reachable Git
history, the v0.1.0 and v0.1.1 release refs, GitHub Actions, package contents,
dependencies, and the installed CLI runtime. OSS Agent Factory is outside scope.

## Baseline findings

- No confirmed real credential was found in the inspected current tree, reachable
  history, or historical package contents.
- The repository's original secret-shaped matches were synthetic detector fixtures,
  test assertions, or documentation examples. The current fixture generates values
  only during tests, so secret-shaped literals are not kept in the current tree.
- The historical v0.1.0 package contained development metadata, `.factory/**`, tests,
  source, plans, and a nested tarball. This was fixed through package allowlisting;
  historical refs were not rewritten.
- The pre-hardening repository had no main branch protection or required check.

## Active controls

- `pnpm verify` starts with a deterministic secret scan over the current tree and
  reachable Git objects, including historical tarballs when present.
- Historical synthetic artifacts are accepted only by exact Git blob/file fingerprints;
  there is no broad test-directory exemption. Unknown matches fail the gate and the
  scanner never prints matched values.
- Human output escapes terminal control characters; JSON output remains valid and
  secret findings remain redacted.
- Input is limited to 10 MiB and the runtime has no network, telemetry, shell,
  configured-server execution, or configuration mutation.
- The npm package has an explicit allowlist containing only `dist`, package metadata,
  public documentation, and the license.
- CI and CodeQL use immutable official Action commit pins and least-privilege
  permissions; Dependabot checks npm and Actions weekly.

## Limitations

The repository scanner is a deterministic fallback because `gitleaks` and
`trufflehog` were not installed in the audit environment. It covers the high-signal
credential families documented by the product and fails closed for unknown matches,
but it is not a proof of absence. GitHub's secret-scanning state and branch protection
are verified separately through the GitHub API during release completion.

No system can be proven "100% secure".
This PASS means no known critical/high findings remain within the audited scope,
all required hardening controls are active,
and the evidence is reproducible from a clean checkout.
