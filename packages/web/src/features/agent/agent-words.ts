/**
 * A tradução dos métodos de login, no molde de
 * `pr-words.ts`: uma tabela pura, testável sem montar nada, separada do
 * componente que desenha.
 */

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
