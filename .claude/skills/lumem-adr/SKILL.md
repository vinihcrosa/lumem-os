---
name: lumem-adr
description: Escreve um ADR do Lumem-OS em docs/adr/ — decisão difícil de reverter, com as alternativas que perderam. Use quando pedirem "escreve um ADR", "registra essa decisão", "isso vira ADR?", quando uma resposta de open-questions contradiz um ADR em vigor, ou quando uma discovery do Outline decidiu algo. Não use para nota de PRD (decisão que falha um dos três testes) nem para estudo (docs/project/).
---

# ADR do Lumem-OS

Um ADR registra **uma escolha**: o que foi decidido, quando, e o que perdeu. Ele não descreve o
sistema — a posição atual sobre uma decisão é a cadeia de ADRs lida até o fim; sobre comportamento, é
o código. A regra de *onde cada coisa mora* está no `CLAUDE.md`; esta skill é o **formato**.

## 1. Antes de escrever: liste e leia

```sh
ls docs/adr/
```

Leia o frontmatter de todo ADR que parecer relevante. **Uma decisão lá vale mais que o seu instinto**,
e contradizê-la em silêncio é o defeito, não a discordância. Se a nova decisão contradiz um ADR, ela o
**supera** — e o novo precisa dizê-lo.

## 2. Passa nos três testes? Todos

1. **Difícil de reverter.** Trocar 40 linhas por uma biblioteca é uma tarde — não é ADR.
2. **Surpreendente sem contexto.** Se qualquer pessoa razoável chegaria sozinha à mesma conclusão, não
   precisa de registro.
3. **Produto de um trade-off real.** Se você não sabe nomear uma alternativa concreta que perdeu,
   provavelmente não é ADR.

Falhou um: é uma **nota na PRD** da feature, no requisito que ela afeta, e não um ADR.

## 3. O arquivo

`docs/adr/YYYY-MM-DD-HHMM-slug.md` — data e hora da decisão (`date "+%Y-%m-%d-%H%M"`), slug em inglês
e kebab-case, dizendo a decisão (`agent-is-always-acp`, não `acp-decision`).

```markdown
---
title: A decisão numa frase, no indicativo
date: YYYY-MM-DD
area: transport | memory | security | distribution | docs | git | architecture | design
summary: O que foi decidido, o que sai, o que fica, e o gatilho que faria alguém reabrir.
supersedes: YYYY-MM-DD-HHMM-slug-do-anterior   # só se superar outro
feature: NNN-nome                              # só se nasceu de uma feature
---

## Contexto
O que era verdade antes, e o que forçou a escolha. **Número** onde existir medição — um número
envelhece melhor que uma impressão. O estudo longo mora em `docs/project/`, e o contexto linka.

## Decisão
A frase, no indicativo. Uma. Depois o que ela implica, item por item.

## Alternativas
### O nome da alternativa
- **O que era:**
- **A favor:**
- **Contra:**
- **Por que perdeu:** — **cite a fonte** em vez de reconstruir de memória. Uma alternativa forte que
  funcionou e perdeu mesmo assim **se escreve** (o *symlink por worktree* do ADR de 2026-09-20).

## Consequências
### Bom
### Ruim
### Riscos — com o gatilho que traz a pergunta de volta
```

## 4. As regras que não se negociam

- **Nenhum ADR é editado depois de escrito.** Nem para corrigir. O que mudou vira um ADR novo.
- **Não existe campo `status:`.** Um ADR está superado **se e somente se** outro o nomeia em
  `supersedes`.
- **ADR não se reverte em parte.** Se só parte mudou, o novo **reafirma o que fica**, por escrito.
- **Nota de PRD nunca derruba ADR sozinha.** Se ela precisa disso, o que falta é um ADR.
- **A nota no requisito contradito fica** — no requisito da PRD, com âncora para o ADR, delimitando o
  que sobrou de pé.

## 5. Depois de escrever

1. A linha na tabela de ADRs de [`docs/README.md`](../../../docs/README.md), em ordem de data
   (`~~riscado~~ · superado` no que ele supera). O `docs:check` recusa a mesma linha duas vezes na
   tabela.
2. A nota no requisito que ele contradiz, se houver.
3. `pnpm docs:check` — links, âncoras e `Status:`.
