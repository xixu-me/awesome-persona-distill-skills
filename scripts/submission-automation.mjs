import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

export const CATEGORY_DEFINITIONS = [
  {
    label: "自我蒸馏与元工具 / Self Distillation and Meta Tools",
    zhHeading: "## 自我蒸馏与元工具",
    enHeading: "## Self Distillation and Meta Tools",
  },
  {
    label: "职场与学术关系 / Workplace and Academic Relationships",
    zhHeading: "## 职场与学术关系",
    enHeading: "## Workplace and Academic Relationships",
  },
  {
    label: "亲密关系与家庭记忆 / Intimate Relationships and Family Memories",
    zhHeading: "## 亲密关系与家庭记忆",
    enHeading: "## Intimate Relationships and Family Memories",
  },
  {
    label:
      "公众人物与方法论视角 / Public Figures and Methodological Perspectives",
    zhHeading: "## 公众人物与方法论视角",
    enHeading: "## Public Figures and Methodological Perspectives",
  },
  {
    label: "精神性与专门化主题 / Spiritual and Specialized Topics",
    zhHeading: "## 精神性与专门化主题",
    enHeading: "## Spiritual and Specialized Topics",
  },
];

export const CATEGORY_LABELS = CATEGORY_DEFINITIONS.map(
  (definition) => definition.label,
);

export const CATEGORY_MAP = new Map(
  CATEGORY_DEFINITIONS.map((definition) => [definition.label, definition]),
);

const REQUIRED_FIELDS = [
  ["存储库链接 / Repository URL", "repositoryUrl"],
  ["汉语名称 / Chinese Name", "projectNameZh"],
  ["英语名称 / English Name", "projectNameEn"],
  ["汉语描述 / Chinese Description", "descriptionZh"],
  ["英语描述 / English Description", "descriptionEn"],
  ["分类 / Category", "categoryLabel"],
  ["收录理由 / Why It Belongs Here", "rationale"],
  ["与现有条目的区别 / Differentiation", "differentiation"],
];

const REQUIRED_CONFIRMATIONS = [
  "我已阅读并遵循贡献指南 / I have read and follow the contribution guide",
];

const ENTRY_PATTERN = /^- \[(.+?)\]\((https:\/\/github\.com\/[^)]+)\) - (.+)$/u;
const GITHUB_REPOSITORY_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/u;

function normalizeLineEndings(value) {
  return value.replace(/\r/g, "");
}

function collapseWhitespace(value) {
  return value.replace(/\s+/g, " ").trim();
}

function escapeForRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractSection(body, heading) {
  const normalizedBody = normalizeLineEndings(body);
  const pattern = new RegExp(
    `(?:^|\\n)### ${escapeForRegex(heading)}\\n([\\s\\S]*?)(?=\\n### |$)`,
    "u",
  );
  const match = normalizedBody.match(pattern);
  if (!match) {
    throw new Error(`Missing required section: ${heading}`);
  }

  return match[1].trim();
}

function normalizeRepositoryUrl(url) {
  const normalized = collapseWhitespace(url).replace(/\/$/, "");
  if (!GITHUB_REPOSITORY_PATTERN.test(normalized)) {
    throw new Error("Submission must include a public GitHub repository URL.");
  }

  return normalized;
}

function parseEntry(line) {
  const match = line.match(ENTRY_PATTERN);
  if (!match) {
    throw new Error(`Invalid README entry format: ${line}`);
  }

  return {
    name: match[1],
    url: normalizeRepositoryUrl(match[2]),
    description: match[3],
  };
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

function sectionRange(readme, heading) {
  const normalizedReadme = normalizeLineEndings(readme);
  const start = normalizedReadme.indexOf(`${heading}\n`);
  if (start === -1) {
    throw new Error(`Missing heading: ${heading}`);
  }

  const nextHeadingIndex = normalizedReadme.indexOf(
    "\n## ",
    start + heading.length + 1,
  );
  const end =
    nextHeadingIndex === -1 ? normalizedReadme.length : nextHeadingIndex + 1;

  return {
    start,
    end,
    content: normalizedReadme.slice(start, end),
  };
}

function listEntriesInSection(sectionContent) {
  return normalizeLineEndings(sectionContent)
    .split("\n")
    .filter((line) => line.startsWith("- ["))
    .map(parseEntry);
}

function rebuildSection(heading, entries) {
  const lines = [heading, ""];
  for (const entry of entries) {
    lines.push(`- [${entry.name}](${entry.url}) - ${entry.description}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function updateReadmeSection(readme, heading, entry) {
  const normalizedReadme = normalizeLineEndings(readme);
  const { start, end, content } = sectionRange(normalizedReadme, heading);
  const entries = listEntriesInSection(content);

  if (entries.some((existing) => existing.url === entry.url)) {
    throw new Error(`Repository URL already exists: ${entry.url}`);
  }

  entries.push(entry);
  entries.sort(compareEntries);

  return `${normalizedReadme.slice(0, start)}${rebuildSection(
    heading,
    entries,
  )}${normalizedReadme.slice(end)}`;
}

function assertRequiredConfirmations(body) {
  const confirmationSection = extractSection(body, "确认事项 / Confirmations");
  for (const label of REQUIRED_CONFIRMATIONS) {
    const pattern = new RegExp(
      `(^|\\n)- \\[[xX]\\] ${escapeForRegex(label)}(?=\\n|$)`,
      "u",
    );
    if (!pattern.test(confirmationSection)) {
      throw new Error(`Missing required confirmation: ${label}`);
    }
  }
}

export function parseSubmissionIssueBody(body) {
  const parsed = {};

  for (const [heading, key] of REQUIRED_FIELDS) {
    const rawValue = extractSection(body, heading);
    parsed[key] =
      key === "repositoryUrl"
        ? normalizeRepositoryUrl(rawValue)
        : collapseWhitespace(rawValue);
  }

  if (!CATEGORY_MAP.has(parsed.categoryLabel)) {
    throw new Error(`Unsupported category: ${parsed.categoryLabel}`);
  }

  assertRequiredConfirmations(body);
  parsed.category = CATEGORY_MAP.get(parsed.categoryLabel);

  return parsed;
}

export function applySubmissionToReadmes({ readmeZh, readmeEn, submission }) {
  const repositoryUrl = normalizeRepositoryUrl(submission.repositoryUrl);
  const zhEntry = {
    name: collapseWhitespace(submission.projectNameZh),
    url: repositoryUrl,
    description: collapseWhitespace(submission.descriptionZh),
  };
  const enEntry = {
    name: collapseWhitespace(submission.projectNameEn),
    url: repositoryUrl,
    description: collapseWhitespace(submission.descriptionEn),
  };

  const updatedZh = updateReadmeSection(
    readmeZh,
    submission.category.zhHeading,
    zhEntry,
  );
  const updatedEn = updateReadmeSection(
    readmeEn,
    submission.category.enHeading,
    enEntry,
  );

  return {
    readmeZh: updatedZh,
    readmeEn: updatedEn,
  };
}

export async function applySubmissionFromIssueBody({
  issueBody,
  workspace = process.cwd(),
}) {
  const [readmeZh, readmeEn] = await Promise.all([
    fs.readFile(path.join(workspace, "README.md"), "utf8"),
    fs.readFile(path.join(workspace, "README.en.md"), "utf8"),
  ]);

  const submission = parseSubmissionIssueBody(issueBody);
  const updated = applySubmissionToReadmes({
    readmeZh,
    readmeEn,
    submission,
  });

  await Promise.all([
    fs.writeFile(path.join(workspace, "README.md"), updated.readmeZh),
    fs.writeFile(path.join(workspace, "README.en.md"), updated.readmeEn),
  ]);

  return submission;
}

async function main() {
  const issueBody = process.env.ISSUE_BODY;
  if (!issueBody) {
    throw new Error("ISSUE_BODY is required.");
  }

  const submission = await applySubmissionFromIssueBody({ issueBody });
  console.log(
    JSON.stringify({
      repositoryUrl: submission.repositoryUrl,
      projectNameZh: submission.projectNameZh,
      projectNameEn: submission.projectNameEn,
      category: submission.categoryLabel,
    }),
  );
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
