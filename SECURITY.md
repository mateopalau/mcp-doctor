# Security Policy

## Supported Versions

Only the latest released version of mcp-doctor receives security fixes.

## Reporting a Vulnerability

Open a private security advisory via GitHub ("Report a vulnerability") instead of a
public issue. Include reproduction steps and affected versions. Do not include real
credentials in reports.

## Scope

### In Scope
- The CLI reads only files explicitly passed as arguments or via stdin.
- No network connections are made by the tool.
- No configuration mutation or auto-fix is performed.
- Secret-shaped values are **never printed** in output (human or JSON); only field paths and locations are reported.

### Out of Scope
- mcp-doctor does not execute MCP servers or invoke tools.
- mcp-doctor does not validate the safety of remote MCP endpoints.
- Findings are heuristic risk signals, not security guarantees.
- False positives/negatives in secret/path detection are expected and not considered vulnerabilities.

## Security Model

| Property | Behavior |
|----------|----------|
| File access | Read-only, explicit paths only |
| Network | None |
| Subprocess execution | None |
| Secret handling | Detected values redacted in all outputs |
| Configuration mutation | None (read-only) |
| Telemetry | None |

## Known Limitations

- Secret detection uses regex and entropy heuristics; false positives (e.g., UUIDs, long random strings) and false negatives are possible.
- Broad path detection only applies to recognized filesystem server packages; custom servers with similar args may not be flagged.
- The tool validates configuration shape, not runtime behavior of configured servers.