import type { AcpCommand, AcpConfigOption, AdapterCatalogView } from "@lumem/shared";

/**
 * O catálogo de adaptador com a forma que a M1 mediu (`033` PRD §5), para as
 * stories e os testes das três telas.
 *
 * Os ids, as categorias e as choices são os do `claude-agent-acp@0.75.1` e do
 * `codex-acp@1.10.0` — inclusive o que a M1a achou: o conjunto de opções
 * **depende do modelo**. `haiku` não tem `effort`; `sonnet` tem `effort` e perde
 * `fast`; o Codex muda as choices do `reasoning_effort` por modelo. Os nomes e
 * as descrições das choices são de fixture — o que importa aqui é a forma.
 */

function choices(values: readonly string[]): AcpConfigOption["choices"] {
  return values.map((value) => ({ value, name: value }));
}

const CLAUDE_MODE: AcpConfigOption = {
  id: "mode",
  name: "Mode",
  category: "mode",
  currentValue: "default",
  choices: choices(["default", "acceptEdits", "plan", "auto", "bypassPermissions"]),
};

const CLAUDE_MODEL: AcpConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "opus[1m]",
  choices: [
    { value: "default", name: "Default", description: "o modelo recomendado para a sua conta" },
    { value: "opus[1m]", name: "Opus", description: "Opus 5 com janela de 1M" },
    { value: "claude-fable-5-1[1m]", name: "Fable 5.1", description: "Fable 5.1 com janela de 1M" },
    { value: "sonnet", name: "Sonnet", description: "equilíbrio entre custo e capacidade" },
    { value: "haiku", name: "Haiku", description: "o mais rápido, para tarefa simples" },
  ],
};

const CLAUDE_EFFORT: AcpConfigOption = {
  id: "effort",
  name: "Effort",
  category: "thought_level",
  currentValue: "xhigh",
  choices: choices(["default", "low", "medium", "high", "xhigh", "max"]),
};

const CLAUDE_FAST: AcpConfigOption = {
  id: "fast",
  name: "Fast",
  category: "model_config",
  currentValue: "off",
  choices: choices(["on", "off"]),
};

function withModel(option: AcpConfigOption, model: string): AcpConfigOption {
  return { ...option, currentValue: model };
}

/** O Claude logado, no padrão desta máquina (`opus[1m]` · `xhigh`). */
export const CLAUDE_VIEW: AdapterCatalogView = {
  adapterId: "claude",
  label: "Claude Code",
  installed: true,
  authRequired: false,
  configOptions: [CLAUDE_MODE, CLAUDE_MODEL, CLAUDE_EFFORT, CLAUDE_FAST],
  optionsByModel: {
    default: [CLAUDE_MODE, withModel(CLAUDE_MODEL, "default"), CLAUDE_EFFORT, CLAUDE_FAST],
    "opus[1m]": [CLAUDE_MODE, CLAUDE_MODEL, CLAUDE_EFFORT, CLAUDE_FAST],
    "claude-fable-5-1[1m]": [CLAUDE_MODE, withModel(CLAUDE_MODEL, "claude-fable-5-1[1m]"), CLAUDE_EFFORT],
    sonnet: [CLAUDE_MODE, withModel(CLAUDE_MODEL, "sonnet"), CLAUDE_EFFORT],
    haiku: [CLAUDE_MODE, withModel(CLAUDE_MODEL, "haiku")],
  },
  commands: [],
};

/** Os comandos que uma sessão de Claude já trouxe para este projeto — com as skills do repositório. */
export const PROJECT_COMMANDS: AcpCommand[] = [
  { name: "compact", description: "Clear conversation history but keep a summary in context", takesInput: true },
  { name: "review", description: "Review a pull request", takesInput: true },
  { name: "init", description: "Initialize a new CLAUDE.md file with codebase documentation", takesInput: false },
  { name: "gate", description: "Roda o gate declarado pela task (skill do projeto)", takesInput: false },
  { name: "tlc-spec-lean", description: "Spec-driven feature work (skill do projeto)", takesInput: true },
  { name: "security-review", description: "Complete a security review of the pending changes", takesInput: false },
];

export const CLAUDE_VIEW_WITH_COMMANDS: AdapterCatalogView = { ...CLAUDE_VIEW, commands: PROJECT_COMMANDS };

const CODEX_MODEL: AcpConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "gpt-5.5",
  choices: [
    { value: "gpt-5.5", name: "gpt-5.5", description: "o padrão do config.toml" },
    { value: "gpt-5.6-luna", name: "gpt-5.6-luna", description: "raciocínio até max" },
    { value: "gpt-6-astra", name: "gpt-6-astra", description: "raciocínio até ultra" },
  ],
};

function codexEffort(values: readonly string[]): AcpConfigOption {
  return {
    id: "reasoning_effort",
    name: "Reasoning effort",
    category: "thought_level",
    currentValue: "medium",
    choices: choices(values),
  };
}

/** O Codex logado. */
export const CODEX_VIEW: AdapterCatalogView = {
  adapterId: "codex",
  label: "Codex",
  installed: true,
  authRequired: false,
  configOptions: [CODEX_MODEL, codexEffort(["low", "medium", "high", "xhigh"])],
  optionsByModel: {
    "gpt-5.5": [CODEX_MODEL, codexEffort(["low", "medium", "high", "xhigh"])],
    "gpt-5.6-luna": [withModel(CODEX_MODEL, "gpt-5.6-luna"), codexEffort(["low", "medium", "high", "xhigh", "max"])],
    "gpt-6-astra": [
      withModel(CODEX_MODEL, "gpt-6-astra"),
      codexEffort(["low", "medium", "high", "xhigh", "max", "ultra"]),
    ],
  },
  commands: [],
};

/**
 * O Codex instalado e sem login: o `session/new` do probe foi recusado, então
 * não há opção nenhuma gravada — o grupo não tem o que listar.
 */
export const CODEX_NO_LOGIN_VIEW: AdapterCatalogView = {
  ...CODEX_VIEW,
  authRequired: true,
  configOptions: [],
  optionsByModel: {},
};

/** O Codex que nem foi instalado. */
export const CODEX_NOT_INSTALLED_VIEW: AdapterCatalogView = {
  ...CODEX_NO_LOGIN_VIEW,
  installed: false,
  authRequired: null,
};

/**
 * Vinte modelos num adaptador só — a mesma lista do `LUMEM_FAKE_MANY_MODELS`
 * do e2e da `023`: dezenove `modelo-NN` e `modelo-do-fundo`, o último.
 */
const TWENTY_MODELS: AcpConfigOption = {
  id: "model",
  name: "Model",
  category: "model",
  currentValue: "modelo-01",
  choices: Array.from({ length: 20 }, (_, index) =>
    index === 19
      ? { value: "modelo-do-fundo", name: "modelo-do-fundo", description: "o último da lista" }
      : {
          value: `modelo-${String(index + 1).padStart(2, "0")}`,
          name: `modelo-${String(index + 1).padStart(2, "0")}`,
          description: `descrição do modelo ${String(index + 1)}`,
        },
  ),
};

export const CLAUDE_TWENTY_MODELS_VIEW: AdapterCatalogView = {
  ...CLAUDE_VIEW,
  configOptions: [CLAUDE_MODE, TWENTY_MODELS],
  optionsByModel: {},
};
