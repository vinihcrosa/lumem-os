import { useState } from "react";

import { MemoryEntries } from "./MemoryEntries.js";
import { MemoryNumbers } from "./MemoryNumbers.js";
import { MemoryPlaybooks } from "./MemoryPlaybooks.js";
import { MemoryTimeline } from "./MemoryTimeline.js";
import { useMemoryCore, useMemoryList, useProposals, type MemoryScopeFilter } from "./useMemory.js";

/**
 * A memória na tela — quatro vistas, uma coluna.
 *
 * Desde a `032` T28, este arquivo só roteia: as quatro vistas moram em
 * `MemoryEntries`, `MemoryPlaybooks`, `MemoryTimeline` e `MemoryNumbers` —
 * `MemoryProposals`, a quinta, saiu da tela na `022` T4 e mora ao lado.
 */

export type MemoryTab = "entries" | "playbooks" | "timeline" | "numbers";

export interface MemoryPanelProps extends MemoryScopeFilter {
  tab?: MemoryTab;
  onTabChange?(tab: MemoryTab): void;
}

const TABS: readonly { id: MemoryTab; label: string }[] = [
  { id: "entries", label: "Memória" },
  // Aba própria, e não uma seção da primeira: playbook não é memória (§6 do
  // PRD), e o que a lista dele mostra é uso, não escopo.
  { id: "playbooks", label: "Playbooks" },
  { id: "timeline", label: "Histórico" },
  { id: "numbers", label: "Números" },
];

export function MemoryPanel({ workspaceId, projectId, tab, onTabChange }: MemoryPanelProps) {
  const [internal, setInternal] = useState<MemoryTab>("entries");
  const active = tab ?? internal;
  const setTab = (next: MemoryTab) => {
    setInternal(next);
    onTabChange?.(next);
  };

  const list = useMemoryList({ workspaceId, projectId });
  const core = useMemoryCore({ workspaceId, projectId });
  // Prefetch: aquece o cache da inbox única (`ProposalQueue`) enquanto o
  // painel de memória está montado, mesmo sem uma aba de propostas aqui.
  useProposals("pending");

  return (
    <section className="mem-panel" aria-label="Memória do workspace">
      {/*
        Sem título próprio, e sem repetir a contagem.
        A faixa do painel direito já diz "Memória" e já traz o número — e a
        primeira aba aqui também se chama Memória. Renderizado em 360px, a mesma
        palavra aparecia três vezes na mesma linha, e a quarta aba (`Números`)
        ficava cortada porque não sobrava largura para ela.
      */}
      <header className="mem-head">
        <div role="tablist" aria-label="Vistas da memória" className="mem-tabs">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`mem-tab-${item.id}`}
              aria-selected={active === item.id}
              aria-controls="mem-panel-body"
              // Classe explícita, e não `[aria-selected]` no CSS: é a convenção
              // do resto do app (`tab-item--active`), e sem ela nenhuma das
              // quatro abas aparenta estar aberta.
              className={`mem-tab${active === item.id ? " mem-tab--active" : ""}`}
              onClick={() => {
                setTab(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      </header>

      <div className="mem-body" id="mem-panel-body" role="tabpanel" aria-labelledby={`mem-tab-${active}`}>
        {active === "entries" ? (
          <MemoryEntries query={list} core={core} scope={{ workspaceId, projectId }} />
        ) : null}
        {active === "playbooks" ? <MemoryPlaybooks workspaceId={workspaceId} projectId={projectId} /> : null}
        {active === "timeline" ? <MemoryTimeline /> : null}
        {active === "numbers" ? <MemoryNumbers core={core} /> : null}
      </div>
    </section>
  );
}
