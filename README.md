# MCP Doctor

Offline inspector for local MCP (Model Context Protocol) server/tool JSON configurations with safety-focused checks.

## Install

```bash
# From source (requires Node.js 24+)
pnpm install
pnpm build

# Or install the packed tarball
pnpm pack
npm install -g ./mcp-doctor-0.1.0.tgz
```

## Usage

```bash
# Analyze a config file
mcp-doctor mcp.json

# Analyze common config file names
mcp-doctor .mcp.json
mcp-doctor claude_desktop_config.json
mcp-doctor .mcp/config.json

# Read from stdin
cat mcp.json | mcp-doctor

# Machine-readable JSON output
mcp-doctor mcp.json --json

# Show help and version
mcp-doctor --help
mcp-doctor --version
```

### Options

| Option | Description |
|--------|-------------|
| `--help`, `-h` | Show help message |
| `--version` | Print version |
| `--json` | Output machine-readable JSON |

If no config file is provided, reads from stdin.

### Supported Config Formats

Validates JSON files matching the [MCP config schema](https://json.schemastore.org/mcp-config-0.1.0.json):

```json
{
  "mcpServers": {
    "server-name": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"],
      "env": { "API_KEY": "${ENV_VAR}" },
      "cwd": "/working/dir"
    }
  },
  "inputs": [
    { "type": "promptString", "id": "api_key", "description": "API Key", "password": true }
  ]
}
```

## Checks Performed

| Check | Severity | Description |
|-------|----------|-------------|
| JSON syntax | error | Validates JSON parses correctly with line/column positions |
| Root object | error | Root must be an object |
| `mcpServers` object | error | Required property, must be an object (not array) |
| Server entries | error | Each server must be an object |
| `stdio` servers | error | Must have non-empty `command` string |
| `http`/`sse` servers | error | Must have valid `url` |
| `args` | error | If present, must be array of strings |
| `env` | error | If present, must be object with string values |
| `inputs` | error | If present, must be array of valid input definitions |
| Duplicate server names | error | Reports all locations of duplicate keys |
| Broad filesystem paths | high | Root (`/`), home (`~`, `/home/user`), whole drives (`C:\`, `/mnt/c`), parent traversal (`../`), wildcards (`/*`) |
| Secret-shaped values | high | API keys, tokens, passwords, private keys, connection strings with credentials — **never prints the secret** |

### Broad Path Detection

Only triggers for recognized filesystem server packages:
- `@modelcontextprotocol/server-filesystem`
- `@anthropic/fs-mcp-server`
- `server-filesystem`

### Secret Detection

Detects patterns in keys named `*key*`, `*token*`, `*secret*`, `*password*`, `*credential*`, `*auth*`, `*bearer*` combined with:
- Known prefixes (OpenAI `sk-...`, GitHub `ghp_...`, AWS `AKIA...`, Slack `xoxb-...`, JWT `eyJ...`, etc.)
- PEM private key headers (`-----BEGIN ... PRIVATE KEY-----`)
- Connection strings with embedded credentials (`postgresql://user:pass@host`)
- High-entropy strings (≥20 chars, mixed case/numbers/special)

**Environment variable placeholders (`${VAR_NAME}`) are explicitly allowed and never flagged.**

## Output

### Human-readable (default)

```
mcp-doctor: Analyzing mcp.json

✓ JSON syntax valid
✓ Structure valid
✗ Duplicate server name: "github" at mcp.json (line 3, col 5), mcp.json (line 13, col 5)
⚠ High: Broad filesystem path granted: "/" at mcp.json (line 6, col 65)
⚠ High: Secret-shaped value detected at mcp.json (line 8, col 20)

Summary: 1 error, 2 high, 0 medium, 0 low
Exit code: 1
```

### JSON (`--json`)

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
        { "path": "mcp.json", "line": 3, "column": 5 },
        { "path": "mcp.json", "line": 13, "column": 5 }
      ]
    },
    {
      "severity": "high",
      "code": "broad-filesystem-path",
      "message": "Broad filesystem path granted: \"/\"",
      "locations": [{ "path": "mcp.json", "line": 6, "column": 65 }]
    },
    {
      "severity": "high",
      "code": "secret-shaped-value",
      "message": "Secret-shaped value detected",
      "locations": [{ "path": "mcp.json", "line": 8, "column": 20 }],
      "redacted": true
    }
  ],
  "summary": { "error": 1, "high": 2, "medium": 0, "low": 0 }
}
```

## Exit Codes

| Code | Condition |
|------|-----------|
| `0` | JSON parses, structure valid, no high-severity findings |
| `1` | JSON syntax error OR structural validation error |
| `2` | High-severity finding(s) present (broad path, secret) |
| `3` | Usage error (missing file, invalid flags, empty input) |

## Development

```bash
# Install dependencies
pnpm install

# Run all checks
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

## License

MIT