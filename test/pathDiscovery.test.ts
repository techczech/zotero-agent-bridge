import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildStaticSqliteCandidates,
  discoverStoragePath,
  discoverCandidateSqlitePaths,
  pickPreferredSqliteCandidate,
} from '../src/zotero/pathCandidates';

const cleanupPaths: string[] = [];

afterEach(async () => {
  while (cleanupPaths.length > 0) {
    const p = cleanupPaths.pop();
    if (p) {
      await fs.rm(p, { recursive: true, force: true });
    }
  }
});

describe('path discovery', () => {
  it('builds static candidates for mac and windows', () => {
    const mac = buildStaticSqliteCandidates({
      platform: 'darwin',
      homeDir: '/Users/test',
    });
    expect(mac).toContain('/Users/test/Zotero/zotero.sqlite');

    const win = buildStaticSqliteCandidates({
      platform: 'win32',
      homeDir: 'C:/Users/test',
      userProfile: 'C:/Users/test',
    });
    expect(win).toContain(path.join('C:/Users/test', 'Zotero', 'zotero.sqlite'));
  });

  it('discovers existing sqlite files including profile candidates', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscodezotero-paths-'));
    cleanupPaths.push(root);

    const homeDir = path.join(root, 'home');
    const appData = path.join(root, 'appdata');

    const staticDb = path.join(homeDir, 'Zotero', 'zotero.sqlite');
    await fs.mkdir(path.dirname(staticDb), { recursive: true });
    await fs.writeFile(staticDb, 'sqlite');

    const profileDb = path.join(
      appData,
      'Zotero',
      'Zotero',
      'Profiles',
      'abc.default',
      'zotero.sqlite',
    );
    await fs.mkdir(path.dirname(profileDb), { recursive: true });
    await fs.writeFile(profileDb, 'sqlite');

    const found = await discoverCandidateSqlitePaths({
      platform: 'win32',
      homeDir,
      userProfile: homeDir,
      appData,
    });

    expect(found).toContain(staticDb);
    expect(found).toContain(profileDb);
  });

  it('prefers default Zotero sqlite in home directory', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscodezotero-pref-'));
    cleanupPaths.push(root);

    const homeDir = path.join(root, 'home');
    const preferred = path.join(homeDir, 'Zotero', 'zotero.sqlite');
    const other = path.join(homeDir, 'Library', 'Application Support', 'Zotero', 'Profiles', 'x', 'zotero.sqlite');

    await fs.mkdir(path.dirname(preferred), { recursive: true });
    await fs.writeFile(preferred, 'sqlite');
    await fs.mkdir(path.dirname(other), { recursive: true });
    await fs.writeFile(other, 'sqlite');

    const picked = await pickPreferredSqliteCandidate([other, preferred], {
      platform: 'darwin',
      homeDir,
    });

    expect(picked).toBe(preferred);
  });

  it('finds storage next to sqlite or in common defaults', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'vscodezotero-storage-'));
    cleanupPaths.push(root);

    const homeDir = path.join(root, 'home');
    const sqlitePath = path.join(homeDir, 'Zotero', 'zotero.sqlite');
    const storagePath = path.join(homeDir, 'Zotero', 'storage');
    await fs.mkdir(path.dirname(sqlitePath), { recursive: true });
    await fs.writeFile(sqlitePath, 'sqlite');
    await fs.mkdir(storagePath, { recursive: true });

    const discovered = await discoverStoragePath(sqlitePath, {
      platform: 'darwin',
      homeDir,
    });

    expect(discovered).toBe(storagePath);
  });
});
