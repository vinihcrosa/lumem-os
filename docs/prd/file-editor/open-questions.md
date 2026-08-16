# Editor de arquivos — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 20 perguntas · 17 respondidas · 3 abertas

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

### Q12 — Symlink pendurado: dá para apagar, ou nem isso?

**Dá para apagar, e não dá para gravar.** Decidido na triagem do review do Lote 1.

A E2 recusou toda operação sobre link cujo destino não existe, e o argumento dela era bom para escrita: nada prova onde o link aterrissaria, e criar o destino de um link quebrado não é o que "gravar este arquivo" pediu. O review mostrou o efeito colateral — link pendurado é exatamente o lixo que se quer tirar pela árvore, e ele ficava impossível de remover por qualquer caminho.

A regra que resolve os dois casos de uma vez, e que virou linha no §5 do PRD:

> **Apagar e renomear operam sobre a entrada de diretório; gravar opera sobre o destino.**

Um symlink é as duas coisas ao mesmo tempo, e é a **operação** que decide qual delas importa. Daí saem as quatro propriedades: apagar um link, válido ou pendurado, remove o link e deixa o destino intacto; renomear move o link; gravar através de um link válido cai no destino, que é o que faz o link continuar link; e o link pendurado é apagável e não gravável.

Fica uma consequência para a tela, que a E8 e a E11 precisam saber: leitura e escrita descrevem o mesmo estado de disco com códigos diferentes — a leitura responde `NOT_FOUND` para um link pendurado e a escrita responde `BLOCKED`. As duas frases estão certas, e a tela não pode inventar uma terceira.

**Extensão, decidida depois de o rework apontar a assimetria:** link que aponta **para fora** do checkout também é apagável, pela mesma regra e não por exceção a ela. A entrada de diretório está dentro do checkout, e apagar o link não toca no destino — que é justamente a propriedade que define a regra. Recusar era proteger o arquivo de fora de uma operação que nunca chega perto dele.

O que continua recusado é **gravar** através dele, e aí a recusa é a mesma de antes. Vale enunciar por que isto não abre um caminho de escape: apagar um link é uma operação sobre a entrada, e nenhuma entrada de diretório fora do checkout é alcançável — o pai já foi provado dentro antes de qualquer coisa acontecer.

---

### Q13 — Quem decide que um arquivo dentro de `.git` é somente leitura?

**O servidor, e o motivo viaja nomeado.** Decidido na triagem do review do Lote 1.

`files.read` devolvia `readOnly: null` para `.git/config`: legível, e sem dizer que gravar seria recusado. Com autosave isso é a pior ordem possível — a tela abre editável, a pessoa digita, o debounce vence, e só então a recusa chega.

A alternativa era o cliente derivar "está dentro de `.git`" do caminho. Ela é barata e está errada pelo mesmo motivo que o §5 inteiro existe: **regra de escrita é verificada no servidor, nunca no cliente.** Duplicar a regra no navegador cria dois lugares para ela divergir, e o lado que erra é o que não tem o disco na mão.

Então `ReadOnlyReason` ganha `"inside-git"`, ao lado de `"not-utf8"`. As quatro recusas da F1.4 passam a ter a mesma gramática de verdade: duas vêm da forma do resultado (`binary`, `too-large`) e duas do motivo nomeado.

**Quando as duas razões valem ao mesmo tempo, `inside-git` ganha**, e isso é decisão de produto, não detalhe de implementação — um arquivo do `.git` com bytes que não sobrevivem ao UTF-8 é os dois. `inside-git` é um fato sobre o **caminho**, verdadeiro independentemente dos bytes, e é o que a pessoa precisa ler para entender por que não pode editar. Dizer "não é UTF-8 válido" ali é verdade e é a informação errada: consertar a codificação não destravaria nada.

---

### Q14 — Arquivo marcado somente leitura no disco: grava ou não?

**Não grava: abre somente leitura, com o motivo dito.** Respondida pelo Vinicius.

A pergunta nasceu de um efeito colateral que o dev achou e declarou ao implementar a escrita atômica: gravar num arquivo `0o444` **passa**, porque o `rename` precisa de permissão no **diretório**, não no arquivo — e o modo é preservado depois, então nem rastro fica. Com escrita in-place teria falhado com `EACCES`.

O contra-argumento era bom: `0o444` num repositório costuma ser convenção (arquivo gerado, lock manual), e o dono sempre pode remover o bit. Perdeu por causa do autosave: ele grava **sozinho**, sem ninguém clicar em nada, e o bit de somente-leitura é o único aviso que a pessoa deixou para si mesma naquele arquivo. Passar por cima dele calado é a mesma família da perda silenciosa da [Q9](#q9--e-arquivo-que-não-é-utf-8).

A propriedade que a implementação tem de satisfazer, e ela é maior que a pergunta: **a escrita atômica não pode virar um contorno de permissão.** Se o daemon não conseguiria gravar o arquivo in-place, ele não grava de jeito nenhum. Por isso o veredito é `access(target, W_OK)` — a pergunta honesta "este processo consegue escrever neste arquivo?", que responde certo para dono, grupo, outros e ACL — e não uma leitura de bits de modo, que teria que ser interpretada.

Vira a **quinta** recusa, com a mesma gramática das outras quatro. E as razões passam a ter ordem declarada: `inside-git` → `not-writable` → `not-utf8`, da mais estrutural para a mais dependente de conteúdo. O caminho manda mais que a permissão, que manda mais que os bytes.

---

### Q15 — O que a escrita atômica destrói, já que ela salva o resto?

**uid/gid, ACL, extended attributes e a irmandade de hard link. Declarado, não resolvido.**

Medido no review do Lote 3: os bytes caem num **inode novo**, e do arquivo original sobrevive apenas `mode & 0o777`. Some o dono (o arquivo passa a pertencer ao usuário do daemon), somem ACL POSIX e xattrs, e o hard link para outro caminho é cortado — o outro nome continua apontando para o conteúdo antigo.

Não é escolha entre alternativas: é o preço de o `rename` ser o que fecha os dois vetores do §5. Escrita in-place preservaria tudo isso e devolveria o hard link para fora e a janela entre resolver e gravar, que são bem piores.

Um caso concreto onde o efeito é **bom**, e vale registrar porque é o mais comum: `node_modules` está visível e editável na árvore, e o pnpm o povoa com hard links para o store global. Editar um arquivo lá dentro **desliga o link** em vez de corromper o store de todos os projetos da máquina — que é exatamente o que in-place faria.

O que fica em aberto é só a comunicação: nada na tela diz que salvar troca o dono do arquivo. Não é v1.

---

### Q16 — Renomear para um nome ocupado: como o daemon garante que não sobrescreve?

**Por checagem, não por syscall — e a janela fica declarada.** Decidida na triagem do review do Lote 4.

Criar tem exclusividade de verdade: `open` com `wx` é atômico no kernel, e o teste da corrida de vinte criações simultâneas prova. **Renomear não tem equivalente portátil**, e as três alternativas foram descartadas com motivo:

| Alternativa | Por que não |
|---|---|
| `RENAME_NOREPLACE` / `renameatx_np` | Resolveriam. São por plataforma (Linux e macOS) e o Node **não expõe** nenhum dos dois |
| `link` + `unlink` | `EPERM` para diretório; e no macOS o `link` **segue** o symlink de origem, o que criaria hard link para o alvo e apagaria o link — violando a [Q12](#q12--symlink-pendurado-dá-para-apagar-ou-nem-isso) no caminho |
| reservar com `open('wx')` antes | Não fecha nada: o `rename` substitui a própria reserva |

Então destino ocupado é `DUPLICATE` por checagem, com uma janela entre verificar e renomear. Ela entra no §5 do PRD como o **terceiro** caso de "o que este desenho não cobre", ao lado do hard link e do resolver-antes-de-gravar, e pelo mesmo argumento: o modelo de ameaça aqui é **acidente**, não adversário.

O que muda por ser dito: o comentário no código cita um parágrafo que existe, e quem for mexer em `rename` daqui a seis meses não vai reabrir a discussão do zero.

---

### Q17 — Renomear trocando só a caixa do nome

**Não dá, e a tela diz por quê.** Decidida na triagem do review do Lote 4.

`readme.md` → `README.md` é um gesto comum, e num filesystem insensível a caixa — o padrão do macOS — o `lstat` do destino **encontra o próprio arquivo**, `exists` é verdadeiro, e a resposta é `DUPLICATE` nomeando um arquivo que a árvore não mostra.

Consertar custa renomear em dois passos, por um nome temporário. Isso reabre a janela da [Q16](#q16--renomear-para-um-nome-ocupado-como-o-daemon-garante-que-não-sobrescreve) duas vezes e deixa lixo com nome estranho se o processo morrer no meio — pior que a limitação, para um gesto que o terminal ao lado resolve.

A recusa é **segura**: nada é destruído. O que ela não pode ser é confusa, e por isso a E11 tem que dizer o motivo na tela em vez de repetir "já existe" — a pessoa está olhando para uma árvore onde aquele nome não aparece.

É a irmã do `.GIT` que já está registrado em [testing.md](../../project/testing.md): a mesma insensibilidade de caixa, na operação oposta. Lá ela deixava passar o que devia recusar; aqui recusa o que devia passar.

---

### Q18 — O que `tracked: false` realmente quer dizer?

**"O git não tem cópia **ou** o git não conseguiu responder" — e a tela não pode ser mais forte que isso.** Decidida na triagem do review do Lote 5.

`isTracked` e `trackedUnder` engolem toda falha do git com `.catch(() => ({ stdout: "", stderr: "" }))`. Isso cobre três coisas diferentes: o arquivo realmente não está no índice, o `ls-files` estourou o timeout de 30 s, e o git não está instalado ou o checkout não é repositório.

A direção do erro é **segura de propósito**: o diálogo avisa demais ("nada traz de volta") em vez de prometer uma recuperação que não existe. Numa tela cuja única função é fazer alguém pensar antes de apagar, errar para o lado do medo é a escolha certa.

O que isso proíbe é a tela **afirmar**. "Não está no git" é uma conclusão que o daemon não tem; o que ele tem é "não consegui confirmar que está". A E11 escreve a frase nesse limite.

Fica junto a decisão sobre o timeout, que veio da mesma análise: **30 s, e não menos**. `ls-files` custa milissegundos em qualquer índice comum, então um teto menor não acelera nada — e, por causa do `.catch`, ele não converteria resposta lenta em erro visível, e sim em **resposta errada e silenciosa**: "nada traz de volta" sobre um arquivo que o git tem. Timeout aqui é teto, não espera.

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
