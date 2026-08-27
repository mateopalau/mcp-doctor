#!/usr/bin/env node
import process from "node:process";
import { readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { parseJsonWithPositions } from "./parse.js";
import { validateStructure } from "./validate/structure.js";
import { validateDuplicates } from "./validate/duplicates.js";
import { validatePaths } from "./validate/paths.js";
import { validateSecrets } from "./validate/secrets.js";
import { formatHuman } from "./report/human.js";
import { formatJson } from "./report/json.js";
import { sanitizeForTerminal } from "./report/safe-text.js";
import type { Report, Finding, Summary, CliOptions, ParsedConfig } from "./types.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MAX_INPUT_BYTES = 10 * 1024 * 1024;

function getVersion(): string {
  try {
    const packageJson = readFileSync(resolve(__dirname, "../package.json"), "utf-8");
    return JSON.parse(packageJson).version;
  } catch {
    return "0.1.0";
  }
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    file: undefined,
    json: false,
    help: false,
    version: false,
  };

  for (const arg of args) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--version") {
      options.version = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (!arg.startsWith("-")) {
      if (options.file) {
        throw new Error("Only one config file can be specified");
      }
      options.file = arg;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return options;
}

function printHelp(): void {
  process.stdout.write(
    [
      "mcp-doctor — Offline inspector for local MCP server/tool JSON configurations with safety-focused checks.",
      "",
      "Usage: mcp-doctor [options] [config-file]",
      "",
      "Options:",
      "  --help       Show this help",
      "  --version    Print version",
      "  --json       Output machine-readable JSON",
      "",
      "If no config-file is provided, reads from stdin.",
      "Common config file names: mcp.json, .mcp.json, claude_desktop_config.json, .mcp/config.json",
      "",
    ].join("\n"),
  );
}

async function readInput(file?: string): Promise<{ content: string; filePath: string }> {
  if (file) {
    try {
      const stats = statSync(file);
      if (!stats.isFile()) {
        throw new Error("input path is not a regular file");
      }
      if (stats.size > MAX_INPUT_BYTES) {
        throw new Error(`input exceeds the ${MAX_INPUT_BYTES} byte limit`);
      }
      const buffer = readFileSync(file);
      if (buffer.byteLength > MAX_INPUT_BYTES) {
        throw new Error(`input exceeds the ${MAX_INPUT_BYTES} byte limit`);
      }
      return { content: buffer.toString("utf-8"), filePath: file };
    } catch (error) {
      throw new Error(`Failed to read file "${file}": ${error}`);
    }
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.byteLength;
    if (totalBytes > MAX_INPUT_BYTES) {
      throw new Error(`input exceeds the ${MAX_INPUT_BYTES} byte limit`);
    }
    chunks.push(buffer);
  }
  const content = Buffer.concat(chunks).toString("utf-8");
  return { content, filePath: "stdin" };
}

function computeSummary(findings: Finding[]): Summary {
  const summary: Summary = { error: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) {
    summary[finding.severity]++;
  }
  return summary;
}

function determineExitCode(findings: Finding[]): number {
  const hasError = findings.some((f) => f.severity === "error");
  const hasHigh = findings.some((f) => f.severity === "high");

  if (hasError) return 1;
  if (hasHigh) return 2;
  return 0;
}

function buildReport(
  filePath: string,
  parsed: ParsedConfig,
  structureFindings: Finding[],
  duplicateFindings: Finding[],
  pathFindings: Finding[],
  secretFindings: Finding[],
): Report {
  const allFindings = [
    ...parsed.errors,
    ...structureFindings,
    ...duplicateFindings,
    ...pathFindings,
    ...secretFindings,
  ];

  const summary = computeSummary(allFindings);
  const valid = parsed.errors.length === 0 && structureFindings.length === 0 && duplicateFindings.length === 0;

  return {
    version: "1.0",
    file: filePath,
    valid,
    findings: allFindings,
    summary,
  };
}

async function main(): Promise<void> {
  try {
    const options = parseArgs(process.argv.slice(2));

    if (options.help) {
      printHelp();
      process.exit(0);
    }

    if (options.version) {
      process.stdout.write(`${getVersion()}\n`);
      process.exit(0);
    }

    const { content, filePath } = await readInput(options.file);

    if (!content.trim()) {
      process.stderr.write("Error: Empty input\n");
      process.exit(3);
    }

    const parsed = parseJsonWithPositions(content, filePath);

    let structureFindings: Finding[] = [];
    let duplicateFindings: Finding[] = [];
    let pathFindings: Finding[] = [];
    let secretFindings: Finding[] = [];

    if (parsed.errors.length === 0 && parsed.root) {
      structureFindings = validateStructure(parsed.root, content, filePath);
      duplicateFindings = validateDuplicates(parsed.root, content, filePath);
      pathFindings = validatePaths(parsed.root, content, filePath);
      secretFindings = validateSecrets(parsed.root, content, filePath);
    }

    const report = buildReport(
      filePath,
      parsed,
      structureFindings,
      duplicateFindings,
      pathFindings,
      secretFindings,
    );

    const output = options.json ? formatJson(report) : formatHuman(report);
    process.stdout.write(`${output}\n`);

    const exitCode = determineExitCode(report.findings);
    process.exit(exitCode);
  } catch (error) {
    if (error instanceof Error) {
      process.stderr.write(`Error: ${sanitizeForTerminal(error.message)}\n`);
    } else {
      process.stderr.write("Error: Unknown error\n");
    }
    process.exit(3);
  }
}

main();
