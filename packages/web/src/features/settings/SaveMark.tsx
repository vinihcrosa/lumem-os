/** O que a linha diz sobre si mesma depois que você mexeu nela. */
export type SaveState = { kind: "clean" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; why: string };

/**
 * O retorno de quem grava no gesto — as palavras e os `--color-save-*` do
 * editor. Arquivo próprio porque são duas seções que gravam assim: os tetos e o
 * trio padrão de cada conta (`034` T13).
 */
export function SaveMark({ state }: { state: SaveState }) {
  if (state.kind === "clean") return null;
  const label =
    state.kind === "saving" ? "salvando…" : state.kind === "saved" ? "salvo" : "não deu para salvar";
  return (
    <span className={`set__save set__save--${state.kind}`} title={state.kind === "failed" ? state.why : undefined}>
      <span className="set__save__dot" aria-hidden="true" />
      {label}
    </span>
  );
}
