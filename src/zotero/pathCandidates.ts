import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface CandidateEnv {
  platform: NodeJS.Platform;
  homeDir: string;
  userProfile?: string;
  appData?: string;
}

export interface CandidateWithScore {
  path: string;
  score: number;
}

export async function pathExists(candidatePath: string): Promise<boolean> {
  try {
    await fs.access(candidatePath);
    return true;
  } catch {
    return false;
  }
}

export function buildStaticSqliteCandidates(env: CandidateEnv): string[] {
  const candidates = new Set<string>();

  candidates.add(path.join(env.homeDir, 'Zotero', 'zotero.sqlite'));

  if (env.platform === 'win32') {
    if (env.userProfile) {
      candidates.add(path.join(env.userProfile, 'Zotero', 'zotero.sqlite'));
    }
  }

  if (env.platform === 'darwin') {
    candidates.add(
      path.join(env.homeDir, 'Library', 'Application Support', 'Zotero', 'zotero.sqlite'),
    );
  }

  return Array.from(candidates);
}

async function scanProfileRoot(profileRoot: string): Promise<string[]> {
  if (!(await pathExists(profileRoot))) {
    return [];
  }

  const entries = await fs.readdir(profileRoot, { withFileTypes: true });
  const candidates: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }
    const candidate = path.join(profileRoot, entry.name, 'zotero.sqlite');
    if (await pathExists(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
}

export async function discoverCandidateSqlitePaths(env?: Partial<CandidateEnv>): Promise<string[]> {
  const resolvedEnv: CandidateEnv = {
    platform: env?.platform ?? process.platform,
    homeDir: env?.homeDir ?? os.homedir(),
    userProfile: env?.userProfile ?? process.env.USERPROFILE,
    appData: env?.appData ?? process.env.APPDATA,
  };

  const staticCandidates = buildStaticSqliteCandidates(resolvedEnv);
  const dynamicCandidates: string[] = [];

  if (resolvedEnv.platform === 'win32' && resolvedEnv.appData) {
    dynamicCandidates.push(
      ...(await scanProfileRoot(path.join(resolvedEnv.appData, 'Zotero', 'Zotero', 'Profiles'))),
    );
  }

  if (resolvedEnv.platform === 'darwin') {
    dynamicCandidates.push(
      ...(await scanProfileRoot(
        path.join(resolvedEnv.homeDir, 'Library', 'Application Support', 'Zotero', 'Profiles'),
      )),
    );
  }

  const allCandidates = Array.from(new Set([...staticCandidates, ...dynamicCandidates]));
  const existingCandidates: string[] = [];

  for (const candidate of allCandidates) {
    if (await pathExists(candidate)) {
      existingCandidates.push(candidate);
    }
  }

  return existingCandidates;
}

function canonicalize(candidatePath: string): string {
  return path.normalize(candidatePath).toLowerCase();
}

function looksLikeProfilePath(normalizedPath: string): boolean {
  return normalizedPath.includes('/zotero/profiles/') || normalizedPath.includes('\\zotero\\profiles\\');
}

export async function pickPreferredSqliteCandidate(
  candidates: string[],
  env?: Partial<CandidateEnv>,
): Promise<string | undefined> {
  if (candidates.length === 0) {
    return undefined;
  }

  if (candidates.length === 1) {
    return candidates[0];
  }

  const resolvedEnv: CandidateEnv = {
    platform: env?.platform ?? process.platform,
    homeDir: env?.homeDir ?? os.homedir(),
    userProfile: env?.userProfile ?? process.env.USERPROFILE,
    appData: env?.appData ?? process.env.APPDATA,
  };

  const homeZotero = canonicalize(path.join(resolvedEnv.homeDir, 'Zotero', 'zotero.sqlite'));
  const userProfileZotero = resolvedEnv.userProfile
    ? canonicalize(path.join(resolvedEnv.userProfile, 'Zotero', 'zotero.sqlite'))
    : undefined;

  const scored: CandidateWithScore[] = [];

  for (const candidate of candidates) {
    const normalized = canonicalize(candidate);
    let score = 0;

    if (normalized === homeZotero) {
      score += 1000;
    }
    if (userProfileZotero && normalized === userProfileZotero) {
      score += 900;
    }
    if (looksLikeProfilePath(normalized)) {
      score += 600;
    }
    if (normalized.includes(`${path.sep}application support${path.sep}zotero${path.sep}`.toLowerCase())) {
      score += 300;
    }

    try {
      const stat = await fs.stat(candidate);
      score += Math.floor(stat.mtimeMs / 1000);
    } catch {
      // Keep base score if stat fails.
    }

    scored.push({ path: candidate, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.path;
}

export async function discoverStoragePath(
  sqlitePath: string,
  env?: Partial<CandidateEnv>,
  configuredStoragePath?: string,
): Promise<string | undefined> {
  const resolvedEnv: CandidateEnv = {
    platform: env?.platform ?? process.platform,
    homeDir: env?.homeDir ?? os.homedir(),
    userProfile: env?.userProfile ?? process.env.USERPROFILE,
    appData: env?.appData ?? process.env.APPDATA,
  };

  const guesses: string[] = [];
  if (configuredStoragePath && configuredStoragePath.trim().length > 0) {
    guesses.push(configuredStoragePath.trim());
  }

  guesses.push(path.join(path.dirname(sqlitePath), 'storage'));
  guesses.push(path.join(resolvedEnv.homeDir, 'Zotero', 'storage'));

  if (resolvedEnv.userProfile) {
    guesses.push(path.join(resolvedEnv.userProfile, 'Zotero', 'storage'));
  }

  if (resolvedEnv.platform === 'darwin') {
    guesses.push(path.join(resolvedEnv.homeDir, 'Library', 'Application Support', 'Zotero', 'storage'));
  }

  for (const guess of Array.from(new Set(guesses))) {
    if (await pathExists(guess)) {
      return guess;
    }
  }

  return undefined;
}
