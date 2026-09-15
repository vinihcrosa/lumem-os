import { z } from "zod";

import { LINEAR_SECRET } from "../tracker/LinearHost.js";
import { domainSafeAsync, publicProcedure, router } from "../trpc.js";

/**
 * As credenciais dos serviços de que o Lumem depende
 * ([ADR de 2026-09-13](../../../../docs/adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md)).
 *
 * **Nada aqui devolve valor.** A leitura responde **presença**, e é o único
 * formato em que uma credencial pode atravessar para o navegador: um valor
 * ecoado de volta é um segredo saindo do daemon sem motivo nenhum — a mesma
 * frase que o `apiKeyEnv` da [`021`](../../../../docs/features/021-second-agent/prd.md)
 * já carregava, e que agora vale para um segredo que é **nosso**.
 *
 * Não há procedure de leitura de valor, e a ausência é a decisão: se ela
 * existisse, bastaria alguém chamá-la.
 */

/**
 * Os serviços que o produto sabe guardar, hoje.
 *
 * Um catálogo e não texto livre: um `id` inventado viraria uma credencial que
 * nada lê, guardada para sempre, e quem a pôs acharia que configurou algo.
 *
 * **Agentes, GitHub e GitLab entram numa feature posterior**, e é decisão
 * registrada: eles continuam vindo do ambiente e do `gh` até lá.
 */
export const SECRET_SLOTS = [
  { id: LINEAR_SECRET, label: "Linear", hint: "chave de API pessoal, em Settings → API" },
] as const;

export const secretsRouter = router({
  /** Quais serviços têm credencial. **Presença**, nunca valor. */
  list: publicProcedure.query(({ ctx }) => {
    const stored = new Set(ctx.secrets.list());
    return SECRET_SLOTS.map((slot) => ({ ...slot, present: stored.has(slot.id) }));
  }),

  /**
   * Guarda, ou **apaga** quando o valor vem vazio.
   *
   * Um gesto para os dois, porque rotação na v1 é apagar e pôr outra — e porque
   * um botão *"remover"* separado seria um segundo caminho para o mesmo estado.
   */
  set: publicProcedure
    .input(
      z.object({
        id: z.enum([LINEAR_SECRET]),
        value: z.string(),
      }),
    )
    .mutation(({ ctx, input }) =>
      domainSafeAsync(() => {
        ctx.secrets.write(input.id, input.value);
        /*
         * A resposta é **presença**, e não o que foi gravado.
         *
         * É a mesma regra da leitura, e ela importa mais aqui: quem acabou de
         * mandar o valor já o tem, então devolvê-lo não informa nada e põe o
         * segredo numa resposta HTTP a mais.
         */
        return Promise.resolve({ id: input.id, present: ctx.secrets.has(input.id) });
      }),
    ),
});
