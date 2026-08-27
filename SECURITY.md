# Security Policy

## Supported versions

| Version | Security fixes |
| --- | --- |
| Latest release | Yes |
| Older releases | Upgrade to the latest release |

## Reporting a vulnerability

Use GitHub's private **Report a vulnerability** flow instead of a public issue.
Include the affected version, a minimal reproduction, impact, and mitigation. Never
include credentials, tokens, private keys, or personal configuration data in a report.

## Security boundaries

`mcp-doctor` is an offline, read-only inspector for one local JSON document.

| Boundary | Guarantee in the CLI runtime |
| --- | --- |
| Input | Only the explicit file argument or stdin is read; input is bounded to 10 MiB |
| Network | No network connections, remote endpoint validation, or telemetry |
| Execution | Configured MCP servers and tools are never launched; no shell or child process is used |
| Mutation | The target configuration and its containing directory are never modified |
| Secrets | Secret-shaped values are not included in human or JSON output; only paths and locations are reported |
| Terminal safety | Untrusted paths, names, and messages are escaped in human-readable output |

The repository's verification scripts are development-time tooling and may invoke Git,
package-manager commands, and archive extraction to inspect repository state. Those
scripts are not part of the installed runtime behavior.

## Repository controls

- CI uses least-privilege read permissions for verification and pins third-party Actions
  to immutable commit SHAs.
- The verification gate scans the current tree and reachable Git history without
  printing matched values. Exact historical synthetic test artifacts are fingerprinted;
  there is no broad test-directory exemption.
- Dependabot checks npm and GitHub Actions updates weekly.
- CodeQL analyzes the TypeScript/JavaScript surface with only the permissions required
  to publish code-scanning results.
- The npm package uses an explicit allowlist and excludes repository metadata, tests,
  fixtures, source, plans, workflows, and generated factory state.

## Detection limitations

Secret and filesystem checks are heuristic signals, not proof of safety. They can have
false positives and false negatives, and they do not assess the runtime behavior of a
configured server or the safety of a remote endpoint. Input-size limits reduce local
resource exhaustion risk but are not a general parser sandbox.

No system can be proven "100% secure".
This PASS means no known critical/high findings remain within the audited scope,
all required hardening controls are active,
and the evidence is reproducible from a clean checkout.
