import type { ReactNode } from "react";

import { branchNameForIssue, type OriginChoice, type OriginKind } from "./useOriginChoice.js";
import { Glyph } from "../../ui/index.js";

export interface OriginPickerProps {
  origin: OriginChoice;
  /**
   * Ir para a worktree que já existe.
   *
   * Escolher uma branch que outro checkout já tem não é erro: é uma navegação
   * ([Q5](../../../../docs/features/026-worktree-from/open-questions.md)). O
   * destino é o mesmo do `onCreated`, e o nome é outro porque nada foi criado.
   */
  onOpenExisting?: (worktreeId: string) => void;
  onCreated: (worktreeId: string) => void;
  /** Fecha o diálogo — chamado depois de navegar para uma branch já ocupada. */
  close: () => void;
}

/**
 * O trilho de origem: a aba (`seg`), as três listas (branch, issue, PR) e o
 * aviso de host desligado. Extraído do `CreateWorktreeDialog` na T19.
 *
 * `default` não tem lista própria — é texto fixo dizendo que corta sem ir à
 * rede — e por isso não conta como uma das três.
 */
export function OriginPicker({ origin, onOpenExisting, onCreated, close }: OriginPickerProps) {
  const { kinds, active, select, pick, choose, branches, host, hostOff, hostFailure } = origin;

  return (
    <div className="origin">
      <div className="seg" role="group" aria-label="de onde cortar">
        {kinds.map((option) => (
          <button
            key={option}
            type="button"
            className="seg__btn"
            aria-pressed={active === option}
            onClick={() => select(option)}
          >
            {LABEL[option]}
          </button>
        ))}
      </div>

      {active === "default" ? (
        <div className="origin__list">
          <div className="origin__empty">
            <p>corta da branch default deste projeto — sem ir à rede</p>
          </div>
        </div>
      ) : active === "branch" ? (
        <OriginList
          busy={branches.isPending}
          label="branches"
          empty="nenhuma branch além da default"
          failure={branches.isError ? branches.error.message : null}
        >
          {(branches.data ?? []).map((branch) => {
            const held = branch.worktreePath !== null;
            return (
              <button
                key={branch.name}
                type="button"
                role="option"
                className={`orow${held ? " orow--held" : ""}`}
                aria-selected={pick?.kind === "branch" && pick.ref === branch.name}
                onClick={() => {
                  // Q5: a branch ocupada não é recusa, é destino. E quando
                  // quem a ocupa é o checkout principal não há para onde
                  // ir — a linha então só informa.
                  if (held) {
                    if (branch.worktreeId !== null) {
                      (onOpenExisting ?? onCreated)(branch.worktreeId);
                      close();
                    }
                    return;
                  }
                  // Só o nome da ref. Local ou publicada, e de qual
                  // remoto, é decisão do daemon: a tela chegou a mandar
                  // `remotes[0]` e isso discordava do `remoteHolding`,
                  // que prefere `origin` — a mesma branch rastreava
                  // repositórios diferentes conforme a aba de entrada.
                  // `local` viaja só para o eco abaixo do campo.
                  choose({ kind: "branch", ref: branch.name, local: branch.local }, branch.name);
                }}
              >
                <span className="orow__ref">{branch.name}</span>
                <span className="orow__t" />
                <span className="orow__note">
                  {held
                    ? branch.worktreeName === null
                      ? "no checkout principal"
                      : `em ${branch.worktreeName}`
                    : /*
                       * `local · origin`, e não um ou outro.
                       *
                       * A folha escreve as duas metades na mesma linha, e
                       * o ternário que havia aqui descartava a segunda —
                       * a branch que é local **e** publicada aparecia só
                       * como `local`. Não é cosmético: `local` decide o
                       * glifo do eco (`⑂` × `◈`) e o caminho do daemon
                       * (`existing-branch` × `remote-branch`).
                       */
                      whereOf(branch)}
                </span>
                {held && branch.worktreeId !== null && <span className="orow__go">→</span>}
              </button>
            );
          })}
        </OriginList>
      ) : active === "issue" ? (
        <OriginList
          busy={host.isPending}
          label="issues abertas"
          empty="nenhuma issue aberta neste repositório"
          failure={hostListFailure(host, host.data?.issues.failure ?? null)}
        >
          {(host.data?.issues.items ?? []).map((issue) => (
            <button
              key={issue.number}
              type="button"
              role="option"
              className="orow"
              aria-selected={pick?.kind === "issue" && pick.number === issue.number}
              onClick={() =>
                choose(
                  { kind: "issue", number: issue.number },
                  branchNameForIssue(issue.number, issue.title),
                )
              }
            >
              <span className="orow__n">#{issue.number}</span>
              <span className="orow__t">{issue.title}</span>
            </button>
          ))}
        </OriginList>
      ) : (
        <OriginList
          busy={host.isPending}
          label="pull requests abertas"
          empty="nenhuma PR aberta neste repositório"
          failure={hostListFailure(host, host.data?.pulls.failure ?? null)}
        >
          {(host.data?.pulls.items ?? []).map((pull) => (
            <button
              key={pull.number}
              type="button"
              role="option"
              className="orow"
              aria-selected={pick?.kind === "pr" && pick.number === pull.number}
              onClick={() => choose({ kind: "pr", number: pull.number }, pull.headRefName)}
            >
              <span className="orow__n">#{pull.number}</span>
              <span className="orow__t">{pull.title}</span>
              {!pull.onDisk && (
                /*
                 * Nenhuma linha proibida, e nenhuma nota vermelha.
                 *
                 * A head que não está no clone é **buscada** no `criar` —
                 * o [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0210-pr-head-is-fetched-on-demand.md).
                 * A nota é cinza e anuncia a espera: cortar da que está em
                 * disco é instantâneo, cortar desta vai à rede primeiro, e
                 * duas linhas idênticas com comportamentos diferentes é o
                 * que ela evita.
                 */
                <span className="orow__note orow__note--wait">
                  {pull.crossRepository ? "de um fork · busca ao criar" : "busca ao criar"}
                </span>
              )}
            </button>
          ))}
        </OriginList>
      )}

      {hostOff && (
        <p className="origin__off">
          <Glyph tone="off">◌</Glyph>
          {hostFailure === null || host.data?.host === null
            ? "este projeto não tem remoto — issues e PRs vêm de um host"
            : hostFailure.kind === "no-auth"
              ? "o gh não está autenticado — rode gh auth login no terminal"
              : hostFailure.message}
        </p>
      )}
    </div>
  );
}

/** A moldura da lista: ocupada, vazia, falhando, ou com o conteúdo. */
function OriginList({
  busy,
  label,
  empty,
  failure,
  children,
}: {
  busy: boolean;
  label: string;
  empty: string;
  failure: string | null;
  children: ReactNode[];
}) {
  return (
    <div className="origin__list" role="listbox" aria-label={label} aria-busy={busy || undefined}>
      {busy ? (
        <div className="origin__skel" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : failure !== null ? (
        <div className="origin__empty">
          <p>{failure}</p>
        </div>
      ) : children.length === 0 ? (
        <div className="origin__empty">
          <p>{empty}</p>
        </div>
      ) : (
        children
      )}
    </div>
  );
}

/** Onde a branch existe: local, publicada, ou as duas — na ordem da folha. */
function whereOf(branch: { local: boolean; remotes: string[] }): string {
  return [branch.local ? "local" : null, ...branch.remotes]
    .filter((part): part is string => part !== null)
    .join(" · ");
}

/**
 * O que a lista diz quando não deu.
 *
 * Duas falhas diferentes, e é por isso que esta função existe: a do **host** vem
 * dentro da resposta (`failure`), e a da **consulta** é a query ter dado erro —
 * daemon reiniciando, projeto removido com o diálogo aberto, qualquer
 * `DomainError`. Sem olhar a segunda, `host.data` fica `undefined`, a lista fica
 * vazia, e a tela afirma *"nenhuma issue aberta neste repositório"* sobre uma
 * leitura que **não aconteceu** — o pior tipo de resposta errada, porque é
 * plausível. A aba `branch` já passava o `isError` dela.
 */
function hostListFailure(
  query: { isError: boolean; error: Error | null },
  failure: { message: string } | null,
): string | null {
  if (query.isError) return query.error?.message ?? "não deu para ler as origens deste projeto";
  return failure === null ? null : failure.message;
}

const LABEL: Record<OriginKind, string> = {
  default: "default",
  branch: "branch",
  issue: "issue",
  pr: "PR",
};
