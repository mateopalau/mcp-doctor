import type { Finding } from "../types.js";
import { getPathLocation } from "../parse.js";

export function validateStructure(
  root: unknown,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];

  if (!isObject(root)) {
    findings.push({
      severity: "error",
      code: "invalid-root",
      message: "Root must be an object",
      locations: [{ path: filePath, line: 1, column: 1 }],
    });
    return findings;
  }

  const config = root as Record<string, unknown>;

  if (!("mcpServers" in config)) {
    findings.push({
      severity: "error",
      code: "missing-mcp-servers",
      message: "Missing required property: mcpServers",
      locations: [{ path: filePath, line: 1, column: 1 }],
    });
  } else {
    const mcpServers = config.mcpServers;
    if (!isObject(mcpServers)) {
      const location = getPathLocation(content, ["mcpServers"], filePath);
      findings.push({
        severity: "error",
        code: "invalid-mcp-servers",
        message: "mcpServers must be an object",
        locations: [location],
      });
    } else {
      const servers = mcpServers as Record<string, unknown>;
      for (const [serverName, serverConfig] of Object.entries(servers)) {
        if (!isObject(serverConfig)) {
          const location = getPathLocation(content, ["mcpServers", serverName], filePath);
          findings.push({
            severity: "error",
            code: "invalid-server-entry",
            message: `Server "${serverName}" must be an object`,
            locations: [location],
          });
          continue;
        }

        const server = serverConfig as Record<string, unknown>;
        const serverFindings = validateServer(serverName, server, content, filePath);
        findings.push(...serverFindings);
      }
    }
  }

  if ("inputs" in config) {
    const inputs = config.inputs;
    if (!Array.isArray(inputs)) {
      const location = getPathLocation(content, ["inputs"], filePath);
      findings.push({
        severity: "error",
        code: "invalid-inputs",
        message: "inputs must be an array",
        locations: [location],
      });
    } else {
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        if (!isObject(input)) {
          const location = getPathLocation(content, ["inputs", i], filePath);
          findings.push({
            severity: "error",
            code: "invalid-inputs",
            message: `Input at index ${i} must be an object`,
            locations: [location],
          });
          continue;
        }
        const inputObj = input as Record<string, unknown>;
        if (inputObj.type !== "promptString") {
          const location = getPathLocation(content, ["inputs", i, "type"], filePath);
          findings.push({
            severity: "error",
            code: "invalid-inputs",
            message: `Input at index ${i} must have type "promptString"`,
            locations: [location],
          });
        }
        if (typeof inputObj.id !== "string" || inputObj.id.length === 0) {
          const location = getPathLocation(content, ["inputs", i, "id"], filePath);
          findings.push({
            severity: "error",
            code: "invalid-inputs",
            message: `Input at index ${i} must have a non-empty string id`,
            locations: [location],
          });
        }
        if (typeof inputObj.description !== "string") {
          const location = getPathLocation(content, ["inputs", i, "description"], filePath);
          findings.push({
            severity: "error",
            code: "invalid-inputs",
            message: `Input at index ${i} must have a string description`,
            locations: [location],
          });
        }
        if ("password" in inputObj && typeof inputObj.password !== "boolean") {
          const location = getPathLocation(content, ["inputs", i, "password"], filePath);
          findings.push({
            severity: "error",
            code: "invalid-inputs",
            message: `Input at index ${i} password must be a boolean`,
            locations: [location],
          });
        }
      }
    }
  }

  return findings;
}

function validateServer(
  serverName: string,
  server: Record<string, unknown>,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];
  const basePath = ["mcpServers", serverName];

  const type = server.type;
  if (typeof type !== "string" || !["stdio", "http", "sse"].includes(type)) {
    const location = getPathLocation(content, [...basePath, "type"], filePath);
    findings.push({
      severity: "error",
      code: "invalid-server-entry",
      message: `Server "${serverName}" must have a valid type (stdio, http, or sse)`,
      locations: [location],
    });
    return findings;
  }

  if (type === "stdio") {
    const command = server.command;
    if (typeof command !== "string" || command.trim().length === 0) {
      const location = getPathLocation(content, [...basePath, "command"], filePath);
      findings.push({
        severity: "error",
        code: "missing-command",
        message: `Server "${serverName}" (stdio) must have a non-empty command`,
        locations: [location],
      });
    }

    if ("args" in server) {
      const args = server.args;
      if (!Array.isArray(args) || !args.every((a) => typeof a === "string")) {
        const location = getPathLocation(content, [...basePath, "args"], filePath);
        findings.push({
          severity: "error",
          code: "invalid-args",
          message: `Server "${serverName}" args must be an array of strings`,
          locations: [location],
        });
      }
    }

    if ("env" in server) {
      const env = server.env;
      if (!isObject(env) || !Object.values(env).every((v) => typeof v === "string")) {
        const location = getPathLocation(content, [...basePath, "env"], filePath);
        findings.push({
          severity: "error",
          code: "invalid-env",
          message: `Server "${serverName}" env must be an object with string values`,
          locations: [location],
        });
      }
    }

    if ("cwd" in server && typeof server.cwd !== "string") {
      const location = getPathLocation(content, [...basePath, "cwd"], filePath);
      findings.push({
        severity: "error",
        code: "invalid-server-entry",
        message: `Server "${serverName}" cwd must be a string`,
        locations: [location],
      });
    }
  } else if (type === "http" || type === "sse") {
    const url = server.url;
    if (typeof url !== "string" || !isValidUrl(url)) {
      const location = getPathLocation(content, [...basePath, "url"], filePath);
      findings.push({
        severity: "error",
        code: "invalid-url",
        message: `Server "${serverName}" (${type}) must have a valid URL`,
        locations: [location],
      });
    }

    if ("headers" in server) {
      const headers = server.headers;
      if (!isObject(headers) || !Object.values(headers).every((v) => typeof v === "string")) {
        const location = getPathLocation(content, [...basePath, "headers"], filePath);
        findings.push({
          severity: "error",
          code: "invalid-server-entry",
          message: `Server "${serverName}" headers must be an object with string values`,
          locations: [location],
        });
      }
    }
  }

  return findings;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}