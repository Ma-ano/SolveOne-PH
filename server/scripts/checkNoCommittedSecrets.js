import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const allowedEnvironmentFiles = new Set([".env.example"]);
const forbiddenCredentialExtensions = new Set([
  ".jks",
  ".key",
  ".keystore",
  ".p12",
  ".pem",
  ".pfx",
]);
const secretPatterns = Object.freeze([
  ["private key", /-----BEGIN (?:EC |OPENSSH |RSA )?PRIVATE KEY-----/],
  ["AWS access key", /\bAKIA[0-9A-Z]{16}\b/],
  ["OpenAI project key", /\bsk-proj-[A-Za-z0-9_-]{32,}\b/],
  ["live PayMongo key", /\bsk_live_[A-Za-z0-9_-]{24,}\b/],
  [
    "credential-bearing MongoDB URI",
    /mongodb(?:\+srv)?:\/\/[^\s/:]+:[^\s/@]+@[^\s]+/,
  ],
]);
const obviousFixture = /(?:example|replace[-_ ]with|dummy|fake|fixture)/i;

export function inspectTrackedFile(relativePath, content = "") {
  const normalized = relativePath.replaceAll("\\", "/");
  const basename = path.posix.basename(normalized);
  const findings = [];

  if (
    (basename === ".env" || basename.startsWith(".env.")) &&
    !allowedEnvironmentFiles.has(basename)
  ) {
    findings.push("environment file");
  }
  if (forbiddenCredentialExtensions.has(path.posix.extname(basename))) {
    findings.push("credential file extension");
  }
  for (const [label, pattern] of secretPatterns) {
    const match = content.match(pattern);
    const lineStart = match
      ? content.lastIndexOf("\n", Math.max(0, match.index - 1)) + 1
      : 0;
    const nextLineBreak = match ? content.indexOf("\n", match.index) : -1;
    const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak;
    const matchingLine = content.slice(lineStart, lineEnd);
    if (match && !obviousFixture.test(matchingLine)) {
      findings.push(label);
    }
  }

  return findings;
}

function trackedFiles() {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  })
    .split("\0")
    .filter(Boolean);
}

export function checkRepository() {
  const findings = [];
  for (const relativePath of trackedFiles()) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    let content = "";
    try {
      const stats = statSync(absolutePath);
      if (stats.isFile() && stats.size <= 2 * 1024 * 1024) {
        const bytes = readFileSync(absolutePath);
        if (!bytes.includes(0)) content = bytes.toString("utf8");
      }
    } catch {
      continue;
    }
    for (const label of inspectTrackedFile(relativePath, content)) {
      findings.push({ relativePath, label });
    }
  }
  return findings;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (fileURLToPath(import.meta.url) === invokedPath) {
  const findings = checkRepository();
  if (findings.length) {
    for (const finding of findings) {
      console.error(`${finding.relativePath}: ${finding.label}`);
    }
    process.exitCode = 1;
  } else {
    console.log("No high-confidence secrets found in tracked files.");
  }
}
