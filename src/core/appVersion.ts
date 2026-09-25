/**
 * The version shown under the credits: the latest release tag plus the number
 * of commits made since it.
 *
 * Worked out once per build from `git describe` in vite.config.ts and baked in
 * as the `__APP_VERSION__` constant, so the prerendered pages carry it too
 * (the guide ships no JavaScript to ask at runtime). Kept here, free of Node,
 * so the parsing is unit-testable without shelling out.
 */
export interface AppVersion {
  /** 'v1.1.0+33' is 33 commits past the v1.1.0 release; on the tag itself, just 'v1.1.0'. */
  label: string;
  /** Abbreviated hash of the commit that was built. */
  commit: string;
}

/**
 * Parse `git describe --tags --long` output, e.g. 'v1.1.0-33-g0a74c51'.
 *
 * `--long` is what makes this unambiguous: without it a build exactly on a tag
 * prints the bare tag, which cannot be told apart from a tag that itself ends
 * in '-<n>-g<hex>'. Anything that does not match gives null, and no version is
 * shown rather than a wrong one.
 */
export function parseGitDescribe(output: string): AppVersion | null {
  const match = /^(.+)-(\d+)-g([0-9a-f]+)$/.exec(output.trim());
  if (!match) return null;
  const [, tag, count, commit] = match;
  return { label: count === '0' ? tag : `${tag}+${count}`, commit };
}
