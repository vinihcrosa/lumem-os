import type { FastifyInstance } from "fastify";
import { z } from "zod";

import type { Db } from "../db/index.js";

import { MemoryService } from "./MemoryService.js";
import type { AutoLearn } from "./auto-learn.js";
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

/**
 * A partir de quando uma memória entra com aviso de frescor (§8 do PRD).
 *
 * *"Envelhecer não é o mesmo que estar errado"* — então o aviso acompanha, e não
 * filtra. Ele mora **aqui** e não no núcleo, e isso é uma leitura do §8: o banner
 * foi desenhado quando a injeção carregava **fatos**. O núcleo carrega diretriz,
 * e "escreva commit em inglês (verifique antes de afirmar como fato)" é ruído.
 * Fato é o que este endpoint serve, e é onde o aviso significa algo.
 */
const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

const askQuery = z.object({
  q: z.string().min(1),
  session: z.string().min(1).optional(),
});

export interface RegisterMemoryHttpOptions {
  app: FastifyInstance;
  db: Db;
  stateDir: string;
  /**
   * O auto-learn (PR 08). Ausente é o default: sem ele, "não sei" é a resposta
   * final, que é o comportamento que existia antes desta feature.
   */
  autoLearn?: AutoLearn;
}

export function registerMemoryHttp({ app, db, stateDir, autoLearn }: RegisterMemoryHttpOptions): void {
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
      /*
       * O buraco no acervo é o gatilho do auto-learn (§5.2), e **só** ele: subir
       * agente quando a busca já achou algo seria pagar por uma resposta que
       * existia. Aqui é onde "não sei" deixa de ser o fim.
       */
      const learned = autoLearn === undefined ? null : await autoLearn(query, session);
      if (learned?.answer != null) {
        const provenance = learned.written.map(
          (written) =>
            `- ${written.name} — ${written.route === "direct" ? "gravada" : "aguardando sua revisão"}`,
        );
        return reply.send(
          [
            learned.answer,
            "",
            "Isto **não estava** na memória: foi pesquisado agora, e não está verificado.",
            ...(provenance.length > 0 ? ["", "O que ficou guardado:", ...provenance] : []),
            "",
          ].join("\n"),
        );
      }

      // Degradou, estourou o orçamento, ou está desligado: a resposta honesta é a
      // que sempre foi, e ela **diz** que houve tentativa quando houve.
      return reply.send(
        "não sei — não existe memória sobre isso.\n" +
          (learned?.skipped === "degraded"
            ? "A pesquisa automática não conseguiu responder desta vez.\n"
            : learned?.skipped === "over_budget"
              ? "O orçamento de pesquisa automática desta sessão acabou.\n"
              : "") +
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
      const stale = Date.now() - hit.entry.updatedAt.getTime() > STALE_AFTER_MS;
      answers.push(
        [
          `## ${hit.entry.name}`,
          `fonte: ${hit.entry.path} · ${hit.entry.scope} · ${hit.entry.type}`,
          ...(stale ? ["verifique contra o estado atual antes de afirmar como fato"] : []),
          "",
          body,
        ].join("\n"),
      );
    }

    return reply.send(`${answers.join("\n\n")}\n`);
  });
}
