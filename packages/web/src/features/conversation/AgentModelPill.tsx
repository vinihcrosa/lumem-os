import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import {
  chooseModel,
  effortOptionOf,
  modelOf,
  modelOptionOf,
  optionsForModel,
  unavailableReason,
  type AgentModelChoice,
} from "./agent-model.js";
import { ConfigPills } from "./ConfigPills.js";

/**
 * A pílula de agente e modelo (`033` F3) — uma só, com os modelos agrupados por
 * ACP: escolher um modelo escolhe o ACP (F3.1).
 *
 * Presentacional: o catálogo e a escolha chegam por prop, e a escolha sai por
 * `onChange`. Quem liga o `useAdapterCatalog` é a T16.
 *
 * O menu é um `.slash`, ancorado na pílula pelo `.config` e com o teto
 * `--size-menu-max-h` — a regra da `023` (F3.5). O cabeçalho de cada grupo é
 * fixo no topo enquanto a lista rola: com vinte modelos num grupo, o nome do
 * ACP é o que diz de quem é a linha que está no meio da tela.
 */

export interface AgentModelPillProps {
  catalog: readonly AdapterCatalogView[];
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
  value,
  onChange,
  disabled = false,
  defaultOpen = false,
  onLogin,
}: AgentModelPillProps) {
  const [open, setOpen] = useState(defaultOpen);
  const view = catalog.find((entry) => entry.adapterId === value.adapterId) ?? null;
  const model = view === null ? null : modelOf(view, value);
  const modelName =
    view === null || model === null
      ? null
      : (modelOptionOf(view.configOptions)?.choices.find((choice) => choice.value === model)?.name ?? model);

  const label = view === null ? value.adapterId : view.label;
  const effort = view === null || model === null ? null : effortFor(view, model, value);

  return (
    <>
      <span className="config">
        <button
          type="button"
          className="pill pill--agent focus-ring"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`agente e modelo: ${label} · ${modelName ?? "carregando modelos"}`}
          disabled={disabled}
          onClick={() => setOpen(!open)}
        >
          <span className="pill__who">{label}</span>
          <span className="pill__model">{modelName ?? "carregando modelos…"}</span>
          <span className="pill__caret" aria-hidden="true">
            ▾
          </span>
        </button>

        {open && !disabled && (
          <div className="slash agent-menu" role="menu" aria-label="agente e modelo">
            {catalog.map((entry) => (
              <AdapterGroup
                key={entry.adapterId}
                view={entry}
                chosen={entry.adapterId === value.adapterId ? model : null}
                onLogin={onLogin}
                onChoose={(next) => {
                  setOpen(false);
                  onChange(chooseModel(entry, next));
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

/** A opção de *effort* do modelo, com o valor que a escolha já tem. */
function effortFor(view: AdapterCatalogView, model: string, choice: AgentModelChoice) {
  const options = optionsForModel(view, model);
  const option = options === null ? null : effortOptionOf(options);
  if (option === null) return null;
  const chosen = choice.config[option.id];
  const valid = chosen !== undefined && option.choices.some((entry) => entry.value === chosen);
  return valid ? { ...option, currentValue: chosen } : option;
}

interface AdapterGroupProps {
  view: AdapterCatalogView;
  /** O modelo marcado neste grupo, ou `null` quando a escolha é de outro ACP. */
  chosen: string | null;
  onChoose(model: string): void;
  onLogin?(adapterId: string): void;
}

/** Um ACP: o nome no cabeçalho, e os modelos dele — ou o motivo de não ter. */
function AdapterGroup({ view, chosen, onChoose, onLogin }: AdapterGroupProps) {
  const reason = unavailableReason(view);
  const models = modelOptionOf(view.configOptions);
  const headId = `agent-menu-${view.adapterId}`;

  return (
    <div className="agent-menu__group" role="group" aria-labelledby={headId}>
      <div className="agent-menu__head" id={headId}>
        {view.label}
        {reason !== null && <span className="agent-menu__why">{reason}</span>}
      </div>

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
