import { PROTOCOL_VERSION } from "@lumem/shared";
import { z } from "zod";

import { DomainError } from "../errors.js";
import { AUTO_UPDATE_VALUES, createDaemonSettingsRepository } from "../repositories/daemonSettings.js";
import { domainSafeAsync, publicProcedure, router, type Context } from "../trpc.js";
import { busyNow, isIdle } from "../update/idle.js";

/**
 * O Lumem falando dele mesmo (`038`): a versão, se há uma nova, e o gesto de
 * atualizar.
 *
 * Fina de propósito: quem decide é `update/`. Aqui só há o **contrato** — os
 * campos, e qual recusa é qual código: `CONFLICT` para o que passa se esperar
 * (turno em voo, instalação em curso), `PRECONDITION_FAILED` para o que não passa
 * nunca (sem supervisor, sem versão nova).
 */

function settingsOf(ctx: Context) {
  return {
    ...createDaemonSettingsRepository(ctx.db).get(),
    updateCheckForcedOff: ctx.config.noUpdateCheck,
  };
}

export const systemRouter = router({
  /** O que a topbar e a tela de configurações leem para desenhar o banner. */
  updateStatus: publicProcedure.query(({ ctx }) => {
    const { latest, checkedAt } = ctx.update.check.last();
    return {
      current: ctx.update.current,
      latest,
      // ISO, e não `Date`: o tRPC daqui não tem transformador, e um `Date` chegaria
      // ao cliente como texto com o tipo mentindo.
      checkedAt: checkedAt === null ? null : checkedAt.toISOString(),
      updateAvailable: ctx.update.updateAvailable(),
      supervised: ctx.config.supervised,
      checkEnabled: ctx.update.checkEnabled(),
      autoUpdate: createDaemonSettingsRepository(ctx.db).get().autoUpdate,
      lastError: ctx.update.installer.lastError(),
    };
  }),

  /**
   * O resumo barato que a casca de desktop pergunta a cada 10 s (`038`, Parte 3): o que
   * decide a imagem do ícone e o menu, e nada que custe uma consulta ao banco.
   *
   * `attention` é só o pedido de permissão pendente: é o único estado em que um agente
   * parado espera uma pessoa, e uma tarefa bloqueada já tem o quadro.
   */
  status: publicProcedure.query(({ ctx }) => ({
    version: ctx.update.current,
    protocolVersion: PROTOCOL_VERSION,
    supervised: ctx.config.supervised,
    updateAvailable: ctx.update.updateAvailable(),
    liveTurns: ctx.acpManager.liveTurns().length,
    attention: ctx.acpManager.hasPendingPermission(),
  })),

  /**
   * Instala a versão nova e sai, para o supervisor subir a nova (`038`, door 8).
   *
   * Volta assim que a instalação **começa**: o npm leva minutos, e uma requisição
   * que esperasse por ele cairia junto com o processo que a atende. Quem quer saber
   * como terminou pergunta `updateStatus` — que, com o daemon já reiniciado, é
   * respondido pela versão nova.
   */
  update: publicProcedure.mutation(({ ctx }) =>
    domainSafeAsync(async () => {
      if (!ctx.config.supervised) {
        throw new DomainError(
          "PRECONDITION_FAILED",
          "o Lumem não roda sob um supervisor: atualize com `lumem upgrade`",
        );
      }
      const latest = ctx.update.check.last().latest;
      if (latest === null || !ctx.update.updateAvailable()) {
        throw new DomainError("PRECONDITION_FAILED", "não há versão nova para instalar");
      }
      if (ctx.update.installer.installing()) {
        throw new DomainError("BLOCKED", "já há uma atualização em andamento");
      }
      const busy = await busyNow(ctx);
      if (!isIdle(busy)) {
        // Os dois números na frase: quem lê decide se espera o turno ou pede para
        // parar o `pnpm dev`, e "há coisa rodando" não deixa escolher.
        throw new DomainError(
          "BLOCKED",
          `não dá para atualizar agora: ${String(busy.liveTurns)} turnos em voo e ` +
            `${String(busy.runningScripts)} scripts de projeto rodando`,
        );
      }

      ctx.update.installer.start(latest);
      return { started: true as const };
    }),
  ),

  /**
   * Quanto o daemon, os agentes e os terminais gastam agora — o bloco de recursos do
   * painel da barra (`038`). A pergunta é o que arma o relógio de leitura: quem não
   * pergunta não paga o `ps`.
   */
  resources: publicProcedure.query(({ ctx }) => ctx.resources.resources()),

  settings: publicProcedure.query(({ ctx }) => settingsOf(ctx)),

  setSettings: publicProcedure
    .input(
      z.object({
        updateCheck: z.boolean().optional(),
        autoUpdate: z.enum(AUTO_UPDATE_VALUES).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      createDaemonSettingsRepository(ctx.db).set({
        ...(input.updateCheck === undefined ? {} : { updateCheck: input.updateCheck }),
        ...(input.autoUpdate === undefined ? {} : { autoUpdate: input.autoUpdate }),
      });
      return settingsOf(ctx);
    }),
});
