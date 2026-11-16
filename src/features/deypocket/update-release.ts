/**
 * Pure GitHub Release parsing for public APK distribution.
 * No GitHub token is stored on the device. Private repositories cannot use this path.
 */
export type PublicApkRelease = {
  version: string;
  tag: string;
  name: string;
  url: string;
  releaseNotes: string;
  publishedAt: string | null;
};

export type PublicApkCheck =
  | { kind: 'available'; release: PublicApkRelease }
  | { kind: 'up-to-date'; latest: PublicApkRelease | null };

type ReleaseAsset = { name?: unknown; browser_download_url?: unknown; state?: unknown };
type ReleaseRecord = {
  tag_name?: unknown;
  name?: unknown;
  draft?: unknown;
  prerelease?: unknown;
  body?: unknown;
  published_at?: unknown;
  assets?: unknown;
};

export function parseVersion(version: string): [number, number, number] | null {
  const match = /^v?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/i.exec(version.trim());
  if (!match) return null;
  const parts = [Number(match[1]), Number(match[2]), Number(match[3])] as const;
  return parts.every(Number.isSafeInteger) ? [...parts] as [number, number, number] : null;
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isTrustedApkUrl(url: string, owner: string, repo: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com') return false;
    if (parsed.username || parsed.password || parsed.port) return false;
    const components = parsed.pathname.split('/').filter(Boolean).map(decodeURIComponent);
    return components.length >= 6 &&
      components[0].toLowerCase() === owner.toLowerCase() &&
      components[1].toLowerCase() === repo.toLowerCase() &&
      components[2] === 'releases' && components[3] === 'download' &&
      components[5].toLowerCase().endsWith('.apk');
  } catch {
    return false;
  }
}

export function selectLatestPublicApk(
  response: unknown,
  currentVersion: string,
  owner: string,
  repo: string,
): PublicApkCheck {
  if (!Array.isArray(response)) throw new Error('Format GitHub Releases tidak valid.');
  if (!parseVersion(currentVersion)) throw new Error('Versi APK terpasang tidak valid.');
  const releases: PublicApkRelease[] = [];
  for (const unknownRelease of response) {
    if (!isRecord(unknownRelease)) continue;
    const entry = unknownRelease as ReleaseRecord;
    if (entry.draft === true || entry.prerelease === true) continue;
    if (typeof entry.tag_name !== 'string' || !parseVersion(entry.tag_name)) continue;
    if (!Array.isArray(entry.assets)) continue;
    const validAsset = entry.assets.find((value: unknown) => {
      if (!isRecord(value)) return false;
      const asset = value as ReleaseAsset;
      return typeof asset.name === 'string' && asset.name.toLowerCase().endsWith('.apk') &&
        typeof asset.browser_download_url === 'string' &&
        isTrustedApkUrl(asset.browser_download_url, owner, repo) &&
        (asset.state === undefined || asset.state === 'uploaded');
    }) as ReleaseAsset | undefined;
    if (!validAsset) continue;
    releases.push({
      version: entry.tag_name.replace(/^v/i, ''),
      tag: entry.tag_name,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : entry.tag_name,
      url: validAsset.browser_download_url as string,
      releaseNotes: typeof entry.body === 'string' ? entry.body.slice(0, 900) : '',
      publishedAt: typeof entry.published_at === 'string' ? entry.published_at : null,
    });
  }
  releases.sort((a, b) => compareVersions(b.version, a.version));
  const latest = releases[0] ?? null;
  if (!latest || compareVersions(latest.version, currentVersion) <= 0) {
    return { kind: 'up-to-date', latest };
  }
  return { kind: 'available', release: latest };
}

export async function fetchPublicApkRelease(
  owner: string,
  repo: string,
  currentVersion: string,
): Promise<PublicApkCheck> {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) ||
      !/^[A-Za-z0-9._-]+$/.test(repo)) {
    throw new Error('Repository release belum dikonfigurasi dengan benar.');
  }
  const endpoint = `https://api.github.com/repos/${owner}/${repo}/releases?per_page=30`;
  const response = await fetch(endpoint, {
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (response.status === 404) {
    throw new Error('Release GitHub tidak dapat diakses. Repository mungkin privat atau belum tersedia. Gunakan distribusi APK terautentikasi; jangan masukkan token GitHub ke aplikasi.');
  }
  if (!response.ok) throw new Error(`Gagal memeriksa GitHub Releases (HTTP ${response.status}).`);
  return selectLatestPublicApk(await response.json() as unknown, currentVersion, owner, repo);
}
