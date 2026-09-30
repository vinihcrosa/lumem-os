import { isCompatible, type Snapshot } from "./tray-state.js";

/** O que cada item do menu faz; quem decide *o quê* é o `main.ts`, que sabe da plataforma. */
export interface MenuActions {
  openPanel(): void;
  openMain(): void;
  start(): void;
  stop(): void;
  update(): void;
  quit(): void;
}

/** Compatível, por estrutura, com o `MenuItemConstructorOptions` do Electron. */
export interface MenuEntry {
  label: string;
  enabled?: boolean;
  click?: () => void;
}

export const INCOMPATIBLE_LINE = "app e Lumem em versões incompatíveis — rode lumem menubar install";

/** `<estado> · v<versão>`, e ` · atualização disponível` quando há (AC 62 e 66). */
export function statusLine(snapshot: Snapshot): string {
  if (!snapshot.reachable) return "parado";
  if (!isCompatible(snapshot)) return INCOMPATIBLE_LINE;
  const state = snapshot.attention ? "precisa de atenção" : "rodando";
  const update = snapshot.updateAvailable ? " · atualização disponível" : "";
  return `${state} · v${snapshot.version ?? "?"}${update}`;
}

/**
 * Os seis itens do menu de contexto, na ordem do AC 62 — e nenhum separador, porque
 * o que o critério lista é o que existe.
 *
 * `Atualizar` abre o painel, e não instala na hora: é lá que a tela diz **que
 * terminais fecham** antes de fechar (AC 51), e um item de menu que instalasse sem
 * essa frase seria o único caminho que atualiza no escuro.
 */
export function buildMenu(snapshot: Snapshot, actions: MenuActions): MenuEntry[] {
  return [
    { label: "Abrir painel", click: actions.openPanel },
    { label: statusLine(snapshot), enabled: false },
    { label: "Abrir o Lumem", click: actions.openMain },
    snapshot.reachable
      ? { label: "Parar", click: actions.stop }
      : { label: "Iniciar", click: actions.start },
    { label: "Atualizar", enabled: snapshot.updateAvailable, click: actions.update },
    { label: "Sair", click: actions.quit },
  ];
}
