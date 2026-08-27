import { describe, expect, it, beforeEach } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

interface Finding {
  code: string;
  severity: string;
  message: string;
  locations: Array<{ path: string; line: number; column: number }>;
  redacted?: boolean;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const FIXTURES_DIR = resolve(__dirname, "fixtures");
const CLI_PATH = resolve(__dirname, "../dist/cli.js");

function runCli(args: string[], input?: string): { stdout: string; stderr: string; code: number } {
  if (!existsSync(CLI_PATH)) {
    throw new Error(
      [
        "FINAL_GATE FAILED",
        "stage: test",
        "environment: build-output",
        "command: pnpm build",
        "reason: dist/cli.js missing",
        "likely cause: tests depend on build artifact but build did not run",
      ].join("\n"),
    );
  }

  try {
    const stdout = execFileSync(process.execPath, [CLI_PATH, ...args], {
      input,
      encoding: "utf-8",
      cwd: __dirname,
      timeout: 10000,
    });
    return { stdout, stderr: "", code: 0 };
  } catch (error: unknown) {
    if (error instanceof Error && "stdout" in error && "stderr" in error && "status" in error) {
      const err = error as { stdout: Buffer | string; stderr: Buffer | string; status: number };
      return {
        stdout: err.stdout.toString(),
        stderr: err.stderr.toString(),
        code: err.status,
      };
    }
    throw error;
  }
}

interface SyntheticSecretFixture {
  filePath: string;
  values: string[];
}

function createSyntheticSecretValues(): Record<string, string> {
  return {
    openAi: `sk-${"a".repeat(24)}`,
    github: `ghp_${"a".repeat(36)}`,
    awsAccess: `AKIA${"A".repeat(16)}`,
    awsSecret: `${"aB7/".repeat(10)}`,
    privateKey: `${["-----BEGIN ", "RSA PRIVATE ", "KEY-----"].join("")}\n${"A".repeat(24)}\n-----END RSA PRIVATE KEY-----`,
    database: ["postgresql", "://", "user", ":", "password", "@localhost:5432/db"].join(""),
    bearer: ["Bearer ", "eyJ", "a".repeat(24), ".", "b".repeat(16), ".", "c".repeat(16)].join(""),
  };
}

function withTemporaryJson<T>(content: string, callback: (filePath: string) => T): T {
  const directory = mkdtempSync(join(tmpdir(), "mcp-doctor-test-"));
  const filePath = join(directory, "config.json");
  writeFileSync(filePath, content, "utf-8");

  try {
    return callback(filePath);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function withSyntheticSecretsFixture<T>(callback: (fixture: SyntheticSecretFixture) => T): T {
  const values = createSyntheticSecretValues();
  const template = readFileSync(resolve(FIXTURES_DIR, "secrets.json"), "utf-8");
  const escapeJsonString = (value: string): string => JSON.stringify(value).slice(1, -1);
  const content = template
    .replace("${SYNTHETIC_OPENAI_KEY}", escapeJsonString(values.openAi))
    .replace("${SYNTHETIC_GITHUB_TOKEN}", escapeJsonString(values.github))
    .replace("${SYNTHETIC_AWS_ACCESS_KEY}", escapeJsonString(values.awsAccess))
    .replace("${SYNTHETIC_AWS_SECRET_KEY}", escapeJsonString(values.awsSecret))
    .replace("${SYNTHETIC_PRIVATE_KEY}", escapeJsonString(values.privateKey))
    .replace("${SYNTHETIC_DATABASE_URL}", escapeJsonString(values.database))
    .replace("${SYNTHETIC_BEARER_TOKEN}", escapeJsonString(values.bearer));

  return withTemporaryJson(content, (filePath) => callback({ filePath, values: Object.values(values) }));
}

describe("mcp-doctor CLI", () => {
  beforeEach(() => {
    // Ensure build is up to date
  });

  describe("valid.json", () => {
    it("should pass with exit code 0", () => {
      const result = runCli([resolve(FIXTURES_DIR, "valid.json")]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("✓ JSON syntax valid");
      expect(result.stdout).toContain("✓ Structure valid");
      expect(result.stdout).toContain("Summary: 0 error, 0 high, 0 medium, 0 low");
      expect(result.stdout).toContain("Exit code: 0");
    });

    it("should output valid JSON with --json flag", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "valid.json")]);
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      expect(report.version).toBe("1.0");
      expect(report.valid).toBe(true);
      expect(report.findings).toHaveLength(0);
      expect(report.summary).toEqual({ error: 0, high: 0, medium: 0, low: 0 });
    });
  });

  describe("invalid-json.json", () => {
    it("should fail with exit code 1 for JSON syntax error", () => {
      const result = runCli([resolve(FIXTURES_DIR, "invalid-json.json")]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("✗ JSON syntax error");
      expect(result.stdout).toContain("Exit code: 1");
    });

    it("should output JSON with syntax error finding", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "invalid-json.json")]);
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.valid).toBe(false);
      expect(report.findings.some((f: Finding) => f.code === "json-syntax-error")).toBe(true);
      expect(report.summary.error).toBeGreaterThan(0);
    });
  });

  describe("invalid-structure.json", () => {
    it("should fail with exit code 1 for structural errors", () => {
      const result = runCli([resolve(FIXTURES_DIR, "invalid-structure.json")]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Exit code: 1");
    });

    it("should report mcpServers must be an object", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "invalid-structure.json")]);
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      expect(report.findings.some((f: Finding) => f.code === "invalid-mcp-servers")).toBe(true);
    });

    it("should report inputs must be an array", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "invalid-structure.json")]);
      const report = JSON.parse(result.stdout);
      expect(report.findings.some((f: Finding) => f.code === "invalid-inputs")).toBe(true);
    });
  });

  describe("duplicates.json", () => {
    it("should fail with exit code 1 for duplicate server names", () => {
      const result = runCli([resolve(FIXTURES_DIR, "duplicates.json")]);
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("Duplicate server name");
      expect(result.stdout).toContain("Exit code: 1");
    });

    it("should report duplicate server with both locations", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "duplicates.json")]);
      expect(result.code).toBe(1);
      const report = JSON.parse(result.stdout);
      const dupFinding = report.findings.find((f: Finding) => f.code === "duplicate-server-name");
      expect(dupFinding).toBeDefined();
      expect(dupFinding.locations).toHaveLength(2);
      expect(dupFinding.severity).toBe("error");
    });
  });

  describe("broad-path.json", () => {
    it("should fail with exit code 2 for high-severity broad paths", () => {
      const result = runCli([resolve(FIXTURES_DIR, "broad-path.json")]);
      expect(result.code).toBe(2);
      expect(result.stdout).toContain("Broad filesystem path granted");
      expect(result.stdout).toContain("Exit code: 2");
    });

    it("should report root path as high severity", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "broad-path.json")]);
      expect(result.code).toBe(2);
      const report = JSON.parse(result.stdout);
      const pathFindings = report.findings.filter((f: Finding) => f.code === "broad-filesystem-path");
      expect(pathFindings.length).toBeGreaterThanOrEqual(3);
      const highFindings = pathFindings.filter((f: Finding) => f.severity === "high");
      expect(highFindings.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("secrets.json", () => {
    it("should fail with exit code 2 for high-severity secrets", () => {
      withSyntheticSecretsFixture(({ filePath }) => {
        const result = runCli([filePath]);
        expect(result.code).toBe(2);
        expect(result.stdout).toContain("Secret-shaped value detected");
        expect(result.stdout).toContain("Exit code: 2");
      });
    });

    it("should report various secret types", () => {
      withSyntheticSecretsFixture(({ filePath }) => {
        const result = runCli(["--json", filePath]);
        expect(result.code).toBe(2);
        const report = JSON.parse(result.stdout);
        const secretFindings = report.findings.filter((f: Finding) => f.code === "secret-shaped-value");
        expect(secretFindings.length).toBeGreaterThanOrEqual(6);
        for (const finding of secretFindings) {
          expect(finding.severity).toBe("high");
          expect(finding.redacted).toBe(true);
          expect(finding.message).toContain("Secret-shaped value detected");
        }
      });
    });

    it("should not output actual secret values", () => {
      withSyntheticSecretsFixture(({ filePath, values }) => {
        const result = runCli([filePath]);
        for (const value of values) {
          expect(result.stdout).not.toContain(value);
          expect(result.stderr).not.toContain(value);
        }
      });
    });
  });

  describe("env-subst.json", () => {
    it("should pass with exit code 0 (placeholders are safe)", () => {
      const result = runCli([resolve(FIXTURES_DIR, "env-subst.json")]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("✓ JSON syntax valid");
      expect(result.stdout).toContain("✓ Structure valid");
      expect(result.stdout).toContain("Summary: 0 error, 0 high, 0 medium, 0 low");
    });

    it("should not flag env var placeholders as secrets", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "env-subst.json")]);
      expect(result.code).toBe(0);
      const report = JSON.parse(result.stdout);
      const secretFindings = report.findings.filter((f: Finding) => f.code === "secret-shaped-value");
      expect(secretFindings).toHaveLength(0);
    });
  });

  describe("stdin input", () => {
    it("should read from stdin when no file provided", () => {
      const validConfig = JSON.stringify({
        mcpServers: {
          test: {
            type: "stdio",
            command: "echo",
            args: ["hello"],
          },
        },
      });
      const result = runCli([], validConfig);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Analyzing stdin");
    });

    it("should fail on invalid JSON from stdin", () => {
      const result = runCli([], "{ invalid json }");
      expect(result.code).toBe(1);
      expect(result.stdout).toContain("JSON syntax error");
    });
  });

  describe("help and version", () => {
    it("should show help with --help", () => {
      const result = runCli(["--help"]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("mcp-doctor — Offline inspector");
      expect(result.stdout).toContain("Usage:");
      expect(result.stdout).toContain("--help");
      expect(result.stdout).toContain("--version");
      expect(result.stdout).toContain("--json");
    });

    it("should show help with -h", () => {
      const result = runCli(["-h"]);
      expect(result.code).toBe(0);
      expect(result.stdout).toContain("Usage:");
    });

    it("should show version with --version", () => {
      const result = runCli(["--version"]);
      expect(result.code).toBe(0);
      expect(result.stdout.trim()).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("error handling", () => {
    it("should exit with code 3 for missing file", () => {
      const result = runCli(["/nonexistent/file.json"]);
      expect(result.code).toBe(3);
      expect(result.stderr).toContain("Failed to read file");
    });

    it("should exit with code 3 for unknown option", () => {
      const result = runCli(["--unknown-option"]);
      expect(result.code).toBe(3);
      expect(result.stderr).toContain("Unknown option");
    });

    it("should exit with code 3 for multiple files", () => {
      const result = runCli([resolve(FIXTURES_DIR, "valid.json"), resolve(FIXTURES_DIR, "valid.json")]);
      expect(result.code).toBe(3);
      expect(result.stderr).toContain("Only one config file can be specified");
    });

    it("should sanitize terminal control characters in file errors", () => {
      const result = runCli([`missing\u001b[31m\nfile.json`]);
      expect(result.code).toBe(3);
      expect(result.stderr).not.toContain("\u001b");
      expect(result.stderr).toContain("\\x1B[31m\\x0Afile.json");
    });
  });

  describe("adversarial input", () => {
    it("redacts nested secrets and neutralizes terminal injection in human output", () => {
      const values = createSyntheticSecretValues();
      const maliciousPath = "../\u001b[31m\ninjected";
      const config = JSON.stringify({
        mcpServers: {
          filesystem: {
            type: "stdio",
            command: "npx",
            args: ["@modelcontextprotocol/server-filesystem", maliciousPath],
            env: { TOKEN: values.openAi },
            headers: { Authorization: values.bearer },
          },
        },
      });

      withTemporaryJson(config, (filePath) => {
        const result = runCli([filePath]);
        expect(result.code).toBe(2);
        expect(result.stdout).not.toContain("\u001b");
        expect(result.stdout).toContain("../\\x1B[31m\\x0Ainjected");
        expect(result.stdout).not.toContain(values.bearer);
        expect(result.stdout).not.toContain(values.openAi);
      });
    });

    it("rejects input larger than the bounded read limit", () => {
      const result = runCli([], "{" + "x".repeat(10 * 1024 * 1024) + "}");
      expect(result.code).toBe(3);
      expect(result.stderr).toContain("input exceeds the 10485760 byte limit");
    });
  });
});
