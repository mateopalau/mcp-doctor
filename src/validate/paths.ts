import type { Finding, ServerConfig } from "../types.js";
import { getPathLocation } from "../parse.js";
import { FILESYSTEM_SERVER_PACKAGES } from "../types.js";

export function validatePaths(
  root: unknown,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];

  if (!root || typeof root !== "object" || !("mcpServers" in root)) {
    return findings;
  }

  const config = root as Record<string, unknown>;
  const mcpServers = config.mcpServers;

  if (!mcpServers || typeof mcpServers !== "object" || Array.isArray(mcpServers)) {
    return findings;
  }

  const servers = mcpServers as Record<string, ServerConfig>;

  for (const [serverName, serverConfig] of Object.entries(servers)) {
    if (serverConfig.type !== "stdio" || !serverConfig.command) {
      continue;
    }

    const args = serverConfig.args;
    if (!args || !Array.isArray(args)) {
      continue;
    }

    if (!isFilesystemServer(serverConfig.command, args)) {
      continue;
    }

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (typeof arg !== "string") {
        continue;
      }

      const pathFindings = checkPath(arg, serverName, i, content, filePath);
      findings.push(...pathFindings);
    }
  }

  return findings;
}

function isFilesystemServer(command: string, args: string[]): boolean {
  const cmdLower = command.toLowerCase();
  const allArgs = args.join(" ").toLowerCase();

  for (const pkg of FILESYSTEM_SERVER_PACKAGES) {
    if (cmdLower.includes(pkg.toLowerCase()) || allArgs.includes(pkg.toLowerCase())) {
      return true;
    }
  }

  return false;
}

function checkPath(
  path: string,
  serverName: string,
  argIndex: number,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];
  const location = getPathLocation(content, ["mcpServers", serverName, "args", argIndex], filePath);

  const normalizedPath = normalizePath(path);

  if (isRootPath(normalizedPath)) {
    findings.push({
      severity: "high",
      code: "broad-filesystem-path",
      message: `Broad filesystem path granted: "${path}"`,
      locations: [location],
    });
    return findings;
  }

  if (isHomeDirectory(normalizedPath)) {
    findings.push({
      severity: "high",
      code: "broad-filesystem-path",
      message: `Broad filesystem path granted (home directory): "${path}"`,
      locations: [location],
    });
    return findings;
  }

  if (isWholeDrive(normalizedPath)) {
    findings.push({
      severity: "high",
      code: "broad-filesystem-path",
      message: `Broad filesystem path granted (whole drive): "${path}"`,
      locations: [location],
    });
    return findings;
  }

  if (hasParentTraversal(normalizedPath)) {
    findings.push({
      severity: "medium",
      code: "broad-filesystem-path",
      message: `Filesystem path contains parent traversal: "${path}"`,
      locations: [location],
    });
    return findings;
  }

  if (hasWildcard(normalizedPath)) {
    findings.push({
      severity: "medium",
      code: "broad-filesystem-path",
      message: `Filesystem path contains wildcard/glob: "${path}"`,
      locations: [location],
    });
    return findings;
  }

  return findings;
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, "/");
}

function isRootPath(path: string): boolean {
  return path === "/" || /^[a-zA-Z]:[/\\]?$/i.test(path);
}

function isHomeDirectory(path: string): boolean {
  if (path === "~" || path === "~/") {
    return true;
  }
  if (/^\/home\/[^/]+\/?$/i.test(path)) {
    return true;
  }
  if (/^\/users\/[^/]+\/?$/i.test(path)) {
    return true;
  }
  if (/^[a-zA-Z]:[/\\]users[/\\][^/\\]+[/\\]?$/i.test(path)) {
    return true;
  }
  if (/^[a-zA-Z]:[/\\]home[/\\][^/\\]+[/\\]?$/i.test(path)) {
    return true;
  }
  return false;
}

function isWholeDrive(path: string): boolean {
  if (/^\/mnt\/[a-z]+\/?$/i.test(path)) {
    return true;
  }
  if (/^\/volumes\/[^/]+\/?$/i.test(path)) {
    return true;
  }
  if (/^[a-zA-Z]:[/\\]?$/i.test(path)) {
    return true;
  }
  if (/^\\\\[^\\]+\\[^\\]+[/\\]?$/i.test(path)) {
    return true;
  }
  return false;
}

function hasParentTraversal(path: string): boolean {
  return path.includes("../") || path.includes("..\\");
}

function hasWildcard(path: string): boolean {
  return /\/\*($|\/)/.test(path) || /\*\*($|\/)/.test(path);
}