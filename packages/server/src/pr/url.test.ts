import { describe, expect, it } from "vitest";

import { compareUrl, safeUrl } from "./url.js";

/**
 * A validação de URL, que é a regra do §4.6 do PRD.
 *
 * Uma pull request pode conter link para qualquer lugar — corpo, comentário,
 * `detailsUrl` de um app de terceiro. O `↗` do Lumem só leva ao host de onde o
 * dado veio, e o que uma URL recusada produz é uma **linha sem link**, não uma
 * exceção.
 */

const HOST = "github.com";

describe("safeUrl", () => {
  it("aceita https do mesmo host", () => {
    expect(safeUrl("https://github.com/exemplo/repo/pull/19", HOST)).toBe(
      "https://github.com/exemplo/repo/pull/19",
    );
  });

  it("recusa outro host, mesmo em https", () => {
    // O caso normal, e não o ataque: um check do Vercel aponta para
    // `vercel.com`. A linha aparece sem `↗`, e a tela diz por quê.
    expect(safeUrl("https://vercel.com/exemplo/deploy/1", HOST)).toBeNull();
  });

  it("recusa um host que só *parece* o certo", () => {
    expect(safeUrl("https://github.com.evil.example/x", HOST)).toBeNull();
    expect(safeUrl("https://notgithub.com/x", HOST)).toBeNull();
  });

  it.each(["http://github.com/x", "javascript:alert(1)", "data:text/html,x", "file:///etc/passwd"])(
    "recusa %s",
    (candidate) => {
      expect(safeUrl(candidate, HOST)).toBeNull();
    },
  );

  it("recusa URL com credencial embutida", () => {
    // Credencial num `href` é exatamente o que ninguém quer ver num histórico
    // de navegador.
    expect(safeUrl("https://joao:s3nh4@github.com/x", HOST)).toBeNull();
  });

  it("recusa lixo, vazio e ausência sem explodir", () => {
    expect(safeUrl("não é url", HOST)).toBeNull();
    expect(safeUrl("", HOST)).toBeNull();
    expect(safeUrl(null, HOST)).toBeNull();
    expect(safeUrl(undefined, HOST)).toBeNull();
  });

  it("sem host conhecido, nada vira link", () => {
    expect(safeUrl("https://github.com/x", null)).toBeNull();
  });

  it("compara o host sem ligar para a caixa", () => {
    expect(safeUrl("https://GitHub.com/x", HOST)).not.toBeNull();
  });
});

describe("compareUrl", () => {
  it("monta a tela de comparação a partir do host, da base e da head", () => {
    expect(compareUrl({ host: HOST, repo: "exemplo/repo", base: "main", head: "pr-bar" })).toBe(
      "https://github.com/exemplo/repo/compare/main...pr-bar?expand=1",
    );
  });

  it("escapa o que um nome de branch aceita e uma URL não", () => {
    // `feat/algo` é o nome de branch mais comum que existe, e a barra dentro
    // dele é ilegítima como separador de compare. Funciona com todo nome que
    // alguém testou à mão, e quebra com o primeiro que ninguém testou.
    expect(
      compareUrl({ host: HOST, repo: "exemplo/repo", base: "main", head: "feat/algo#12" }),
    ).toBe("https://github.com/exemplo/repo/compare/main...feat%2Falgo%2312?expand=1");
  });

  it("não compara uma branch com ela mesma", () => {
    expect(compareUrl({ host: HOST, repo: "exemplo/repo", base: "main", head: "main" })).toBeNull();
  });

  it("sem host, sem repo ou sem ref não há o que montar", () => {
    expect(compareUrl({ host: null, repo: "exemplo/repo", base: "main", head: "x" })).toBeNull();
    expect(compareUrl({ host: HOST, repo: "", base: "main", head: "x" })).toBeNull();
    expect(compareUrl({ host: HOST, repo: "exemplo/repo", base: "", head: "x" })).toBeNull();
  });

  it("passa pela mesma porta que o resto", () => {
    // A URL que o daemon monta obedece a mesma regra que a URL que ele recebeu.
    // Um `repo` estranho vindo do `gh` não sai daqui como link só porque fomos
    // nós que concatenamos.
    expect(
      compareUrl({ host: HOST, repo: "..@outro.example/x", base: "main", head: "y" }),
    ).toBeNull();
  });
});
