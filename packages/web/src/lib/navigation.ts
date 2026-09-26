import { useSyncExternalStore } from "react";

import { navigate } from "./route.js";

/**
 * Onde você está dentro de um workspace, e este arquivo inteiro é a resposta
 * (`032-web-architecture`, T21 — a fase 0 da `LUM-63`).
 *
 * Até aqui a resposta vivia espalhada em quatro `useState` do `App`:
 * `selection` (o checkout escolhido), `openSessionId` (uma sessão para trazer à
 * frente), `ask` (um pedido que a conversa manda sozinha) e `draft` (um rascunho
 * que ela só preenche). Os três últimos são a **mesma coisa** com uma variação —
 * uma sessão que acabou de nascer, ou de ser escolhida, pede para entrar na tela
 * — e é isso que `arrival` funde: `ask` é `{ text, send: true }`, `draft` é
 * `{ text, send: false }`, e `openSessionId` sozinho é `{ send: false }` sem
 * texto nenhum.
 *
 * **Sem biblioteca, no molde de `route.ts`**: um `Set` de ouvintes, um estado
 * módulo, `useSyncExternalStore`. A diferença é que aqui não há nada no
 * navegador para ler — o valor não vem de fora, ele **é** o estado —, então o
 * "evento próprio" de `route.ts` some: mutar já é notificar.
 *
 * **A URL não entra.** Serializar `selection` na barra de endereço é a `LUM-63`;
 * este é só o lugar onde ela vai escrever depois.
 */

/**
 * A mesma forma de `Scope`, do checkout (`features/checkout/useSessionsByScope.ts`)
 * — sem importá-la. Um arquivo de `lib/` não conhece `features/` (regra 2 do
 * sensor, `architecture.test.ts`), e duplicar a forma é o preço: quem chama passa
 * um `Scope` de verdade, e a igualdade estrutural do TypeScript faz o resto — este
 * arquivo nunca precisa saber que aquele tipo existe.
 */
export interface NavigationScope {
  readonly scopeType: "project" | "worktree";
  readonly scopeId: string;
}

/** Um checkout escolhido, dentro de um projeto. */
export interface Selection {
  readonly projectId: string;
  readonly scope: NavigationScope;
}

/**
 * Uma sessão que pede para entrar na tela, uma vez.
 *
 * `send: true` é o antigo `ask` — a conversa manda o texto sozinha, sem esperar
 * ninguém ler. `send: false` com `text` é o antigo `draft` — preenche o composer
 * e espera. `send: false` sem `text` é o antigo `openSessionId` puro — só traz a
 * aba para a frente.
 */
export interface Arrival {
  readonly sessionId: string;
  readonly text?: string;
  readonly send: boolean;
}

interface NavigationState {
  readonly selection: Selection | null;
  readonly arrival: Arrival | null;
}

let state: NavigationState = { selection: null, arrival: null };
const listeners = new Set<() => void>();

function commit(next: NavigationState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot(): NavigationState {
  return state;
}

/**
 * Seleciona um checkout, e acerta o endereço junto.
 *
 * A regra que este store existe para não deixar discordar de si mesma:
 * `selection !== null` implica `route === "home"`. `replace`, e não `push`
 * (`030-settings`, Q2) — o checkout é seleção, não lugar, e com `push` o botão
 * voltar viraria "desfazer seleção".
 */
export function select(next: Selection): void {
  commit({ ...state, selection: next });
  navigate("home", { replace: true });
}

/**
 * Sai do checkout selecionado.
 *
 * Não toca a rota — voltar para o workspace não é ir para lugar nenhum de
 * endereço próprio, é `selection` virar `null` com a rota como já estava.
 *
 * **Zera `arrival` junto** (achado 10 da revisão independente): sem isto, uma
 * chegada pendente de um checkout ficava viva apontando para uma sessão de
 * fora do workspace novo, até outra chegada a substituir. Paridade com
 * `origin/main`, onde `ask`/`draft` também sobreviviam a uma troca — mas lá
 * eram três lugares, e agora é um só.
 */
export function clear(): void {
  if (state.selection === null && state.arrival === null) return;
  commit({ selection: null, arrival: null });
}

/** Uma sessão pede para entrar na tela — ver `Arrival`. */
export function arrive(next: Arrival): void {
  commit({ ...state, arrival: next });
}

/**
 * Consome a chegada desta sessão, uma vez.
 *
 * `null` quando não há chegada pendente para este `sessionId` — outra sessão,
 * ou nenhuma. Quem recebe algo diferente de `null` é dono dela: a próxima
 * chamada, para o mesmo `sessionId` ou para qualquer outro, não vê mais nada —
 * é o que faz "uma vez" valer mesmo com dois leitores em potencial (`useArrival`
 * e quem decide qual aba trazer para a frente).
 */
export function consumeArrival(sessionId: string): Arrival | null {
  const current = state.arrival;
  if (current === null || current.sessionId !== sessionId) return null;
  commit({ ...state, arrival: null });
  return current;
}

/** Onde você está: o checkout selecionado, e a chegada pendente, se houver. */
export function useNavigation(): NavigationState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

/**
 * Só para teste: devolve o store ao estado inicial entre `it`s.
 *
 * O módulo é module-level de propósito (é o que faz `select`/`arrive` chamáveis
 * de qualquer lugar sem contexto), e é exatamente isso que faz um teste vazar
 * estado para o próximo dentro do mesmo arquivo — `route.test.ts` não precisa
 * disto porque o `window.history` de verdade já tem o próprio reset
 * (`replaceState`); este estado não mora em lugar nenhum fora do módulo.
 */
export function resetNavigationForTests(): void {
  state = { selection: null, arrival: null };
}
