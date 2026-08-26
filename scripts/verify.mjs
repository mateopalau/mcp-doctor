import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
import process from "node:process";

const rootDir = process.cwd();
const packageJson = readJson(join(rootDir, "package.json"));
const verification = readJson(join(rootDir, "scripts", "verification.json"));
const packageManager = detectPackageManager(packageJson, rootDir);

for (const gate of verification.gates) {
  const args = getCommandArgs(gate, packageManager);
  const command = `${packageManager} ${args.join(" ")}`;
  writeOut(`VERIFY stage: ${gate.name}`);
  writeOut(`VERIFY command: ${command}`);

  const invocation = getInvocation(args, packageManager);
  const result = spawnSync(invocation.executable, invocation.args, {
    cwd: rootDir,
    stdio: "inherit",
    shell: invocation.shell,
  });

  if (result.error || result.status !== 0) {
    const status = result.status ?? 1;
    writeErr(`VERIFY FAILED stage: ${gate.name}`);
    writeErr(`VERIFY command: ${command}`);
    if (result.error) {
      writeErr(`VERIFY reason: ${result.error.message}`);
    }
    process.exit(status);
  }
}

writeOut("VERIFY PASS");

function writeOut(message) {
  process.stdout.write(`${message}\n`);
}

function writeErr(message) {
  process.stderr.write(`${message}\n`);
}

function readJson(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read ${filePath}: ${reason}`);
  }
}

function detectPackageManager(manifest, directory) {
  const declared = typeof manifest.packageManager === "string"
    ? manifest.packageManager.split("@", 1)[0]
    : undefined;
  const lockfiles = [
    ["pnpm", "pnpm-lock.yaml"],
    ["npm", "package-lock.json"],
    ["yarn", "yarn.lock"],
    ["bun", "bun.lock"],
    ["bun", "bun.lockb"],
  ].filter(([, file]) => fileExists(join(directory, file)));
  const detected = [...new Set(lockfiles.map(([name]) => name))];

  if (declared && !["pnpm", "npm", "yarn", "bun"].includes(declared)) {
    throw new Error(`Unsupported package manager: ${declared}`);
  }
  if (declared && detected.length > 0 && !detected.includes(declared)) {
    throw new Error(`packageManager ${declared} disagrees with lockfile ${detected.join(", ")}`);
  }
  if (declared) return declared;
  if (detected.length === 1) return detected[0];
  if (detected.length === 0) {
    throw new Error("Cannot detect package manager: no packageManager field or supported lockfile");
  }
  throw new Error(`Cannot detect package manager unambiguously: ${detected.join(", ")}`);
}

function getCommandArgs(gate, manager) {
  if (gate.command === "run") {
    return ["run", ...gate.args];
  }
  if (gate.command === "audit") {
    const severity = gate.args.at(-1) ?? "high";
    switch (manager) {
      case "pnpm":
        return ["audit", ...gate.args];
      case "npm":
        return ["audit", `--audit-level=${severity}`];
      case "yarn":
        return ["npm", "audit", "--severity", severity];
      case "bun":
        return ["audit"];
    }
  }
  throw new Error(`Unsupported verification command: ${gate.command}`);
}

function getExecutable(manager) {
  return process.platform === "win32" ? `${manager}.cmd` : manager;
}

function getInvocation(args, manager) {
  const npmExecPath = process.env.npm_execpath;
  if (
    npmExecPath &&
    npmExecPath.toLowerCase().includes(manager) &&
    /\.(?:cjs|mjs|js)$/i.test(npmExecPath)
  ) {
    return {
      executable: process.execPath,
      args: [npmExecPath, ...args],
      shell: false,
    };
  }

  return {
    executable: getExecutable(manager),
    args,
    shell: process.platform === "win32",
  };
}

function fileExists(filePath) {
  try {
    readFileSync(filePath);
    return true;
  } catch {
    return false;
  }
}
