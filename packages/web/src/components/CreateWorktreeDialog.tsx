import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { worktreeBranchesKey, worktreeHostOriginsKey, worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Field, Glyph, Input, Modal } from "../ui/index.js";
import "./create-worktree.css";

export interface CreateWorktreeDialogProps {
  projectId: string;
  /** Said in the header — the row the `+` was pressed on (F1.3). */
  projectName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (worktreeId: string) => void;
  /**
   * Ir para a worktree que já existe.
   *
   * Escolher uma branch que outro checkout já tem não é erro: é uma navegação
   * ([Q5](../../../../docs/features/026-worktree-from/open-questions.md)). O
   * destino é o mesmo do `onCreated`, e o nome é outro porque nada foi criado.
   */
  onOpenExisting?: (worktreeId: string) => void;
  /**
   * Whether the repository has any commit at all, F6.13.
   *
   * Null means the daemon could not look. A repository cloned empty is a
   * legitimate project (Q19) and simply has no commit to cut a worktree from
   * for a while — the branch exists as a name and not as a commit.
   */
  hasCommits?: boolean | null;
}

/** As quatro origens da `026-worktree-from`, na ordem em que aparecem. */
export type OriginKind = "default" | "branch" | "issue" | "pr";

/** O que foi escolhido na lista, se algo foi. */
export type Pick =
  | { kind: "branch"; ref: string; local: boolean }
  | { kind: "issue"; number: number }
  | { kind: "pr"; number: number };

/**
 * As falhas do host que **apagam as abas** em vez de aparecerem dentro delas.
 *
 * Três, e todas dizem a mesma coisa: aqui não há host nenhum. As outras —
 * `offline`, `rate-limit`, `timeout` — são temporárias, e para essas a aba fica
 * e a lista explica: sumir com ela faria a tela mudar de forma por causa de um
 * wi-fi ruim.
 */
const NO_HOST = new Set(["no-binary", "no-auth", "unsupported-host"]);

/**
 * O nome da branch a partir de uma issue, montado **aqui**.
 *
 * `<número>-<slug>`, a mesma forma que o GitHub gera. O `gh issue develop` daria
 * a mesma string e **criaria uma branch no repositório remoto** — um terceiro
 * verbo de escrita no host, sem portão, disparado por digitar num modal
 * ([Q1](../../../../docs/features/026-worktree-from/open-questions.md)).
 */
export function branchNameForIssue(number: number, title: string): string {
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return slug === "" ? String(number) : `${number}-${slug}`;
}

/**
 * Creating a worktree, F4.1. The name is also the branch, F4.2 — **menos**
 * quando a origem é uma branch que já existe, que é a Q9 da `026-worktree-from`.
 *
 * Since `sidebar-actions` it opens from the `+` on the project's own row, which
 * is why it has no project selector: the gesture already answered that, and the
 * header repeats it rather than asking again.
 */
export function CreateWorktreeDialog({
  projectId,
  projectName,
  open,
  onClose,
  onCreated,
  onOpenExisting,
  hasCommits = null,
}: CreateWorktreeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [kind, setKind] = useState<OriginKind>("default");
  const [pick, setPick] = useState<Pick | null>(null);

  /*
   * Duas leituras, e não uma — a diferença é de duas ordens de grandeza.
   *
   * As branches são disco: 10 ms medidos para 85 refs. As issues e as PRs são
   * rede: ~730 ms. Numa consulta só, a aba `branch` — a única que existe em
   * projeto sem remoto — esperaria um `gh` que talvez nem esteja instalado.
   *
   * As duas começam **depois** de o diálogo existir, e nenhuma segura o campo de
   * nome: é a F3.5, e é o que a `sidebar-actions` aprendeu na Q5a.
   */
  const branches = useQuery({
    queryKey: worktreeBranchesKey(projectId),
    queryFn: () => trpc.worktree.branches.query({ projectId }),
    enabled: open,
  });
  const host = useQuery({
    queryKey: worktreeHostOriginsKey(projectId),
    queryFn: () => trpc.worktree.hostOrigins.query({ projectId }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      trpc.worktree.create.mutate({
        projectId,
        name: name.trim(),
        from: fromOf(active, pick),
      }),
    onSuccess: async (worktree) => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onCreated(worktree.id);
      close();
    },
  });

  function close(): void {
    setName("");
    setKind("default");
    setPick(null);
    create.reset();
    onClose();
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "") return;
    create.mutate();
  };

  const unborn = hasCommits === false;
  const fieldId = `worktree-name-${projectId}`;

  /*
   * Se este projeto tem host, e a resposta enquanto ninguém sabe ainda.
   *
   * Enquanto a leitura não voltou, as quatro abas estão lá: a aparência de
   * carregando é a lista, não o trilho. Quando a resposta diz que não há host —
   * sem remoto, sem `gh`, ou sem autenticação — as duas somem, e o motivo
   * aparece uma vez abaixo do trilho.
   */
  const hostFailure = host.data?.issues.failure ?? host.data?.pulls.failure ?? null;
  const hostOff =
    host.data !== undefined &&
    (host.data.host === null || NO_HOST.has(hostFailure?.kind ?? ""));
  const kinds: OriginKind[] = hostOff ? ["default", "branch"] : ["default", "branch", "issue", "pr"];

  // A aba escolhida sumiu debaixo da escolha: volta para a que sempre existe, em
  // vez de deixar um corpo sem trilho correspondente.
  const active = kinds.includes(kind) ? kind : "default";

  /*
   * A escolha que ainda descreve a aba aberta.
   *
   * `pick` sozinho descreveria uma origem que a tela não está mostrando: com as
   * abas de host sumindo debaixo da escolha, o eco diria "da head da PR #19"
   * embaixo de um trilho com `default` pressionado. O `fromOf` faz a mesma
   * pergunta do outro lado, e as duas respostas têm que ser a mesma.
   */
  const chosen = pick !== null && pick.kind === active ? pick : null;

  function choose(next: Pick, suggested: string): void {
    setPick(next);
    // A origem **sugere**: ela escreve no campo, e o campo continua editável.
    setName(suggested);
  }

  return (
    <Modal
      open={open}
      title="Nova worktree"
      where={
        <>
          em
          <Glyph tone="project">■</Glyph>
          <b>{projectName}</b>
        </>
      }
      onClose={close}
      footer={
        <>
          <Button
            type="submit"
            form={FORM_ID}
            variant="primary"
            disabled={create.isPending || name.trim() === "" || unborn}
          >
            {/* `git worktree add` copies a whole checkout. On a large repository
                this is seconds, and a button that looks idle invites a second
                click that would fail on the branch the first one just made. */}
            {create.isPending ? "criando…" : "criar"}
          </Button>
          <Button variant="ghost" onClick={close}>
            {unborn ? "fechar" : "cancelar"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit}>
        {!unborn && (
          <div className="origin">
            <div className="seg" role="group" aria-label="de onde cortar">
              {kinds.map((option) => (
                <button
                  key={option}
                  type="button"
                  className="seg__btn"
                  aria-pressed={active === option}
                  onClick={() => {
                    setKind(option);
                    setPick(null);
                  }}
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
                    // F3.3: sem fetch. A linha diz por que não serve, e não some
                    // — sumir esconderia que a PR existe.
                    disabled={!pull.onDisk}
                    aria-selected={pick?.kind === "pr" && pick.number === pull.number}
                    onClick={() => choose({ kind: "pr", number: pull.number }, pull.headRefName)}
                  >
                    <span className="orow__n">#{pull.number}</span>
                    <span className="orow__t">{pull.title}</span>
                    {!pull.onDisk && (
                      <span className="orow__note">
                        {/* Fork é outro motivo, e a palavra importa: a branch
                            homônima local existe, e é outra coisa. */}
                        {pull.crossRepository ? "vem de um fork" : "não está no disco"}
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
        )}

        <Field
          id={fieldId}
          label="Nome da worktree"
          // The daemon's own words: "a branch X já existe; escolha outro nome"
          // tells the user what to do, "erro" does not.
          error={create.isError ? create.error.message : undefined}
        >
          <Input
            id={fieldId}
            // Onde o foco cai ao abrir, e não no trilho de origem acima: a
            // origem é opcional, o nome não.
            data-modal-focus=""
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="teste-prd"
            invalid={create.isError}
          />
        </Field>
        {unborn ? (
          /*
           * F6.13. The server refuses this too — the screen avoids the error,
           * the daemon forbids it. Letting git answer would print "invalid
           * reference", which explains nothing to anybody.
           *
           * It is said *here* now, and not on a disabled trigger: since the
           * trigger is a 24px `+` on a tree row, disabling it would have been a
           * grey button with its reason nowhere on screen.
           */
          <Banner tone="warning">
            este repositório ainda não tem nenhum commit — faça o primeiro para poder cortar
            worktrees
          </Banner>
        ) : chosen === null ? (
          <p className="create-worktree__hint">
            A branch tem o mesmo nome. Barra vira diretório aninhado.
          </p>
        ) : (
          <p className={`create-worktree__hint fname${chosen.kind === "branch" && chosen.local ? " fname--branch" : ""}`}>
            <span className="fname__g">{chosen.kind === "branch" && chosen.local ? "⑂" : "◈"}</span>
            <span>{echoOf(chosen)}</span>
          </p>
        )}

        {create.isPending && (
          <Banner tone="info">copiando o checkout — em repositório grande isto leva alguns segundos</Banner>
        )}
      </form>
    </Modal>
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
  children: React.ReactNode[];
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

/** O que a origem escolhida diz sobre o nome, abaixo do campo. */
function echoOf(pick: Pick): string {
  switch (pick.kind) {
    case "branch":
      return pick.local
        ? `na branch ${pick.ref}, que já existe — o nome é só desta worktree`
        : `da branch publicada ${pick.ref}, rastreando ela`;
    case "issue":
      return `da issue #${pick.number} — corta da default, como sempre`;
    case "pr":
      return `da head da PR #${pick.number}, que já está no disco`;
  }
}

/**
 * O pedido que vai ao daemon. `default` não viaja: ausente quer dizer isso.
 *
 * Recebe o `active`, e não o `kind` cru — a diferença entre os dois aparece
 * quando a aba escolhida **desaparece debaixo da escolha**: o host responde
 * `no-auth` numa releitura, as abas de host somem, o trilho passa a desenhar
 * `default` pressionado, e o `kind` continua `"pr"`. Com o `kind`, o `criar`
 * mandaria a origem da PR enquanto a tela dizia que estava cortando da default.
 */
export function fromOf(kind: OriginKind, pick: Pick | null) {
  if (kind === "default" || pick === null) return undefined;
  // A aba mudou e a escolha é de outra: ela não vale mais.
  if (kind !== pick.kind) return undefined;
  return pick;
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

/** Ties the footer's submit button to the body's form across the modal. */
const FORM_ID = "create-worktree";
