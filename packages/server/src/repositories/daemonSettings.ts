import { eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { daemonSettings } from "../db/schema.js";

/** Os dois valores que a tabela aceita — o mesmo conjunto da `CHECK`. */
export const AUTO_UPDATE_VALUES = ["off", "idle"] as const;
export type AutoUpdate = (typeof AUTO_UPDATE_VALUES)[number];

/** As preferências da máquina, com o tipo que o domínio usa (`updateCheck` é booleano). */
export interface DaemonSettings {
  updateCheck: boolean;
  autoUpdate: AutoUpdate;
}

/**
 * A única linha de `daemon_settings` (`038`, door 3).
 *
 * **Síncrono de propósito**, ao contrário dos outros repositórios: o relógio da
 * verificação de versão pergunta *"está ligada?"* a cada tique, e a resposta é uma
 * leitura de uma linha do `better-sqlite3`, que já é síncrono por baixo.
 *
 * Só `UPDATE`, nunca `INSERT`: a migração cria a linha, e uma escrita que precisasse
 * de *upsert* seria uma escrita que não confia nisso.
 */
export interface DaemonSettingsRepository {
  get(): DaemonSettings;
  /** Grava só o que veio, e devolve o que ficou gravado. */
  set(patch: Partial<DaemonSettings>): DaemonSettings;
}

export function createDaemonSettingsRepository(db: Db): DaemonSettingsRepository {
  function get(): DaemonSettings {
    const row = db.select().from(daemonSettings).where(eq(daemonSettings.id, 1)).get();
    if (row === undefined) {
      // A migração cria a linha. Ausente aqui é banco que não passou por ela, e
      // seguir com um padrão inventado esconderia isso.
      throw new Error("daemon_settings não tem a linha que a migração cria");
    }
    return {
      updateCheck: row.updateCheck === 1,
      autoUpdate: row.autoUpdate === "idle" ? "idle" : "off",
    };
  }

  return {
    get,
    set(patch) {
      const changes = {
        ...(patch.updateCheck === undefined ? {} : { updateCheck: patch.updateCheck ? 1 : 0 }),
        ...(patch.autoUpdate === undefined ? {} : { autoUpdate: patch.autoUpdate }),
      };
      // `set({})` não é uma escrita: o drizzle recusa um `SET` vazio.
      if (Object.keys(changes).length > 0) {
        db.update(daemonSettings).set(changes).where(eq(daemonSettings.id, 1)).run();
      }
      return get();
    },
  };
}
