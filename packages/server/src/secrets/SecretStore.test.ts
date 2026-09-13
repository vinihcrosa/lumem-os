import { readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createSecretStore, SECRETS_FILE, SECRETS_KEY_FILE } from "./SecretStore.js";
import { cleanupGitFixtures, tempDir } from "../testing/git-fixtures.js";

/**
 * O cofre (`028` · ADR de 2026-09-13).
 *
 * O que este arquivo mais cobra é o que o ADR **promete** e o que ele **não**
 * promete. As duas metades são testáveis, e a segunda é a que costuma virar
 * folclore quando ninguém a escreve.
 */

afterEach(() => {
  cleanupGitFixtures();
});

const store = () => {
  const stateDir = tempDir("lumem-secrets-");
  return { stateDir, secrets: createSecretStore({ stateDir }) };
};

describe("o que entra, sai", () => {
  it("grava e lê", () => {
    const { secrets } = store();

    secrets.write("linear", "lin_api_segredo");

    expect(secrets.read("linear")).toBe("lin_api_segredo");
  });

  it("o que não existe é `null`, e não erro", () => {
    const { secrets } = store();

    // *"Não configurado"* é um estado normal — é o de toda instalação que não
    // usa o serviço —, e erro obrigaria quem chama a tratar o caso comum.
    expect(secrets.read("linear")).toBeNull();
    expect(secrets.has("linear")).toBe(false);
  });

  it("valor vazio apaga", () => {
    const { secrets } = store();
    secrets.write("linear", "lin_api_segredo");

    secrets.write("linear", "   ");

    // Um gesto, e não dois: rotação na v1 é apagar e pôr outra.
    expect(secrets.has("linear")).toBe(false);
    expect(secrets.list()).toEqual([]);
  });

  it("a lista diz quais, e nada além disso", () => {
    const { secrets } = store();
    secrets.write("linear", "a");
    secrets.write("github", "b");

    expect(secrets.list()).toEqual(["github", "linear"]);
  });
});

describe("o que o ADR promete", () => {
  it("o valor não aparece em texto no arquivo", () => {
    const { stateDir, secrets } = store();

    secrets.write("linear", "lin_api_segredo_que_nao_pode_vazar");

    /*
     * É a promessa inteira: o segredo não aparece num `cat`, num log, numa
     * captura de tela, nem num `git remote` usado como backup do `~/.lumem`.
     */
    const onDisk = readFileSync(join(stateDir, SECRETS_FILE), "utf8");
    expect(onDisk).not.toContain("lin_api_segredo_que_nao_pode_vazar");
  });

  it("os dois arquivos nascem `0600`", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "a");

    const mode = (path: string) => statSync(join(stateDir, path)).mode & 0o777;
    expect(mode(SECRETS_KEY_FILE)).toBe(0o600);
    // O arquivo de segredos também, ainda que cifrado: ele diz **quais**
    // serviços você usa, e isso já é informação.
    expect(mode(SECRETS_FILE)).toBe(0o600);
  });

  it("a permissão da chave é reaplicada na leitura", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "a");
    const keyPath = join(stateDir, SECRETS_KEY_FILE);
    writeFileSync(keyPath, readFileSync(keyPath), { mode: 0o644 });

    secrets.read("linear");

    /*
     * Um `~/.lumem` restaurado de um backup que não preservou permissão voltaria
     * com a chave legível por qualquer um. O daemon é quem tem como notar isso.
     */
    expect(statSync(keyPath).mode & 0o777).toBe(0o600);
  });

  it("cada segredo tem IV próprio — dois iguais não ficam iguais no disco", () => {
    const { stateDir, secrets } = store();

    secrets.write("linear", "mesmo-valor");
    secrets.write("github", "mesmo-valor");

    // Reusar IV em GCM quebra a cifra, e o sintoma seria este: dois segredos
    // idênticos com o mesmo texto cifrado, o que já vaza que eles são iguais.
    const stored = JSON.parse(readFileSync(join(stateDir, SECRETS_FILE), "utf8")) as Record<
      string,
      { iv: string; value: string }
    >;
    expect(stored["linear"]?.iv).not.toBe(stored["github"]?.iv);
    expect(stored["linear"]?.value).not.toBe(stored["github"]?.value);
  });
});

describe("o que quebra vira ausência, e não exceção", () => {
  it("arquivo de segredos corrompido lê como vazio", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "a");
    writeFileSync(join(stateDir, SECRETS_FILE), "{isto não é json");

    /*
     * Lançar derrubaria o boot do daemon inteiro por causa de um arquivo de uma
     * feature opcional — e quem perdeu o cofre vai reescrever a chave, não
     * consertar JSON à mão.
     */
    expect(secrets.list()).toEqual([]);
    expect(secrets.read("linear")).toBeNull();
  });

  it("chave trocada devolve `null`, e não lixo", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "lin_api_segredo");
    writeFileSync(join(stateDir, SECRETS_KEY_FILE), Buffer.alloc(32, 7), { mode: 0o600 });

    /*
     * GCM **autentica**, e é por isso que ele foi escolhido: devolver o que
     * sobrou de uma decifragem quebrada seria mandar lixo como cabeçalho de
     * autenticação para um host de terceiro.
     */
    expect(secrets.read("linear")).toBeNull();
  });

  it("conteúdo adulterado não decifra", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "lin_api_segredo");
    const all = JSON.parse(readFileSync(join(stateDir, SECRETS_FILE), "utf8")) as Record<
      string,
      { value: string }
    >;
    all["linear"]!.value = Buffer.from("outra coisa").toString("base64");
    writeFileSync(join(stateDir, SECRETS_FILE), JSON.stringify(all));

    expect(secrets.read("linear")).toBeNull();
  });
});

describe("o que o ADR **não** promete", () => {
  it("quem lê os dois arquivos decifra, e isto está escrito de propósito", () => {
    const { stateDir, secrets } = store();
    secrets.write("linear", "lin_api_segredo");

    /*
     * **Este caso existe para não deixar a promessa virar folclore.** A chave
     * está ao lado do arquivo: quem já lê o seu `$HOME` como você reconstrói o
     * segredo — e é exatamente o que um segundo cofre construído aqui faz.
     *
     * A alternativa que fecha isto é o cofre do sistema operacional, e o estudo
     * mede o preço: o valor vai para o `argv` em três CLIs diferentes, ou entra
     * um terceiro módulo nativo, que quebra o *"só o par nativo por fora"* da
     * `014`.
     */
    const other = createSecretStore({ stateDir });
    expect(other.read("linear")).toBe("lin_api_segredo");
  });
});
