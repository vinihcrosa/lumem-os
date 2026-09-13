import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * O cofre do Lumem (`028` · [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)).
 *
 * **O Lumem guarda as credenciais dos serviços de que depende.** É decisão do
 * Vinicius e ela reverte a de horas antes: o `gh` foi solução **daquele** caso e
 * ler do ambiente foi **simplicidade** — nenhuma das duas era política.
 *
 * **Contra o que isto protege**, e é metade da decisão: contra o repositório git
 * do `~/.lumem`, contra um `git remote` usado como backup daquela pasta, contra
 * um `cat` do banco, contra um log, contra uma captura de tela e contra qualquer
 * resposta do daemon para a tela.
 *
 * **Contra o que não protege:** quem já lê o seu `$HOME` como você. A chave está
 * ao lado do arquivo, e quem lê os dois decifra. É escolha, não descuido — o
 * [estudo](../../../../docs/project/secret-store.md) mede o que a alternativa
 * custa: o cofre do sistema põe o valor no `argv` em três CLIs diferentes, e o
 * módulo nativo quebra o *"só o par nativo por fora"* que a `014` comprou.
 */

/** Onde os dois moram, e os dois dentro do `_system/`, que o git já ignora. */
export const SECRETS_FILE = join("_system", "secrets.json");
export const SECRETS_KEY_FILE = join("_system", "secrets.key");

/** Um serviço com credencial. O nome é o que a tela mostra. */
export interface SecretSlot {
  id: string;
  label: string;
}

export interface SecretStore {
  /** **Presença**, e é isto que atravessa para a tela. Nunca o valor. */
  has(id: string): boolean;
  /** O valor, e só para quem vai usá-lo numa chamada. */
  read(id: string): string | null;
  /** Grava, cifrado. Valor vazio **apaga** — é como se remove uma credencial. */
  write(id: string, value: string): void;
  /** Quais têm valor. Uma lista de ids, e nada mais. */
  list(): string[];
}

/**
 * `AES-256-GCM`, nativo do Node.
 *
 * GCM e não CBC porque ele **autentica**: um arquivo de segredos adulterado
 * falha ao decifrar em vez de devolver lixo que o daemon mandaria como
 * cabeçalho para um host de terceiro.
 */
const ALGORITHM = "aes-256-gcm";

interface Envelope {
  /** Base64 do IV. Próprio por segredo — reusar IV em GCM quebra a cifra. */
  iv: string;
  tag: string;
  value: string;
}

export function createSecretStore({ stateDir }: { stateDir: string }): SecretStore {
  const path = join(stateDir, SECRETS_FILE);
  const keyPath = join(stateDir, SECRETS_KEY_FILE);

  /**
   * A chave, criada no primeiro uso.
   *
   * `0600` na criação **e** reaplicado na leitura: um `~/.lumem` restaurado de
   * um backup que não preservou permissão voltaria com o arquivo legível, e o
   * daemon é quem tem como notar isso.
   */
  function key(): Buffer {
    mkdirSync(dirname(keyPath), { recursive: true });
    if (!existsSync(keyPath)) {
      writeFileSync(keyPath, randomBytes(32), { mode: 0o600 });
      return readFileSync(keyPath);
    }
    chmodSync(keyPath, 0o600);
    return readFileSync(keyPath);
  }

  function load(): Record<string, Envelope> {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, "utf8")) as Record<string, Envelope>;
    } catch {
      /*
       * Arquivo corrompido lê como vazio, e **não** lança.
       *
       * O efeito é o mesmo de não ter credencial: a feature não aparece. Lançar
       * derrubaria o boot do daemon inteiro por causa de um arquivo de uma
       * feature opcional — e quem perdeu o cofre vai reescrever a chave, não
       * consertar JSON à mão.
       */
      return {};
    }
  }

  function save(all: Record<string, Envelope>): void {
    mkdirSync(dirname(path), { recursive: true });
    // `0600` aqui também, ainda que o conteúdo esteja cifrado: o arquivo diz
    // **quais** serviços você usa, e isso já é informação.
    writeFileSync(path, `${JSON.stringify(all, null, 2)}\n`, { mode: 0o600 });
  }

  return {
    has(id) {
      return load()[id] !== undefined;
    },

    list() {
      /*
       * `localeCompare` e não o `sort()` seco.
       *
       * Os ids são slugs ASCII, então os dois dariam a mesma ordem hoje — e o
       * `sort()` sem comparador ordena por **unidade de código UTF-16**, que é
       * uma ordem que só coincide com a alfabética enquanto ninguém acrescentar
       * um id com acento. A lista alimenta a tela; ordem por acaso ali é ordem
       * que muda quando o catálogo cresce.
       */
      return Object.keys(load()).sort((a, b) => a.localeCompare(b));
    },

    read(id) {
      const envelope = load()[id];
      if (envelope === undefined) return null;
      try {
        const decipher = createDecipheriv(
          ALGORITHM,
          key(),
          Buffer.from(envelope.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
        return (
          decipher.update(Buffer.from(envelope.value, "base64")).toString("utf8") +
          decipher.final("utf8")
        );
      } catch {
        /*
         * Decifrar falhou: a chave mudou, ou o arquivo foi adulterado. Os dois
         * viram `null`, que é *"não há credencial"* — e é o certo: devolver o
         * que sobrou de uma decifragem quebrada seria mandar lixo como
         * cabeçalho de autenticação para um host de terceiro.
         */
        return null;
      }
    },

    write(id, value) {
      const all = load();
      if (value.trim() === "") {
        // Valor vazio **apaga**, e é como uma credencial é removida: um gesto,
        // e não dois. Rotação na v1 é apagar e pôr outra.
        delete all[id];
        save(all);
        return;
      }

      const iv = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key(), iv);
      const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
      all[id] = {
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        value: encrypted.toString("base64"),
      };
      save(all);
    },
  };
}
