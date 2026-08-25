import type { Finding, Location } from "../types.js";
import { parseTree, findNodeAtLocation, type Node } from "jsonc-parser";

export function validateDuplicates(
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

  // Use parse tree to find duplicate keys in mcpServers
  const tree = parseTree(content);
  if (!tree) {
    return findings;
  }

  const mcpServersNode = findNodeAtLocation(tree, ["mcpServers"]);
  if (!mcpServersNode || !mcpServersNode.children) {
    return findings;
  }

  const nameToLocations = new Map<string, Location[]>();

  for (const child of mcpServersNode.children) {
    // child is a property node, its key is in the first child (a string node)
    const keyNode = child.children?.[0];
    if (!keyNode || typeof keyNode.value !== "string") {
      continue;
    }
    const serverName = keyNode.value;

    const location = getNodeLocation(content, keyNode, filePath);
    const existing = nameToLocations.get(serverName);
    if (existing) {
      existing.push(location);
    } else {
      nameToLocations.set(serverName, [location]);
    }
  }

  for (const [serverName, locations] of nameToLocations.entries()) {
    if (locations.length > 1) {
      findings.push({
        severity: "error",
        code: "duplicate-server-name",
        message: `Duplicate server name: "${serverName}"`,
        locations,
      });
    }
  }

  return findings;
}

function getNodeLocation(
  content: string,
  node: Node,
  filePath: string,
): Location {
  let line = 1;
  let column = 1;

  for (let i = 0; i < node.offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { path: filePath, line, column };
}