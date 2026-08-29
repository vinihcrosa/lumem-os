import { mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { DomainError } from "./errors.js";
import { cleanupGitFixtures, createRepo, tempDir } from "./testing/git-fixtures.js";
import {
  isInside,
  prepareCloneTarget,
  projectHome,
  repoDir,
  slugSegment,
  worktreeDir,
  worktreesDir,
} from "./workspace-layout.js";

afterEach(() => {
  cleanupGitFixtures();
});

const ROOT = "/estado/workspaces";

describe("a árvore", () => {
  it("põe o projeto debaixo do workspace", () => {
    expect(projectHome(ROOT, "pessoal", "api")).toBe("/estado/workspaces/pessoal/api");
  });

  it("põe o clone e as worktrees como irmãos, e nenhum engole o outro", () => {
    // D5. Se o clone fosse a raiz do `projectHome`, `worktrees/` cairia dentro
    // do repositório — e o `git status` dele passaria a ver toda worktree.
    const home = projectHome(ROOT, "pessoal", "api");

    expect(repoDir(home)).toBe("/estado/workspaces/pessoal/api/repo");
    expect(worktreesDir(home)).toBe("/estado/workspaces/pessoal/api/worktrees");
    expect(isInside(repoDir(home), worktreesDir(home))).toBe(false);
    expect(isInside(worktreesDir(home), repoDir(home))).toBe(false);
  });

  it("põe a worktree debaixo do projeto dela", () => {
    const home = projectHome(ROOT, "pessoal", "api");

    expect(worktreeDir(home, "feat-login")).toBe(
      "/estado/workspaces/pessoal/api/worktrees/feat-login",
    );
  });

  it("deixa um nome com barra aninhar, porque é branch e não acidente", () => {
    // `nameSchema` no router já recusou `..`, traço inicial e espaço. A barra
    // sobra de propósito: `feat/login` é nome de branch que se escreve à mão.
    expect(worktreeDir(projectHome(ROOT, "pessoal", "api"), "feat/login")).toBe(
      "/estado/workspaces/pessoal/api/worktrees/feat/login",
    );
  });

  it("recusa um nome que sairia do diretório do projeto", () => {
    // Contenção, não confiança: o `nameSchema` é a primeira porta, esta é a
    // segunda, e ela olha o resultado em vez da entrada.
    const home = projectHome(ROOT, "pessoal", "api");

    expect(() => worktreeDir(home, "../fora")).toThrow(DomainError);
    expect(() => worktreeDir(home, ".")).toThrow(DomainError);
  });

  it("calcula o mesmo caminho para projeto gerenciado e para registrado por caminho", () => {
    // A16: `projectHome` é função de (workspace, projeto) e não recebe
    // `managed`. Se recebesse, haveria dois cálculos de caminho, e as regras do
    // §4.4 valeriam para metade dos projetos. O projeto registrado por caminho
    // não tem `repo/` — o repositório dele mora onde o usuário o deixou — mas
    // tem `worktrees/` no mesmo lugar que o clonado teria.
    const clonado = projectHome(ROOT, "pessoal", "api");
    const registrado = projectHome(ROOT, "pessoal", "lorebase");

    expect(worktreeDir(clonado, "x")).toBe("/estado/workspaces/pessoal/api/worktrees/x");
    expect(worktreeDir(registrado, "x")).toBe(
      "/estado/workspaces/pessoal/lorebase/worktrees/x",
    );
  });
});

describe("slugSegment", () => {
  it("não deixa uma barra virar diretório", () => {
    // Nome de workspace e de projeto são texto livre que o usuário digita.
    expect(slugSegment("time/api", "projeto")).toBe("time-api");
    expect(projectHome(ROOT, "pessoal", "time/api")).toBe("/estado/workspaces/pessoal/time-api");
  });

  it("não deixa '..' virar fuga", () => {
    expect(slugSegment("..", "projeto")).toBe("projeto");
    expect(slugSegment("../../etc", "projeto")).toBe("etc");
    // O que garante a segurança não é o resultado ser bonito: é ele ser um
    // segmento só, e não uma instrução.
    expect(slugSegment("a/../b", "projeto")).not.toContain("/");
  });

  it("não deixa '.' virar o próprio diretório", () => {
    expect(slugSegment(".", "projeto")).toBe("projeto");
  });

  it("não deixa um nome começar com ponto", () => {
    // Um projeto chamado `.git` daria `<workspacesDir>/<workspace>/.git`, e o
    // diretório do workspace passaria a responder como repositório — o que faria
    // a D4 recusar todos os projetos dele.
    expect(slugSegment(".git", "projeto")).toBe("git");
    expect(slugSegment(".oculto", "projeto")).toBe("oculto");
  });

  it("dobra acento em vez de trocar por traço", () => {
    expect(slugSegment("café com leite", "projeto")).toBe("cafe-com-leite");
  });

  it("cai no fallback quando não sobra nada", () => {
    expect(slugSegment("", "projeto")).toBe("projeto");
    expect(slugSegment("///", "workspace")).toBe("workspace");
  });

  it("mantém o que já é um nome de diretório", () => {
    expect(slugSegment("lumem-os", "projeto")).toBe("lumem-os");
    expect(slugSegment("api.v2_final", "projeto")).toBe("api.v2_final");
  });
});

describe("prepareCloneTarget", () => {
  /** Um `workspacesDir` de verdade, com um destino ainda inexistente dentro. */
  async function targetIn(root: string, name = "api"): Promise<string> {
    return join(await realpath(root), "pessoal", name, "repo");
  }

  it("cria o pai que falta e devolve o caminho real", async () => {
    // D3. O primeiro projeto de um workspace sempre encontra o diretório dele
    // ausente, então criar faz parte do caminho feliz.
    const root = tempDir("lumem-ws-");
    const target = await targetIn(root);

    const resolved = await prepareCloneTarget(target, { workspacesDir: root });

    expect(resolved).toBe(target);
    expect(await readdir(join(await realpath(root), "pessoal"))).toEqual(["api"]);
  });

  it("aceita um destino que existe e está vazio", async () => {
    const root = tempDir("lumem-ws-");
    const target = await targetIn(root);
    mkdirSync(target, { recursive: true });

    await expect(prepareCloneTarget(target, { workspacesDir: root })).resolves.toBe(target);
  });

  it("recusa um destino que tem coisa dentro", async () => {
    // D2. `git clone` recusaria sozinho — depois de abrir conexão e autenticar.
    const root = tempDir("lumem-ws-");
    const target = await targetIn(root);
    mkdirSync(target, { recursive: true });
    writeFileSync(join(target, "sobra.txt"), "de um clone anterior\n");

    await expect(prepareCloneTarget(target, { workspacesDir: root })).rejects.toThrow(
      /tem 1 item/,
    );
  });

  it("recusa um destino que é link simbólico", async () => {
    // Um link que passa num `stat` de diretório vazio seria seguido por tudo
    // que vem depois — inclusive pelo que apaga.
    const root = tempDir("lumem-ws-");
    const target = await targetIn(root);
    const fora = tempDir("lumem-fora-");
    mkdirSync(join(await realpath(root), "pessoal", "api"), { recursive: true });
    symlinkSync(fora, target);

    await expect(prepareCloneTarget(target, { workspacesDir: root })).rejects.toThrow(
      /link simbólico/,
    );
  });

  it("recusa quando o pai aponta para fora da árvore", async () => {
    // D6. O `realpath` vem antes de qualquer outra leitura do caminho.
    const root = await realpath(tempDir("lumem-ws-"));
    const fora = await realpath(tempDir("lumem-fora-"));
    mkdirSync(join(root, "pessoal"), { recursive: true });
    symlinkSync(fora, join(root, "pessoal", "api"));

    await expect(
      prepareCloneTarget(join(root, "pessoal", "api", "repo"), { workspacesDir: root }),
    ).rejects.toThrow(/aponta para fora/);
  });

  it("recusa quando o pai existe e não é diretório", async () => {
    const root = await realpath(tempDir("lumem-ws-"));
    mkdirSync(join(root, "pessoal"), { recursive: true });
    writeFileSync(join(root, "pessoal", "api"), "sou um arquivo\n");

    await expect(
      prepareCloneTarget(join(root, "pessoal", "api", "repo"), { workspacesDir: root }),
    ).rejects.toThrow(/não é um diretório/);
  });

  it("recusa um destino dentro de um repositório que já existe", async () => {
    // D4. Perguntado ao git, e não procurando `.git` na mão: o `.git` de uma
    // worktree é um arquivo, e o de um submódulo é um ponteiro.
    const repo = await realpath(await createRepo());

    await expect(
      prepareCloneTarget(join(repo, "pessoal", "api", "repo"), { workspacesDir: repo }),
    ).rejects.toThrow(/está dentro do repositório/);
  });

  it("recusa um destino relativo", async () => {
    // D1. Aqui isso significa defeito de quem chamou, não entrada ruim — e é
    // por isso que vale pegar antes de um diretório nascer dele.
    await expect(
      prepareCloneTarget("workspaces/pessoal/api/repo", { workspacesDir: "/estado" }),
    ).rejects.toBeInstanceOf(DomainError);
  });
});
