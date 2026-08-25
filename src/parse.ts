import { parse, parseTree, findNodeAtLocation, getNodeValue, type ParseError, type Node, type JSONPath } from "jsonc-parser";
import type { ParsedConfig, Finding, Location } from "./types.js";

export function parseJsonWithPositions(
  content: string,
  filePath: string,
): ParsedConfig {
  const errors: Finding[] = [];
  const parseErrors: ParseError[] = [];

  const root = parse(content, parseErrors);

  for (const error of parseErrors) {
    const location = getLocationFromOffset(content, error.offset, filePath);
    errors.push({
      severity: "error",
      code: "json-syntax-error",
      message: `JSON syntax error: ${getParseErrorMessage(error.error)}`,
      locations: [location],
    });
  }

  return { root, errors };
}

function getParseErrorMessage(error: ParseError["error"]): string {
  switch (error) {
    case 1:
      return "Invalid symbol";
    case 2:
      return "Invalid number format";
    case 3:
      return "Property name expected";
    case 4:
      return "Value expected";
    case 5:
      return "Colon expected";
    case 6:
      return "Comma expected";
    case 7:
      return "Close brace expected";
    case 8:
      return "Close bracket expected";
    case 9:
      return "End of file expected";
    case 10:
      return "Invalid comment token";
    case 11:
      return "Unexpected end of comment";
    case 12:
      return "Unexpected end of string";
    case 13:
      return "Unexpected end of number";
    case 14:
      return "Invalid unicode";
    case 15:
      return "Invalid escape character";
    case 16:
      return "Invalid character";
    default:
      return "Unknown parse error";
  }
}

function getLocationFromOffset(
  content: string,
  offset: number,
  filePath: string,
): Location {
  let line = 1;
  let column = 1;

  for (let i = 0; i < offset && i < content.length; i++) {
    if (content[i] === "\n") {
      line++;
      column = 1;
    } else {
      column++;
    }
  }

  return { path: filePath, line, column };
}

export function getNodeLocation(
  content: string,
  node: Node,
  filePath: string,
): Location {
  return getLocationFromOffset(content, node.offset, filePath);
}

export function getPathLocation(
  content: string,
  path: JSONPath,
  filePath: string,
): Location {
  if (path.length === 0) {
    return { path: filePath, line: 1, column: 1 };
  }

  const tree = parseTree(content);
  if (!tree) {
    return { path: filePath, line: 1, column: 1 };
  }

  const node = findNodeAtLocation(tree, path);
  if (!node) {
    return { path: filePath, line: 1, column: 1 };
  }

  return getNodeLocation(content, node, filePath);
}

export function findNodesAtPath(
  content: string,
  path: JSONPath,
): Node[] {
  const tree = parseTree(content);
  if (!tree) {
    return [];
  }

  const node = findNodeAtLocation(tree, path);
  if (!node || !node.children) {
    return [];
  }

  return node.children;
}

export function getNodeValueAtPath<T>(content: string, path: JSONPath): T | undefined {
  const tree = parseTree(content);
  if (!tree) {
    return undefined;
  }

  const node = findNodeAtLocation(tree, path);
  if (!node) {
    return undefined;
  }

  return getNodeValue(node) as T | undefined;
}

export function getNodeStringValue(node: Node): string | undefined {
  const value = getNodeValue(node);
  return typeof value === "string" ? value : undefined;
}