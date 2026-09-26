import { mkdirSync, rmSync } from "node:fs";

import { adapterById, newId, type AdapterSpec } from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import { createAgentAccountRepository } from "../repositories/agentAccount.js";
import { configForAdapter, createAgentConfigRepository } from "../repositories/agentConfig.js";
import { accountDirFor, inheritInto, isInsideAgentsDir } from "../setup/account-connect.js";
import { agentAccountSecretId } from "../setup/adapter-command.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";

/**
 * As contas de cada agente (`034` T8): conectar, desconectar, apagar de vez, e
 * a conta padrão com o trio dela (emenda da Q1).
 *
 * Entrar numa conta **não** mora aqui: é o `setup.login`/`setup.authenticate`
 * com `accountId`, e quem diz que deu certo é o `setup.probe` da mesma conta —
 * conferido, não acreditado (`021`). É ele que a vira `connected`.
 *
 * **Apagar de vez** (Q8) é o segundo gesto, e ele leva junto as **conversas**
 * da conta: a linha de cada sessão sai numa transação com a conta — o
 * `session.agent_account_id` é `RESTRICT`, e é a contagem que a frase da tela
 * mostra que autoriza isso. O consumo fica (é histórico, sem estrangeiro), e a
 * transcrição do Lumem cai na manutenção do boot, que remove o que sobrou de um
 * purge. O diretório da conta — onde o Claude guarda as dele — sai por último.
 */

function specOf(adapterId: string): AdapterSpec {
  const spec = adapterById(adapterId);
  if (spec === null) {
    throw new DomainError("INVALID_ARGUMENT", `não existe adaptador "${adapterId}" no catálogo`);
  }
  return spec;
}

const accountIdInput = z.object({ accountId: z.string().trim().min(1) });

/**
 * Avisa a tela que as contas deste agente mudaram (`account.changed`). O agente
 * sai da configuração da conta — lido **antes** do gesto quando o gesto a apaga.
 */
async function adapterIdOfAccount(ctx: Context, accountId: string): Promise<string | null> {
  const account = await createAgentAccountRepository(ctx.db).get(accountId);
  if (!account) return null;
  const config = await createAgentConfigRepository(ctx.db).findById(account.agentConfigId);
  return config === undefined ? null : (adapterById(config.name)?.id ?? config.name);
}

/** Roda o gesto e avisa; o aviso sai só se o gesto não lançou. */
async function andTell<T>(ctx: Context, accountId: string, gesture: () => Promise<T>): Promise<T> {
  const adapterId = await adapterIdOfAccount(ctx, accountId);
  const result = await gesture();
  if (adapterId !== null) ctx.events.emit({ type: "account.changed", adapterId });
  return result;
}

export const agentAccountRouter = router({
  /** As contas por agente, com o que a tela de configuração desenha. */
  list: publicProcedure
    .input(z.object({ adapterId: z.string().trim().min(1).optional() }).optional())
    .query(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const accounts = createAgentAccountRepository(ctx.db);
        const configs = await createAgentConfigRepository(ctx.db).list();
        const readings = ctx.adapterCatalog.view();
        const rows = [];
        for (const config of configs) {
          const adapterId = adapterById(config.name)?.id ?? config.name;
          if (input?.adapterId !== undefined && input.adapterId !== adapterId) continue;
          for (const account of await accounts.listByConfig(config.id)) {
            rows.push({
              ...account,
              adapterId,
              isDefault: config.defaultAccountId === account.id,
              // A conta sem diretório é o login desta máquina: a tela a
              // distingue, e ela não se apaga de vez.
              bare: account.configDir === null,
              sessionCount: await accounts.sessionCount(account.id),
              /*
               * O modelo padrão não está na última lista que esta conta viu
               * (`034` T9, Q9) — derivado da leitura dela no catálogo, e não
               * guardado: a próxima lista que o traga de volta desfaz sozinha.
               * Sem leitura ainda, não há o que afirmar.
               */
              defaultsUnavailable: (() => {
                if (account.defaultModel === null) return false;
                const reading = readings.find((each) => each.accountId === account.id);
                const model = reading?.configOptions.find((option) => option.id === "model");
                if (model === undefined || model.choices.length === 0) return false;
                return !model.choices.some((choice) => choice.value === account.defaultModel);
              })(),
            });
          }
        }
        return rows;
      }),
    ),

  /**
   * Uma conta nova: o diretório, a herança da Q10, e o estado.
   *
   * **Assinatura** nasce `disconnected` — o login é do CLI, e só a conferência
   * diz que ele aconteceu. **Chave** nasce `connected` ao ser guardada: não há
   * leitura que confira uma chave sem gastar um turno — o `session/new` do
   * Codex aceita uma falsa (§3.3 do estudo) —, então a conta é o que ela diz ser
   * até o primeiro turno dizer o contrário.
   */
  connect: publicProcedure
    .input(
      z.object({
        adapterId: z.string().trim().min(1),
        label: z.string().trim().min(1).max(80),
        kind: z.enum(["subscription", "api_key"]),
        /** Atravessa o daemon para o cofre, e não volta em resposta nenhuma. */
        apiKey: z.string().min(1).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(async () => {
        const spec = specOf(input.adapterId);
        if (spec.accountEnv === null) {
          throw new DomainError("INVALID_ARGUMENT", `${spec.label} não tem mais de uma conta`);
        }
        if (input.kind === "api_key" && input.apiKey === undefined) {
          throw new DomainError("INVALID_ARGUMENT", "conta de chave precisa da chave");
        }

        const accounts = createAgentAccountRepository(ctx.db);
        const agentConfigId = await configForAdapter(ctx.db, spec.id);
        const id = newId();
        const configDir = accountDirFor(ctx.config.stateDir, spec.id, id);
        // A linha primeiro: um rótulo repetido recusa antes de haver diretório.
        const created = await accounts.create({
          id,
          agentConfigId,
          label: input.label,
          kind: input.kind,
          configDir,
          state: "disconnected",
        });

        let inherited;
        try {
          // Antes de qualquer processo: o Codex recusa um `CODEX_HOME` que não
          // existe (medido na T7).
          mkdirSync(configDir, { recursive: true, mode: 0o700 });
          inherited = inheritInto({ spec, home: ctx.config.homeDir, accountDir: configDir });
        } catch (error) {
          await accounts.purge(id);
          rmSync(configDir, { recursive: true, force: true });
          throw error;
        }

        if (input.kind === "api_key") {
          ctx.secrets.write(agentAccountSecretId(id), input.apiKey!);
          await accounts.markConnected(id);
        }

        const account = (await accounts.get(id)) ?? created;
        ctx.events.emit({ type: "account.changed", adapterId: spec.id });
        return { account, ...inherited };
      }),
    ),

  /** Guarda o diretório (Q8): as conversas continuam legíveis, e reconectar é entrar de novo. */
  disconnect: publicProcedure
    .input(accountIdInput)
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() =>
        andTell(ctx, input.accountId, () =>
          createAgentAccountRepository(ctx.db).disconnect(input.accountId),
        ),
      ),
    ),

  /**
   * Apaga de vez: a conta, as conversas dela, o diretório e a chave.
   *
   * Exige a contagem de conversas **na chamada**, a mesma da frase da tela: se
   * ela mudou entre ler e confirmar, a pessoa confirmou outra coisa.
   */
  purge: publicProcedure
    .input(accountIdInput.extend({ sessionCount: z.number().int().min(0) }))
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => andTell(ctx, input.accountId, async () => {
        const accounts = createAgentAccountRepository(ctx.db);
        const account = await accounts.get(input.accountId);
        if (!account) throw new DomainError("NOT_FOUND", `conta ${input.accountId} não existe`);

        // A sem diretório é o login desta máquina, e não do Lumem: o que ela
        // tem mora no `~/.claude` de verdade, e apagá-lo não é deste produto.
        if (account.configDir === null) {
          throw new DomainError(
            "BLOCKED",
            "a conta sem diretório próprio é o login desta máquina — o Lumem pode desconectá-la, mas não apagá-la",
          );
        }
        if (!isInsideAgentsDir(ctx.config.stateDir, account.configDir)) {
          throw new DomainError(
            "BLOCKED",
            `o diretório desta conta (${account.configDir}) não é um que o Lumem criou — nada foi apagado`,
          );
        }
        const actual = await accounts.sessionCount(account.id);
        if (actual !== input.sessionCount) {
          throw new DomainError(
            "BLOCKED",
            `esta conta tem ${actual} ${actual === 1 ? "conversa" : "conversas"}, e não ${input.sessionCount} — confira antes de apagar`,
          );
        }
        if (await accounts.hasRunningSession(account.id)) {
          throw new DomainError("BLOCKED", "há uma conversa aberta nesta conta — feche-a antes de apagar");
        }

        await accounts.purge(account.id);
        rmSync(account.configDir, { recursive: true, force: true });
        // Valor vazio apaga (o contrato do cofre).
        ctx.secrets.write(agentAccountSecretId(account.id), "");
      })),
    ),

  setDefault: publicProcedure
    .input(accountIdInput)
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() =>
        andTell(ctx, input.accountId, () =>
          createAgentAccountRepository(ctx.db).setDefault(input.accountId),
        ),
      ),
    ),

  /** O modelo e o effort em que uma conversa nova desta conta nasce (T9 aplica). */
  setDefaults: publicProcedure
    .input(
      accountIdInput.extend({
        model: z.string().trim().min(1).nullable(),
        effort: z.string().trim().min(1).nullable(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() =>
        andTell(ctx, input.accountId, () =>
          createAgentAccountRepository(ctx.db).setDefaults(input.accountId, {
            model: input.model,
            effort: input.effort,
          }),
        ),
      ),
    ),
});
