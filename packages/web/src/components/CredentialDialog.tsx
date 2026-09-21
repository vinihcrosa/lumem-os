import { useState } from "react";

import { useSecretMutations, type SecretSlotView } from "../hooks/useSecrets.js";
import { Button, Field, Input, Modal } from "../ui/index.js";

/**
 * O diálogo de uma credencial (ADR de 2026-09-13).
 *
 * Arquivo próprio, e não um bloco dentro do rodapé: são **duas folhas** — o
 * rodapé é do `agent-login.css` e o diálogo é do `ui/modal.css` —, e as
 * auditorias de CSS deste repositório conferem nas duas direções por arquivo.
 * Um componente que desenha as duas faria cada auditoria acusar as classes da
 * outra como inexistentes, que é o falso positivo que ensina a ignorá-las.
 */

export function CredentialDialog({ slot, onClose }: { slot: SecretSlotView; onClose: () => void }) {
  /*
   * O campo **nasce vazio**, inclusive quando já há chave guardada.
   *
   * O daemon não tem procedure que devolva credencial — e essa ausência é a
   * decisão, não um buraco. Desenhar um campo preenchido pediria uma.
   */
  const [value, setValue] = useState("");
  const { set: save } = useSecretMutations();

  return (
    <Modal
      open
      title={slot.label}
      onClose={onClose}
      footer={
        <>
          {/*
            `remover` à esquerda, separado dos outros dois: é a ação destrutiva,
            e pô-la ao lado de `guardar` é como alguém a clica querendo o outro.
            Sem confirmação — apagar uma chave não perde trabalho, você cola
            outra.
          */}
          {slot.present ? (
            // `danger` porque ela apaga, e o produto já tem essa cor para isto:
            // inventar um cinza aqui seria o botão destrutivo mais discreto da
            // tela.
            <Button
              variant="danger"
              className="modal__destructive"
              onClick={() => save.mutate({ id: slot.id, value: "" }, { onSuccess: onClose })}
              disabled={save.isPending}
            >
              remover
            </Button>
          ) : null}
          <Button onClick={onClose}>cancelar</Button>
          <Button
            variant="primary"
            disabled={value.trim() === "" || save.isPending}
            onClick={() => save.mutate({ id: slot.id, value }, { onSuccess: onClose })}
          >
            guardar
          </Button>
        </>
      }
    >
      <Field
        id={`secret-${slot.id}`}
        label="chave de API"
        error={save.isError ? "não deu para guardar" : undefined}
        /*
          A frase mais importante desta tela: ela diz o que o produto **faz** com
          a chave. O que ela não diz — e o ADR diz — é que quem lê o seu `$HOME`
          decifra; isso não cabe num campo, e a promessa que cabe aqui é a que a
          tela consegue cumprir.
        */
        hint={
          <>
            {slot.hint}. O Lumem guarda <b>cifrada</b> e <b>nunca a mostra de volta</b>.
          </>
        }
      >
        <Input
          id={`secret-${slot.id}`}
          type="password"
          autoComplete="off"
          placeholder={slot.present ? "há uma chave guardada — cole outra para trocar" : ""}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
    </Modal>
  );
}
