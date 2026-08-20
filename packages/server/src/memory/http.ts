import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Db } from "../db/index.js";

import { MemoryService } from "./MemoryService.js";
import { memoryScopeOfSession } from "./scope-of-session.js";

/**
 * A porta que a skill ensina a usar — a camada 3 do context-delivery.
 *
 * HTTP e texto puro, e as duas escolhas são pelo mesmo motivo: o agente já tem
 * shell, e `curl` funciona de qualquer `cwd` sem instalar nada. A CLI existe e
 * tem o mesmo contrato (D4), mas depende de saber onde o daemon foi instalado —
 * o que a sessão não sabe. O formato é indiferente por desenho (§4.2): o que
 * importa é que a interface seja uma pergunta.
 *
 * Fora do `/trpc` de propósito. Uma chamada tRPC pede o envelope `?input={...}`
 * codificado, e ensinar isso a um agente é ensinar a errar; o que entra no
 * prompt tem que ser copiável sem raciocínio.
 */

const ASK_LIMIT = 5;

const askQuery = z.object({
  q: z.string().min(1),
  session: z.string().min(1).optional(),
});

export interface RegisterMemoryHttpOptions {
  app: FastifyInstance;
  db: Db;
  stateDir: string;
}

export function registerMemoryHttp({ app, db, stateDir }: RegisterMemoryHttpOptions): void {
  app.get("/memory/ask", async (request, reply) => {
    const parsed = askQuery.safeParse(request.query);
    if (!parsed.success) {
      return reply
        .code(400)
        .type("text/plain; charset=utf-8")
        .send('faltou a pergunta: use ?q=<pergunta>\n');
    }

    const memory = new MemoryService({ db, stateDir, log: app.log });
    const { q: query, session } = parsed.data;
    const scope = session === undefined ? {} : await memoryScopeOfSession(db, session);

    // O índice pode estar atrasado — arquivo editado à mão no `~/.lumem`, ou um
    // banco anterior à feature. Consertar aqui é o mesmo que a CLI faz, e pelo
    // mesmo motivo: uma busca que não acha nada por índice velho responde "não
    // sei" sobre algo que o sistema sabe, que é a pior resposta possível.
    await memory.ensureIndexFresh();

    const result = memory.search(query, {
      ...scope,
      limit: ASK_LIMIT,
      // Só o caminho do agente registra (Q25), e é este. É também o número que o
      // §6 chama de mais importante: chamadas por sessão.
      ...(session === undefined ? {} : { record: true, sessionId: session }),
    });

    reply.type("text/plain; charset=utf-8");

    if (result.skipped === "trivial_query") {
      // Não buscou é diferente de não achou.
      return reply.send("pergunta muito curta: use pelo menos dois termos com significado\n");
    }
    if (result.hits.length === 0) {
      return reply.send(
        "não sei — não existe memória sobre isso.\n" +
          "Se você descobrir a resposta, vale registrar: é assim que o acervo cresce.\n",
      );
    }

    const answers: string[] = [];
    for (const hit of result.hits) {
      // A fonte junto da resposta, sempre (§5.5). Sem o caminho, o agente não
      // tem como dizer de onde tirou aquilo — e uma resposta que não se pode
      // conferir é uma resposta que não se pode contestar.
      const body = await memory
        .read(hit.entry.type as never, hit.entry.name, hit.entry.scope as never, {
          ...(hit.entry.workspaceId ? { workspaceId: hit.entry.workspaceId } : {}),
          ...(hit.entry.projectId ? { projectId: hit.entry.projectId } : {}),
        })
        .then((entry) => entry.body)
        .catch(() => hit.entry.description);
      answers.push(
        [`## ${hit.entry.name}`, `fonte: ${hit.entry.path} · ${hit.entry.scope} · ${hit.entry.type}`, "", body].join("\n"),
      );
    }

    return reply.send(`${answers.join("\n\n")}\n`);
  });
}
