import { agoOf, relativeAge } from "../../lib/relative-time.js";

/**
 * As palavras do painel da barra (`038`, Parte 3).
 *
 * Uma tela de 360 px que se lê de relance: cada número é curto e ninguém precisa
 * abrir nada para saber o que ele quer dizer. As funções recebem o relógio, porque o
 * texto de *"reseta em 2 h"* muda com a hora e o teste não pode depender dela.
 */

/** `0,87` é `87%`: a manchete é uma porcentagem inteira (AC 46). */
export function percentOf(utilization: number): string {
  return `${String(Math.round(utilization * 100))}%`;
}

/** `reseta em 2 h`, ou `resetou` se a janela já renovou; `null` quando o agente não disse quando. */
export function untilReset(resetsAt: number | null, now: number): string | null {
  if (resetsAt === null) return null;
  const ms = resetsAt * 1000 - now;
  return ms <= 0 ? "resetou" : `reseta em ${agoOf(ms)}`;
}

/** `há 5 min`, ou `agora` — o `relativeAge` diz só `5 min`, e a frase precisa do verbo. */
export function sinceWords(iso: string, now: number): string {
  const age = relativeAge(iso, now);
  return age === "agora" || age === "" ? "agora" : `há ${age}`;
}

/** `US$ 1,75`: duas casas, porque o painel é de relance e o custo do dia passa de centavo. */
export function dayCost(amount: number, currency: string | null): string {
  const symbol = currency === "USD" || currency === null ? "US$" : currency;
  return `${symbol} ${amount.toFixed(2).replace(".", ",")}`;
}

/** `180 MB`, ou `1,2 GB` quando passa de um giga. */
export function memoryOf(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb < 1024) return `${String(Math.round(mb))} MB`;
  return `${(mb / 1024).toFixed(1).replace(".", ",")} GB`;
}

/** `22,4%`, ou um traço: uma amostra só não tem taxa, e `0%` seria afirmar o que ninguém mediu. */
export function cpuOf(percent: number | null): string {
  return percent === null ? "—" : `${percent.toFixed(1).replace(".", ",")}%`;
}

/** `2 terminais abertos fecham ao atualizar` — e o singular, que é o caso comum. */
export function terminalsClose(count: number): string {
  return count === 1
    ? "1 terminal aberto fecha ao atualizar"
    : `${String(count)} terminais abertos fecham ao atualizar`;
}
