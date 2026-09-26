import { useState } from "react";

import type { AdapterSpec } from "@lumem/shared";

import { useAgentAccountMutations, type AgentAccountView } from "../agent/index.js";
import { Button, Field, Input } from "../../ui/index.js";

type Kind = "subscription" | "api_key";

/**
 * Conectar uma conta nova a um agente (`034` T13).
 *
 * Antes de confirmar, o painel diz o que a conta **vai** levar da sua
 * configuração de hoje e o que **não** vai (Q10): a segunda conta do Claude
 * nasce sem os MCPs de usuário, e quem descobre isso na primeira conversa não
 * entende por quê.
 *
 * A linha dos termos de uso só aparece quando o agente **já tem** conta (§8):
 * é o único momento em que a frase é sobre o que você está fazendo.
 */
export function ConnectAccountPanel({
  spec,
  hasAccounts,
  onClose,
  onConnected,
}: {
  spec: AdapterSpec;
  hasAccounts: boolean;
  onClose(): void;
  onConnected(account: Pick<AgentAccountView, "id" | "kind">): void;
}) {
  const [label, setLabel] = useState("");
  const [kind, setKind] = useState<Kind>("subscription");
  const [apiKey, setApiKey] = useState("");
  const { connect } = useAgentAccountMutations();

  const ready = label.trim() !== "" && (kind === "subscription" || apiKey.trim() !== "") && !connect.isPending;
  const labelId = `connect-${spec.id}-label`;
  const keyId = `connect-${spec.id}-key`;

  function submit(): void {
    if (!ready) return;
    connect.mutate(
      {
        adapterId: spec.id,
        label: label.trim(),
        kind,
        ...(kind === "api_key" ? { apiKey: apiKey.trim() } : {}),
      },
      {
        onSuccess: (result) => {
          // A chave não fica na tela depois de atravessar para o cofre.
          setApiKey("");
          onConnected({ id: result.account.id, kind });
        },
      },
    );
  }

  return (
    <div className="set__connect" role="group" aria-label={`conectar conta do ${spec.label}`}>
      <span className="set__lbl">Nova conta do {spec.label}</span>
      <Field id={labelId} label="nome da conta" hint="O nome é seu — é ele que a pílula da conversa mostra.">
        <Input
          id={labelId}
          value={label}
          placeholder="pessoal, trabalho…"
          onChange={(event) => setLabel(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submit();
          }}
        />
      </Field>

      <span className="seg" role="group" aria-label="tipo de conta">
        <button type="button" className="seg__btn focus-ring" aria-pressed={kind === "subscription"} onClick={() => setKind("subscription")}>
          assinatura
        </button>
        <button type="button" className="seg__btn focus-ring" aria-pressed={kind === "api_key"} onClick={() => setKind("api_key")}>
          chave de API
        </button>
      </span>

      {kind === "api_key" && (
        <Field id={keyId} label="chave de API" hint="Vai cifrada para o cofre do Lumem, e não volta para esta tela.">
          <Input id={keyId} type="password" value={apiKey} placeholder="sk-…" onChange={(event) => setApiKey(event.target.value)} />
        </Field>
      )}

      <ul className="set__inherit">
        {spec.inheritLinks.length > 0 && (
          <li>
            liga da sua configuração de hoje (<code>~/{spec.defaultConfigDir}</code>):{" "}
            {spec.inheritLinks.map((item, index) => (
              <span key={item}>
                {index > 0 && ", "}
                <code>{item}</code>
              </span>
            ))}
          </li>
        )}
        {spec.notInherited.map((item) => (
          <li key={item}>
            <b>não leva</b> {item}
          </li>
        ))}
        {hasAccounts && <li className="set__terms">usar duas assinaturas para somar limite pode ferir os termos do provedor</li>}
      </ul>

      {connect.error !== null && (
        <span className="set__err" role="alert">
          {connect.error.message}
        </span>
      )}

      <span className="setup__acts">
        <Button size="sm" variant="primary" disabled={!ready} onClick={submit}>
          {connect.isPending ? "conectando…" : "conectar"}
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose}>
          cancelar
        </Button>
      </span>
    </div>
  );
}
