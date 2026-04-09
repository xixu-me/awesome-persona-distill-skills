import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

import {
  CATEGORY_DEFINITIONS,
  CATEGORY_MAP,
} from "./submission-automation.mjs";

export { CATEGORY_MAP };

const ENTRY_PATTERN = /^- \[(.+?)\]\((https:\/\/github\.com\/[^)]+)\) - (.+)$/u;
const GITHUB_REPOSITORY_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/u;

function normalizeLineEndings(value) {
  return value.replace(/\r/g, "");
}

function collectSection(readme, heading) {
  const normalized = normalizeLineEndings(readme);
  const start = normalized.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`Missing heading: ${heading}`);
  }

  const nextHeadingIndex = normalized.indexOf(
    "\n## ",
    start + heading.length + 1,
  );
  const end =
    nextHeadingIndex === -1 ? normalized.length : nextHeadingIndex + 1;

  return normalized.slice(start, end);
}

function parseEntries(sectionContent) {
  return normalizeLineEndings(sectionContent)
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map((line) => {
      const match = line.match(ENTRY_PATTERN);
      if (!match) {
        throw new Error(`Invalid README entry format: ${line}`);
      }

      return {
        name: match[1],
        url: match[2].replace(/\/$/, ""),
        description: match[3],
      };
    });
}

function repositorySortKey(url) {
  const match = url.match(GITHUB_REPOSITORY_PATTERN);
  if (!match) {
    return url.toLowerCase();
  }

  return match[2].toLowerCase();
}

function compareEntries(a, b) {
  const byRepositoryName = repositorySortKey(a.url).localeCompare(
    repositorySortKey(b.url),
    "en",
    { sensitivity: "base" },
  );
  if (byRepositoryName !== 0) {
    return byRepositoryName;
  }

  return a.url.localeCompare(b.url, "en", { sensitivity: "base" });
}

export function findDuplicateUrls(urls) {
  const seen = new Set();
  const duplicates = new Set();
  for (const url of urls) {
    if (seen.has(url)) {
      duplicates.add(url);
    }
    seen.add(url);
  }
  return [...duplicates].sort();
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) {
    throw new Error(`${label} must include "${expected}".`);
  }
}

export function validateRepositoryContent({
  readmeZh,
  readmeEn,
  contributingZh,
  contributingEn,
  issueTemplateConfig,
  issueTemplate,
}) {
  const zhUrls = [];
  const enUrls = [];

  for (const definition of CATEGORY_DEFINITIONS) {
    const zhEntries = parseEntries(
      collectSection(readmeZh, definition.zhHeading),
    );
    const enEntries = parseEntries(
      collectSection(readmeEn, definition.enHeading),
    );

    const zhSectionUrls = zhEntries.map((entry) => entry.url).sort();
    const enSectionUrls = enEntries.map((entry) => entry.url).sort();

    if (JSON.stringify(zhSectionUrls) !== JSON.stringify(enSectionUrls)) {
      throw new Error(
        `${definition.zhHeading} and ${definition.enHeading} must list the same URLs.`,
      );
    }

    const sortedZhEntries = [...zhEntries].sort(compareEntries);
    if (JSON.stringify(zhEntries) !== JSON.stringify(sortedZhEntries)) {
      throw new Error(
        `${definition.zhHeading} entries must be sorted by repository name.`,
      );
    }

    const sortedEnEntries = [...enEntries].sort(compareEntries);
    if (JSON.stringify(enEntries) !== JSON.stringify(sortedEnEntries)) {
      throw new Error(
        `${definition.enHeading} entries must be sorted by repository name.`,
      );
    }

    zhUrls.push(...zhSectionUrls);
    enUrls.push(...enSectionUrls);
  }

  const zhDuplicates = findDuplicateUrls(zhUrls);
  if (zhDuplicates.length > 0) {
    throw new Error(
      `Duplicate URLs found in README.md: ${zhDuplicates.join(", ")}`,
    );
  }

  const enDuplicates = findDuplicateUrls(enUrls);
  if (enDuplicates.length > 0) {
    throw new Error(
      `Duplicate URLs found in README.en.md: ${enDuplicates.join(", ")}`,
    );
  }

  assertIncludes(contributingZh, "issue 表单", "CONTRIBUTING.md");
  assertIncludes(contributingZh, "approved", "CONTRIBUTING.md");
  assertIncludes(contributingEn, "issue form", "CONTRIBUTING.en.md");
  assertIncludes(contributingEn, "approved", "CONTRIBUTING.en.md");
  assertIncludes(readmeZh, "issue 表单", "README.md");
  assertIncludes(readmeZh, "approved", "README.md");
  assertIncludes(readmeEn, "issue form", "README.en.md");
  assertIncludes(readmeEn, "approved", "README.en.md");
  assertIncludes(
    issueTemplateConfig,
    "blank_issues_enabled: false",
    ".github/ISSUE_TEMPLATE/config.yml",
  );
  assertIncludes(
    issueTemplate,
    "Submission Request",
    ".github/ISSUE_TEMPLATE/submission.yml",
  );
  assertIncludes(
    issueTemplate,
    "approved",
    ".github/ISSUE_TEMPLATE/submission.yml",
  );
  assertIncludes(
    issueTemplate,
    "汉语名称 / Chinese Name",
    ".github/ISSUE_TEMPLATE/submission.yml",
  );
  assertIncludes(
    issueTemplate,
    "英语名称 / English Name",
    ".github/ISSUE_TEMPLATE/submission.yml",
  );
}

async function main() {
  const workspace = process.cwd();
  const [
    readmeZh,
    readmeEn,
    contributingZh,
    contributingEn,
    issueTemplateConfig,
    issueTemplate,
  ] = await Promise.all([
    fs.readFile(path.join(workspace, "README.md"), "utf8"),
    fs.readFile(path.join(workspace, "README.en.md"), "utf8"),
    fs.readFile(path.join(workspace, "CONTRIBUTING.md"), "utf8"),
    fs.readFile(path.join(workspace, "CONTRIBUTING.en.md"), "utf8"),
    fs.readFile(
      path.join(workspace, ".github", "ISSUE_TEMPLATE", "config.yml"),
      "utf8",
    ),
    fs.readFile(
      path.join(workspace, ".github", "ISSUE_TEMPLATE", "submission.yml"),
      "utf8",
    ),
  ]);

  validateRepositoryContent({
    readmeZh,
    readmeEn,
    contributingZh,
    contributingEn,
    issueTemplateConfig,
    issueTemplate,
  });
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
