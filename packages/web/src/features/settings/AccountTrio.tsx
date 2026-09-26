import { useState } from "react";

import type { AdapterCatalogView } from "@lumem/shared";

import type { AgentAccountView } from "../agent/index.js";
import { effortChoicesOf, modelChoicesOf } from "./account-words.js";
import { SaveMark, type SaveState } from "./SaveMark.js";

/**
 * O modelo e o effort em que uma conversa nova desta conta nasce — o trio da
 * emenda da Q1, sem a conta, que é a própria linha.
 *
 * A lista é a que **esta conta** viu (Q9): ela é por conta, e muda com o plano.
 * Vazio é *o do adaptador* — o `null` do banco, e não um quarto valor. O effort
 * só aparece quando o modelo o oferece, e nunca com valor inventado.
 */
export function AccountTrio({
  account,
  reading,
  onSave,
}: {
  account: AgentAccountView;
  reading: AdapterCatalogView | null;
  onSave(defaults: { model: string | null; effort: string | null }): Promise<unknown>;
}) {
  const [state, setState] = useState<SaveState>({ kind: "clean" });
  const models = modelChoicesOf(reading);

  if (models === null) {
    return (
      <span className="set__trio">
        <span className="set__trio__k">conversa nova</span>
        <span className="set__d">
          {account.state === "connected"
            ? "a lista de modelos chega na primeira conversa desta conta"
            : "a lista de modelos chega quando a conta entrar"}
        </span>
      </span>
    );
  }

  const model = account.defaultModel;
  const effort = effortChoicesOf(reading, model);
  const known = model === null || models.choices.some((choice) => choice.value === model);

  async function save(next: { model: string | null; effort: string | null }): Promise<void> {
    setState({ kind: "saving" });
    try {
      await onSave(next);
      setState({ kind: "saved" });
    } catch (cause) {
      setState({ kind: "failed", why: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  return (
    <span className="set__trio">
      <span className="set__trio__k">conversa nova</span>
      <select
        className="input set__sel"
        aria-label={`modelo padrão de ${account.label}`}
        value={model ?? ""}
        onChange={(event) => {
          const nextModel = event.target.value === "" ? null : event.target.value;
          // O effort escolhido é do modelo anterior: ele só viaja se o próximo o oferece.
          const nextEffort = effortChoicesOf(reading, nextModel);
          const keeps = nextEffort?.choices.some((choice) => choice.value === account.defaultEffort) ?? false;
          void save({ model: nextModel, effort: keeps ? account.defaultEffort : null });
        }}
      >
        <option value="">o do adaptador</option>
        {models.choices.map((choice) => (
          <option key={choice.value} value={choice.value}>
            {choice.name}
          </option>
        ))}
        {/* O guardado que saiu da lista continua sendo o valor, e diz que saiu. */}
        {!known && model !== null && <option value={model}>{model} (fora da lista)</option>}
      </select>
      {effort !== null && (
        <select
          className="input set__sel"
          aria-label={`effort padrão de ${account.label}`}
          value={account.defaultEffort ?? ""}
          onChange={(event) =>
            void save({ model, effort: event.target.value === "" ? null : event.target.value })
          }
        >
          <option value="">o do modelo</option>
          {effort.choices.map((choice) => (
            <option key={choice.value} value={choice.value}>
              {choice.name}
            </option>
          ))}
        </select>
      )}
      <SaveMark state={state} />
      {account.defaultsUnavailable && (
        <span className="set__warn">indisponível — o modelo padrão saiu da lista</span>
      )}
    </span>
  );
}
