import { DEFAULT_ADAPTER_ID, adapterById, newId } from "@lumem/shared";
import { and, eq, or } from "drizzle-orm";

import type { Db } from "../db/index.js";
import {
  namedAgent,
  roleBinding,
  task,
  type NamedAgentRow,
} from "../db/schema.js";
import { DomainError } from "../errors.js";
import { withConstraints } from "../repositories/base.js";

/**
 * O catálogo de agentes nomeados, e a cascata que resolve o encaixe
 * (`028` §5.1, Parte 2 — T23).
 *
 * **Encaixe não é agente.** O papel — `implementador`, `revisor`, `testador` —
 * é um buraco no desenho da esteira; quem o preenche é um agente que **você**
 * nomeia e configura, com granularidade de projeto. Um `revisor-severo` no
 * `acme-api` e um `revisor-rapido` no `acme-web` são configuração, não código.
 *
 * **E agente não é adaptador.** O agente aponta para um `AdapterSpec` da
 * [`021`](../../../../docs/features/021-second-agent/prd.md) — que é por onde
 * ele *fala* —, e a distinção custou uma palavra na tela
 * ([Q35](../../../../docs/features/028-autonomous-orchestration/open-questions.md)).
 */

/** Os três encaixes do §5.1, e são três de propósito: um quarto é uma coluna. */
export const ROLES = ["implementador", "revisor", "testador"] as const;
export type Role = (typeof ROLES)[number];

export type BindingScope = "workspace" | "project" | "task";

/**
 * Os quatro degraus, do mais específico para o mais genérico.
 *
 * A ordem **é** a regra, e escrevê-la como um array em vez de uma sequência de
 * `??` é o que permite testar *"o terceiro degrau ganha quando os dois de cima
 * estão vazios"* sem reescrever a função.
 */
export const CASCADE: readonly BindingScope[] = ["task", "project", "workspace"];

export interface ResolvedAgent {
  /** `null` quando ninguém configurou nada e o default respondeu. */
  agent: NamedAgentRow | null;
  /** De que degrau veio — `default` é a ausência, e ela tem nome. */
  from: BindingScope | "default";
  /** O `AdapterSpec.id` a usar. Sempre presente: o default garante isso. */
  adapter: string;
  /** `null` é *o que o adaptador escolher*. */
  model: string | null;
  instructions: string;
}

/**
 * O degrau que ganha, dada a tabela de quem respondeu cada um.
 *
 * **Função pura**, e é aqui que a cascata mora inteira. O I/O — quatro leituras
 * — fica do lado de fora, o que faz *"o projeto ganha do workspace"* ser
 * testável sem banco.
 */
export function resolveFromBindings(
  bound: Partial<Record<BindingScope, NamedAgentRow>>,
): ResolvedAgent {
  for (const scope of CASCADE) {
    const agent = bound[scope];
    if (agent) {
      return {
        agent,
        from: scope,
        adapter: agent.adapter,
        model: agent.model,
        instructions: agent.instructions,
      };
    }
  }

  /*
   * O quarto degrau, e ele **não** está no banco.
   *
   * Guardar o default seria guardar a ausência: toda instalação nasceria com
   * três linhas dizendo o que já está escrito no código, e mudar o default do
   * produto deixaria de mudar o comportamento de quem nunca configurou nada.
   */
  return {
    agent: null,
    from: "default",
    adapter: DEFAULT_ADAPTER_ID,
    model: null,
    instructions: "",
  };
}

export interface AgentCatalog {
  create(input: {
    workspaceId: string;
    name: string;
    adapter: string;
    model?: string | null;
    instructions?: string;
  }): Promise<NamedAgentRow>;
  listByWorkspace(workspaceId: string): Promise<NamedAgentRow[]>;
  bind(input: {
    scopeType: BindingScope;
    scopeId: string;
    role: Role;
    agentId: string;
  }): Promise<void>;
  unbind(input: { scopeType: BindingScope; scopeId: string; role: Role }): Promise<void>;
  /** Quem faz este papel nesta tarefa, subindo a cascata até o default. */
  resolve(input: { taskId: string; role: Role }): Promise<ResolvedAgent>;
}

export function createAgentCatalog(db: Db): AgentCatalog {
  return {
    async create({ workspaceId, name, adapter, model = null, instructions = "" }) {
      /*
       * O adaptador é validado **aqui**, e não por estrangeiro: o catálogo
       * `ADAPTERS` é código do bundle, não tabela. Sem esta linha, um agente
       * apontando para `gpt` seria aceito e só falharia no `spawn`, longe de
       * quem o criou.
       */
      if (adapterById(adapter) === null) {
        throw new DomainError("INVALID_ARGUMENT", `adaptador desconhecido: ${adapter}`);
      }
      const trimmed = name.trim();
      if (trimmed === "") throw new DomainError("INVALID_ARGUMENT", "o agente precisa de nome");

      const [row] = await withConstraints(
        () =>
          db
            .insert(namedAgent)
            .values({ id: newId(), workspaceId, name: trimmed, adapter, model, instructions })
            .returning(),
        {
          "unique:named_agent.workspace_id,named_agent.name": {
            code: "DUPLICATE",
            message: `já existe um agente chamado "${trimmed}" neste workspace`,
          },
          foreignKey: { code: "NOT_FOUND", message: "o workspace não existe" },
        },
      );
      return row!;
    },

    async listByWorkspace(workspaceId) {
      return db
        .select()
        .from(namedAgent)
        .where(eq(namedAgent.workspaceId, workspaceId))
        .orderBy(namedAgent.name)
        .all();
    },

    async bind({ scopeType, scopeId, role, agentId }) {
      /*
       * Um papel por escopo, e reamarrar é **substituir** e não empilhar. O
       * índice único recusaria a segunda linha; tratá-la como erro obrigaria
       * quem chama a desamarrar antes, o que é duas escritas para um gesto que
       * é um.
       */
      await db
        .delete(roleBinding)
        .where(
          and(
            eq(roleBinding.scopeType, scopeType),
            eq(roleBinding.scopeId, scopeId),
            eq(roleBinding.role, role),
          ),
        );
      await withConstraints(
        async () => {
          db.insert(roleBinding).values({ id: newId(), scopeType, scopeId, role, agentId }).run();
        },
        { foreignKey: { code: "NOT_FOUND", message: `agente ${agentId} não existe` } },
      );
    },

    async unbind({ scopeType, scopeId, role }) {
      await db
        .delete(roleBinding)
        .where(
          and(
            eq(roleBinding.scopeType, scopeType),
            eq(roleBinding.scopeId, scopeId),
            eq(roleBinding.role, role),
          ),
        );
    },

    async resolve({ taskId, role }) {
      const target = await db.query.task.findFirst({ where: eq(task.id, taskId) });
      if (!target) throw new DomainError("NOT_FOUND", `tarefa ${taskId} não existe`);

      /*
       * **Uma consulta para os três degraus**, e não três.
       *
       * A alternativa óbvia — perguntar tarefa, depois projeto, depois
       * workspace, parando no primeiro que responde — é mais barata no caso em
       * que a tarefa tem amarração, e mais cara em **todos** os outros. O caso
       * comum é ninguém ter configurado nada, que é três viagens para três
       * vazios.
       */
      const rows = await db
        .select({ scopeType: roleBinding.scopeType, agent: namedAgent })
        .from(roleBinding)
        .innerJoin(namedAgent, eq(namedAgent.id, roleBinding.agentId))
        .where(
          and(
            eq(roleBinding.role, role),
            or(
              and(eq(roleBinding.scopeType, "task"), eq(roleBinding.scopeId, taskId)),
              and(eq(roleBinding.scopeType, "project"), eq(roleBinding.scopeId, target.projectId)),
              and(
                eq(roleBinding.scopeType, "workspace"),
                eq(roleBinding.scopeId, target.workspaceId),
              ),
            ),
          ),
        )
        .all();

      const bound: Partial<Record<BindingScope, NamedAgentRow>> = {};
      for (const row of rows) bound[row.scopeType as BindingScope] = row.agent;

      return resolveFromBindings(bound);
    },
  };
}
