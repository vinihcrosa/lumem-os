import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import { useAdapterCatalog, useAgentAccounts, type AgentAccountView } from "../agent/index.js";
import {
  accountNeedsLogin,
  chooseAccount,
  chooseModel,
  effortOptionOf,
  initialChoice,
  modelOf,
  modelOptionOf,
  optionsForModel,
  pickableAccounts,
  unavailableReason,
  viewForChoice,
  type AgentModelChoice,
} from "./agent-model.js";
import { ConfigPills } from "./ConfigPills.js";

const NO_CATALOG: readonly AdapterCatalogView[] = [];
const NO_ACCOUNTS: readonly AgentAccountView[] = [];

/**
 * A escolha de agente e modelo, com o catálogo de verdade do projeto (`033` T16).
 *
 * `choice` é o que o pai manda ao daemon — `{ adapterId, config }`, a forma do
 * `session.createAgent` e do `worktree.start`. Enquanto ninguém escolheu, ela é
 * **derivada** do catálogo a cada render (`initialChoice`, Q8), e não um estado
 * congelado no `mount`: o catálogo chega depois da primeira pintura, e um padrão
 * sem login só se descobre quando ele chega. Depois do primeiro gesto, a escolha
 * é de quem a fez — um `catalog.changed` não a desfaz.
 */
export function useAgentModelChoice(projectId: string | null): {
  catalog: readonly AdapterCatalogView[];
  accounts: readonly AgentAccountView[];
  choice: AgentModelChoice;
  choose(next: AgentModelChoice): void;
} {
  const catalog = useAdapterCatalog(projectId).data ?? NO_CATALOG;
  const accounts = useAgentAccounts().data ?? NO_ACCOUNTS;
  const [chosen, setChosen] = useState<AgentModelChoice | null>(null);
  return { catalog, accounts, choice: chosen ?? initialChoice(catalog, accounts), choose: setChosen };
}

/**
 * A pílula de agente e modelo (`033` F3) — uma só, com os modelos agrupados por
 * ACP: escolher um modelo escolhe o ACP (F3.1).
 *
 * Presentacional: o catálogo e a escolha chegam por prop, e a escolha sai por
 * `onChange` — quem a liga ao daemon é o `useAgentModelChoice` acima, no pai,
 * porque o pai também precisa do catálogo (o rótulo e os comandos `/`).
 *
 * O menu é um `.slash`, ancorado na pílula pelo `.config` e com o teto
 * `--size-menu-max-h` — a regra da `023` (F3.5). O cabeçalho de cada grupo é
 * fixo no topo enquanto a lista rola: com vinte modelos num grupo, o nome do
 * ACP é o que diz de quem é a linha que está no meio da tela.
 */

export interface AgentModelPillProps {
  catalog: readonly AdapterCatalogView[];
  /**
   * As contas lidas (`034` T14). A escolha de conta só aparece com duas ou
   * mais do agente escolhido — com uma, a pílula é a de antes, pixel a pixel.
   */
  accounts?: readonly AgentAccountView[];
  value: AgentModelChoice;
  onChange(next: AgentModelChoice): void;
  /** Enquanto a sessão abre, ou com o compositor travado. */
  disabled?: boolean;
  /**
   * Nasce com o menu aberto.
   *
   * Existe para o erro de criação (F5.4 — *"a pílula reabre para escolher de
   * novo"*): quem monta a pílula de novo com `defaultOpen` devolve a escolha a
   * quem a fez, em vez de deixar o erro apontando para uma pílula fechada.
   */
  defaultOpen?: boolean;
  /** O caminho para o rodapé de login, quando o ACP está sem login (F3.4). */
  onLogin?(adapterId: string): void;
}

export function AgentModelPill({
  catalog,
  accounts = NO_ACCOUNTS,
  value,
  onChange,
  disabled = false,
  defaultOpen = false,
  onLogin,
}: AgentModelPillProps) {
  const [open, setOpen] = useState(defaultOpen);
  const view = viewForChoice(catalog, value, accounts);
  const account = accounts.find((each) => each.id === value.accountId) ?? null;
  const model = view === null ? null : modelOf(view, value, account);
  const modelName =
    view === null || model === null
      ? null
      : (modelOptionOf(view.configOptions)?.choices.find((choice) => choice.value === model)?.name ?? model);

  const label = view === null ? value.adapterId : view.label;
  const effort = view === null || model === null ? null : effortFor(view, model, value, account);
  // A conta só entra no botão e no menu quando há o que escolher.
  const choosable = pickableAccounts(accounts, value.adapterId);
  const accountLabel = choosable.length > 1 ? (account?.label ?? null) : null;
  const who = accountLabel === null ? label : `${label} · ${accountLabel}`;

  return (
    <>
      <span className="config">
        <button
          type="button"
          className="pill pill--agent focus-ring"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`agente e modelo: ${who} · ${modelName ?? "carregando modelos"}`}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <span className="pill__who">{label}</span>
          {accountLabel !== null && <span className="pill__acct">{accountLabel}</span>}
          <span className="pill__model">{modelName ?? "carregando modelos…"}</span>
          <span className="pill__caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {open && !disabled && (
          <div className="slash agent-menu" role="menu" aria-label="agente e modelo">
            {groupsOf(catalog, value, view).map((entry) => (
              <AdapterGroup
                key={entry.adapterId}
                view={entry}
                chosen={entry.adapterId === value.adapterId ? model : null}
                accounts={entry.adapterId === value.adapterId && choosable.length > 1 ? choosable : []}
                needsLogin={(account) => accountNeedsLogin(catalog, account, accounts)}
                chosenAccount={value.accountId ?? null}
                onLogin={onLogin}
                onChooseAccount={(accountId) => {
                  setOpen(false);
                  onChange(chooseAccount(entry.adapterId, accountId));
                }}
                onChoose={(next) => {
                  setOpen(false);
                  onChange(chooseModel(entry, next, value, accounts));
                }}
              />
            ))}
          </div>
        )}
      </span>

      {/*
        O *effort* é uma pílula do mesmo feitio que as da sessão viva — e é a
        mesma peça: o `ConfigPills` desenha uma opção do protocolo, e a opção
        aqui é a do catálogo para o modelo escolhido (M1a). Ausente quando o
        modelo não a tem, e nunca com valor inventado (F3.3).
      */}
      {effort !== null && (
        <ConfigPills
          mode=""
          options={[effort]}
          disabled={disabled}
          onSwitch={(optionId, next) =>
            onChange({ adapterId: value.adapterId, config: { ...value.config, [optionId]: next } })
          }
        />
      )}
    </>
  );
}

/**
 * Um grupo por agente, com a leitura que vale para cada um.
 *
 * O catálogo tem uma leitura **por conta** desde a `034` T9; desenhar uma por
 * entrada punha dois grupos `Claude Code` no menu. O do agente escolhido usa a
 * leitura da conta escolhida; os outros, a primeira — a da padrão.
 */
function groupsOf(
  catalog: readonly AdapterCatalogView[],
  choice: AgentModelChoice,
  chosenView: AdapterCatalogView | null,
): AdapterCatalogView[] {
  const groups: AdapterCatalogView[] = [];
  for (const entry of catalog) {
    if (groups.some((group) => group.adapterId === entry.adapterId)) continue;
    groups.push(entry.adapterId === choice.adapterId && chosenView !== null ? chosenView : entry);
  }
  return groups;
}

/**
 * A opção de *effort* do modelo, com o valor que a escolha já tem — ou o padrão
 * da conta, quando o modelo o oferece: é o que o daemon aplica sem pedido.
 */
function effortFor(
  view: AdapterCatalogView,
  model: string,
  choice: AgentModelChoice,
  account: AgentAccountView | null,
) {
  const options = optionsForModel(view, model);
  const option = options === null ? null : effortOptionOf(options);
  if (option === null) return null;
  const offered = (value: string | null | undefined): value is string =>
    value !== undefined && value !== null && option.choices.some((entry) => entry.value === value);
  const chosen = choice.config[option.id];
  if (offered(chosen)) return { ...option, currentValue: chosen };
  const fallback = account?.defaultEffort;
  return offered(fallback) ? { ...option, currentValue: fallback } : option;
}

interface AdapterGroupProps {
  view: AdapterCatalogView;
  /** O modelo marcado neste grupo, ou `null` quando a escolha é de outro ACP. */
  chosen: string | null;
  /** As contas a escolher neste grupo — vazio quando não há o que escolher. */
  accounts: readonly AgentAccountView[];
  chosenAccount: string | null;
  /** A conta que pede login antes: aparece, mas não se escolhe. */
  needsLogin(account: AgentAccountView): boolean;
  onChoose(model: string): void;
  onChooseAccount(accountId: string): void;
  onLogin?(adapterId: string): void;
}

/** Um ACP: o nome no cabeçalho, as contas dele, e os modelos — ou o motivo de não ter. */
function AdapterGroup({
  view,
  chosen,
  accounts,
  chosenAccount,
  needsLogin,
  onChoose,
  onChooseAccount,
  onLogin,
}: AdapterGroupProps) {
  const reason = unavailableReason(view);
  const models = modelOptionOf(view.configOptions);
  const headId = `agent-menu-${view.adapterId}`;

  return (
    <div className="agent-menu__group" role="group" aria-labelledby={headId}>
      <div className="agent-menu__head" id={headId}>
        {view.label}
        {reason !== null && <span className="agent-menu__why">{reason}</span>}
      </div>

      {/* Só o rótulo, que é seu (Q2): o e-mail mora em `/settings`. */}
      {accounts.length > 0 && (
        <div className="agent-menu__accts" role="group" aria-label={`conta do ${view.label}`}>
          {accounts.map((account) => {
            // Aparece, porque existe; não se escolhe, porque a conversa morreria no primeiro prompt.
            const locked = needsLogin(account);
            return (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={account.id === chosenAccount}
                className={`agent-menu__acct focus-ring${account.id === chosenAccount ? " agent-menu__acct--on" : ""}`}
                key={account.id}
                disabled={locked}
                {...(locked ? { title: "entre em Configurações → Agentes" } : {})}
                onClick={() => onChooseAccount(account.id)}
              >
                {locked ? `${account.label} · sem login` : account.label}
              </button>
            );
          })}
        </div>
      )}

      {reason !== null ? (
        /*
         * Desabilitado com o motivo e o caminho (F3.4). Sem login não há opção
         * gravada nenhuma — o `session/new` do probe foi recusado —, então não
         * existe lista cinza para desenhar: existe uma frase e um botão.
         */
        <p className="agent-menu__note">
          {view.installed
            ? `entre na conta do ${view.label} para escolher um modelo dele`
            : `o ${view.label} não está instalado neste daemon`}
          {view.installed && onLogin !== undefined && (
            <button type="button" className="agent-menu__act focus-ring" onClick={() => onLogin(view.adapterId)}>
              entrar ↓
            </button>
          )}
        </p>
      ) : models === null ? (
        // Instalado e logado, e nunca sondado: o probe do boot resolve em segundos.
        <p className="agent-menu__note">carregando modelos…</p>
      ) : (
        models.choices.map((choice) => (
          <button
            type="button"
            role="menuitemradio"
            aria-checked={choice.value === chosen}
            className={`slash__row focus-ring${choice.value === chosen ? " slash__row--on" : ""}`}
            key={choice.value}
            onClick={() => onChoose(choice.value)}
          >
            <span className="slash__cmd">{choice.value}</span>
            {/* Verbatim (A13), como no seletor da sessão viva. */}
            <span className="slash__desc">{choice.description ?? ""}</span>
          </button>
        ))
      )}
    </div>
  );
}
