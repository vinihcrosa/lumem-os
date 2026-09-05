import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import type { PrMergeStrategy, PrStatus } from "@lumem/shared";

import { trpc } from "../lib/trpc.js";
import { Button, Field, Input } from "../ui/index.js";

/**
 * Os dois verbos que escrevem no remoto (F7).
 *
 * A [Q3](../../../../docs/prd/pull-request-status/open-questions.md) e a
 * [Q4](../../../../docs/prd/pull-request-status/open-questions.md) foram
 * respondidas **contra** a proposta do PRD: o `Merge` entra no v1 e o Lumem
 * cria a PR. Isso trouxe a única parte da feature que é irreversível para o
 * time inteiro, e é por isso que ela não é um clique.
 *
 * Três coisas aqui são deliberadas, e cada uma é um jeito de o portão deixar de
 * ser portão:
 *
 * - **a confirmação diz o que vai acontecer** — número, base, estratégia e
 *   destino da branch. Merge sem essa frase é merge de surpresa;
 * - **as estratégias são as que o repositório permite**, e vêm do host. O
 *   Lumem não inventa nenhuma (F7.3);
 * - **não há "não perguntar de novo"**. O dia em que isto virar preferência
 *   salva, deixa de ser portão — a mesma regra do `FreeModeGate`.
 *
 * E o portão de verdade não está aqui: está no daemon, que **relê o veredito**
 * antes de escrever (F7.2). Esta tela é conforto; a recusa lá é a garantia.
 *
 * **Sem tela desenhada**: a Q3 e a Q4 chegaram depois de o protótipo fechar, e
 * a tela 9 dele ainda diz que a barra não faz isto. Registrado como dívida no
 * §10 do PRD. O que existe aqui é feito dos tokens que já existem — nenhum
 * token novo, nenhuma cor à mão.
 *
 * O portão **não** reusa o `.gate` do modo liberado, e a tentativa de reusar
 * custou um defeito: aquele é `position: absolute; bottom: 100%` com 420px de
 * largura, ancorado ao compositor da conversa. Dentro de uma coluna de 360px
 * ele ia parar **acima do painel inteiro** — e nenhum teste via, porque o jsdom
 * não faz layout e o `toBeVisible` do Playwright aprova elemento fora da tela.
 */

export interface PrWriteDialogProps {
  verb: "merge" | "create";
  status: PrStatus;
  worktreeId: string;
  onClose(): void;
}

const STRATEGY_LABEL: Record<PrMergeStrategy, string> = {
  squash: "squash",
  merge: "merge commit",
  rebase: "rebase",
};

export function PrWriteDialog(props: PrWriteDialogProps) {
  const cancel = useRef<HTMLButtonElement>(null);

  // Foco na saída, e não no caminho — como o portão do modo liberado faz.
  useEffect(() => cancel.current?.focus(), []);

  return (
    <div
      className="prgate"
      role="dialog"
      aria-modal="true"
      aria-label={props.verb === "merge" ? "mesclar a pull request" : "abrir uma pull request"}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        props.onClose();
      }}
    >
      {props.verb === "merge" ? (
        <MergeForm {...props} cancelRef={cancel} />
      ) : (
        <CreateForm {...props} cancelRef={cancel} />
      )}
    </div>
  );
}

type FormProps = PrWriteDialogProps & { cancelRef: React.RefObject<HTMLButtonElement | null> };

function useInvalidate(worktreeId: string) {
  const queryClient = useQueryClient();
  return () => {
    // Mesclar muda a barra, o marcador da sidebar e a lista de worktrees. Três
    // invalidações e não uma: são três consultas diferentes sobre o mesmo fato,
    // e invalidar duas de três é como uma tela passa a discordar de si mesma.
    void queryClient.invalidateQueries({ queryKey: ["pr"] });
    void queryClient.invalidateQueries({ queryKey: ["worktree"] });
    void queryClient.invalidateQueries({ queryKey: ["changes"] });
    return worktreeId;
  };
}

function MergeForm({ status, worktreeId, onClose, cancelRef }: FormProps) {
  const invalidate = useInvalidate(worktreeId);
  const allowed = allowedStrategies(status);
  const [strategy, setStrategy] = useState<PrMergeStrategy>(allowed[0] ?? "merge");
  const [deleteBranch, setDeleteBranch] = useState(status.merge.deleteBranchOnMerge);

  const merge = useMutation({
    mutationFn: () => trpc.pr.merge.mutate({ worktreeId, strategy, deleteBranch }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const pull = status.pull;
  if (pull === null) return null;

  return (
    <form
      className="prform"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        merge.mutate();
      }}
    >
      <div className="prgate__t">
        <span className="prgate__g" aria-hidden="true">
          ⚠
        </span>
        Mesclar a #{pull.number}?
      </div>

      {/* O que vai acontecer, escrito antes de acontecer. Merge é irreversível
          para o time inteiro, e a frase é a diferença entre decidir e clicar. */}
      <div className="prform__what">
        <span>
          <b>{pull.head}</b> entra em <b>{pull.base}</b>, por <b>{STRATEGY_LABEL[strategy]}</b>.
        </span>
        <span>
          {deleteBranch
            ? "A branch remota é apagada. A worktree local fica onde está."
            : "A branch remota fica. A worktree local também."}
        </span>
      </div>

      <div className="prform__field">
        <span className="prform__label">estratégia</span>
        <div className="prform__strategies" role="radiogroup" aria-label="estratégia de merge">
          {allowed.map((option) => (
            <Button
              key={option}
              size="sm"
              variant={option === strategy ? "primary" : "default"}
              role="radio"
              aria-checked={option === strategy}
              onClick={() => setStrategy(option)}
            >
              {STRATEGY_LABEL[option]}
            </Button>
          ))}
        </div>
      </div>

      <label className="prform__field">
        <span>
          <input
            type="checkbox"
            checked={deleteBranch}
            onChange={(event) => setDeleteBranch(event.target.checked)}
          />{" "}
          apagar a branch remota depois
        </span>
      </label>

      {merge.isError && (
        <p className="prform__error" role="alert">
          {merge.error.message}
        </p>
      )}

      <div className="prform__acts">
        <Button size="sm" variant="ghost" ref={cancelRef} onClick={onClose}>
          cancelar
        </Button>
        <Button size="sm" variant="danger" type="submit" disabled={merge.isPending}>
          {merge.isPending ? "mesclando…" : "mesclar"}
        </Button>
      </div>
    </form>
  );
}

function CreateForm({ status, worktreeId, onClose, cancelRef }: FormProps) {
  const invalidate = useInvalidate(worktreeId);
  // F7.6: o formulário **propõe** e não decide. Reviewers, labels e template
  // ficam no host, atrás do `↗` — aquela tela é boa, e o Lumem não a refaz.
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [draft, setDraft] = useState(false);

  const create = useMutation({
    mutationFn: () => trpc.pr.create.mutate({ worktreeId, title: title.trim(), body, draft }),
    onSuccess: () => {
      invalidate();
      onClose();
    },
  });

  const id = `pr-title-${worktreeId}`;

  return (
    <form
      className="prform"
      onSubmit={(event: FormEvent) => {
        event.preventDefault();
        if (title.trim() === "") return;
        create.mutate();
      }}
    >
      <div className="prgate__t">Abrir pull request</div>

      <div className="prform__what">
        <span>
          <b>{status.branch}</b> para <b>{status.base}</b>, em <b>{status.host ?? "GitHub"}</b>.
        </span>
      </div>

      <Field
        id={id}
        label="Título"
        error={create.isError ? create.error.message : undefined}
      >
        <Input
          id={id}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="feat: o que esta branch faz"
          invalid={create.isError}
          autoFocus
        />
      </Field>

      <div className="prform__field">
        <label className="prform__label" htmlFor={`${id}-body`}>
          descrição
        </label>
        <textarea
          id={`${id}-body`}
          className="prform__body"
          rows={5}
          value={body}
          onChange={(event) => setBody(event.target.value)}
        />
      </div>

      <label className="prform__field">
        <span>
          <input
            type="checkbox"
            checked={draft}
            onChange={(event) => setDraft(event.target.checked)}
          />{" "}
          abrir como rascunho
        </span>
      </label>

      <div className="prform__acts">
        <Button size="sm" variant="ghost" ref={cancelRef} onClick={onClose}>
          cancelar
        </Button>
        <Button
          size="sm"
          variant="primary"
          type="submit"
          disabled={create.isPending || title.trim() === ""}
        >
          {create.isPending ? "abrindo…" : "abrir"}
        </Button>
        {status.compareUrl !== null && (
          <a
            className="btn btn--ghost btn--sm focus-ring"
            href={status.compareUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            abrir no GitHub <span aria-hidden="true">↗</span>
          </a>
        )}
      </div>
    </form>
  );
}

/** As que o repositório permite, na ordem em que costumam ser escolhidas. */
function allowedStrategies(status: PrStatus): PrMergeStrategy[] {
  return (["squash", "merge", "rebase"] as const).filter((option) => status.merge[option]);
}
