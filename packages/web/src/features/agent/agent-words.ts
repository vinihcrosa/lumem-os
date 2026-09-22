import type { AdapterSpec } from "@lumem/shared";

import type { AdapterEntry } from "./queries.js";

/**
 * A tradução do catálogo de agentes e dos métodos de login, no molde de
 * `pr-words.ts`: uma tabela pura, testável sem montar nada, separada do
 * componente que desenha.
 */

/** O que uma linha do catálogo diz sobre uma spec, antes do clique. */
export function describeSpec(
  spec: AdapterSpec,
  found: AdapterEntry | undefined,
  already: boolean,
  pending: boolean,
): string {
  if (already) return "já conectado";
  if (pending) return "procurando na sua máquina…";

  /*
   * O que a linha relata é o que a pessoa **não** resolve clicando.
   *
   * O adaptador o daemon instala; o CLI que ele dirige, não — e por isso é a
   * presença do CLI que decide se vale clicar. Quando a spec não dirige nenhum
   * (o `codex-acp` traz o próprio, §4.8), o que sobra a relatar é o adaptador.
   */
  if (spec.cli !== null) {
    return found?.cli?.path == null
      ? `o CLI ${spec.cli.command} não está no PATH — o adaptador precisa dele`
      : `${spec.cli.command} encontrado · ${found.cli.version ?? "versão não lida"}`;
  }
  return found?.adapter.path == null
    ? "o adaptador traz o próprio agente dentro"
    : `instalado · ${found.adapter.version ?? "versão não lida"}`;
}

/** Um jeito de entrar, como o adaptador o listou. */
export interface AuthMethodView {
  id: string;
  name: string;
  description: string | null;
  type: string;
  command: string | null;
  args: readonly string[];
}

/** Um método que pede uma chave é o único que precisa de um campo antes da chamada. */
export function needsKey(method: AuthMethodView): boolean {
  return method.type === "env_var" || /api[- ]?key/i.test(method.id);
}

/** A descrição do agente, e o que o Lumem sabe dizer quando ele não deu uma. */
export function describeMethod(method: AuthMethodView): string {
  if (method.description !== null && method.description !== "") return method.description;
  if (method.type === "terminal") return "roda um comando num terminal do daemon";
  return "abre o navegador nesta máquina";
}
