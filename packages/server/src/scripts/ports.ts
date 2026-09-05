import { createServer } from "node:net";

import { newId, PORT_BLOCK_SIZE } from "@lumem/shared";
import { and, eq } from "drizzle-orm";

import type { Db } from "../db/index.js";
import { checkoutPort } from "../db/schema.js";
import { DomainError } from "../errors.js";
import type { ScopeType } from "../scope.js";

/**
 * A porta que cada checkout ganha para rodar (S5).
 *
 * O problema é banal e o custo dele não é: `pnpm dev` na worktree A e `pnpm dev` na
 * worktree B do mesmo projeto pedem a mesma porta, e a segunda morre com um
 * `EADDRINUSE` que aparece no meio de trinta linhas de log. Duas ferramentas já
 * resolveram isso por fora deste produto — o Conductor reservando dez portas por
 * workspace, e o `scripts/workspace/env.sh` **deste repositório** derivando um par do
 * hash do caminho.
 *
 * Três decisões, e as três têm preço:
 *
 * - **gravada, não sorteada.** A porta entra em `.env`, em proxy e na barra do
 *   navegador. Uma que muda a cada start não serve para nada disso — e o preço é uma
 *   tabela que precisa ser limpa quando o checkout morre;
 * - **um bloco, não uma porta.** Um monorepo sobe API e front; oferecer uma só
 *   empurraria o segundo de volta para o sorteio. O preço é reservar dez para quem
 *   usa uma;
 * - **verificada livre na alocação, e não a cada start.** Checar de novo a cada run
 *   transformaria "sua porta é a 45010" numa promessa que muda sozinha.
 */

/**
 * Quantas portas cada checkout leva.
 *
 * Mora no `@lumem/shared` desde a `run-dock-open`: a tela nomeia a faixa em voz
 * alta antes de qualquer coisa ter rodado, e um segundo `10` do lado do web seria
 * um número para divergir.
 */
export { PORT_BLOCK_SIZE };

/**
 * A faixa padrão.
 *
 * Alta o bastante para não colidir com o que um sistema usa, e longe da faixa
 * efêmera do macOS (49152+), de onde o kernel tira porta de saída — reservar ali é
 * disputar com toda conexão que a máquina abre.
 */
export const DEFAULT_PORT_RANGE = { from: 45_000, to: 46_990 } as const;

export interface PortRange {
  from: number;
  to: number;
}

export interface CheckoutScope {
  scopeType: ScopeType;
  scopeId: string;
}

export interface ReservePortOptions {
  range?: PortRange;
  /** Injetável no teste: decide se a porta está livre na máquina. */
  isFree?: (port: number) => Promise<boolean>;
}

/**
 * Lê a reserva sem criar nenhuma.
 *
 * Existe separado do `reserve` porque a tela pergunta ("qual é a porta deste
 * checkout?") muito mais vezes do que alguém roda — e uma leitura que aloca faria
 * abrir o rodapé consumir porta de um checkout que nunca vai rodar nada.
 */
export async function findReservedPort(db: Db, scope: CheckoutScope): Promise<number | null> {
  const row = await db.query.checkoutPort.findFirst({
    where: and(
      eq(checkoutPort.scopeType, scope.scopeType),
      eq(checkoutPort.scopeId, scope.scopeId),
    ),
  });
  return row?.port ?? null;
}

/** A reserva deste checkout, criando-a na primeira vez. */
export async function reservePort(
  db: Db,
  scope: CheckoutScope,
  { range = DEFAULT_PORT_RANGE, isFree = isPortFree }: ReservePortOptions = {},
): Promise<number> {
  const existing = await findReservedPort(db, scope);
  if (existing !== null) return existing;

  const taken = new Set((await db.select().from(checkoutPort)).map((row) => row.port));

  for (let base = range.from; base + PORT_BLOCK_SIZE - 1 <= range.to; base += PORT_BLOCK_SIZE) {
    if (taken.has(base)) continue;
    if (!(await isFree(base))) continue;

    try {
      await db.insert(checkoutPort).values({ id: newId(), ...scope, port: base });
      return base;
    } catch {
      // Duas reservas simultâneas competindo pelo mesmo bloco: o índice único
      // recusa a segunda, e ela continua procurando em vez de estourar. É o
      // único jeito de a corrida ter um perdedor que ainda funciona.
      const now = await findReservedPort(db, scope);
      if (now !== null) return now;
    }
  }

  throw new DomainError(
    "BLOCKED",
    `não há bloco de ${PORT_BLOCK_SIZE} portas livre entre ${range.from} e ${range.to} — ` +
      "libere alguma coisa, ou aponte LUMEM_RUN_PORT_RANGE para outra faixa",
  );
}

/** Devolve o bloco inteiro, para as variáveis `LUMEM_RUN_PORT_1..N`. */
export function portBlock(base: number): number[] {
  return Array.from({ length: PORT_BLOCK_SIZE }, (_, index) => base + index);
}

/**
 * Libera a reserva de um checkout que deixou de existir.
 *
 * Sem isto a faixa vaza: cada worktree criada e removida levaria dez portas
 * consigo, e a mensagem de "não há bloco livre" chegaria sem nada estar rodando.
 */
export async function releasePort(db: Db, scope: CheckoutScope): Promise<void> {
  await db
    .delete(checkoutPort)
    .where(
      and(eq(checkoutPort.scopeType, scope.scopeType), eq(checkoutPort.scopeId, scope.scopeId)),
    );
}

/**
 * A porta está livre nesta máquina agora.
 *
 * `0.0.0.0` de propósito: um servidor de desenvolvimento costuma escutar em todas as
 * interfaces, então testar só o loopback aprovaria uma porta que ele não consegue
 * abrir.
 */
export function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(false));
    probe.once("listening", () => probe.close(() => resolve(true)));
    probe.listen(port, "0.0.0.0");
  });
}

/** `LUMEM_RUN_PORT_RANGE=45000-46990`, ou o default quando ela não diz nada legível. */
export function parsePortRange(raw: string | undefined): PortRange {
  const match = /^\s*(\d+)\s*-\s*(\d+)\s*$/.exec(raw ?? "");
  if (!match) return { ...DEFAULT_PORT_RANGE };

  const from = Number.parseInt(match[1] as string, 10);
  const to = Number.parseInt(match[2] as string, 10);
  // Faixa invertida, ou menor que um bloco, é faixa que ninguém quis: cair no
  // default é melhor que um daemon que não sobe por causa de um traço trocado.
  if (from < 1 || to > 65_535 || to - from + 1 < PORT_BLOCK_SIZE) return { ...DEFAULT_PORT_RANGE };
  return { from, to };
}
