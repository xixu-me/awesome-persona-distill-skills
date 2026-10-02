import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

const DEFAULT_FILES = [
  "README.md",
  "README.en.md",
  "CONTRIBUTING.md",
  "CONTRIBUTING.en.md",
];

const REMOTE_PROTOCOL_PATTERN = /^https?:\/\//u;
const IGNORED_REMOTE_TARGET_PREFIXES = ["https://dartnode.com"];

export function extractMarkdownLinks(markdown) {
  const withoutFencedCode = markdown.replace(/```[\s\S]*?```/gu, "");
  const matches = [...withoutFencedCode.matchAll(/\[[^\]]+\]\(([^)]+)\)/gu)];
  return matches.map((match) => match[1]);
}

function shouldIgnoreTarget(target) {
  return (
    target.startsWith("#") ||
    target.startsWith("mailto:") ||
    target.startsWith("tel:") ||
    IGNORED_REMOTE_TARGET_PREFIXES.some((prefix) => target.startsWith(prefix))
  );
}

export async function checkRelativeLink({ filePath, target, workspace }) {
  const fileDirectory = path.dirname(path.join(workspace, filePath));
  const [pathname] = target.split("#", 1);
  const resolvedPath = path.resolve(fileDirectory, pathname);

  try {
    await fs.access(resolvedPath);
    return { ok: true, path: resolvedPath };
  } catch {
    return { ok: false, path: resolvedPath };
  }
}

export async function checkRemoteLink({ target, fetchImpl = fetch }) {
  const headers = {
    "user-agent": "awesome-persona-distill-skills-link-checker",
  };
  const headResponse = await fetchImpl(target, {
    method: "HEAD",
    redirect: "follow",
    headers,
  });
  if (headResponse.ok) {
    return { ok: true, status: headResponse.status, url: target };
  }

  const getResponse = await fetchImpl(target, {
    method: "GET",
    redirect: "follow",
    headers,
  });
  return {
    ok: getResponse.ok,
    status: getResponse.status,
    url: target,
  };
}

async function validateFileLinks({ filePath, workspace }) {
  const absolutePath = path.join(workspace, filePath);
  const markdown = await fs.readFile(absolutePath, "utf8");
  const failures = [];

  for (const target of extractMarkdownLinks(markdown)) {
    if (shouldIgnoreTarget(target)) {
      continue;
    }

    if (REMOTE_PROTOCOL_PATTERN.test(target)) {
      try {
        const result = await checkRemoteLink({ target });
        if (!result.ok) {
          failures.push(`${filePath}: ${target} returned ${result.status}`);
        }
      } catch (error) {
        failures.push(`${filePath}: ${target} failed: ${error.message}`);
      }
      continue;
    }

    const result = await checkRelativeLink({ filePath, target, workspace });
    if (!result.ok) {
      failures.push(
        `${filePath}: ${target} resolved to missing path ${result.path}`,
      );
    }
  }

  return failures;
}

async function main() {
  const workspace = process.cwd();
  const failures = [];

  for (const filePath of DEFAULT_FILES) {
    const fileFailures = await validateFileLinks({ filePath, workspace });
    failures.push(...fileFailures);
  }

  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(failure);
    }
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
