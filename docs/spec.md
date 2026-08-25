# mcp-doctor — Architect Seed Contract

This seed locks the generation boundary for the first factory project. The
architect worker MUST incorporate every requirement below into `docs/spec.md`
and MUST NOT broaden, shrink, or reinterpret the forbidden scope. If a
requirement cannot be satisfied, the worker returns a blocked result with an
explicit reason instead of silently deviating.

## Product Goal

`mcp-doctor` is an offline CLI inspector for **local JSON MCP (Model Context
Protocol) configuration files**. It helps developers catch broken or risky
configuration before launching an agent session. It is a diagnostic tool: it
reads, analyzes, and reports.

## Required Behavior

The first version MUST:

1. Accept a local JSON MCP configuration file as its primary input.
2. Validate JSON syntax and report precise parse errors (file and offset/line).
3. Validate expected server/tool configuration shapes where deterministically
   possible (for example: servers map present, each entry an object, command
   and args fields well-formed).
4. Detect duplicate server names and report each occurrence's location.
5. Identify suspiciously broad filesystem/path configuration patterns (such as
   root-level or whole-drive access grants) as high-severity findings.
6. Flag obvious plaintext secret-shaped values (token/key/password-shaped
   strings) WITHOUT printing the secret itself; reports reference the field and
   location only.
7. Produce human-readable terminal output by default.
8. Support structured output via a `--json` flag with a stable machine-readable
   schema including per-finding severity and location.
9. Return non-zero exit status for invalid configuration OR for any
   high-severity finding; exit zero only when the configuration parses and no
   high-severity findings exist.
10. Include fixture-driven tests covering: valid config, invalid JSON,
    duplicate names, broad filesystem paths, and secret-shaped values.

## Forbidden Scope

The first version MUST NOT:

- MUST NOT connect to arbitrary remote MCP servers; network connections are
  out of scope for v1.
- MUST NOT execute discovered MCP tools or spawn configured servers.
- MUST NOT mutate the target MCP configuration; the CLI is read-only.
- MUST NOT claim a configuration is secure in an absolute sense; findings are
  heuristic risk signals, not guarantees.

## Deterministic Acceptance Commands

The generated project must pass all of these from its workspace root:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Package smoke: after `pnpm pack`, the packed tarball installs in a clean
fixture directory and the CLI answers `--help`.

## Evidence Requirements

- The implementer MUST NEVER fabricate results; every reported pass maps to an
  actually executed command recorded with evidence in its structured result.
- Reviewers MUST return evidence-backed findings (exact file, line where
  possible, and concrete excerpts or command output).
- A worker that cannot proceed due to a missing external requirement MUST
  return `"status": "blocked"` with a precise `blockedReason`; it must never
  guess, improvise, or mark such work as passed.
