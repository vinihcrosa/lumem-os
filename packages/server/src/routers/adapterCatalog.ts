import { adapterById, type AdapterCatalogView } from "@lumem/shared";
import { z } from "zod";

import { adapterCommandFor } from "../setup/adapter-command.js";
import { publicProcedure, router } from "../trpc.js";

/**
 * O catálogo de adaptador, lido pela tela antes de existir sessão (`033` §3.1).
 *
 * `installed` mora aqui e não no catálogo porque é pergunta ao disco de agora,
 * não cache: a mesma checagem que o aquecimento do `bootstrap` faz — o
 * `adapterCommandFor` não lançar. Id sem spec (a config fake dos e2e) não tem
 * cópia gerenciada, então nunca é instalado.
 */
function isInstalled(adapterId: string, stateDir: string): boolean {
  const spec = adapterById(adapterId);
  if (spec === null) return false;
  try {
    adapterCommandFor(spec, stateDir);
    return true;
  } catch {
    return false;
  }
}

export const adapterCatalogRouter = router({
  list: publicProcedure
    .input(z.object({ projectId: z.string().min(1).optional() }).optional())
    .query(({ ctx, input }): AdapterCatalogView[] =>
      ctx.adapterCatalog.view(input?.projectId).map((reading) => ({
        ...reading,
        installed: isInstalled(reading.adapterId, ctx.config.stateDir),
      })),
    ),
});
