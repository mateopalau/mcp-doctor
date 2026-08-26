import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const CLI_PATH = resolve(__dirname, "../dist/cli.js");

describe("scaffold", () => {
  it("boots with a passing smoke test", () => {
    expect(true).toBe(true);
  });

  it("runs the compiled CLI entry point", () => {
    expect(existsSync(CLI_PATH)).toBe(true);
    const output = execFileSync(process.execPath, [CLI_PATH, "--help"], {
      encoding: "utf-8",
    });

    expect(output).toContain("Usage: mcp-doctor");
  });
});
