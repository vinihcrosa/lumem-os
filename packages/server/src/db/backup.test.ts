import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import Database from "better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";

import { openDatabase, type Database_ } from "./index.js";

/**
 * A cópia do banco antes de migrar (`038`, door 7).
 *
 * O caminho manual de volta de uma migração ruim é `lumem.db.bak-<versão>`, e cada
 * caso aqui é um jeito de esse arquivo estar errado sem ninguém notar: copiado
 * **depois** da migração (então é o banco já quebrado), `last-version` gravado
 * antes de a migração passar (então a próxima subida acha que já cuidou disso), ou
 * uma cópia por versão para sempre (o disco enche com o banco inteiro a cada release).
 */

const open: Database_[] = [];
const dirs: string[] = [];

afterEach(() => {
  for (const handle of open.splice(0)) handle.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

interface Home {
  stateDir: string;
  databasePath: string;
  lastVersionPath: string;
}

function home(): Home {
  const stateDir = mkdtempSync(join(tmpdir(), "lumem-backup-"));
  dirs.push(stateDir);
  return {
    stateDir,
    databasePath: join(stateDir, "lumem.db"),
    lastVersionPath: join(stateDir, "last-version"),
  };
}

/** Um banco de uma versão antiga: só uma tabela do teste, e **nenhuma migração** aplicada. */
function oldDatabase(path: string): void {
  const raw = new Database(path);
  raw.exec("CREATE TABLE marker (note TEXT); INSERT INTO marker VALUES ('antes da migração')");
  raw.close();
}

function tablesOf(path: string): string[] {
  const raw = new Database(path, { readonly: true });
  try {
    return (raw.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map(
      (row) => row.name,
    );
  } finally {
    raw.close();
  }
}

function upgrade(where: Home, version: string, keep?: number): Database_ {
  const handle = openDatabase({
    path: where.databasePath,
    release: { stateDir: where.stateDir, version, ...(keep === undefined ? {} : { keep }) },
  });
  open.push(handle);
  return handle;
}

const backups = (where: Home): string[] =>
  readdirSync(where.stateDir)
    .filter((name) => name.startsWith("lumem.db.bak-"))
    .sort();

describe("the copy before migrating", () => {
  it("copies the database before migrating to a new version", () => {
    const where = home();
    oldDatabase(where.databasePath);
    writeFileSync(where.lastVersionPath, "0.6.1\n");

    upgrade(where, "0.7.0");

    // A cópia é do banco **como estava**: com a tabela do teste e sem nenhuma
    // tabela do Lumem. Copiar depois de migrar seria guardar o banco já mudado.
    const copy = join(where.stateDir, "lumem.db.bak-0.6.1");
    expect(backups(where)).toEqual(["lumem.db.bak-0.6.1"]);
    expect(tablesOf(copy)).toEqual(["marker"]);
    const raw = new Database(copy, { readonly: true });
    expect(raw.prepare("SELECT note FROM marker").all()).toEqual([{ note: "antes da migração" }]);
    raw.close();

    // O banco de verdade foi migrado, e a versão gravada é a nova.
    expect(tablesOf(where.databasePath)).toContain("daemon_settings");
    expect(readFileSync(where.lastVersionPath, "utf8").trim()).toBe("0.7.0");
  });

  it("copies what is still in the write-ahead log", () => {
    // O daemon anterior pode ter caído sem checkpoint: um `cp` do arquivo principal
    // deixaria a cópia sem as últimas escritas, e ela só se descobre assim no dia
    // em que alguém precisa dela.
    const where = home();
    const writer = new Database(where.databasePath);
    writer.pragma("journal_mode = WAL");
    writer.pragma("wal_autocheckpoint = 0");
    writer.exec("CREATE TABLE marker (note TEXT); INSERT INTO marker VALUES ('só no wal')");
    writeFileSync(where.lastVersionPath, "0.6.1");
    expect(existsSync(`${where.databasePath}-wal`)).toBe(true);

    try {
      upgrade(where, "0.7.0");
    } finally {
      writer.close();
    }

    const raw = new Database(join(where.stateDir, "lumem.db.bak-0.6.1"), { readonly: true });
    expect(raw.prepare("SELECT note FROM marker").all()).toEqual([{ note: "só no wal" }]);
    raw.close();
  });

  it("keeps the three newest backups", () => {
    const where = home();
    oldDatabase(where.databasePath);
    // Três cópias de antes, com idades distintas; o nome não é a ordem — quem
    // decide é a data de modificação, como diz o critério.
    const now = Date.now() / 1_000;
    for (const [version, age] of [
      ["0.5.0", 300],
      ["0.5.1", 100],
      ["0.6.0", 200],
    ] as const) {
      const path = join(where.stateDir, `lumem.db.bak-${version}`);
      writeFileSync(path, version);
      utimesSync(path, now - age, now - age);
    }
    writeFileSync(where.lastVersionPath, "0.6.1");

    upgrade(where, "0.7.0", 3);

    // A mais velha (0.5.0, 300 s) saiu; a quarta cópia é a de agora.
    expect(backups(where)).toEqual([
      "lumem.db.bak-0.5.1",
      "lumem.db.bak-0.6.0",
      "lumem.db.bak-0.6.1",
    ]);
  });

  it("copies nothing when the version did not change", () => {
    // Reiniciar o mesmo daemon é o caso comum (`lumem` sem verbo, o supervisor):
    // uma cópia por subida encheria o disco com o mesmo banco.
    const where = home();
    oldDatabase(where.databasePath);
    writeFileSync(where.lastVersionPath, "0.7.0");

    upgrade(where, "0.7.0");

    expect(backups(where)).toEqual([]);
  });

  it("copies nothing when there is no database yet", () => {
    // `last-version` sem banco é uma pasta de estado meio apagada: não há o que
    // copiar, e a subida tem de seguir em vez de tropeçar na cópia.
    const where = home();
    writeFileSync(where.lastVersionPath, "0.6.1");

    upgrade(where, "0.7.0");

    expect(backups(where)).toEqual([]);
    expect(readFileSync(where.lastVersionPath, "utf8").trim()).toBe("0.7.0");
  });

  it("records the version only after the migrations succeed", () => {
    // Sem `last-version`: nada a copiar, e a versão é gravada depois de migrar.
    const fresh = home();
    upgrade(fresh, "0.7.0");
    expect(backups(fresh)).toEqual([]);
    expect(readFileSync(fresh.lastVersionPath, "utf8").trim()).toBe("0.7.0");

    // Uma migração que falha — a tabela `workspace` já existe e a primeira
    // migração tenta criá-la. A versão que estava gravada continua sendo a que
    // estava: a próxima subida ainda sabe que precisa copiar.
    const failing = home();
    const stuck = new Database(failing.databasePath);
    stuck.exec("CREATE TABLE workspace (x INTEGER)");
    stuck.close();
    writeFileSync(failing.lastVersionPath, "0.6.1");
    expect(() => upgrade(failing, "0.7.0")).toThrow();
    expect(readFileSync(failing.lastVersionPath, "utf8").trim()).toBe("0.6.1");
    // E a cópia **foi** feita antes de a migração falhar — é para isso que ela serve.
    expect(backups(failing)).toEqual(["lumem.db.bak-0.6.1"]);

    // Sem `last-version` e com a migração falhando: nada é gravado.
    const unrecorded = home();
    const alsoStuck = new Database(unrecorded.databasePath);
    alsoStuck.exec("CREATE TABLE workspace (x INTEGER)");
    alsoStuck.close();
    expect(() => upgrade(unrecorded, "0.7.0")).toThrow();
    expect(existsSync(unrecorded.lastVersionPath)).toBe(false);
  });
});
