import type { ReactNode } from "react";

import { Skeleton } from "../../ui/index.js";

export interface BlockProps {
  /** O nome que a região tem para quem lê a tela, e o título dela quando `title` não vem. */
  label: string;
  /** Sem título visível: a manchete é o número, e o rótulo `Consumo` fica só para leitor de tela. */
  quiet?: boolean;
  children: ReactNode;
}

/**
 * Um bloco do painel: uma região com nome, e cada uma falha sozinha (`038`, AC 50).
 */
export function Block({ label, quiet = false, children }: BlockProps) {
  return (
    <section className="menubar__block" aria-label={label}>
      {!quiet && <h2 className="menubar__title">{label}</h2>}
      {children}
    </section>
  );
}

/** `não consegui ler os recursos` — o bloco diz o que faltou, e os outros seguem. */
export function BlockError({ what }: { what: string }) {
  return (
    <p className="menubar__err" role="alert">
      não consegui ler {what}
    </p>
  );
}

export function BlockLoading({ what }: { what: string }) {
  return <Skeleton label={`lendo ${what}`} widths={["60%", "40%"]} />;
}
