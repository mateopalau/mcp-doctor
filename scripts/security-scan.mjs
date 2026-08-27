import { execFileSync, spawnSync } from "node:child_process";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const gitExecutable = process.platform === "win32" ? "git.exe" : "git";
const tarExecutable = process.platform === "win32" ? "tar.exe" : "tar";
const scanHistory = process.argv.includes("--history");
const maxTextBytes = 10 * 1024 * 1024;
const maxArchiveBytes = 50 * 1024 * 1024;

const detectors = [
  { name: "openai-or-anthropic-key", regex: /\bsk-[A-Za-z0-9]{20,}\b/g },
  { name: "github-token", regex: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: "aws-access-key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "google-api-key", regex: /\bAIzaSy[A-Za-z0-9_-]{33}\b/g },
  { name: "slack-token", regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { name: "bearer-token", regex: /\bBearer\s+[A-Za-z0-9._-]{20,}\b/g },
  { name: "pem-private-key", regex: /-----BEGIN [A-Z ]+PRIVATE KEY-----/gi },
  {
    name: "credentialed-connection-string",
    regex: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|mssql|sqlserver):\/\/[^\s"']+/gi,
  },
  {
    name: "credential-assignment",
    regex: /["']?(?:password|passwd|pwd|token|secret|api[_-]?key|private[_-]?key)["']?\s*[:=]\s*["'](?=[^"'$\r\n]{8,})[^"']+/gi,
  },
];

const syntheticHistoryBlobs = new Set([
  "3478fbedfb0d4ffd7ad84c95a0dfd9146aef80ee",
  "3ddb1bf753ad1c2c2f31eada047205ab926f522b",
  "ff21b13e5aa39f11f20edf0f9d025d2bfc51abf3",
]);

const syntheticArchiveFileHashes = new Map([
  [
    "test/fixtures/secrets.json",
    new Set(["3b111a62eec5d9b60f7137ee014e3b7502886bb28e00daee5d7dc7dc6224de76"]),
  ],
  [
    "test/cli.test.ts",
    new Set(["9f408dd5bc5e78fd3e478411d979faa8a7dd8ed914dc2849d40975ffdacccd23"]),
  ],
]);

const findings = [];
const scannedSources = new Set();
const scannedArchives = new Set();

scanCurrentTree();
if (scanHistory) {
  scanReachableHistory();
}

for (const finding of findings) {
  writeOut(
    `SECURITY_SCAN finding category=${finding.category} detector=${finding.detector} ` +
      `source=${finding.source} path=${finding.path} fingerprint=${finding.fingerprint}`,
  );
}

const unknownFindings = findings.filter((finding) => finding.category === "UNKNOWN");
writeOut(`SECURITY_SCAN scanned_sources=${scannedSources.size}`);
writeOut(`SECURITY_SCAN findings=${findings.length}`);
writeOut(`SECURITY_SCAN unknown_or_real=${unknownFindings.length}`);

if (unknownFindings.length > 0) {
  process.exitCode = 1;
} else {
  writeOut("SECURITY_SCAN PASS");
}

function scanCurrentTree() {
  const files = splitNullDelimited(runGit(["ls-files", "-z"]));
  for (const file of files) {
    const absolutePath = resolve(rootDir, file);
    if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
      continue;
    }

    const content = readFileSync(absolutePath);
    if (file.toLowerCase().endsWith(".tgz")) {
      scanArchive(content, `working-tree:${file}`, 0);
    } else {
      scanText(content, file, `working-tree:${file}`, undefined);
    }
  }
}

function scanReachableHistory() {
  const entries = runGit(["rev-list", "--objects", "--all"])
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const separator = entry.indexOf(" ");
    if (separator < 1) {
      continue;
    }

    const blobId = entry.slice(0, separator);
    const file = entry.slice(separator + 1);
    if (runGit(["cat-file", "-t", blobId]).trim() !== "blob") {
      continue;
    }
    if (file.toLowerCase().endsWith(".tgz")) {
      scanArchive(runGitBuffer(["cat-file", "blob", blobId]), `git:${blobId}:${file}`, 0);
      continue;
    }

    scanText(runGitBuffer(["cat-file", "blob", blobId]), file, `git:${blobId}`, blobId);
  }
}

function scanText(content, file, source, blobId) {
  const normalizedFile = file.replaceAll("\\", "/");
  const key = `${source}:${normalizedFile}`;
  if (scannedSources.has(key)) {
    return;
  }
  scannedSources.add(key);

  if (content.byteLength > maxTextBytes || isBinary(content)) {
    return;
  }

  const text = content.toString("utf8");
  const contentHash = sha256(content);
  for (const detector of detectors) {
    const matcher = new RegExp(detector.regex.source, detector.regex.flags.includes("g") ? detector.regex.flags : `${detector.regex.flags}g`);
    for (const match of text.matchAll(matcher)) {
      const value = match[0];
      findings.push({
        category: classify(normalizedFile, source, blobId, contentHash, value),
        detector: detector.name,
        source,
        path: normalizedFile,
        fingerprint: sha256(Buffer.from(value, "utf8")),
      });
    }
  }
}

function scanArchive(content, source, depth) {
  if (content.byteLength > maxArchiveBytes) {
    findings.push({
      category: "UNKNOWN",
      detector: "archive-size-limit",
      source,
      path: "<archive>",
      fingerprint: sha256(content),
    });
    return;
  }

  const archiveHash = sha256(content);
  if (scannedArchives.has(archiveHash)) {
    return;
  }
  scannedArchives.add(archiveHash);

  const directory = mkdtempSync(join(tmpdir(), "mcp-doctor-security-"));
  const archivePath = join(directory, "archive.tgz");
  writeFileSync(archivePath, content);

  try {
    const extraction = spawnSync(tarExecutable, ["-xzf", archivePath, "-C", directory], {
      encoding: "utf8",
      timeout: 30_000,
    });
    if (extraction.error || extraction.status !== 0) {
      throw new Error(`unable to extract historical archive ${source}`);
    }

    for (const file of listFiles(directory)) {
      if (file === archivePath) {
        continue;
      }
      const relativePath = relative(directory, file).replaceAll("\\", "/");
      const fileContent = readFileSync(file);
      if (relativePath.toLowerCase().endsWith(".tgz")) {
        if (depth < 2) {
          scanArchive(fileContent, `${source}!${relativePath}`, depth + 1);
        }
      } else {
        scanText(fileContent, relativePath, `${source}!${relativePath}`, undefined);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function classify(file, source, blobId, contentHash, value) {
  if (isSyntheticTestArtifact(file, source, blobId, contentHash)) {
    return "SYNTHETIC_TEST_FIXTURE";
  }
  if (isDocumentationExample(file, value)) {
    return "DOCUMENTATION_EXAMPLE";
  }
  return "UNKNOWN";
}

function isSyntheticTestArtifact(file, source, blobId, contentHash) {
  const normalizedFile = file.replaceAll("\\", "/");
  const isSecretFixture = normalizedFile.endsWith("test/fixtures/secrets.json");
  const isCliTest = normalizedFile.endsWith("test/cli.test.ts");
  if (!isSecretFixture && !isCliTest) {
    return false;
  }

  if (blobId && syntheticHistoryBlobs.has(blobId)) {
    return true;
  }
  if (source.includes("!")) {
    for (const [artifactPath, hashes] of syntheticArchiveFileHashes) {
      if (normalizedFile.endsWith(artifactPath) && hashes.has(contentHash)) {
        return true;
      }
    }
  }
  return false;
}

function isDocumentationExample(file, value) {
  const normalizedFile = file.toLowerCase().replaceAll("\\", "/");
  const isDocumentation = normalizedFile.endsWith(".md");
  if (!isDocumentation) {
    return false;
  }

  return /actual-key-here|user:pass@host|localhost|example\.com|plaintext-secret|\$\{[A-Z_]/i.test(value)
    || /^-----BEGIN [A-Z ]+ PRIVATE KEY-----$/i.test(value);
}

function isBinary(content) {
  const sample = content.subarray(0, Math.min(content.length, 8192));
  return sample.includes(0);
}

function listFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

function runGit(args) {
  return execFileSync(gitExecutable, args, { cwd: rootDir, encoding: "utf8", maxBuffer: 100 * 1024 * 1024 });
}

function runGitBuffer(args) {
  return execFileSync(gitExecutable, args, { cwd: rootDir, encoding: "buffer", maxBuffer: 100 * 1024 * 1024 });
}

function splitNullDelimited(value) {
  return value.split("\0").filter(Boolean);
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function writeOut(message) {
  process.stdout.write(`${message}\n`);
}
