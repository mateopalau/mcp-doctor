# mcp-doctor — Specification

## Product Goal

`mcp-doctor` is an offline CLI inspector for **local JSON MCP (Model Context Protocol) configuration files**. It helps developers catch broken or risky configuration before launching an agent session. It is a diagnostic tool: it reads, analyzes, and reports.

## Problem

Developers configuring Model Context Protocol (MCP) servers in local JSON configuration files have no offline inspector that:

- Validates configuration shape and JSON syntax
- Detects duplicate server names
- Flags risky filesystem access patterns (e.g., root-level or whole-drive grants)
- Identifies plaintext secret-shaped values in configuration

Without validation, misconfigured or unsafe MCP configurations can cause agent startup failures, grant excessive filesystem access, or leak credentials.

## Target Users

1. **Developers using MCP-capable coding agents locally** — validate their `.mcp.json`, `mcp.json`, or `claude_desktop_config.json` before starting a session
2. **Platform engineers auditing team MCP configurations** — run automated checks in CI/CD or pre-commit hooks

## MCP Configuration Format

Based on the emerging standard (JSON Schema at `https://json.schemastore.org/mcp-config-0.1.0.json` and the [timheuer gist](https://gist.github.com/timheuer/7b092645f01fe15fad2a96677d0b34e6)), the canonical format is:

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio" | "http" | "sse",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "env": {
        "API_KEY": "${ENV_VAR}",
        "SECRET": "plaintext-secret"
      },
      "cwd": "/working/dir",
      "url": "https://example.com/mcp",
      "headers": { "Authorization": "Bearer ${TOKEN}" }
    }
  },
  "inputs": [
    { "type": "promptString", "id": "api_key", "description": "API Key", "password": true }
  ]
}
```

### Server Types

| Type | Required Fields | Optional Fields |
|------|----------------|-----------------|
| `stdio` | `command` | `args` (string[]), `env` (object), `cwd` (string) |
| `http` | `url` | `headers` (object), `type: "http"` |
| `sse` | `url` | `headers` (object), `type: "sse"` |

### Common Patterns Observed in Practice

- **Environment variable substitution**: `${VAR_NAME}` placeholders in any string field
- **Filesystem server args**: The last argument(s) to `@modelcontextprotocol/server-filesystem` are directory paths granted to the agent
- **Secrets in env**: Plaintext values like `"API_KEY": "sk-actual-key-here"` or connection strings with embedded credentials

## Required CLI Behavior

### Input

```bash
mcp-doctor [options] <config-file>
```

- Primary input: path to a local JSON MCP configuration file
- If no file provided, read from stdin (for piping)
- Support common config file names: `mcp.json`, `.mcp.json`, `claude_desktop_config.json`, `.mcp/config.json`

### Validation Rules

#### 1. JSON Syntax Validation
- Parse JSON and report precise parse errors with file path, line, column, and offset
- Use a streaming/lenient parser that can recover position information

#### 2. Structural Validation
- Root must be an object
- `mcpServers` property must exist and be an object (not array)
- Each server entry must be an object
- For `stdio` servers: `command` must be a non-empty string
- For `http`/`sse` servers: `url` must be a valid URI
- `args` if present must be an array of strings
- `env` if present must be an object with string values
- `inputs` if present must be an array of valid input definitions

#### 3. Duplicate Server Name Detection
- Report each duplicate server name with all locations (file path + key path)
- Severity: **error** (causes non-zero exit)

#### 4. Broad Filesystem Path Detection (High Severity)
Detect suspiciously broad filesystem access grants in `stdio` server `args`:

| Pattern | Example | Severity |
|---------|---------|----------|
| Root directory | `/`, `C:\`, `C:/` | **high** |
| Home directory | `~`, `/home/user`, `C:\Users\user` | **high** |
| Whole drive | `/mnt/c`, `/Volumes/*` | **high** |
| Parent traversal | `../`, `..\\` in path args | **medium** |
| Wildcard/glob in path | `/*`, `/**` | **medium** |

Only applies to recognized filesystem server packages (e.g., `@modelcontextprotocol/server-filesystem`, `@anthropic/fs-mcp-server`, `server-filesystem`)

#### 5. Secret-Shaped Value Detection (High Severity)
Flag obvious plaintext secret patterns **without printing the secret**. Report field path and location only.

Patterns to detect (case-insensitive key names + value patterns):

| Key Pattern | Value Pattern | Example |
|-------------|---------------|---------|
| `*key*`, `*token*`, `*secret*`, `*password*`, `*credential*` | High-entropy string (≥20 chars, mixed case/numbers/special) | `sk-abc123...` |
| `*api*key*` | Known prefix patterns | `AIzaSy...`, `ghp_...`, `sk-...` |
| `*access*key*`, `*secret*key*` | AWS patterns | `AKIA...`, 40-char base64 |
| `*private*key*` | PEM headers | `-----BEGIN RSA PRIVATE KEY-----` |
| `*auth*`, `*bearer*` | Bearer tokens | `Bearer eyJ...` |
| Connection strings | Embedded credentials | `postgresql://user:pass@host` |

**Critical**: Never output the actual secret value. Report: `Found secret-shaped value at mcpServers.github.env.GITHUB_TOKEN (line 12, col 15)`

### Output Formats

#### Human-Readable (Default)
```
mcp-doctor: Analyzing mcp.json

✓ JSON syntax valid
✓ Structure valid
✗ Duplicate server name: "github" at mcpServers.github (line 5), mcpServers.github (line 18)
⚠ High: Broad filesystem path "/" at mcpServers.filesystem.args[2] (line 10)
⚠ High: Secret-shaped value at mcpServers.api.env.API_KEY (line 14)

Summary: 1 error, 2 high, 0 medium, 0 low
Exit code: 1
```

#### JSON (`--json` flag)
Stable machine-readable schema:

```json
{
  "version": "1.0",
  "file": "mcp.json",
  "valid": false,
  "findings": [
    {
      "severity": "error",
      "code": "duplicate-server-name",
      "message": "Duplicate server name: \"github\"",
      "locations": [
        { "path": "mcpServers.github", "line": 5, "column": 3 },
        { "path": "mcpServers.github", "line": 18, "column": 3 }
      ]
    },
    {
      "severity": "high",
      "code": "broad-filesystem-path",
      "message": "Broad filesystem path granted: \"/\"",
      "locations": [{ "path": "mcpServers.filesystem.args[2]", "line": 10, "column": 22 }]
    },
    {
      "severity": "high",
      "code": "secret-shaped-value",
      "message": "Secret-shaped value detected",
      "locations": [{ "path": "mcpServers.api.env.API_KEY", "line": 14, "column": 15 }],
      "redacted": true
    }
  ],
  "summary": { "error": 1, "high": 2, "medium": 0, "low": 0 }
}
```

### Exit Codes

| Code | Condition |
|------|-----------|
| 0 | JSON parses, structure valid, no high-severity findings |
| 1 | JSON syntax error OR structural validation error |
| 2 | High-severity finding(s) present (broad path, secret) |
| 3 | Usage error (missing file, invalid flags) |

## Non-Goals (Forbidden Scope)

The first version **MUST NOT**:

- Connect to arbitrary remote MCP servers; network connections are out of scope for v1
- Execute discovered MCP tools or spawn configured servers
- Mutate the target MCP configuration; the CLI is read-only
- Claim a configuration is secure in an absolute sense; findings are heuristic risk signals, not guarantees
- Support YAML configuration files (JSON only for v1)
- Auto-fix or remediate findings

## Test Requirements

Fixture-driven tests covering:

| Fixture | Description | Expected Findings |
|---------|-------------|-------------------|
| `valid.json` | Well-formed config with stdio + http servers | None (exit 0) |
| `invalid-json.json` | Trailing comma, missing brace | JSON syntax error (exit 1) |
| `invalid-structure.json` | `mcpServers` as array, missing `command` | Structural errors (exit 1) |
| `duplicates.json` | Two servers named "github" | Duplicate name error (exit 1) |
| `broad-path.json` | Filesystem server with `/` or `C:\` | High-severity broad path (exit 2) |
| `secrets.json` | Plaintext `sk-...`, `AKIA...`, connection string | High-severity secret (exit 2) |
| `env-subst.json` | `${API_KEY}` placeholders | No secret finding (placeholder is safe) |

## Deterministic Acceptance Commands

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Package smoke test: after `pnpm pack`, the packed tarball installs in a clean fixture directory and the CLI answers `--help`.

## Architecture Notes

### Suggested Module Structure

```
src/
├── cli.ts           # Entry point, argument parsing, exit codes
├── parse.ts         # JSON parsing with position tracking
├── validate/
│   ├── structure.ts # Structural schema validation
│   ├── duplicates.ts # Duplicate server name detection
│   ├── paths.ts     # Broad filesystem path detection
│   └── secrets.ts   # Secret-shaped value detection
├── report/
│   ├── human.ts     # Human-readable formatter
│   └── json.ts      # JSON formatter
└── types.ts         # Shared TypeScript types
```

### Key Dependencies

- **JSON parsing with positions**: Use `jsonc-parser` (Microsoft's VS Code parser) or custom parser for line/column info
- **Secret detection**: Regex-based patterns + entropy estimation for generic high-entropy strings
- **Path normalization**: `path.posix` / `path.win32` for cross-platform path analysis

## Open Questions

1. **Config file discovery**: Should the CLI auto-discover config files in standard locations if no file argument given?
2. **Schema versioning**: Should we validate against a specific JSON Schema version, or be permissive?
3. **False positive tuning**: Secret detection will have false positives (e.g., UUIDs, long random strings). How aggressive should v1 be?
4. **Windows path handling**: Broad path detection must handle `C:\`, `C:/`, `\\server\share`, etc.

These are recorded here instead of resolved silently per integrity rules.

## Evidence Requirements

- The implementer MUST NEVER fabricate results; every reported pass maps to an actually executed command recorded with evidence in its structured result.
- Reviewers MUST return evidence-backed findings (exact file, line where possible, and concrete excerpts or command output).
- A worker that cannot proceed due to a missing external requirement MUST return `"status": "blocked"` with a precise `blockedReason`; it must never guess, improvise, or mark such work as passed.