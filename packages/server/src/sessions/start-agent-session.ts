import { adapterById } from "@lumem/shared";
import { eq } from "drizzle-orm";

import { isCommandAvailable } from "../agents/availability.js";
import { session, type AgentConfigRow, type SessionRow } from "../db/schema.js";
import { DomainError } from "../errors.js";
import { configForAdapter, createAgentConfigRepository } from "../repositories/agentConfig.js";
import { createSessionRepository } from "../repositories/session.js";
import { createTaskRepository } from "../repositories/task.js";
import { resolveScope, type ScopeType } from "../scope.js";
import { adapterCommandFor, adapterCommandForConfig } from "../setup/adapter-command.js";
import type { Context } from "../trpc.js";

/**
 * Abrir uma conversa de agente, fora de qualquer procedure (`033` §3.2).
 *
 * Mora aqui, e não no router, porque tem dois chamadores com entradas
 * diferentes: o `session.createAgent`, que é a tela pedindo uma conversa, e o
 * `worktree.start` (T12), que cria a worktree e abre o agente nela no mesmo
 * gesto. Os dois chegam com os valores **já validados** — o que é regra de
 * formato (exatamente um entre configuração e adaptador) é do `zod` de quem
 * chama; o que é regra de domínio mora aqui, para valer igual nos dois.
 */

/** Quem sobe: uma configuração que já existe, ou o adaptador do catálogo. */
export type AgentChoice = { agentConfigId: string } | { adapterId: string };

export type TaskRole = "implementador" | "revisor" | "testador";

export interface StartAgentSessionInput {
  scopeType: ScopeType;
  scopeId: string;
  agent: AgentChoice;
  /**
   * `optionId → valor`, aplicado **antes** de devolver.
   *
   * `mode` primeiro e o resto na ordem do objeto: a troca de modelo responde
   * com o conjunto inteiro de opções, e no Claude esse conjunto não traz o modo
   * — que vem de `modes` —, então validar o modo depois do modelo o procuraria
   * numa lista que já não o tem.
   */
  config?: Readonly<Record<string, string>>;
  taskId?: string;
  taskRole?: TaskRole;
  /** Só o daemon liga — conferido aqui, e não em quem chama. */
  autonomous?: boolean;
  cols?: number;
  rows?: number;
}

const MODE_OPTION = "mode";

export async function startAgentSession(
  ctx: Context,
  input: StartAgentSessionInput,
): Promise<SessionRow> {
  /*
   * O `autonomous` é do daemon, e a conferência é aqui.
   *
   * Não é autenticação — o produto é local e toda procedure é pública —, e é o
   * que separa a porta que a esteira usa da porta que a tela usa: a tela
   * **nunca** abre uma conversa que nasce liberada. Aqui e não no router porque
   * esta função tem mais de um chamador, e um portão que só um deles confere é
   * um portão que o outro contorna.
   */
  if ((input.autonomous === true || input.taskRole !== undefined) && ctx.internal !== true) {
    throw new DomainError(
      "BLOCKED",
      "só a esteira abre uma sessão que nasce sem quem responda permissão",
    );
  }

  const config = await resolveConfig(ctx, input.agent);
  /*
   * Aposentada é legado sem acesso (`033` Q3), e a recusa é aqui, antes de
   * resolver o que lançar.
   *
   * A linha continua no banco porque a sessão de ontem aponta para ela (a FK
   * é `restrict`) e a lista do checkout precisa do nome. O que ela não faz
   * mais é subir processo: era um agente num PTY, e o [ADR de
   * 2026-09-24](../../../../docs/adr/2026-09-24-1620-agent-is-always-acp.md)
   * fechou esse caminho. Sem a recusa, a `claude-code` com `command:
   * "claude"` chegaria ao handshake ACP contra um CLI que não fala ACP.
   */
  if (config.retiredAt !== null) {
    throw new DomainError(
      "BLOCKED",
      "esta configuração rodava o agente num terminal (PTY), e o Lumem não roda mais agente assim",
    );
  }

  /*
   * O que lançar, resolvido **agora** e não lido da coluna.
   *
   * A `agent_config.command` guarda o caminho absoluto que alguém resolveu no
   * dia em que a linha nasceu, e o router não tem `update`: nesta máquina, uma
   * linha de 2026-08-30 apontava para o `claude-agent-acp` global — `0.40.0` —
   * enquanto o pino dizia `0.75.1`, e nenhuma instalação gerenciada correta
   * teria desalojado ela. Quem decide é a spec. [ADR de
   * 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md).
   */
  const command = adapterCommandForConfig(config, ctx.config.stateDir);

  // F6.5: refused before the spawn. Afterwards, a missing binary reads as
  // the agent crashing rather than as not being installed.
  //
  // Uma frase só, e ela fala de arquivo: o `adapterCommandForConfig` só
  // devolve caminho absoluto — um nome nu seria o PATH escolhendo, e ele já
  // o recusou —, então "não está no PATH" deixou de ter sobre o que falar.
  if (!isCommandAvailable(command)) {
    throw new DomainError(
      "BLOCKED",
      `"${command}" não é executável; a configuração "${config.name}" está indisponível`,
    );
  }

  // Project scope is allowed on purpose (F5.2, decision WS-Q15): asking
  // an agent about the repository does not need a branch.
  const { cwd } = await resolveScope(ctx, input.scopeType, input.scopeId);

  const started = await ctx.sessionStore.start({
    kind: "agent",
    agentConfigId: config.id,
    scopeType: input.scopeType,
    scopeId: input.scopeId,
    cwd,
    command,
    args: config.args,
    // F5.5: the daemon's environment plus what the configuration declares.
    env: config.env,
    adapterVersion: config.adapterVersion,
    // Nasce liberada só quando quem chamou disse que não há ninguém do
    // outro lado. O default é `false`, então toda conversa que a tela
    // abre continua herdando o workspace — e nenhum workspace é `free`.
    // Duas coisas, e são duas de propósito: a política com que ela nasce
    // (não há ninguém para responder permissão) e **quem a empurra**, que
    // é o que faz o teto do workspace parar em vez de avisar (Q45).
    ...(input.autonomous === true
      ? { lumemMode: "free" as const, driver: "conveyor" as const }
      : {}),
    ...(input.cols === undefined ? {} : { cols: input.cols }),
    ...(input.rows === undefined ? {} : { rows: input.rows }),
  });

  let row = started;
  if (input.config !== undefined && Object.keys(input.config).length > 0) {
    row = await applyConfigOrClose(ctx, started, input.config, labelOf(config));
  }

  /*
   * A ligação com a tarefa é escrita **depois** do spawn — e depois da
   * configuração —, e é de propósito.
   *
   * Uma linha com `task_id` de uma sessão que não chegou a existir seria a
   * tarefa dizendo que alguém trabalhou nela quando ninguém trabalhou — e
   * `in_progress` é derivado justamente daqui. O `start` é quem pode
   * falhar; a coluna não.
   */
  if (input.taskId !== undefined) {
    await ctx.db
      .update(session)
      .set({
        taskId: input.taskId,
        ...(input.taskRole === undefined ? {} : { taskRole: input.taskRole }),
      })
      .where(eq(session.id, row.id));
    const linked = await createTaskRepository(ctx.db).get(input.taskId);
    if (linked) ctx.events.emit({ type: "task.changed", workspaceId: linked.workspaceId });
  }

  ctx.events.emit({ type: "session.changed", scopeType: input.scopeType, scopeId: input.scopeId });
  return row;
}

/**
 * A configuração de quem sobe.
 *
 * Pelo adaptador, a instalação é conferida **antes** de achar-ou-criar a
 * configuração: um adaptador que não está no disco não deixa uma linha de
 * `agent_config` para trás — ela apareceria no rodapé como um agente que
 * existe.
 */
async function resolveConfig(ctx: Context, agent: AgentChoice): Promise<AgentConfigRow> {
  const configs = createAgentConfigRepository(ctx.db);
  if ("agentConfigId" in agent) {
    const found = await configs.findById(agent.agentConfigId);
    if (!found) throw new DomainError("NOT_FOUND", `configuração ${agent.agentConfigId} não existe`);
    return found;
  }

  const spec = adapterById(agent.adapterId);
  if (spec === null) {
    throw new DomainError("INVALID_ARGUMENT", `adaptador desconhecido: ${agent.adapterId}`);
  }
  // Lança `NOT_FOUND` com o pino na frase quando a cópia gerenciada não existe.
  adapterCommandFor(spec, ctx.config.stateDir);
  const id = await configForAdapter(ctx.db, spec.id);
  return (await configs.findById(id))!;
}

/** O nome que a frase de recusa usa: o do catálogo, ou o da configuração. */
function labelOf(config: AgentConfigRow): string {
  return adapterById(config.name)?.label ?? config.name;
}

/**
 * Aplica o que foi pedido, ou fecha a sessão e recusa — nunca a meio caminho.
 *
 * O valor pedido é conferido contra o que **esta** sessão oferece, e não
 * contra o catálogo: o catálogo é cache, e o handshake que acabou de acontecer
 * é a resposta de hoje. Conferir aqui, em vez de esperar a recusa do
 * adaptador, é o que faz a frase não depender dele: o `setConfig` só lança
 * `NOT_FOUND` para **opção** desconhecida, e um valor desconhecido o adaptador
 * responde como quiser.
 *
 * Falhou, fecha. Uma sessão que nasce calada no modelo padrão quando se pediu
 * outro é a pessoa gastando no modelo que não escolheu sem saber; e como o
 * `start` já gravou as opções novas no catálogo, a pílula se corrige sozinha.
 */
async function applyConfigOrClose(
  ctx: Context,
  row: SessionRow,
  config: Readonly<Record<string, string>>,
  label: string,
): Promise<SessionRow> {
  try {
    for (const [optionId, value] of orderedEntries(config)) {
      await applyOption(ctx, row.id, optionId, value, label);
    }
  } catch (error) {
    await ctx.sessionStore.close(row.id);
    throw error;
  }

  /*
   * A linha segue o manager **antes** de devolver.
   *
   * O `watchConfig` do `trackExits` também grava, num `void`. Hoje ele termina
   * antes da releitura abaixo porque o driver do SQLite é síncrono — medido:
   * tirar esta escrita não derruba teste nenhum —, e isso é detalhe do
   * driver, não contrato. Sem ela, a resposta e a linha poderiam dizer o
   * modelo do handshake enquanto a sessão já roda no pedido, e reabrir a aba
   * lê da linha.
   */
  const live = ctx.acpManager.get(row.id);
  if (live) {
    await createSessionRepository(ctx.db).setConfig(row.id, { mode: live.mode, model: live.model });
  }
  return (await ctx.sessionStore.findById(row.id)) ?? row;
}

/** `mode` primeiro, o resto na ordem em que veio. */
function orderedEntries(config: Readonly<Record<string, string>>): [string, string][] {
  const entries = Object.entries(config);
  const mode = entries.filter(([optionId]) => optionId === MODE_OPTION);
  const rest = entries.filter(([optionId]) => optionId !== MODE_OPTION);
  return [...mode, ...rest];
}

async function applyOption(
  ctx: Context,
  sessionId: string,
  optionId: string,
  value: string,
  label: string,
): Promise<void> {
  const option = ctx.acpManager.get(sessionId)?.configOptions.find((each) => each.id === optionId);
  if (option === undefined) throw refused(label, `a opção "${optionId}"`);
  if (option.currentValue === value) return;

  // Uma opção sem lista de valores (a booleana) não tem o que conferir aqui.
  const offered =
    option.choices.length === 0 || option.choices.some((choice) => choice.value === value);
  if (!offered) throw refused(label, `"${value}" em ${option.name}`);

  try {
    await ctx.acpManager.setConfig(sessionId, optionId, value);
  } catch (error) {
    if (error instanceof DomainError && error.code === "NOT_FOUND") {
      throw refused(label, `a opção "${optionId}"`);
    }
    throw error;
  }
}

function refused(label: string, what: string): DomainError {
  return new DomainError("INVALID_ARGUMENT", `o ${label} não oferece mais ${what} — escolha de novo`);
}
