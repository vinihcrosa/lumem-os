import { arrive } from "../../lib/navigation.js";
import { useRightPanel, useScripts, type Scope } from "../checkout/index.js";
import { PendingPrompt, type PendingPromptReason } from "./PendingPrompt.js";
import { useDiscardPending, useSendPending } from "./queries.js";

export interface PendingConversationProps {
  sessionId: string;
  /** De onde vem o `[scripts]` deste prompt — o mesmo escopo do checkout. */
  scope: Scope;
  prompt: string;
  reason: PendingPromptReason | null;
}

/**
 * O primeiro prompt, vivo e ainda sem turno (`033` T21, §3.3).
 *
 * Substitui o `Transcript`/`Composer` inteiros enquanto dura: não há conversa
 * para rolar ainda, e um compositor destravado ao lado de um prompt que já
 * foi escrito não teria para onde mandar um segundo texto antes de o
 * primeiro sair. `Conversation` para de montar isto no instante em que
 * `conversation.turns` ganha o primeiro turno — ver o comentário lá.
 */
export function PendingConversation({ sessionId, scope, prompt, reason }: PendingConversationProps) {
  const scripts = useScripts(scope);
  const rightPanel = useRightPanel();
  const sendPending = useSendPending(sessionId);
  const discardPending = useDiscardPending(sessionId);

  /*
   * O atalho abre a coluna de arquivos, onde o rodapé mora — só quando ela
   * está fechada. `useRunDock` guarda em que aba o rodapé está como estado
   * local do próprio componente (`RunDock.tsx`), sem contexto nenhum acima
   * dele, então daqui não há como pedir a aba `Setup` especificamente sem
   * dar a esse hook o mesmo tratamento que `useRightPanel` já tem — fora do
   * escopo desta task (achado registrado no relatório da T21). Com a coluna
   * já aberta o botão não teria o que fazer, e por isso some.
   */
  const onShowSetup = rightPanel.open ? undefined : () => rightPanel.toggle();

  return (
    <>
      <div className="conv__scroll">
        <PendingPrompt
          prompt={prompt}
          reason={reason}
          setupExit={scripts.data?.setup.last?.exitCode ?? null}
          onShowSetup={onShowSetup}
          onSendAnyway={reason === "setup_failed" ? () => sendPending.mutate() : undefined}
          onEdit={
            reason === "setup_failed"
              ? () =>
                  discardPending.mutate(undefined, {
                    // O texto vai para o compositor pelo mesmo mecanismo que
                    // já leva rascunho a uma sessão que já existe (`useArrival`)
                    // — e não por um segundo caminho que poderia discordar dele.
                    onSuccess: () => arrive({ sessionId, text: prompt, send: false }),
                  })
              : undefined
          }
          busy={sendPending.isPending || discardPending.isPending}
        />
      </div>

      {/*
        Travado, e não o `Composer` de verdade: enquanto o prompt segura, um
        segundo texto não tem para onde ir antes de o primeiro sair — e o
        `Composer` real reagiria à chegada que o `editar` acima acabou de
        mandar antes de este componente sair de cena.
      */}
      <div className="composer">
        <div className="composer__box">
          <textarea
            className="composer__in composer__in--empty"
            disabled
            aria-label="mensagem para o agente"
            placeholder="o primeiro prompt espera o setup"
          />
        </div>
      </div>
    </>
  );
}
