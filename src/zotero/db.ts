import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import initSqlJs, { type Database, type SqlJsStatic, type SqlValue } from 'sql.js';

export type DbParameter = string | number | null;

export interface OpenedZoteroDatabase {
  db: Database;
  cleanup: () => Promise<void>;
}

let sqlJsPromise: Promise<SqlJsStatic> | undefined;

async function getSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    const wasmDir = path.dirname(require.resolve('sql.js/dist/sql-wasm.js'));
    sqlJsPromise = initSqlJs({
      locateFile: (file: string) => path.join(wasmDir, file),
    });
  }

  return sqlJsPromise;
}

async function copyDatabaseToTemp(sqlitePath: string): Promise<string> {
  const tempDbPath = path.join(
    os.tmpdir(),
    `vscodezotero-${Date.now()}-${Math.random().toString(36).slice(2)}.sqlite`,
  );
  await fs.copyFile(sqlitePath, tempDbPath);
  return tempDbPath;
}

export async function openZoteroDatabase(sqlitePath: string): Promise<OpenedZoteroDatabase> {
  const tempDbPath = await copyDatabaseToTemp(sqlitePath);
  const sqlJs = await getSqlJs();
  const content = await fs.readFile(tempDbPath);
  const db = new sqlJs.Database(new Uint8Array(content));

  return {
    db,
    cleanup: async () => {
      try {
        db.close();
      } finally {
        await fs.rm(tempDbPath, { force: true });
      }
    },
  };
}

export function runQuery<T extends object>(
  db: Database,
  sql: string,
  params: DbParameter[] = [],
): T[] {
  const results = db.exec(sql, params as SqlValue[]);
  if (results.length === 0) {
    return [];
  }

  const [{ columns, values }] = results;
  return values.map((valueRow) => {
    const row: Record<string, unknown> = {};
    columns.forEach((column, index) => {
      row[column] = valueRow[index];
    });
    return row as T;
  });
}

export function runOne<T extends object>(
  db: Database,
  sql: string,
  params: DbParameter[] = [],
): T | undefined {
  return runQuery<T>(db, sql, params)[0];
}

export function sqlPlaceholders(count: number): string {
  if (count <= 0) {
    throw new Error('Placeholder count must be greater than zero.');
  }
  return new Array(count).fill('?').join(', ');
}
