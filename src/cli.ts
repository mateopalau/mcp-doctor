#!/usr/bin/env node
import process from "node:process";

const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  printHelp();
  process.exit(0);
}

if (args.includes("--version")) {
  process.stdout.write("0.1.0\n");
  process.exit(0);
}

printHelp();

function printHelp(): void {
  process.stdout.write(
    [
      "mcp-doctor — Offline inspector for local MCP server/tool JSON configurations with safety-focused checks.",
      "",
      "Usage: mcp-doctor [options]",
      "",
      "Options:",
      "  --help       Show this help",
      "  --version    Print version",
      "",
    ].join("\n")
  );
}
