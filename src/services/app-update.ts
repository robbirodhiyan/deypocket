import * as Application from 'expo-application';
import Constants from 'expo-constants';

type GithubAsset = {
  name: string;
  browser_download_url: string;
};

type GithubRelease = {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  assets: GithubAsset[];
};

export type AppUpdateInfo = {
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
  prerelease: boolean;
};

const settings =
  Constants.expoConfig?.extra?.project;

const owner = String(
  settings?.releaseOwner ?? ''
).trim();

const repo = String(
  settings?.releaseRepository ?? ''
).trim();

function normalize(version: string): string {
  return version.trim().replace(/^v/i, '');
}

function numbers(
  version: string
): number[] | null {
  const value = normalize(version);

  return /^\d+\.\d+\.\d+$/.test(value)
    ? value.split('.').map(Number)
    : null;
}

function compare(
  a: string,
  b: string
): number {
  const left = numbers(a);
  const right = numbers(b);

  if (!left || !right) {
    return 0;
  }

  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) {
      return left[i] - right[i];
    }
  }

  return 0;
}

export function getInstalledVersion(): string {
  return (
    Application.nativeApplicationVersion ??
    Constants.expoConfig?.version ??
    '0.0.0'
  );
}

export async function checkForAppUpdate():
  Promise<AppUpdateInfo> {
  const currentVersion =
    getInstalledVersion();

  if (!owner || !repo) {
    throw new Error(
      'GitHub Releases belum dikonfigurasi.'
    );
  }

  const url =
    'https://api.github.com/repos/' +
    encodeURIComponent(owner) + '/' +
    encodeURIComponent(repo) +
    '/releases?per_page=30';

  const response = await fetch(url, {
    headers: {
      Accept:
        'application/vnd.github+json',
    },
  });

  if (!response.ok) {
    throw new Error(
      'GitHub Releases HTTP ' +
      response.status
    );
  }

  const data: unknown =
    await response.json();

  if (!Array.isArray(data)) {
    throw new Error(
      'Respons GitHub tidak valid.'
    );
  }

  const valid =
    (data as GithubRelease[])
      .filter((entry) =>
        !entry.draft &&
        numbers(entry.tag_name) !== null &&
        Array.isArray(entry.assets) &&
        entry.assets.some((asset) =>
          asset.name
            .toLowerCase()
            .endsWith('.apk')
        )
      )
      .sort((a, b) =>
        compare(
          b.tag_name,
          a.tag_name
        )
      );

  const latest = valid[0];

  if (!latest) {
    return {
      currentVersion,
      latestVersion: null,
      hasUpdate: false,
      downloadUrl: null,
      prerelease: false,
    };
  }

  const apk = latest.assets.find(
    (asset) =>
      asset.name
        .toLowerCase()
        .endsWith('.apk')
  );

  return {
    currentVersion,

    latestVersion:
      normalize(latest.tag_name),

    hasUpdate:
      compare(
        latest.tag_name,
        currentVersion
      ) > 0,

    downloadUrl:
      apk?.browser_download_url ?? null,

    prerelease:
      latest.prerelease,
  };
}
