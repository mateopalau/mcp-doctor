import { describe, expect, it, beforeEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

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
    const stdout = execSync(`node ${CLI_PATH} ${args.join(" ")}`, {
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
      const result = runCli([resolve(FIXTURES_DIR, "secrets.json")]);
      expect(result.code).toBe(2);
      expect(result.stdout).toContain("Secret-shaped value detected");
      expect(result.stdout).toContain("Exit code: 2");
    });

    it("should report various secret types", () => {
      const result = runCli(["--json", resolve(FIXTURES_DIR, "secrets.json")]);
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

    it("should not output actual secret values", () => {
      const result = runCli([resolve(FIXTURES_DIR, "secrets.json")]);
      expect(result.stdout).not.toContain("sk-abcdefghijklmnopqrstuvwxyz123456");
      expect(result.stdout).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz123456");
      expect(result.stdout).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(result.stdout).not.toContain("wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY");
      expect(result.stdout).not.toContain("BEGIN RSA PRIVATE KEY");
      expect(result.stdout).not.toContain("postgresql://user:password@localhost:5432/db");
      expect(result.stdout).not.toContain("eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9");
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
  });
});
