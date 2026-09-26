import { useId } from "react";

import { adapterById, type AdapterCatalogView } from "@lumem/shared";

import { useAdapterCatalog, useAgentAccounts, type AgentAccountView } from "../agent/index.js";
import { useConveyorSlots, useWorkspaceMutations, type ConveyorSlot } from "../workspace/index.js";
import { effortChoicesOf, modelChoicesOf, readingFor } from "./account-words.js";
import { SettingRow } from "./SettingsPanel.js";

const NO_ACCOUNTS: readonly AgentAccountView[] = [];
const NO_CATALOG: readonly AdapterCatalogView[] = [];

/** O nome do encaixe na tela. O dado é o do daemon, em ascii; quem traduz é a tela. */
const ROLE_LABEL: Record<ConveyorSlot["role"], string> = {
  implementador: "Implementador",
  revisor: "Revisor",
  testador: "Testador",
};

/**
 * Os três encaixes da esteira, com o trio de cada um (`034` T16, Q5).
 *
 * O degrau mostrado é o do **workspace**: o de projeto e o de tarefa ganham dele
 * na cascata, e continuam sem tela. Nulo é *herde* — a conta padrão do agente e
 * os padrões dela —, e a linha escreve o que isso resolve hoje em vez de um
 * campo vazio que não diz nada.
 *
 * Trocar a conta volta modelo e effort para *herdar da conta nova* (Q1a): o
 * trio é composto, e o modelo da conta de antes pode nem existir na lista da
 * nova.
 *
 * Eles moram na seção do orçamento, e sem legenda de grupo liam como mais três
 * tetos: `Quem faz cada papel` os separa sem uma seção a mais.
 */
export function ConveyorSlots({ workspaceId }: { workspaceId: string }) {
  const slots = useConveyorSlots(workspaceId).data ?? [];
  const accounts = useAgentAccounts().data ?? NO_ACCOUNTS;
  const catalog = useAdapterCatalog(null).data ?? NO_CATALOG;
  const { setSlot } = useWorkspaceMutations(workspaceId);
  const headId = useId();

  return (
    <div className="set__rows" role="group" aria-labelledby={headId}>
      <h3 className="set__group" id={headId}>
        Quem faz cada papel
      </h3>
      {slots.map((slot) => (
        <SlotRow
          key={slot.role}
          slot={slot}
          accounts={accounts}
          catalog={catalog}
          onSave={(next) => setSlot.mutate({ role: slot.role, ...next })}
        />
      ))}
      {setSlot.error !== null && (
        <span className="set__err" role="alert">
          {setSlot.error.message}
        </span>
      )}
    </div>
  );
}

type Trio = { adapter: string; accountId: string | null; model: string | null; effort: string | null };

function SlotRow({
  slot,
  accounts,
  catalog,
  onSave,
}: {
  slot: ConveyorSlot;
  accounts: readonly AgentAccountView[];
  catalog: readonly AdapterCatalogView[];
  onSave(next: Trio): void;
}) {
  const role = slot.role;
  const account =
    accounts.find((each) => each.id === slot.accountId) ??
    accounts.find((each) => each.adapterId === slot.adapter && each.isDefault) ??
    null;
  const reading = account === null ? null : readingFor(catalog, account);
  const models = modelChoicesOf(reading);
  const effort = effortChoicesOf(reading, slot.model ?? account?.defaultModel ?? null);
  const current = { adapter: slot.adapter, accountId: slot.accountId, model: slot.model, effort: slot.effort };

  return (
    <div role="group" aria-label={`encaixe ${role}`}>
      <SettingRow label={ROLE_LABEL[role]} description={describe(slot, account)} owner="workspace">
        <select
          className="input set__sel"
          aria-label={`conta do ${role}`}
          value={`${slot.adapter}:${slot.accountId ?? ""}`}
          onChange={(event) => {
            const [adapter = slot.adapter, accountId = ""] = event.target.value.split(":");
            onSave({ adapter, accountId: accountId === "" ? null : accountId, model: null, effort: null });
          }}
        >
          {accountOptions(accounts, slot)}
        </select>
        {/* Legenda à vista: dois `▾` com *"padrão da conta"* dentro não dizem qual é qual. */}
        {models !== null && <span className="set__trio__k">modelo</span>}
        {models !== null && (
          <select
            className="input set__sel"
            aria-label={`modelo do ${role}`}
            value={slot.model ?? ""}
            onChange={(event) => {
              const model = event.target.value === "" ? null : event.target.value;
              const offered = effortChoicesOf(reading, model ?? account?.defaultModel ?? null);
              const keeps = offered?.choices.some((choice) => choice.value === slot.effort) ?? false;
              onSave({ ...current, model, effort: keeps ? slot.effort : null });
            }}
          >
            <option value="">padrão da conta</option>
            {models.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.name}
              </option>
            ))}
          </select>
        )}
        {effort !== null && <span className="set__trio__k">effort</span>}
        {effort !== null && (
          <select
            className="input set__sel"
            aria-label={`effort do ${role}`}
            value={slot.effort ?? ""}
            onChange={(event) => onSave({ ...current, effort: event.target.value === "" ? null : event.target.value })}
          >
            <option value="">padrão da conta</option>
            {effort.choices.map((choice) => (
              <option key={choice.value} value={choice.value}>
                {choice.name}
              </option>
            ))}
          </select>
        )}
      </SettingRow>
    </div>
  );
}

/** `Claude Code · conta padrão`, e cada conta conectada — por agente, na ordem em que foram conectadas. */
function accountOptions(accounts: readonly AgentAccountView[], slot: ConveyorSlot) {
  const adapters = [...new Set([slot.adapter, ...accounts.map((account) => account.adapterId)])];
  return adapters.flatMap((adapterId) => {
    const label = adapterById(adapterId)?.label ?? adapterId;
    const mine = accounts.filter(
      (account) => account.adapterId === adapterId && (account.state === "connected" || account.id === slot.accountId),
    );
    return [
      <option key={`${adapterId}:`} value={`${adapterId}:`}>
        {label} · conta padrão
      </option>,
      ...mine.map((account) => (
        <option key={account.id} value={`${adapterId}:${account.id}`}>
          {label} · {account.label}
        </option>
      )),
    ];
  });
}

/**
 * De que degrau o encaixe veio, e em que conta ele roda — uma linha. Agente,
 * modelo e effort já estão nos seletores ao lado; repeti-los aqui quebrava a
 * descrição em quatro linhas.
 */
function describe(slot: ConveyorSlot, account: AgentAccountView | null): string {
  const origin = slot.from === "workspace" ? "deste workspace" : "padrão do produto";
  return `${origin} · ${account?.label ?? "sem conta conectada"}`;
}
