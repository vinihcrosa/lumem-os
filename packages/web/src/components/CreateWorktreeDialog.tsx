import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { worktreesKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Field, Glyph, Input, Modal, ModalEsc } from "../ui/index.js";

export interface CreateWorktreeDialogProps {
  projectId: string;
  /** O nome que o cabeçalho repete — de onde a ação veio. */
  projectName: string;
  open: boolean;
  onClose: () => void;
  onCreated: (worktreeId: string) => void;
}

/**
 * Criar uma worktree, F4.1. O nome é também a branch, F4.2.
 *
 * Controlado: quem abre é a árvore, no `+` da linha do projeto. O diálogo não
 * tem mais botão próprio — dois lugares oferecendo a mesma ação é o que a
 * feature veio desfazer.
 */
export function CreateWorktreeDialog({
  projectId,
  projectName,
  open,
  onClose,
  onCreated,
}: CreateWorktreeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  /**
   * Se o repositório tem algum commit, F6.13.
   *
   * Perguntado aqui e não recebido de fora: quem abre é a árvore, e a lista de
   * projetos não carrega esse dado. Só enquanto o diálogo está aberto — e é a
   * mesma chave de cache do painel do `local`, então abrir a partir de um
   * projeto já visitado não custa requisição nenhuma.
   */
  const project = useQuery({
    // A mesma chave literal que o `LocalPanel` e o `WorktreePanel` usam, e a
    // que o `useLiveState` invalida. Não é a `projectDetailKey` do
    // `queryKeys.ts` — ela existe com outro nome de chave para a mesma leitura,
    // e usá-la aqui abriria uma segunda requisição para o mesmo projeto.
    queryKey: ["project", "get", projectId],
    queryFn: () => trpc.project.get.query({ id: projectId }),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => trpc.worktree.create.mutate({ projectId, name: name.trim() }),
    onSuccess: async (worktree) => {
      await queryClient.invalidateQueries({ queryKey: worktreesKey(projectId) });
      onCreated(worktree.id);
      close();
    },
  });

  const unborn = project.data?.hasCommits === false;
  const fieldId = `worktree-name-${projectId}`;

  /**
   * Todo caminho de saída passa por aqui — `Esc`, o véu, o `✕`, o `cancelar` e o
   * sucesso —, porque é o `Modal` que chama isto em todos eles.
   *
   * Sem efeito de limpeza: a primeira versão desta task tinha um `useEffect` com
   * o resultado da mutação nas dependências, e o objeto que o react-query
   * devolve é **novo a cada render** — o efeito rodava sempre, e a suíte inteira
   * estourou a memória do processo principal do vitest.
   */
  function close(): void {
    setName("");
    create.reset();
    onClose();
  }

  const submit = (event: FormEvent): void => {
    event.preventDefault();
    if (name.trim() === "" || unborn) return;
    create.mutate();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Nova worktree"
      where={
        <>
          em <Glyph tone="project">■</Glyph> <strong>{projectName}</strong>
        </>
      }
    >
      <form onSubmit={submit}>
        <div className="modal__body">
          <Field
            id={fieldId}
            label="Nome da worktree"
            // As palavras do daemon: "a branch X já existe; escolha outro nome"
            // diz o que fazer, "erro" não.
            error={create.isError ? create.error.message : undefined}
          >
            <Input
              id={fieldId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="teste-prd"
              invalid={create.isError}
            />
          </Field>

          {unborn ? (
            // F6.13. O servidor também recusa — a tela evita o erro, o daemon o
            // proíbe. Deixar o git responder imprimiria "invalid reference", que
            // não explica nada a ninguém.
            //
            // E é aqui que ele é dito, e não no `+` da linha: um botão de 24px
            // desabilitado numa árvore é um botão cinza sem motivo à vista.
            <Banner tone="warning">
              este repositório ainda não tem nenhum commit — faça o primeiro para poder cortar
              worktrees
            </Banner>
          ) : (
            <p className="modal__hint">A branch tem o mesmo nome. Barra vira diretório aninhado.</p>
          )}

          {create.isPending && (
            <Banner tone="info">
              copiando o checkout — em repositório grande isto leva alguns segundos
            </Banner>
          )}
        </div>

        <div className="modal__foot">
          <Button
            type="submit"
            variant="primary"
            disabled={create.isPending || name.trim() === "" || unborn}
          >
            {/* `git worktree add` copia um checkout inteiro. Num repositório
                grande isso é segundos, e um botão parado convida um segundo
                clique que falharia na branch que o primeiro acabou de criar. */}
            {create.isPending ? "criando…" : "criar"}
          </Button>
          <Button variant="ghost" onClick={close}>
            cancelar
          </Button>
          <ModalEsc />
        </div>
      </form>
    </Modal>
  );
}
