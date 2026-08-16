# Editor de arquivos — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 11 perguntas · 9 respondidas · 2 abertas

---

## Respondidas

### Q1 — Qual motor de edição?

**CodeMirror 6.** Respondida pelo Vinicius.

As três saídas eram `<textarea>` com o realce do Shiki por baixo, CodeMirror 6, e Monaco.

O `<textarea>` custa zero de bundle e é onde a tentação mora — mas o preço aparece todo na hora de fazer funcionar: sincronizar a rolagem e a métrica da fonte entre duas camadas, e conviver sem multi-cursor, sem indentação automática, sem seleção de coluna. Pior: a quebra de linha, que a [D3.1 da right-panel](../right-panel/tasks.md) deixou **ligada por padrão**, faz a numeração de linha desalinhar entre as camadas, porque cada uma quebra por conta própria.

Monaco resolve tudo e custa vários MB num `dist` que o daemon serve sem CDN — o oposto exato do cuidado que a right-panel teve ao medir o Shiki e cair de 9,1 MB para 1,9 MB.

CodeMirror 6 fica no meio: editor de verdade, modular, e com um número de bundle que a task **mede** em vez de estimar.

---

### Q1.1 — Duas gramáticas de realce no bundle?

**Não: a ponte `@shikijs/codemirror`.** Decidido junto da Q1.

O CodeMirror tem o próprio sistema de linguagem (Lezer), e adotá-lo significaria carregar um segundo conjunto de gramáticas e escrever um segundo tema — com o risco garantido de o patch e o arquivo, lado a lado na mesma moldura, terem paletas que divergem em algum escopo.

A ponte usa o highlighter do Shiki que já existe, com o `lumemShikiTheme` que já sai de `tokens.ts` e com as 16 gramáticas que a right-panel já escolheu carregar sob demanda.

Se na implementação a ponte não servir, isto volta para a mesa **antes** de entrar uma segunda gramática — não durante.

---

### Q2 — Quando o arquivo é gravado?

**Autosave com debounce.** Respondida pelo Vinicius.

A alternativa era `Cmd+S` explícito, com estado sujo e confirmação ao fechar.

Autosave combina com o gesto que motiva a feature: corrigir uma linha e voltar a olhar o agente. Um estado sujo que sobrevive a trocar de aba é uma coisa a mais para lembrar, num app cuja tela inteira é feita de coisas rodando ao lado.

O preço é real e está no §7 do PRD: cada pausa de digitação vira uma gravação no disco que o agente pode estar lendo. É por isso que a **F3 existe** — sem revisão comparada na escrita, autosave é uma máquina de sobrescrever o trabalho do agente.

Duas consequências que a implementação carrega:

- **desmontar descarrega o pendente** (F2.2). Com autosave, o único jeito de perder o que foi digitado é sumir da tela antes do debounce vencer;
- **desfazer depois de salvo não desfaz o arquivo.** O `undo` do editor volta o buffer, e o buffer salva de novo. É o comportamento correto, mas só porque a gravação é guardada por revisão.

---

### Q3 — Escopo de escrita da v1?

**CRUD completo na árvore.** Respondida pelo Vinicius.

Editar arquivo existente era o escopo mínimo, e teria a vantagem de uma superfície só (`files.write`) para revisar.

Não foi o escolhido porque o corte não sobrevive ao uso: quem corrige um arquivo pela árvore vai querer criar o vizinho, e o meio-caminho ("edita mas não cria") é a assimetria que exige explicação na tela. Criar, renomear e apagar são três procedures a mais, todas passando pela **mesma** guarda — o custo é de teste e de UI, não de arquitetura.

O que **não** entrou junto: mover arrastando na árvore (renomear já move, digitando o caminho), operação em lote, e lixeira ([Q5](#q5--apagar-manda-para-onde)).

---

### Q4 — Como o daemon sabe que o disco mudou embaixo do buffer?

**Revisão por hash do conteúdo, comparada no momento da escrita.**

Três candidatos: `mtime`, `mtime + tamanho`, e hash do conteúdo.

`mtime` sozinho mente em duas direções: a granularidade em alguns filesystems é de segundo — e um agente escreve várias vezes por segundo — e uma escrita que devolve o arquivo ao conteúdo anterior muda o `mtime` sem mudar nada que importe. `mtime + tamanho` melhora e continua cego a troca de mesmo tamanho, que é exatamente o caso de um agente corrigindo um caractere.

Hash é O(tamanho do arquivo), e o arquivo já é lido inteiro de qualquer jeito — o teto de 1 MiB é o mesmo. O custo é nulo perto do que já se paga.

A comparação acontece **na escrita**, dentro do daemon, entre ler o disco e gravar — não no cliente, que não tem como olhar o disco.

---

### Q4.1 — Conflito é erro ou resposta?

**Resposta.** `{ ok: false, reason: "stale", revision }`.

O `readFile` já devolve `binary` e `too-large` como formas do resultado em vez de lançar, pelo motivo de que são casos previstos, não falhas. Conflito é o mesmo tipo de coisa — e num app com um agente escrevendo ao lado, é o caso **esperado**, não o excepcional.

Tem um motivo mecânico junto: `DomainError` vira `TRPCError` e o cliente recebe só o código do tRPC. `BLOCKED`, `DUPLICATE` e `IN_USE` já mapeiam todos para `CONFLICT`, então distinguir "o arquivo mudou no disco" dos outros exigiria casar mensagem — que é o tipo de acoplamento que quebra na primeira tradução.

E diante do conflito, **nenhuma saída é o default**. Recarregar perde o que você digitou; sobrescrever perde o que o agente escreveu. Escolher por conta própria seria escolher de quem é o trabalho descartável.

---

### Q6 — Fim de linha, quebra final e codificação

**Preservados. O daemon grava os bytes que recebe.**

Arquivo CRLF que volta LF aparece como "todas as linhas mudaram" no diff — um arquivo tocado por engano vira uma revisão inteira de ruído. Arquivo sem `\n` final que ganha um é a mesma armadilha, uma linha menor.

A normalização acontece no cliente, e é simétrica: o editor converte na entrada e reconverte na saída, guardando qual era o original. O servidor não opina.

UTF-8 é o único que se lê, e continua sendo o único que se escreve — a detecção de binário por byte NUL já recusa a maioria do que não é UTF-8, e o resto é [Q9](#q9--e-arquivo-que-não-é-utf-8).

---

### Q10 — `.git` aparece na árvore e não deixa editar. Isso não é contraditório?

**Não, e a distinção é a resposta.** Mostrar não é permitir.

A [Q2 da right-panel](../right-panel/open-questions.md) decidiu que a árvore mostra tudo — ignorado, `node_modules`, `.git` — porque esconder é mentir sobre o que existe no disco. Aquela decisão era sobre **leitura**, e continua valendo inteira.

Escrita dentro de `.git` é outra conversa: apagar aquele diretório destrói a worktree e leva o trabalho não commitado junto, sem desfazer. Nada nesta feature vale esse risco, e quem realmente precisa mexer no `.git` tem um terminal na aba do lado.

Na tela, isso aparece como um arquivo que abre em modo somente leitura **com o motivo dito** — o mesmo padrão de binário e grande demais.

---

### Q8 — Qual é o debounce?

**800 ms**, proposto pela E1 e válido até alguém reclamar — mesma política da
[Q8 da right-panel](../right-panel/open-questions.md) para os tetos.

O intervalo entre teclas de quem está escrevendo uma linha fica na casa de 100 a 300 ms; uma pausa
perto de 600 ms já não é digitação, é parar para ler o que se escreveu. Um debounce **abaixo** disso
corta a frase no meio: cada palavra vira uma gravação, e cada gravação invalida a lista de mudanças,
que é um `git status` no checkout que o agente está usando. 800 ms fica do outro lado dessa
fronteira — a frase inteira é uma escrita só — sem chegar a 1 s, onde o "salvo há Ns" começa a
contar depois de o olho já ter saído da linha.

O que 800 ms **não** precisa resolver: a janela em que o texto só existe na memória. Ela não é o
debounce, é o debounce **menos** o descarregamento — e a F2.2 fecha os cinco gatilhos de saída de
tela gravando antes de sumir. Perder o que foi digitado exige a janela inteira sem nenhum desses
gatilhos, o que na prática é o navegador morrendo.

Fica num só lugar do cliente, nomeado: `AUTOSAVE_DEBOUNCE_MS`.

---

### Q9 — E arquivo que não é UTF-8?

**Recusa editar: abre somente leitura, com o motivo dito.** Respondida pelo Vinicius.

Latin-1 sem byte NUL passa pela detecção de binário, é lido como UTF-8 com caracteres de substituição, e o autosave grava os substitutos por cima do conteúdo original. Perda silenciosa, e o autosave a torna pior: ela acontece sem ninguém clicar em nada.

As outras duas saídas eram detectar a codificação e converter nos dois sentidos, ou ignorar. Converter traz detecção de codificação para dentro do daemon — heurística que erra, num processo que grava por cima do trabalho do agente. Ignorar aceita a perda silenciosa, que é o único desfecho inaceitável dos três.

O teste é de ida e volta, e é barato: **se decodificar em UTF-8 e recodificar não devolve os bytes originais, o arquivo não é editável.** Sem tabela de codificação, sem palpite sobre qual é a certa — só a pergunta que importa, que é se gravar destruiria alguma coisa.

Na tela isso é a **quarta recusa**, com a mesma gramática das três que já existem: binário, grande demais, dentro de `.git`, e agora "não é UTF-8". O arquivo continua **legível** — o que se perde é a permissão de gravar, e quem precisa mesmo editar tem um terminal na aba do lado.

---

## Abertas

### Q5 — Apagar manda para onde?

A v1 apaga direto, com confirmação que nomeia o alvo. Para arquivo rastreado pelo git isso é reversível (`git checkout --`), e para arquivo não rastreado não é.

A alternativa é a lixeira do sistema, que resolve o caso irreversível e traz uma dependência nativa por plataforma. Não decidido; a v1 apaga e a confirmação diz quando o alvo **não** está no git — que é a informação que muda a decisão de quem clica.

---

### Q7 — O daemon não tem autenticação

Até aqui, quem alcançava a porta do daemon podia ler qualquer arquivo do checkout. Com esta feature, também pode escrever, criar e apagar — a superfície muda de categoria, não de tamanho.

O daemon escuta em `127.0.0.1`, o que limita mas não fecha: qualquer processo da máquina alcança. A resposta certa é autenticação do daemon (token na conexão, socket unix, ou origem verificada), que é feature própria e independente desta.

Fica registrado aqui porque foi esta feature que tornou a dívida visível — e porque ela não é motivo para não fazer esta, e sim para agendar aquela.

---

---

### Q11 — O buffer sobrevive à troca de worktree?

Com autosave, a pergunta é menor do que parece: ao sair da tela o pendente já foi para o disco, então nada se perde.

O que não sobrevive é o **histórico de undo** — voltar para a worktree reabre o arquivo do disco, sem os passos anteriores. É o comportamento de um visualizador que passou a editar, e não o de um editor de verdade. A [Q9 da right-panel](../right-panel/open-questions.md) deixou a pergunta irmã aberta pelo mesmo motivo, e a resposta provavelmente é a mesma para as duas.
