import { DEFAULT_ADAPTER_ID, type AcpConfigOption, type AdapterCatalogView } from "@lumem/shared";

/**
 * O que a pílula de agente e modelo escolhe (`033` F3), antes de existir sessão.
 *
 * `config` é `optionId → value`, a mesma forma que o `session.createAgent` e o
 * `worktree.start` recebem: o daemon aplica cada par por `set_config_option`
 * antes de devolver a sessão. Escolher o modelo escolhe o ACP — por isso os dois
 * andam juntos, e nunca um sem o outro.
 */
export interface AgentModelChoice {
  adapterId: string;
  config: Readonly<Record<string, string>>;
}

/** A opção de modelo de um conjunto de opções. */
export function modelOptionOf(options: readonly AcpConfigOption[]): AcpConfigOption | null {
  return options.find((option) => option.category === "model" || option.id === "model") ?? null;
}

/**
 * A opção de *effort*, pela categoria do protocolo.
 *
 * `thought_level` é o que os dois adaptadores medidos usam (`effort` no Claude,
 * `reasoning_effort` no Codex — M1); `effort` fica para quem usar o nome da
 * coisa como categoria.
 */
export function effortOptionOf(options: readonly AcpConfigOption[]): AcpConfigOption | null {
  return options.find((option) => option.category === "thought_level" || option.category === "effort") ?? null;
}

/**
 * As opções que valem **para este modelo** (M1a), ou `null` quando ninguém sabe.
 *
 * O `session/new` só conta as opções do modelo padrão; as dos outros vêm do
 * probe que percorre os modelos. Um modelo que não é o padrão e que ninguém
 * percorreu devolve `null` — e aí a pílula de *effort* não aparece, porque
 * mostrar o *effort* do padrão sobre o `haiku` seria inventar uma opção (F3.3).
 */
export function optionsForModel(view: AdapterCatalogView, model: string): readonly AcpConfigOption[] | null {
  const known = view.optionsByModel[model];
  if (known !== undefined) return known;
  return modelOptionOf(view.configOptions)?.currentValue === model ? view.configOptions : null;
}

/** O modelo que a escolha aponta, ou o padrão do ACP quando ela não disse (Q8). */
export function modelOf(view: AdapterCatalogView, choice: AgentModelChoice): string | null {
  const option = modelOptionOf(view.configOptions);
  if (option === null) return null;
  return choice.config[option.id] ?? option.currentValue;
}

/**
 * Por que este ACP não pode ser escolhido, ou `null` quando pode.
 *
 * A frase é a do rodapé de login, e não um código: um grupo cinza sem motivo é
 * a mesma armadilha do `+` desabilitado que a `sidebar-actions` recusou.
 */
export function unavailableReason(view: AdapterCatalogView): string | null {
  if (!view.installed) return "não instalado";
  if (view.authRequired === true) return "sem login";
  return null;
}

/**
 * A escolha com que a pílula nasce (F3.2, Q8): o ACP padrão, no modelo que ele
 * devolve como padrão. `config` vazio **é** o padrão — o daemon não aplica nada
 * que ninguém pediu.
 */
export function initialChoice(catalog: readonly AdapterCatalogView[]): AgentModelChoice {
  const preferred = catalog.find((view) => view.adapterId === DEFAULT_ADAPTER_ID && unavailableReason(view) === null);
  const usable = preferred ?? catalog.find((view) => unavailableReason(view) === null);
  return { adapterId: usable?.adapterId ?? DEFAULT_ADAPTER_ID, config: {} };
}

/**
 * A escolha de um modelo, que é também a escolha do ACP.
 *
 * O *effort* escolhido antes **não** viaja: ele é do modelo anterior, e o
 * seguinte pode nem ter a opção (`haiku`) ou ter outras choices (`gpt-6-astra`).
 */
export function chooseModel(view: AdapterCatalogView, model: string): AgentModelChoice {
  const option = modelOptionOf(view.configOptions);
  return { adapterId: view.adapterId, config: option === null ? {} : { [option.id]: model } };
}
