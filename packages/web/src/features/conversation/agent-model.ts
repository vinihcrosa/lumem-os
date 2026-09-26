import { DEFAULT_ADAPTER_ID, type AcpConfigOption, type AdapterCatalogView } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";

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
  /**
   * Em que conta a conversa nasce (`034` T14). Ausente quando o agente não tem
   * conta lida — o daemon cai na padrão, como antes da `034`.
   */
  accountId?: string;
  config: Readonly<Record<string, string>>;
}

/**
 * As contas que a pílula oferece: conectadas, ou que ainda não entraram.
 *
 * A desconectada por alguém (Q8) fica de fora — reconectar é gesto de
 * `/settings`, e uma conversa não nasce numa conta cujo login foi desfeito. A
 * que nunca entrou fica: escolhê-la mostra *sem login* no grupo, com o caminho.
 */
export function pickableAccounts(accounts: readonly AgentAccountView[], adapterId: string): AgentAccountView[] {
  return accounts.filter(
    (account) => account.adapterId === adapterId && (account.state === "connected" || account.identity === null),
  );
}

/**
 * A escolha com a conta padrão do agente dela (Q1a). Sem padrão, sem conta: o
 * daemon decide, e é ele quem diz *"conecte uma conta"* quando não há nenhuma.
 */
function withDefaultAccount(adapterId: string, config: Readonly<Record<string, string>>, accounts: readonly AgentAccountView[]): AgentModelChoice {
  const account = pickableAccounts(accounts, adapterId).find((each) => each.isDefault);
  return account === undefined ? { adapterId, config } : { adapterId, accountId: account.id, config };
}

/**
 * A escolha de uma conta: o modelo e o effort voltam aos padrão **dela** (Q1a).
 * `config` vazio é isso — quem aplica o trio da conta é o daemon, e a pílula
 * mostra o mesmo por `modelOf`.
 */
export function chooseAccount(adapterId: string, accountId: string): AgentModelChoice {
  return { adapterId, accountId, config: {} };
}

/**
 * A leitura do catálogo que vale para a escolha: a da conta dela.
 *
 * Sem leitura da conta, a padrão usa a primeira do agente (o daemon põe a da
 * padrão na frente). Uma outra conta sem leitura não tem lista para mostrar: se
 * ela nunca entrou, o grupo diz *sem login*; se entrou, *carregando modelos*.
 */
export function viewForChoice(
  catalog: readonly AdapterCatalogView[],
  choice: AgentModelChoice,
  accounts: readonly AgentAccountView[],
): AdapterCatalogView | null {
  const readings = catalog.filter((view) => view.adapterId === choice.adapterId);
  const first = readings[0];
  if (first === undefined) return null;
  if (choice.accountId === undefined) return first;
  const own = readings.find((view) => view.accountId === choice.accountId);
  if (own !== undefined) return own;
  const account = accounts.find((each) => each.id === choice.accountId);
  if (account === undefined || account.isDefault) return first;
  return {
    ...first,
    accountId: account.id,
    configOptions: [],
    optionsByModel: {},
    authRequired: account.state === "connected" ? null : true,
  };
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

/**
 * O modelo que a escolha aponta; sem ele, o padrão da conta (Q1a) quando a
 * lista dela ainda o tem; sem os dois, o padrão do ACP (Q8). É a mesma ordem em
 * que o daemon aplica, então o que a pílula diz é o que a sessão nasce.
 */
export function modelOf(
  view: AdapterCatalogView,
  choice: AgentModelChoice,
  account: AgentAccountView | null = null,
): string | null {
  const option = modelOptionOf(view.configOptions);
  if (option === null) return null;
  const explicit = choice.config[option.id];
  if (explicit !== undefined) return explicit;
  const fallback = account?.defaultModel ?? null;
  if (fallback !== null && option.choices.some((entry) => entry.value === fallback)) return fallback;
  return option.currentValue;
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
export function initialChoice(
  catalog: readonly AdapterCatalogView[],
  accounts: readonly AgentAccountView[] = [],
): AgentModelChoice {
  const preferred = catalog.find((view) => view.adapterId === DEFAULT_ADAPTER_ID && unavailableReason(view) === null);
  const usable = preferred ?? catalog.find((view) => unavailableReason(view) === null);
  return withDefaultAccount(usable?.adapterId ?? DEFAULT_ADAPTER_ID, {}, accounts);
}

/**
 * A escolha de um modelo, que é também a escolha do ACP.
 *
 * O *effort* escolhido antes **não** viaja: ele é do modelo anterior, e o
 * seguinte pode nem ter a opção (`haiku`) ou ter outras choices (`gpt-6-astra`).
 */
export function chooseModel(
  view: AdapterCatalogView,
  model: string,
  current: AgentModelChoice | null = null,
  accounts: readonly AgentAccountView[] = [],
): AgentModelChoice {
  const option = modelOptionOf(view.configOptions);
  const config = option === null ? {} : { [option.id]: model };
  // No mesmo agente, a conta escolhida fica; noutro, vale a padrão dele.
  if (current?.adapterId === view.adapterId && current.accountId !== undefined) {
    return { adapterId: view.adapterId, accountId: current.accountId, config };
  }
  return withDefaultAccount(view.adapterId, config, accounts);
}
