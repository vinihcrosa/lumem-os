/**
 * O catálogo de adaptadores ACP — uma lista, no lugar de cinco constantes.
 *
 * Antes disto, o produto tinha `ACP_ADAPTER_COMMAND`, `ACP_ADAPTER_PACKAGE`,
 * `ACP_ADAPTER_PINNED_VERSION`, `CLAUDE_CLI_COMMAND` e `ANTHROPIC_API_KEY_ENV`:
 * cinco strings de **um** adaptador, espalhadas por instalador, pré-voo e
 * mensagem de erro. Um segundo agente com esse desenho seria um `if` por arquivo.
 *
 * A regra é a do walking-skeleton levada até o instalador: **nada no daemon sabe
 * o que é "codex" fora desta lista.** Quem precisa de um adaptador pede a spec e
 * usa os campos dela.
 *
 * Os dois campos opcionais são medição, não previsão — a fase 0 da
 * `second-agent` (§4 do PRD) mediu os dois casos contra os adaptadores reais:
 *
 * - **`package` opcional** porque um agente nativo (`gemini --acp`) não tem
 *   adaptador para instalar: ele mora no PATH e o pré-voo diz se falta;
 * - **`cli` opcional** porque o `codex-acp` traz o próprio `@openai/codex` por
 *   `optionalDependencies` — 285 dos 301 MB da instalação. Medido: com
 *   `PATH=/nonexistent` o handshake dele ainda responde. O `claude-agent-acp`,
 *   ao contrário, é um adaptador que dirige um binário que tem que existir.
 */

/** O CLI que um adaptador dirige, quando ele não traz o próprio. */
export interface AdapterCli {
  /** O binário, como ele se chama no PATH. */
  command: string;
  /** Como instalar, para a linha que o pré-voo mostra. Null quando não há uma só. */
  install: string | null;
}

export interface AdapterSpec {
  /** Curto, estável, e o nome do diretório em `<stateDir>/adapters/<id>`. */
  id: string;
  /**
   * O que uma tela escreve.
   *
   * Mora aqui porque o protocolo não serve: medido, o `agentInfo.name` do Codex
   * é `@agentclientprotocol/codex-acp` — o nome do **pacote**. O `title` que
   * presta (`Codex`) só existe depois do handshake, e a tela precisa do rótulo
   * antes dele, para oferecer a instalação.
   */
  label: string;
  /** O pacote npm a instalar. Null quando o adaptador é esperado no PATH. */
  package: string | null;
  /** O binário do adaptador — o que o daemon lança para falar ACP. */
  command: string;
  /**
   * A versão instalada, sempre literal.
   *
   * Nunca `latest` (A12): uma publicação noturna de um adaptador de terceiro não
   * muda como o agente se comporta sem alguém ter revisado. E a fase 0 mostrou
   * que isto é **insuficiente** para a família do Codex — `codex-acp@1.10.0`
   * depende de `@openai/codex: ^0.153.3`, um caret. Pinar o adaptador não pina o
   * agente por baixo dele, e o produto diz a versão que mediu.
   */
  pinnedVersion: string;
  /** O CLI que ele dirige. Null quando o adaptador traz o próprio. */
  cli: AdapterCli | null;
  /**
   * As variáveis de ambiente que significam "cobrança por token".
   *
   * Lista porque o Codex aceita duas. O pré-voo reporta **presença**, nunca
   * valor: uma chave ecoada de volta para o browser seria um segredo saindo do
   * daemon sem motivo nenhum.
   */
  apiKeyEnv: readonly string[];
}

/** O comando que instala um adaptador globalmente — a sugestão de um erro de spawn. */
export function adapterInstallCommand(spec: AdapterSpec): string | null {
  return spec.package === null ? null : `npm i -g ${spec.package}@${spec.pinnedVersion}`;
}

export const CLAUDE_ADAPTER: AdapterSpec = {
  id: "claude",
  label: "Claude Code",
  package: "@agentclientprotocol/claude-agent-acp",
  // Duas strings porque não são a mesma string, e é exatamente essa a armadilha:
  // o pacote é escopado e o binário não.
  command: "claude-agent-acp",
  pinnedVersion: "0.40.0",
  cli: { command: "claude", install: null },
  apiKeyEnv: ["ANTHROPIC_API_KEY"],
};

export const CODEX_ADAPTER: AdapterSpec = {
  id: "codex",
  label: "Codex",
  package: "@agentclientprotocol/codex-acp",
  command: "codex-acp",
  // Medido na fase 0, em 2026-09-06: é o que ele reportou como
  // `agentInfo.version`.
  pinnedVersion: "1.10.0",
  // Null, e não `{ command: "codex" }` por simetria: ele traz o próprio.
  cli: null,
  apiKeyEnv: ["CODEX_API_KEY", "OPENAI_API_KEY"],
};

export const ADAPTERS: readonly AdapterSpec[] = [CLAUDE_ADAPTER, CODEX_ADAPTER];

/** O adaptador que o primeiro acesso instala, e o default de todo parâmetro opcional. */
export const DEFAULT_ADAPTER_ID = CLAUDE_ADAPTER.id;

/**
 * A spec de um id, ou `null`.
 *
 * Devolve `null` em vez de lançar porque quem chama sabe traduzir para o erro do
 * seu andar — o router devolve `INVALID_ARGUMENT` com o id citado, e o daemon
 * que monta uma mensagem de erro não pode falhar montando uma mensagem de erro.
 */
export function adapterById(id: string): AdapterSpec | null {
  return ADAPTERS.find((spec) => spec.id === id) ?? null;
}

/** A spec de um binário de adaptador, para reconhecer o que já está rodando. */
export function adapterByCommand(command: string): AdapterSpec | null {
  return ADAPTERS.find((spec) => spec.command === command) ?? null;
}
