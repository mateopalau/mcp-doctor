import type { Report, Finding } from "../types.js";
import { sanitizeForTerminal } from "./safe-text.js";

export function formatHuman(report: Report): string {
  const lines: string[] = [];

  lines.push(`mcp-doctor: Analyzing ${sanitizeForTerminal(report.file)}`);
  lines.push("");

  const hasSyntaxError = report.findings.some((f) => f.code === "json-syntax-error");
  const hasStructuralError = report.findings.some(
    (f) =>
      f.severity === "error" &&
      f.code !== "json-syntax-error" &&
      f.code !== "duplicate-server-name",
  );
  const hasDuplicateError = report.findings.some((f) => f.code === "duplicate-server-name");

  if (!hasSyntaxError) {
    lines.push("✓ JSON syntax valid");
  }

  if (!hasStructuralError && !hasDuplicateError) {
    lines.push("✓ Structure valid");
  }

  for (const finding of report.findings) {
    if (finding.code === "json-syntax-error") {
      lines.push(`✗ JSON syntax error: ${sanitizeForTerminal(finding.message)}`);
      continue;
    }

    const prefix = getSeverityPrefix(finding.severity);
    const locationStr = formatLocations(finding.locations);

    if (finding.code === "duplicate-server-name") {
      lines.push(`✗ ${sanitizeForTerminal(finding.message)} at ${locationStr}`);
    } else {
      lines.push(`${prefix} ${finding.severity.charAt(0).toUpperCase() + finding.severity.slice(1)}: ${sanitizeForTerminal(finding.message)} at ${locationStr}`);
    }
  }

  lines.push("");
  lines.push(
    `Summary: ${report.summary.error} error, ${report.summary.high} high, ${report.summary.medium} medium, ${report.summary.low} low`,
  );
  lines.push(`Exit code: ${getExitCode(report)}`);

  return lines.join("\n");
}

function getSeverityPrefix(severity: Finding["severity"]): string {
  switch (severity) {
    case "error":
      return "✗";
    case "high":
      return "⚠";
    case "medium":
      return "⚠";
    case "low":
      return "ℹ";
  }
}

function formatLocations(locations: Array<{ path: string; line: number; column: number }>): string {
  return locations
    .map((loc) => `${sanitizeForTerminal(loc.path)} (line ${loc.line}, col ${loc.column})`)
    .join(", ");
}

function getExitCode(report: Report): number {
  if (report.findings.some((f) => f.severity === "error")) {
    return 1;
  }
  if (report.findings.some((f) => f.severity === "high")) {
    return 2;
  }
  return 0;
}
