# Changelog

All notable changes to MCP Doctor are documented here.

## 0.1.0 - 2026-08-24

### Added
- **CLI entry point** (`mcp-doctor`) accepting a config file path or stdin input
- **JSON syntax validation** using `jsonc-parser` with precise line/column/error reporting
- **Structural validation** for MCP config schema:
  - Root must be an object
  - `mcpServers` required, must be an object
  - Each server entry must be an object
  - `stdio` servers require non-empty `command`
  - `http`/`sse` servers require valid `url`
  - `args` must be string array if present
  - `env` must be object with string values if present
  - `inputs` must be array of valid `promptString` definitions if present
- **Duplicate server name detection** — reports all key locations using parse tree positions
- **Broad filesystem path detection** (high severity) for recognized filesystem servers:
  - Root directory (`/`, `C:\`)
  - Home directory (`~`, `/home/user`, `C:\Users\user`)
  - Whole drive (`/mnt/c`, `/Volumes/*`, UNC paths)
  - Parent traversal (`../`, `..\`) — medium severity
  - Wildcard/glob (`/*`, `/**`) — medium severity
  - Recognized packages: `@modelcontextprotocol/server-filesystem`, `@anthropic/fs-mcp-server`, `server-filesystem`
- **Secret-shaped value detection** (high severity) without printing secrets:
  - Known prefixes: OpenAI (`sk-...`), GitHub (`ghp_...`, `gho_...`, etc.), AWS (`AKIA...`, 40-char base64), Slack (`xoxb-...`, `xoxp-...`, `xoxa-...`), JWT (`eyJ...`, `Bearer ...`), Google (`AIzaSy...`)
  - PEM private key headers (`-----BEGIN ... PRIVATE KEY-----`)
  - Connection strings with embedded credentials (PostgreSQL, MySQL, MongoDB, Redis, SQL Server)
  - High-entropy heuristic (≥20 chars, mixed case/numbers/special) for keys matching `*key*`, `*token*`, `*secret*`, `*password*`, `*credential*`, `*auth*`, `*bearer*`
  - Environment variable placeholders (`${VAR_NAME}`) explicitly allowed
- **Two output formats**:
  - Human-readable terminal output with severity prefixes and location info
  - Machine-readable JSON (`--json` flag) with stable schema v1.0
- **Exit codes**: 0 (clean), 1 (syntax/structure error), 2 (high-severity findings), 3 (usage error)
- **Help (`--help`, `-h`) and version (`--version`) flags**
- **Fixture-driven test suite** covering all validation categories:
  - `valid.json` — well-formed stdio + http config (exit 0)
  - `invalid-json.json` — trailing comma (exit 1)
  - `invalid-structure.json` — `mcpServers` as array, invalid `inputs` (exit 1)
  - `duplicates.json` — duplicate "github" server (exit 1)
  - `broad-path.json` — root, Windows drive, home directory paths (exit 2)
  - `secrets.json` — API keys, tokens, AWS keys, PEM key, connection string, JWT (exit 2)
  - `env-subst.json` — `${VAR}` placeholders correctly allowed (exit 0)
- **TypeScript strict mode** with `jsonc-parser` for position-aware parsing
- **ESLint + TypeScript ESLint** configuration
- **Vitest** test runner with 25 passing tests

### Non-Goals (Intentionally Excluded)
- Network connections to MCP servers
- Server execution or tool invocation
- Configuration mutation/auto-fix
- YAML config support
- Absolute security guarantees (findings are heuristic risk signals)