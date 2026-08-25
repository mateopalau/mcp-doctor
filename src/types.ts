export interface Location {
  path: string;
  line: number;
  column: number;
}

export interface Finding {
  severity: "error" | "high" | "medium" | "low";
  code: string;
  message: string;
  locations: Location[];
  redacted?: boolean;
}

export interface Summary {
  error: number;
  high: number;
  medium: number;
  low: number;
}

export interface Report {
  version: string;
  file: string;
  valid: boolean;
  findings: Finding[];
  summary: Summary;
}

export interface ParsedConfig {
  root: unknown;
  errors: Finding[];
}

export interface ServerConfig {
  type: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  headers?: Record<string, string>;
}

export interface InputConfig {
  type: "promptString";
  id: string;
  description: string;
  password?: boolean;
}

export interface MCPConfig {
  mcpServers?: Record<string, ServerConfig>;
  inputs?: InputConfig[];
}

export interface CliOptions {
  file: string | undefined;
  json: boolean;
  help: boolean;
  version: boolean;
}

export const FINDING_CODES = {
  JSON_SYNTAX_ERROR: "json-syntax-error",
  INVALID_ROOT: "invalid-root",
  MISSING_MCP_SERVERS: "missing-mcp-servers",
  INVALID_MCP_SERVERS: "invalid-mcp-servers",
  INVALID_SERVER_ENTRY: "invalid-server-entry",
  MISSING_COMMAND: "missing-command",
  INVALID_URL: "invalid-url",
  INVALID_ARGS: "invalid-args",
  INVALID_ENV: "invalid-env",
  INVALID_INPUTS: "invalid-inputs",
  DUPLICATE_SERVER_NAME: "duplicate-server-name",
  BROAD_FILESYSTEM_PATH: "broad-filesystem-path",
  SECRET_SHAPED_VALUE: "secret-shaped-value",
} as const;

export type FindingCode = (typeof FINDING_CODES)[keyof typeof FINDING_CODES];

export const FILESYSTEM_SERVER_PACKAGES = [
  "@modelcontextprotocol/server-filesystem",
  "@anthropic/fs-mcp-server",
  "server-filesystem",
] as const;

export type FilesystemServerPackage = (typeof FILESYSTEM_SERVER_PACKAGES)[number];