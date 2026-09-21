import { ADAPTERS, type AdapterSpec } from "@lumem/shared";
import { useState } from "react";

import { describeSpec } from "./agent-words.js";
import { entryOf, useConnectAgent, useSetupAgentsReport, type AdapterEntry } from "./queries.js";
import { Banner } from "../../ui/index.js";

/**
 * O `＋`: qual agente conectar, e o preparo dele.
 *
 * A lista é o **catálogo do daemon** e não uma lista desta tela: `ADAPTERS`, no
 * `shared`. O que já está conectado continua listado, desabilitado — sumir com ele
 * faz a pessoa procurar.
 */
export function ConnectPanel({
  configured,
  onClose,
  onCustom,
  onConnected,
}: {
  configured: readonly string[];
  onClose: () => void;
  onCustom: () => void;
  onConnected: (configId: string) => void;
}) {
  const [stage, setStage] = useState<"idle" | "installing" | "handshaking">("idle");
  const [chosen, setChosen] = useState<AdapterSpec | null>(null);

  const report = useSetupAgentsReport();
  const connect = useConnectAgent(report.data, setStage);

  const startConnect = (spec: AdapterSpec): void => {
    setChosen(spec);
    connect.mutate(spec, {
      onSuccess: (id) => onConnected(id),
      onSettled: () => setStage("idle"),
    });
  };

  return (
    <div className="setup" role="group" aria-label="conectar agente">
      <div className="setup__head">
        <span className="setup__t">
          {connect.isPending ? `Preparando o ${chosen?.label ?? "agente"}` : "Conectar agente"}
        </span>
        {!connect.isPending && (
          <button type="button" className="setup__x" aria-label="fechar" onClick={onClose}>
            ✕
          </button>
        )}
      </div>

      {connect.isPending ? (
        <Preparing spec={chosen} stage={stage} entry={entryOf(report.data, chosen?.id)} />
      ) : (
        <>
          {ADAPTERS.map((spec, index) => {
            const found = entryOf(report.data, spec.id);
            const already =
              found?.adapter.path != null && configured.includes(found.adapter.path);

            return (
              <button
                type="button"
                key={spec.id}
                /*
                 * Um preenchido por painel, e é o primeiro do catálogo que ainda
                 * não está conectado. Dois preenchidos seriam duas recomendações.
                 */
                className={index === 0 && !already ? "opt opt--primary" : "opt"}
                /*
                 * Desabilitado também enquanto a detecção está no ar, e isso não é
                 * gentileza: o `connect` decide se instala lendo o que a detecção
                 * achou. Clicado antes da resposta, ele lê "não achei nada" e
                 * instala um adaptador que já estava lá — minutos de npm para nada.
                 */
                disabled={already || connect.isPending || report.isPending}
                onClick={() => startConnect(spec)}
              >
                <span className="opt__t">
                  <span className="opt__g" aria-hidden="true">
                    ◆
                  </span>
                  {spec.label}
                </span>
                <span className="opt__d">
                  {describeSpec(spec, found, already === true, report.isPending)}
                </span>
              </button>
            );
          })}
          <button type="button" className="linkbtn" onClick={onCustom}>
            outro agente ACP…
          </button>
          <span className="setup__note">
            A lista é o <b>catálogo do daemon</b>. O adaptador é instalado{" "}
            <b>dentro da pasta do app</b> e fixado numa versão — nunca <code>@latest</code>, para uma
            atualização de madrugada não mudar o comportamento do agente.
          </span>
          {connect.isError && <Banner tone="danger">{connect.error.message}</Banner>}
        </>
      )}
    </div>
  );
}

/**
 * O preparo, em duas ou três linhas.
 *
 * Três quando a spec dirige um CLI que tem que existir; **duas** quando ela traz o
 * próprio agente dentro. A linha desaparece porque a etapa desaparece — medido: o
 * `codex-acp` responde o handshake com `PATH=/nonexistent`.
 */
function Preparing({
  spec,
  stage,
  entry,
}: {
  spec: AdapterSpec | null;
  stage: "idle" | "installing" | "handshaking";
  entry: AdapterEntry | undefined;
}) {
  type Mark = "done" | "now" | "wait";
  const rows: [string, Mark][] = [];

  if (spec?.cli != null) {
    rows.push([`${spec.cli.command} encontrado`, entry?.cli?.path == null ? "wait" : "done"]);
  }
  rows.push([
    "instalando o adaptador",
    stage === "installing" ? "now" : stage === "handshaking" ? "done" : "wait",
  ]);
  rows.push(["handshake", stage === "handshaking" ? "now" : "wait"]);

  return (
    <>
      <div className="prep">
        {rows.map(([label, mark]) => (
          <div className={`prep__r prep__r--${mark}`} key={label}>
            <span className="prep__m" aria-hidden="true">
              {mark === "done" ? "✓" : mark === "now" ? "◐" : "○"}
            </span>
            {label}
          </div>
        ))}
      </div>
      <span className="setup__note">
        {spec !== null && spec.cli === null ? (
          <>
            Duas linhas, e não três: este adaptador <b>não precisa de CLI no PATH</b> — ele traz o
            próprio. Não há o que procurar na sua máquina.
          </>
        ) : (
          <>
            Nada para rodar no terminal: o adaptador é instalado <b>dentro da pasta do app</b> e
            fixado numa versão.
          </>
        )}
      </span>
    </>
  );
}
