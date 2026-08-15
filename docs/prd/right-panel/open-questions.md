# Barra direita — perguntas

Registro de por que cada decisão foi tomada. Pergunta respondida não vira suposição silenciosa: fica aqui, com o motivo.

**Estado:** 10 perguntas · 5 respondidas · 5 abertas

---

## Respondidas

### Q1 — O diff mostra o quê?

**As duas coisas, com alternador.** Respondida pelo Vinicius.

`não commitado` é o que o agente acabou de fazer e ainda não commitou — a pergunta mais frequente enquanto ele trabalha. `vs base` é o que a worktree inteira fez, commits incluídos — a pergunta de quem vai revisar antes de abrir PR.

Escolher só uma deixaria metade das perguntas sem resposta, e o custo do alternador é um parâmetro no servidor e um estado no cliente.

**Como cada vista é calculada:**

| Vista | Comparação |
|---|---|
| não commitado | árvore de trabalho contra `HEAD`, mais os não rastreados |
| vs base | `merge-base(base, HEAD)` contra a árvore de trabalho |

A segunda usa a árvore de trabalho, não `HEAD`: quem revisa quer ver o trabalho todo, e trabalho não commitado ainda é trabalho. Duas vistas que se sobrepõem são melhores que uma lacuna entre elas.

---

### Q2 — A árvore lista o que existe ou o que o git rastreia?

**O que existe, um nível por vez.** Respondida pelo Vinicius.

`git ls-files` daria a árvore inteira numa chamada e sem lixo — mas arquivo novo só apareceria depois de `git add`, e arquivo novo é justamente o que um agente produz o tempo todo. Uma árvore que não mostra o que o agente acabou de criar não serve para acompanhar o agente.

Esconder ignorados pelo `.gitignore` tem o problema irmão: `dist/` e `node_modules/` são exatamente onde se olha quando o build quebrou.

O custo é um teto por diretório (§4 do PRD): sem ele, `node_modules/.pnpm` é uma listagem de dez mil entradas.

---

### Q3 — Realce de sintaxe agora ou depois?

**Shiki desde já.** Respondida pelo Vinicius.

Um visualizador de código sem realce é um `cat` com moldura, e o terminal já faz isso. Se a coluna existe para *ler* código, ela nasce sabendo pintá-lo.

O preço é uma dependência nova num pacote que hoje só tem React, xterm e tRPC — e o peso dos grammars. Por isso o carregamento é sob demanda por linguagem, e o tamanho do bundle é medido na task, não estimado.

O tema sai de `tokens.ts`, pelo mesmo motivo que o do xterm saiu: um realce com paleta própria briga com a tela inteira.

---

### Q4 — A coluna pertence ao checkout ou é mais uma aba?

**Terceira coluna do shell, do checkout.** Respondida pelo Vinicius.

O ganho inteiro da coluna é ver o agente trabalhando **e** o que ele mexeu, ao mesmo tempo. Como aba, os dois se excluem — e aí ela não acrescenta nada ao `cat` no terminal.

Como coluna do checkout, ela segue a mesma regra do cabeçalho do `ScopePanel`: trocar de aba de sessão não muda os arquivos, porque a sessão não muda o checkout.

---

### Q10 — Onde o arquivo clicado abre?

**Num split da aba atual, ao lado da sessão.** Corrigido pelo Vinicius em cima do primeiro protótipo, que abria o arquivo dentro da própria coluna.

O erro do primeiro desenho era estrutural, não estético: com o conteúdo dentro da coluna, ou você via a árvore ou via o arquivo — e a coluna tem 360px, largura em que ler código dói. Pior, abrir um arquivo escondia a navegação, então o gesto seguinte (abrir o próximo arquivo) exigia desfazer o anterior.

A regra que fica: **a coluna navega, o split lê.** Como o split é da aba, cada sessão carrega o seu, e a coluna — que é do checkout — não muda quando se troca de aba.

---

## Abertas

### Q5 — Busca na árvore

O print de referência tem um campo `Search files`. A árvore é lazy, então buscar significa varrer o que ainda não foi carregado — e num repositório grande, com `node_modules` visível, isso é caro.

Três saídas possíveis: filtrar só o que já está carregado (barato e meia-boca), varrer no servidor com teto e timeout, ou usar `git ls-files` só para a busca e assumir que arquivo não rastreado não é encontrável. Nenhuma decidida.

Fora da v1.

---

### Q6 — Como a coluna sabe que o disco mudou?

Na v1 ela recarrega por foco da janela, pelo evento `worktree.changed` que o daemon já emite, e por um botão.

Com um agente escrevendo, isso vai parecer lento. A alternativa é um watcher no daemon — que custa descritores, precisa de debounce, e num repositório com `node_modules` precisa de filtro para não afogar o event loop. Feature própria, com decisão própria.

---

### Q7 — Qual é a "base" do checkout `local`?

Worktree tem base declarada: a `default_branch` do projeto de onde ela nasceu. O checkout principal muitas vezes **está** nessa branch, e aí `vs base` é sempre vazio.

Dizer "você está na base" é honesto e inútil. Esconder o alternador no `local` é assimetria não explicada. A D2 da [worktree-tabs](../worktree-tabs/tasks.md) já declarou uma assimetria parecida e escolheu dizê-la na tela; provavelmente a resposta é a mesma, mas ainda não foi decidida.

---

### Q8 — Os tetos exatos

O protótipo já desenha dois números — **1 MB por arquivo** e **2 000 entradas por diretório** — e desenha o que acontece quando são estourados. São proposta, não medição: valem até alguém abrir um repositório real e reclamar. Linhas por patch continua sem número.

Ficam num só lugar do código, nomeados, para que ajustar seja uma linha.

---

### Q9 — Split aberto sobrevive à troca de worktree?

Dentro de um checkout está resolvido: o split é da aba, então trocar de aba de sessão troca o arquivo junto e voltar reencontra o que estava aberto.

Entre worktrees, não: sair e voltar zera. Reabrir o que estava aberto seria o comportamento de um editor, e custa guardar um estado por aba de cada checkout em vez de um por aba. Não decidido; a v1 zera.
