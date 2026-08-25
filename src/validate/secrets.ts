import type { Finding } from "../types.js";
import { getPathLocation } from "../parse.js";

const SECRET_KEY_PATTERNS = [
  /key/i,
  /token/i,
  /secret/i,
  /password/i,
  /credential/i,
  /apikey/i,
  /api_key/i,
  /accesskey/i,
  /access_key/i,
  /secretkey/i,
  /secret_key/i,
  /privatekey/i,
  /private_key/i,
  /auth/i,
  /bearer/i,
];

const KNOWN_PREFIXES = [
  { pattern: /^sk-[a-zA-Z0-9]{20,}$/, name: "OpenAI/Anthropic API key" },
  { pattern: /^ghp_[a-zA-Z0-9]{36}$/, name: "GitHub personal access token" },
  { pattern: /^gho_[a-zA-Z0-9]{36}$/, name: "GitHub OAuth token" },
  { pattern: /^ghu_[a-zA-Z0-9]{36}$/, name: "GitHub user token" },
  { pattern: /^ghs_[a-zA-Z0-9]{36}$/, name: "GitHub server token" },
  { pattern: /^ghr_[a-zA-Z0-9]{36}$/, name: "GitHub refresh token" },
  { pattern: /^AIzaSy[a-zA-Z0-9_-]{33}$/, name: "Google API key" },
  { pattern: /^AKIA[0-9A-Z]{16}$/, name: "AWS access key ID" },
  { pattern: /^[A-Za-z0-9/+=]{40}$/, name: "AWS secret access key (base64)" },
  { pattern: /^xoxb-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{24}$/, name: "Slack bot token" },
  { pattern: /^xoxp-[0-9]{11,13}-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{32}$/, name: "Slack user token" },
  { pattern: /^xoxa-[0-9]{11,13}-[0-9]{11,13}-[0-9]{11,13}-[a-zA-Z0-9]{32}$/, name: "Slack app token" },
  { pattern: /^Bearer\s+[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, name: "Bearer JWT token" },
  { pattern: /^eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*$/, name: "JWT token" },
];

const PEM_HEADER_PATTERN = /^-----BEGIN [A-Z ]+PRIVATE KEY-----$/i;

const CONNECTION_STRING_PATTERNS = [
  /^postgresql:\/\/[^:]+:[^@]+@/i,
  /^postgres:\/\/[^:]+:[^@]+@/i,
  /^mysql:\/\/[^:]+:[^@]+@/i,
  /^mongodb:\/\/[^:]+:[^@]+@/i,
  /^redis:\/\/[^:]+:[^@]+@/i,
  /^mongodb\+srv:\/\/[^:]+:[^@]+@/i,
  /^mssql:\/\/[^:]+:[^@]+@/i,
  /^sqlserver:\/\/[^:]+:[^@]+@/i,
  /^Server=.*;Database=.*;User Id=.*;Password=.*/i,
];

export function validateSecrets(
  root: unknown,
  content: string,
  filePath: string,
): Finding[] {
  const findings: Finding[] = [];

  if (!root || typeof root !== "object") {
    return findings;
  }

  const config = root as Record<string, unknown>;

  checkObjectForSecrets(config, [], content, filePath, findings);

  return findings;
}

function checkObjectForSecrets(
  obj: Record<string, unknown>,
  path: string[],
  content: string,
  filePath: string,
  findings: Finding[],
): void {
  for (const [key, value] of Object.entries(obj)) {
    const currentPath = [...path, key];

    if (typeof value === "string") {
      checkValueForSecrets(key, value, currentPath, content, filePath, findings);
    } else if (value && typeof value === "object" && !Array.isArray(value)) {
      checkObjectForSecrets(value as Record<string, unknown>, currentPath, content, filePath, findings);
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (item && typeof item === "object" && !Array.isArray(item)) {
          checkObjectForSecrets(item as Record<string, unknown>, [...currentPath, String(i)], content, filePath, findings);
        } else if (typeof item === "string") {
          checkValueForSecrets(`${key}[${i}]`, item, currentPath, content, filePath, findings);
        }
      }
    }
  }
}

function checkValueForSecrets(
  key: string,
  value: string,
  path: string[],
  content: string,
  filePath: string,
  findings: Finding[],
): void {
  if (isEnvPlaceholder(value)) {
    return;
  }

  if (isHighEntropySecret(key, value)) {
    const location = getPathLocation(content, path, filePath);
    findings.push({
      severity: "high",
      code: "secret-shaped-value",
      message: "Secret-shaped value detected",
      locations: [location],
      redacted: true,
    });
    return;
  }

  if (matchesKnownPrefix(key, value)) {
    const location = getPathLocation(content, path, filePath);
    findings.push({
      severity: "high",
      code: "secret-shaped-value",
      message: "Secret-shaped value detected",
      locations: [location],
      redacted: true,
    });
    return;
  }

  if (isPemPrivateKey(value)) {
    const location = getPathLocation(content, path, filePath);
    findings.push({
      severity: "high",
      code: "secret-shaped-value",
      message: "Secret-shaped value detected (PEM private key)",
      locations: [location],
      redacted: true,
    });
    return;
  }

  if (isConnectionString(value)) {
    const location = getPathLocation(content, path, filePath);
    findings.push({
      severity: "high",
      code: "secret-shaped-value",
      message: "Secret-shaped value detected (connection string with credentials)",
      locations: [location],
      redacted: true,
    });
    return;
  }
}

function isEnvPlaceholder(value: string): boolean {
  return /^\$\{[A-Z_][A-Z0-9_]*\}$/.test(value.trim());
}

function isHighEntropySecret(key: string, value: string): boolean {
  const keyLower = key.toLowerCase();
  const isSecretKey = SECRET_KEY_PATTERNS.some((pattern) => pattern.test(keyLower));

  if (!isSecretKey) {
    return false;
  }

  if (value.length < 20) {
    return false;
  }

  const entropy = calculateEntropy(value);
  const hasMixedCase = /[a-z]/.test(value) && /[A-Z]/.test(value);
  const hasNumbers = /[0-9]/.test(value);
  const hasSpecial = /[^a-zA-Z0-9]/.test(value);

  return entropy > 3.5 && hasMixedCase && hasNumbers && hasSpecial;
}

function matchesKnownPrefix(key: string, value: string): boolean {
  const keyLower = key.toLowerCase();
  const isRelevantKey = SECRET_KEY_PATTERNS.some((pattern) => pattern.test(keyLower));

  if (!isRelevantKey) {
    return false;
  }

  return KNOWN_PREFIXES.some(({ pattern }) => pattern.test(value));
}

function isPemPrivateKey(value: string): boolean {
  const trimmed = value.trim();
  const firstLine = trimmed.split(/\r?\n/)[0] ?? "";
  return PEM_HEADER_PATTERN.test(firstLine);
}

function isConnectionString(value: string): boolean {
  return CONNECTION_STRING_PATTERNS.some((pattern) => pattern.test(value));
}

function calculateEntropy(str: string): number {
  const freq = new Map<string, number>();
  for (const char of str) {
    freq.set(char, (freq.get(char) || 0) + 1);
  }

  let entropy = 0;
  const len = str.length;
  for (const count of freq.values()) {
    const p = count / len;
    entropy -= p * Math.log2(p);
  }

  return entropy;
}