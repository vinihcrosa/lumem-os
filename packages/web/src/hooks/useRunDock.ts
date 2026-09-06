import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lumem.runDock";

export const RUN_DOCK_MIN_HEIGHT = 96;

/**
 * A altura que ele nasce: **metade da janela**.
 *
 * A primeira versão nascia com 256px fixos e ficava colada no rodapé da tela — a
 * saída de um `pnpm dev` mal cabia, e a primeira coisa que se fazia ao abrir era
 * arrastar. Metade é o que faz o rodapé ser uma das duas metades da coluna em vez
 * de uma tira no pé dela.
 *
 * Calculada na hora de ler, e não constante: a resposta depende da janela de quem
 * está olhando, e uma constante estaria errada nas duas pontas — apertada no
 * monitor grande, grande demais no notebook.
 */
export function defaultHeight(viewport = window.innerHeight): number {
  return clampHeight(Math.round(viewport / 2), viewport);
}

/**
 * O teto é a janela menos o que a árvore precisa para continuar existindo.
 *
 * Sem isso, arrastar até em cima deixaria a coluna sem lista de arquivos — e o
 * rodapé é a segunda metade da coluna, não o lugar dela.
 */
export function maxHeight(viewport = window.innerHeight): number {
  return Math.max(RUN_DOCK_MIN_HEIGHT, viewport - 160);
}

/**
 * A largura mínima que a coluna ganha quando o rodapé abre (S1).
 *
 * Um terminal de 80 colunas quer uns 640px, e a coluna nasce com 360. Sem isto o
 * rodapé nasceria ilegível — que é exatamente a objeção que a S1 registrou antes de
 * o desenho responder.
 */
export const RUN_DOCK_PANEL_WIDTH = 640;

interface Stored {
  open: boolean;
  height: number;
}

export function clampHeight(height: number, viewport = window.innerHeight): number {
  return Math.min(maxHeight(viewport), Math.max(RUN_DOCK_MIN_HEIGHT, Math.round(height)));
}

/**
 * De onde ele cai quando ninguém escolheu nada — **aberto**, desde 2026-09-06.
 *
 * Era `false`, pelo mesmo argumento da coluna de arquivos: quem nunca pediu não
 * perde um terço da tela. O que virou o argumento foi medir o que ele custa em vez
 * de supor — numa coluna de 576px a árvore mostra 11 das 16 linhas com o rodapé na
 * metade, e não a metade inútil que a prosa supunha. Contra três linhas de árvore,
 * "minha aplicação está de pé, e em que porta?" é a primeira pergunta de quem chega
 * numa worktree, não a décima.
 *
 * Só o `open` mudou: a altura é a mesma de quem abria de propósito, porque um
 * segundo número de altura no produto é a pergunta "por que ele mudou de tamanho?"
 * para sempre. E isto é o **primeiro contato**, não uma regra: quem fechar encontra
 * a tira recolhida na próxima vez.
 */
function read(): Stored {
  const fallback: Stored = { open: true, height: defaultHeight() };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return fallback;
    const { open, height } = parsed as Partial<Stored>;
    return {
      open: typeof open === "boolean" ? open : fallback.open,
      height: typeof height === "number" ? clampHeight(height) : fallback.height,
    };
  } catch {
    // Igual à largura da coluna: preferência ilegível é preferência que nunca foi
    // escrita, e não um motivo para a tela não abrir.
    return fallback;
  }
}

function write(state: Stored): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* a altura de um rodapé não vale um crash */
  }
}

/** O mínimo que a coluna precisa ter para o rodapé ser legível — ver `widenColumnOnOpen`. */
export interface ColumnWidth {
  width: number;
  setWidth(width: number): void;
}

/**
 * O **único** gatilho do piso de 640px: abrir o rodapé pelo chevron.
 *
 * Só para cima, e só quando a coluna está estreita demais para um terminal — quem
 * já arrastou para mais que isso não é corrigido, e fechar não desfaz o que a
 * pessoa escolheu depois.
 *
 * Isto é uma função, e não três linhas dentro do `App`, porque a lista do que
 * **não** alarga é o resultado da [Q2] e da [Q5] e precisa de prova: chegar numa
 * worktree não alarga (o rodapé já nasce aberto, então nunca passa por aqui), o
 * daemon reconciliar um `run` de pé não alarga, trocar de worktree não alarga, e
 * **mandar rodar não alarga** — rodar roda, e não mexe na tela.
 */
export function widenColumnOnOpen(dock: RunDockState, column: ColumnWidth): RunDockState {
  return {
    ...dock,
    toggle: () => {
      if (!dock.open && column.width < RUN_DOCK_PANEL_WIDTH) column.setWidth(RUN_DOCK_PANEL_WIDTH);
      dock.toggle();
    },
  };
}

export interface RunDockState {
  open: boolean;
  height: number;
  toggle(): void;
  setHeight(height: number): void;
  /** Começa o arrasto da alça. O resto acontece na janela, como no `RightPanel`. */
  beginResize(event: { preventDefault(): void }): void;
}

/**
 * Se o rodapé está aberto e quão alto — lembrado entre recargas.
 *
 * **Aberto** na primeira vez, e fechado a partir da primeira vez que alguém o
 * fechar — ver o `read()` para o porquê de cada metade dessa frase.
 */
export function useRunDock(): RunDockState {
  const [state, setState] = useState<Stored>(read);
  const [dragging, setDragging] = useState(false);

  const setHeight = useCallback((height: number) => {
    setState((current) => {
      const next = { ...current, height: clampHeight(height) };
      write(next);
      return next;
    });
  }, []);

  const toggle = useCallback(() => {
    setState((current) => {
      const next = { ...current, open: !current.open };
      write(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!dragging) return;

    const onMove = (event: PointerEvent): void => {
      event.preventDefault();
      // Medido da borda de baixo da janela, e não pelo delta do ponteiro: um
      // arrasto mais rápido que um frame derraparia.
      setHeight(window.innerHeight - event.clientY);
    };
    const onUp = (): void => setDragging(false);

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [dragging, setHeight]);

  const beginResize = useCallback((event: { preventDefault(): void }) => {
    event.preventDefault();
    setDragging(true);
  }, []);

  return { open: state.open, height: state.height, toggle, setHeight, beginResize };
}
