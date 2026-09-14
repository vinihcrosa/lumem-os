import type { Role } from "../agents/catalog.js";

/**
 * O que a esteira diz a cada encaixe (`028` Parte 2, T27).
 *
 * **Funções puras sobre fato**, e a palavra *fato* é a regra inteira. A
 * [Q47](../../../../docs/features/028-autonomous-orchestration/open-questions.md)
 * decidiu que **nada passa de uma sessão para outra** — nem resumido —, e o que
 * ela protege é o **canal**: a sessão A não briefa a sessão B. O que entra aqui
 * é o que está escrito na tarefa, o que está no disco e o que o `git` responde.
 *
 * O teste disto é barato justamente por ser texto de entrada e texto de saída,
 * e é por isso que o prompt não é montado dentro do laço: um prompt que só
 * existe no meio de um `spawn` é um prompt que ninguém lê antes de ele custar.
 */

export interface PromptFacts {
  role: Role;
  title: string;
  /** O corpo da tarefa. Vazio é comum e não é erro. */
  body: string;
  /** Onde o checkout está, para a frase dizer o lugar e não só a coisa. */
  checkoutPath: string;
  /**
   * A tentativa que está começando, contando de 1.
   *
   * Ela muda o texto porque a segunda tentativa **chega num lugar diferente**:
   * a primeira morreu e deixou trabalho pela metade.
   */
  attempt: number;
  /**
   * O `git status` do checkout não está limpo.
   *
   * É o fato da [Q49](../../../../docs/features/028-autonomous-orchestration/open-questions.md),
   * e a razão de ele não furar a Q47: *"este checkout já tem mudanças"* é fato
   * **sobre o disco**, do mesmo tipo que o corpo da tarefa — o agente o
   * descobriria com um `git status`, gastando um turno para chegar onde uma
   * frase chega de graça. O que **não** entra junto é o que a tentativa anterior
   * concluiu, e é aí que a linha fica.
   */
  dirty: boolean;
  /** A instrução do agente nomeado, quando há um (§5.1). */
  instructions: string;

}

/** O que cada encaixe é, em uma frase. O resto do prompt é fato. */
const MISSION: Record<Role, string> = {
  implementador:
    "Implemente a tarefa abaixo neste checkout. Quando terminar, faça `git add -A` e `git commit`.",
  /*
   * **O parecer é postado, não escrito na conversa** (Parte 7 — T53).
   *
   * Como se posta está no preâmbulo, e não aqui: é lá que mora o id da sessão,
   * que a porta exige — e este arquivo é função pura sobre fato, sem acesso a
   * nada que o daemon saiba sobre a conversa em voo.
   */
  revisor:
    "Revise o que já foi feito neste checkout para a tarefa abaixo, e **poste o parecer** " +
    "pela porta que o preâmbulo descreve — mesmo que você não tenha achado nada que segure.",
  testador:
    "Verifique se o que foi feito neste checkout para a tarefa abaixo funciona. Rode o que precisar.",
};

export function promptFor(facts: PromptFacts): string {
  const parts: string[] = [];

  if (facts.instructions.trim() !== "") parts.push(facts.instructions.trim());

  parts.push(
    "Você está trabalhando sozinho: ninguém vai responder a uma pergunta durante este turno.",
  );
  parts.push(MISSION[facts.role]);
  parts.push(`Checkout: ${facts.checkoutPath}`);

  if (facts.dirty) {
    /*
     * A frase da Q49, e ela é deliberadamente **pobre**: diz que existe mudança
     * anterior e **não diz o que a tentativa anterior achou**. Acrescentar o
     * resumo aqui seria o canal que a Q47 fecha, e o enviesamento que ela evita
     * voltaria pela porta do prompt.
     */
    parts.push(
      "Este checkout já tem mudanças de uma tentativa anterior que terminou sem completar. " +
        "Confira com `git status` e `git diff` antes de continuar; o que estiver lá pode estar " +
        "incompleto ou errado.",
    );
  }

  parts.push(`## ${facts.title}`);
  if (facts.body.trim() !== "") parts.push(facts.body.trim());

  return parts.join("\n\n");
}
