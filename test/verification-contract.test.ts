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
  return readFileSync(resolve(ROOT_DIR, path), "utf-8").replace(/\r\n/g, "\n");
}

describe("clean verification contract", () => {
  it("defines the release gates in build-before-test order", () => {
    const manifest = JSON.parse(readText("scripts/verification.json")) as { gates: Gate[] };

    expect(manifest.gates.map((gate) => gate.name)).toEqual([
      "security-scan",
      "lint",
      "typecheck",
      "build",
      "test",
      "audit",
    ]);
    expect(manifest.gates[3]?.args).toEqual(["build"]);
    expect(manifest.gates[4]?.args).toEqual(["test"]);
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
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("permissions:\n  contents: read");
    expect(workflow).toMatch(/actions\/checkout@[0-9a-f]{40}/);
    expect(workflow).toMatch(/pnpm\/action-setup@[0-9a-f]{40}/);
    expect(workflow).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
  });

  it("keeps CodeQL least-privileged and immutable", () => {
    const workflow = readText(".github/workflows/codeql.yml");

    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("security-events: write");
    expect(workflow).toMatch(/github\/codeql-action\/init@[0-9a-f]{40}/);
    expect(workflow).toMatch(/github\/codeql-action\/analyze@[0-9a-f]{40}/);
  });

  it("pins every workflow action to a full commit SHA", () => {
    const workflowDirectory = resolve(ROOT_DIR, ".github", "workflows");
    const actionReferences = readdirSync(workflowDirectory)
      .map((file) => readText(`.github/workflows/${file}`))
      .flatMap((workflow) => [...workflow.matchAll(/^\s*- uses: \S+@([^\s]+)$/gm)])
      .map((match) => match[1]);

    expect(actionReferences.length).toBeGreaterThan(0);
    for (const reference of actionReferences) {
      expect(reference).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it("keeps the installed runtime offline and process-free", () => {
    const runtimeFiles = [
      "src/cli.ts",
      "src/parse.ts",
      "src/types.ts",
      "src/report/human.ts",
      "src/report/json.ts",
      "src/report/safe-text.ts",
      "src/validate/duplicates.ts",
      "src/validate/paths.ts",
      "src/validate/secrets.ts",
      "src/validate/structure.ts",
    ].map((file) => readText(file)).join("\n");

    expect(runtimeFiles).not.toMatch(/from ["']node:(?:child_process|net|http|https|dgram|tls)["']/);
    expect(runtimeFiles).not.toMatch(/\b(?:fetch|spawn|exec|execFile)\s*\(/);
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

  it("uses an explicit package allowlist", () => {
    const packageJson = JSON.parse(readText("package.json")) as { files?: string[] };

    expect(packageJson.files).toEqual([
      "dist",
      "README.md",
      "CHANGELOG.md",
      "LICENSE",
      "SECURITY.md",
    ]);
  });

  it("does not rely on a tracked build artifact", () => {
    const packageArtifacts = readdirSync(ROOT_DIR).filter((file) => file.endsWith(".tgz"));

    expect(packageArtifacts).toEqual([]);
  });
});
