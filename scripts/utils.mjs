export const ENTRY_PATTERN = /^- \[(.+?)\]\((https:\/\/github\.com\/[^)]+)\) - (.+)$/u;
export const GITHUB_REPOSITORY_PATTERN =
  /^https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)\/?$/u;

export function normalizeLineEndings(value) {
  return value.replace(/\r/g, "");
}

export function repositorySortKey(url) {
  const match = url.match(GITHUB_REPOSITORY_PATTERN);
  if (!match) {
    return url.toLowerCase();
  }

  return match[2].toLowerCase();
}

export function compareEntries(a, b) {
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
