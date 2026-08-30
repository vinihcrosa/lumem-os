import { describe, expect, it } from "vitest";

import { planClone, tempCloneDir } from "./clone-plan.js";

const BASE = { workspacesDir: "/estado/workspaces", workspaceName: "pessoal", home: "/Users/vc" };

describe("o que foi colado", () => {
  it("reconhece caminho absoluto como caminho", () => {
    expect(planClone({ ...BASE, source: "/Users/vc/GitHub/lorebase" })).toEqual({
      kind: "path",
      path: "/Users/vc/GitHub/lorebase",
    });
  });

  it("expande o ~ na casa do daemon", () => {
    // Q18: o disco que importa é o do servidor, que pode ser outra máquina. O
    // `↳` mostra o caminho já expandido, e é isso que evita o mal-entendido.
    expect(planClone({ ...BASE, source: "~/GitHub/lorebase" })).toEqual({
      kind: "path",
      path: "/Users/vc/GitHub/lorebase",
    });
  });

  it("reconhece o resto como URL", () => {
    const plan = planClone({ ...BASE, source: "git@gitlab.com:time/api.git" });

    expect(plan).toMatchObject({ kind: "url", scheme: "ssh", name: "api" });
  });

  it("devolve a recusa com a regra que falhou, e não um booleano", () => {
    expect(planClone({ ...BASE, source: "ext::sh -c id" })).toMatchObject({
      kind: "refused",
      rule: "scheme",
    });
  });
});

describe("o destino", () => {
  it("é calculado, e cai debaixo do workspace", () => {
    // Q14: não há campo de destino. O caminho é resposta, não pergunta.
    expect(planClone({ ...BASE, source: "https://github.com/org/api.git" })).toMatchObject({
      home: "/estado/workspaces/pessoal/api",
      targetPath: "/estado/workspaces/pessoal/api/repo",
    });
  });

  it("anda junto com o nome, porque os dois são a mesma decisão", () => {
    // F6.3. Se o destino não mudasse com o nome, a tela estaria mentindo sobre
    // onde os bytes vão cair.
    const plan = planClone({
      ...BASE,
      source: "https://github.com/org/api.git",
      name: "api-do-cliente",
    });

    expect(plan).toMatchObject({
      name: "api-do-cliente",
      targetPath: "/estado/workspaces/pessoal/api-do-cliente/repo",
    });
  });

  it("ignora um nome vazio e volta ao do repositório", () => {
    expect(planClone({ ...BASE, source: "https://github.com/org/api.git", name: "  " })).toMatchObject(
      { name: "api" },
    );
  });

  it("põe o temporário como irmão do destino, no mesmo filesystem", () => {
    // D4: irmão para o `rename` final ser atômico, e com prefixo previsível
    // para a varredura de boot reconhecê-lo sem depender de nenhum job.
    expect(tempCloneDir("/estado/workspaces/pessoal/api/repo", "j1")).toBe(
      "/estado/workspaces/pessoal/api/.lumem-clone-j1",
    );
  });
});

describe("o que a linha ↳ precisa dizer", () => {
  it("marca http como sem TLS", () => {
    expect(planClone({ ...BASE, source: "http://git.interno/time/api.git" })).toMatchObject({
      insecure: true,
    });
  });

  it("não deixa a credencial chegar ao que a tela mostra", () => {
    const plan = planClone({ ...BASE, source: "https://u:s3cr3t@github.com/org/api.git" });

    expect(JSON.stringify(plan)).not.toContain("s3cr3t");
  });
});
