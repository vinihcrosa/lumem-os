---
title: O Outline discute e opera, o repositório decide e executa
date: 2026-09-28
area: docs
summary: A documentação passa a ter dois lugares, com fronteira escrita. Fica no repositório tudo de que o código, o gate ou um agente dependem, e tudo que muda no mesmo PR que o código — ADR, features, os estudos que sustentam ADR, testing, backlog, perguntas. Vai para o Outline o que é discussão antes da decisão, operação e conteúdo que não pode ser público, narrativa e instantâneo. O Outline nunca repete conteúdo normativo escrito à mão — ele linka. A regra *"toda documentação vive em `/docs`"* do `CLAUDE.md` deixa de valer inteira; a hierarquia do ADR de 2026-09-07 fica.
---

## Contexto

Desde **2026-09-22** existe um wiki Outline (`wiki.cazimi.tech`) com três coleções do Lumem — `Lumem`
(o workspace lê), `Lumem · Team` (só o time) e `Lumem · Public` (vazia). Ele nasceu com três tipos de
conteúdo, e só dois deles se sustentaram seis dias depois.

**O primeiro são espelhos em inglês do repositório**, cada um com o aviso *"the disk wins"*:
`Decisions in force`, `Documentation rule`, `Tests and gates`, `Design rule`, `Writing conventions`,
`How we write an ADR`, `Backlog and what was refused`. Medido em 2026-09-28: `Decisions in force` está
**dois ADRs atrás** (faltam o de 2026-09-24 e o de 2026-09-26), e `Documentation rule` afirma **133
arquivos** em `docs/` quando são **142**. É a mesma falha que o
[ADR de 2026-09-20](2026-09-20-2246-design-lives-in-the-code.md) pagou no desenho — uma cópia escrita
à mão que ficou 67 arquivos atrás sem nada falhar —, só que mais rápida.

**O segundo é conteúdo que não tem lugar no repositório**, porque o repositório é **público**
(`github.com/vinihcrosa/lumem-os`): runbooks, o postmortem da `LUM-51`, custo real e onde mora cada
credencial. A regra *"toda documentação vive em `/docs`"* não tinha resposta para isso — ela só não
tinha sido testada.

**O terceiro é discussão antes da decisão**: a discovery de arquitetura de plugins de 2026-09-28, com
oito blocos de perguntas e quatro páginas de evidência, sem equivalente no repositório. É o formato
que o Outline serve e o git não — comentário por parágrafo, sem PR.

Do lado do repositório, duas medições decidiram a fronteira. **O acoplamento é real:** comentários de
código linkam `docs/adr/` e âncoras de `open-questions.md` (`config.ts`, `worktree.ts`,
`secrets.ts`, `tasks/gate.ts`, `routers/task.ts`); o `check-docs` valida link, âncora e `Status:` de
tudo que está em `docs/`; `questions.md` é citado por 143 arquivos e `backlog.md` por 71. **E o
`CLAUDE.md` carrega narrativa:** o §Estado atual tinha **8 195 das 9 792 palavras** do arquivo, lido
em toda sessão de todo agente — crônica de como cada feature chegou, e não instrução.

## Decisão

**O Outline discute e opera; o repositório decide e executa.** A hierarquia do
[ADR de 2026-09-07](2026-09-07-2208-prd-number-is-reading-order-not-precedence.md) fica inteira —
`docs/adr/` decide · `docs/project/` sustenta · `docs/features/` executa · o código está em vigor — e
o Outline fica **fora** dela: nada no Outline decide nem está em vigor.

Fica no **repositório** o que passa em pelo menos um destes testes:

1. **O código, o gate ou um agente dependem dele** — link de comentário, âncora checada, `tasks.md`
   que o `lumem-dev` executa, regra que o `CLAUDE.md` manda ler.
2. **Ele muda no mesmo PR que o código** — `testing.md`, `workspaces.md`, `backlog.md` (a ideia
   adiada entra *na hora*, e a hora é o PR).
3. **Ele sustenta um ADR** — o estudo que um `Alternativas` cita não pode ser link que o gate não vê.

Vai para o **Outline**:

- **discussão antes da decisão** (discovery). Quando decide, vira ADR e PRD aqui, e a página do
  Outline ganha, no topo, o link para eles;
- **operação e o que não pode ser público** — runbook, postmortem, custo, endereço de credencial —,
  em `Lumem · Team`;
- **narrativa** — a crônica das features que saiu do `CLAUDE.md`;
- **instantâneo e diário** — passagem de bastão, diário de uso —, que envelhecem por definição;
- **explicação para pessoa** — onboarding, glossário, visão geral da arquitetura —, desde que não
  repita número nem tabela do repositório.

**O Outline nunca repete conteúdo normativo escrito à mão.** Uma página sobre uma regra diz em uma
frase o que ela é e linka para o arquivo no GitHub. Se um dia uma projeção for útil lá — a tabela de
ADRs, por exemplo —, ela é **gerada** do frontmatter, nunca copiada.

## Alternativas

### Tudo no repositório — a regra como estava

- **O que era:** *"toda documentação vive em `/docs`"*, sem exceção, e o Outline não existiria.
- **A favor:** um lugar só para buscar, um gate que vê tudo, e um agente que lê tudo sem MCP.
- **Contra:** o `CLAUDE.md` continua pagando 8 mil palavras de crônica por sessão; discovery sem
  comentário vira PR de rascunho.
- **Por que perdeu:** **o repositório é público.** Postmortem que cita a decisão de uma pessoa, custo
  com o nome da tarefa e o endereço de uma credencial não têm onde morar aqui, e a regra não dizia o
  que fazer com eles — só nunca tinha sido cobrada.

### O Outline como fonte, e o repositório espelha

- **O que era:** escrever no Outline e sincronizar para `docs/` o que o código precisar.
- **A favor:** um editor melhor, comentário nativo e busca para quem não abre o git.
- **Contra:** o link de comentário de código, a âncora checada e o `tasks.md` do `lumem-dev` passam a
  depender de um sincronizador.
- **Por que perdeu:** o ADR de 2026-09-20 mediu o que acontece com fonte fora e cópia dentro, e a
  resposta foi tirar a fonte de fora. Voltar a ela para a documentação é repetir a medição sabendo o
  resultado.

### Manter os espelhos, escritos à mão

- **O que era:** o estado de 2026-09-22 — páginas em inglês com *"the disk wins"*.
- **A favor:** quem lê o Outline encontra tudo em inglês, num lugar só.
- **Contra:** alguém tem que lembrar de reescrever a página quando o repositório muda.
- **Por que perdeu:** a medição está no §Contexto — dois ADRs e nove arquivos de atraso em **seis
  dias**. O aviso *"the disk wins"* não impede a divergência; ele só a torna culpa do leitor.

### Espelhos gerados por script

- **O que era:** um script que lê o frontmatter de `docs/adr/` e reescreve `Decisions in force`.
- **A favor:** resolve a divergência sem perder a página.
- **Por que não agora:** não é recusa, é gatilho. Ninguém pediu a tabela no Outline, e o link para a
  pasta no GitHub responde a mesma pergunta. **Volta quando** alguém de fora do repositório precisar
  da lista de decisões sem abrir o git.

## Consequências

### Bom

- **O `CLAUDE.md` encolhe** para o que é instrução, e o §Estado atual continua sendo a projeção que o
  ADR de 2026-09-07 nomeou — agora uma linha por feature, e não uma crônica.
- Conteúdo que não pode ser público ganha lugar sem exceção à regra.
- **Nenhuma página do Outline pode ficar desatualizada em relação a uma regra**, porque nenhuma a
  repete.

### Ruim

- **O `check-docs` não vê o Outline.** Um link do repositório para o Outline pode morrer em silêncio,
  e um link do Outline para o GitHub também. É o preço de dois lugares; por isso os links do
  repositório para o Outline são poucos e apontam para coisas que envelhecem de propósito.
- **Um agente sem o MCP do Outline não lê a crônica nem as discoveries.** Aceito: nada ali está em
  vigor, e o que decide mora aqui.
- **Duas línguas.** O Outline é em inglês e a crônica foi movida em português, como estava — traduzir
  8 mil palavras seria reescrever, e reescrever é onde se perde o número.

### Riscos

- **Discovery que decide e não desce.** Se a conversa no Outline fechar uma decisão e ninguém escrever
  o ADR, a decisão fica num lugar que o agente não lê. A regra 6 do `CLAUDE.md` — *decisão revertida
  sem registro é decisão que volta sozinha* — vale para a decisão tomada fora também.
- **`references/` e as medições antigas** (`task-cycle-evidence.md`, `harness-audit.md`) passam nos
  testes com folga pequena: são 32, 3 e 6 links de entrada, e nenhum código depende delas. Ficam aqui
  por ora. **Gatilho de voltar:** o dia em que `references/` for lida mais no Outline que no git.
