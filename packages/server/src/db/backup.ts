import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

import Database from "better-sqlite3";

/**
 * A cópia do banco antes de migrar (`038`, door 7).
 *
 * Não existe rollback automático de uma migração: o caminho de volta é o arquivo
 * `lumem.db.bak-<versão anterior>`, e a decisão de copiar é **a versão que subiu
 * da última vez**, gravada em `<stateDir>/last-version`. Uma tabela de versão
 * dentro do próprio banco obrigaria a abrir — e a migrar, se o `openDatabase`
 * fosse o dono — o banco que se quer copiar antes de decidir copiá-lo.
 */

export const LAST_VERSION_FILE = "last-version";

/** Quantas cópias ficam: o banco inteiro a cada release encheria o disco. */
export const BACKUPS_KEPT = 3;

export interface ReleaseOptions {
  /** Onde mora o `last-version`. */
  stateDir: string;
  /** A versão que está subindo agora. */
  version: string;
  keep?: number;
}

export interface Upgrade {
  /** Grava a versão. Só depois de as migrações passarem: antes disso a próxima subida ainda precisa copiar. */
  commit(): void;
}

function readLastVersion(stateDir: string): string | null {
  try {
    const text = readFileSync(join(stateDir, LAST_VERSION_FILE), "utf8").trim();
    return text === "" ? null : text;
  } catch {
    return null;
  }
}

/**
 * Copia o banco quando a versão mudou, e devolve quem grava a versão nova.
 *
 * `VACUUM INTO` e não `cp`: o daemon anterior pode ter caído sem checkpoint, e
 * então o que falta ao arquivo principal está no `-wal`. A cópia por SQLite é
 * consistente com o que o banco diz, e — a razão de existir — é a que se abre
 * sozinha no dia em que alguém precisa dela.
 */
export function prepareUpgrade(databasePath: string, release: ReleaseOptions): Upgrade {
  const last = readLastVersion(release.stateDir);

  if (last !== null && last !== release.version && existsSync(databasePath)) {
    const copy = `${databasePath}.bak-${last}`;
    // `VACUUM INTO` recusa um destino que existe: uma cópia da mesma versão
    // anterior, de uma subida que falhou, é substituída pela de agora.
    rmSync(copy, { force: true });
    const source = new Database(databasePath, { readonly: true, fileMustExist: true });
    try {
      source.prepare("VACUUM INTO ?").run(copy);
    } finally {
      source.close();
    }
    pruneBackups(databasePath, release.keep ?? BACKUPS_KEPT);
  }

  return {
    commit() {
      mkdirSync(release.stateDir, { recursive: true });
      writeFileSync(join(release.stateDir, LAST_VERSION_FILE), `${release.version}\n`);
    },
  };
}

/** Fica com as `keep` mais recentes **por data de modificação** — o nome de uma versão não é uma ordem. */
function pruneBackups(databasePath: string, keep: number): void {
  const prefix = `${basename(databasePath)}.bak-`;
  const dir = dirname(databasePath);
  const found = readdirSync(dir)
    .filter((name) => name.startsWith(prefix))
    .map((name) => ({ path: join(dir, name), modifiedAt: statSync(join(dir, name)).mtimeMs }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);

  for (const old of found.slice(keep)) rmSync(old.path, { force: true });
}
