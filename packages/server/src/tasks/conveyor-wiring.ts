import { adapterById } from "@lumem/shared";
import { eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { agentConfig, project, worktree } from "../db/schema.js";
import type { PrCache } from "../pr/PrCache.js";
import { decide } from "../pr/verdict.js";
import { createAgentConfigRepository } from "../repositories/agentConfig.js";

import type { PrLike } from "./conveyor-ports.js";

/**
 * As duas costuras que a esteira precisa e que ninguém mais precisa
 * (`028` Parte 2, T26 e T28).
 *
 * Elas moram fora do `conveyor-ports.ts` porque as duas dependem de coisas que
 * a esteira não deveria conhecer — a tabela de configuração de agente e o cache
 * de PR —, e o arquivo de portas já é a fronteira. Aqui é a costura da costura.
 */

/**
 * A configuração de agente para este adaptador, criada na primeira vez.
 *
 * O catálogo do §5.1 fala em **adaptador** (`claude`, `codex`); o
 * `session.createAgent` pede uma `agent_config`, que é a linha que o rodapé da
 * sidebar mostra. A ponte é o nome: uma configuração por adaptador, com o nome
 * do adaptador.
 *
 * **Criada e não exigida** porque a esteira não pode depender de alguém ter
 * aberto uma conversa antes: um workspace novo com a autonomia ligada tem tarefa
 * e não tem configuração nenhuma, e recusar ali seria a esteira parando por
 * causa de uma linha que ela mesma sabe escrever.
 */
export async function configForAdapter(db: Db, adapterId: string): Promise<string> {
  const spec = adapterById(adapterId);
  if (spec === null) throw new Error(`adaptador desconhecido: ${adapterId}`);

  const existing = await db.query.agentConfig.findFirst({
    where: eq(agentConfig.name, spec.id),
  });
  if (existing) return existing.id;

  const created = await createAgentConfigRepository(db).create({
    name: spec.id,
    /*
     * O comando é o da `spec`, e quem o resolve de verdade é o
     * `adapterCommandForConfig` na hora do `spawn` — o
     * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)
     * tirou essa decisão desta coluna justamente porque ela envelhece. O que
     * fica aqui é o nome, não o caminho.
     */
    command: spec.command,
    transport: "acp",
    adapterVersion: spec.pinnedVersion,
  });
  return created.id;
}

/**
 * O veredito da PR **desta worktree**, ou `null`.
 *
 * `null` quer dizer *não há PR*, e é a resposta da maioria dos turnos. Nenhum
 * dos caminhos de falha vira exceção: o portão trata ausência como *não segura
 * nada*, e derrubar a passada da esteira porque o `gh` não está instalado seria
 * transformar uma metade opcional do portão num requisito.
 *
 * A consulta é **por projeto**, que é a decisão da [`013`]: oito worktrees
 * custam um processo, não oito. O que sobra aqui é achar, entre as PRs do
 * projeto, a que tem a branch deste checkout.
 */
export async function verdictOfWorktree(
  db: Db,
  pr: PrCache,
  worktreeId: string,
): Promise<PrLike> {
  try {
    const checkout = await db.query.worktree.findFirst({ where: eq(worktree.id, worktreeId) });
    if (!checkout) return null;
    const owner = await db.query.project.findFirst({ where: eq(project.id, checkout.projectId) });
    if (!owner) return null;

    const entry = await pr.get({
      id: owner.id,
      path: owner.path,
      remoteUrl: owner.remoteUrl,
    });
    const found = entry.snapshot?.pulls.find((pull) => pull.headRefName === checkout.branch);
    return found ? decide(found).verdict : null;
  } catch {
    return null;
  }
}
