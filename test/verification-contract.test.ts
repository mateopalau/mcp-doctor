import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface Gate {
  name: string;
  command: "run" | "audit";
  args: string[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(__dirname, "..");

function readText(path: string): string {
  return readFileSync(resolve(ROOT_DIR, path), "utf-8");
}

describe("clean verification contract", () => {
  it("defines the release gates in build-before-test order", () => {
    const manifest = JSON.parse(readText("scripts/verification.json")) as { gates: Gate[] };

    expect(manifest.gates.map((gate) => gate.name)).toEqual([
      "lint",
      "typecheck",
      "build",
      "test",
      "audit",
    ]);
    expect(manifest.gates[2]?.args).toEqual(["build"]);
    expect(manifest.gates[3]?.args).toEqual(["test"]);
  });

  it("has a runner that executes the manifest and reports the failed stage", () => {
    const runner = readText("scripts/verify.mjs");

    expect(runner).toContain("verification.json");
    expect(runner).toContain("spawnSync");
    expect(runner).toContain("VERIFY FAILED stage:");
  });

  it("makes CI invoke the same verifier after a frozen install", () => {
    const workflow = readText(".github/workflows/ci.yml");
    const installIndex = workflow.indexOf("pnpm install --frozen-lockfile");
    const verifyIndex = workflow.indexOf("pnpm verify");

    expect(installIndex).toBeGreaterThanOrEqual(0);
    expect(verifyIndex).toBeGreaterThan(installIndex);
    expect(workflow).not.toContain("pnpm test");
    expect(workflow).not.toContain("pnpm build");
  });

  it("pins the package manager and ignores generated state", () => {
    const packageJson = JSON.parse(readText("package.json")) as {
      packageManager?: string;
      engines?: { node?: string };
    };
    const gitignore = readText(".gitignore");

    expect(packageJson.packageManager).toBe("pnpm@11.23.0");
    expect(packageJson.engines?.node).toBe(">=24");
    expect(gitignore).toContain("dist/");
    expect(gitignore).toContain(".pnpm-store/");
    expect(gitignore).toContain("*.tgz");
  });

  it("does not rely on a tracked build artifact", () => {
    const packageArtifacts = readdirSync(ROOT_DIR).filter((file) => file.endsWith(".tgz"));

    expect(packageArtifacts).toEqual([]);
  });
});
