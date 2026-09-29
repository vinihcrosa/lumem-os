---
name: lumem-feature
description: 'O fluxo de feature do Lumem-OS em docs/features/NNN-nome/ — plano no prd.md, perguntas no open-questions.md, obrigações com prova no checks.md, construção a partir dos checks, e o verification.md de um verificador que não é o autor. Use quando pedirem "planeja a feature", "especifica", "escreve os checks", "constrói esse plano", "verifica o trabalho", ou para abrir uma feature nova. Não use para feature antiga no formato de tasks.md (execute-a pelo lumem-dev), nem para ADR (lumem-adr).'
license: CC-BY-4.0 — derivado de tlc-spec-lean 1.1.0 (Tech Leads Club, github.com/tech-leads-club)
---

# O fluxo de feature do Lumem-OS

Congele as obrigações. Libere o plano. Prove com quem não construiu. Derivado da `tlc-spec-lean`
pelo [ADR de 2026-09-28](../../../docs/adr/2026-09-28-1952-a-feature-is-proven-by-checks-not-planned-in-tasks.md):
**uma feature se prova por checks, e não se planeja em tasks.**

```
┌──────┐   ┌────────┐   ┌───────┐   ┌────────┐
│ PLAN │ → │ CHECKS │ → │ BUILD │ → │ VERIFY │
└──────┘   └────────┘   └───────┘   └────────┘
 prd.md     checks.md     do agente  verification.md
```

## Por que esta forma

O defeito dominante de um agente não é raciocínio ruim: é um requisito que foi lido e nunca virou
obrigação ativa — e um *"pronto"* em cima dele. Este repositório mediu os sintomas: a
`walking-skeleton` entregue com 244 caixas abertas, *"task escrita não é task começada"*, uma feature
com 61 tasks. O que funciona é um **conjunto pequeno e congelado de obrigações** mais um **verificador
que não é o autor**. **Granularidade não é qualidade**: quinze tasks de um arquivo compram ordem, não
correção.

## Regras fixas

1. Todo check é **uma afirmação observável com valor concreto** mais a **prova** — o teste ou comando
   cujo código de saída a decide. Sem prova, não é check.
2. O teste afirma o que o check diz, **nunca o que o código por acaso faz**. Nunca escreva teste lendo a
   implementação.
3. Nunca enfraqueça asserção, apague ou pule teste para a suíte passar. Um check errado de verdade é
   **parar e perguntar**, não editar.
4. Checks e `Test policy` aprovados são fixos. No plano, `Landing`, `Relations` e `Surface` só
   **crescem** — uma porta descoberta construindo ganha linha antes do código que a fecha; `Flow` e
   `Impact` são mantidos **verdadeiros**.
5. O **verificador é um `lumem-reviewer` novo**, nunca o autor, nunca opcional, nunca esperando ser
   pedido. Quem segura a feature inteira o dispara depois do **último commit**, sobre
   `<base da feature>..HEAD`, com **todos** os checks. Um construtor termina, reporta e para.
6. **O perfil é um piso e não é segredo** — o relatório o nomeia.
7. O portão de *pronto* é um script: `pnpm -s feature:check verification docs/features/NNN-nome` sai 0.
8. **Raio de dano:** um plano aprovado autoriza edição e commit locais. `git push`, deploy e dado de
   produção pedem aval explícito para aquela ação — e o guarda do repositório recusa o resto.

## O que é deste repositório, e não da skill original

| A skill original | Aqui |
|---|---|
| `.specs/features/<feature>/` | `docs/features/NNN-nome/` — `NNN` é o próximo número livre, três dígitos, **nunca renumerado** |
| `plan.md` | **`prd.md`**, com as seções do plano (Problem, Flow, Impact, Relations, Surface, Landing, Criteria) — os títulos de seção ficam em inglês, como esquema; a prosa é em português |
| as perguntas do plano, duas por turno | **`open-questions.md`**: `- [ ] **Qn — pergunta**`, recomendação, *"o que a resposta muda"*, e `**R:**` quando responder |
| `STATE.md`, decisões `AD-NNN` | **`docs/adr/`** — skill `lumem-adr` |
| `LESSONS.md` | **Armadilhas já corrigidas**, em `docs/project/testing.md` |
| o perfil no `AGENTS.md` | a linha `Profile:` do próprio `checks.md`; ausente, `light` |
| `validate_*.py` | `pnpm -s feature:check <plan\|checks\|verification> docs/features/NNN-nome` |
| `check_commit.py` | o hook `commit-msg` (husky) |

E o que é só daqui:
- **`**Status:**`** com gramática fechada no `prd.md` e no `checks.md` — `proposta | em execução |
  completa | superada por <link do ADR>` —, e o `check-docs` o compara com o disco: **proposta ⇔ não
  existe `checks.md`**, e `checks.md` **não nasce vazio**;
- **a nota no requisito contradito** fica, com âncora para quem contradiz, delimitando o que sobrou;
- **ao fechar a feature:** a linha dela na tabela do §Estado atual do `CLAUDE.md`, e o parágrafo da
  crônica no History do Outline (skill `lumem-outline`);
- **mudança pequena** — menos de uns três arquivos e nenhuma porta de mão única — tem só o `checks.md`,
  com um parágrafo `## Intent`. Um atalho só, não uma matriz de tamanho.

## Os quatro movimentos

**Plan** — o problema, depois o caminho e o que a mudança perturba, depois o resto da forma, depois os
critérios. Fatos você procura; decisões você pergunta, em `open-questions.md`, com opções concretas e a
sua recomendação. Duas enumerações acham o que falta — as superfícies que a feature expõe e as nove
dimensões de requisito implícito —, e as duas aceitam `n/a - <motivo>`, nunca branco. Processo
completo, template e portão: [references/plan.md](references/plan.md).

**Checks** — derive afirmações com prova do plano, junte cada membro de conjunto a um check, registre
onde cada dimensão varrida caiu. Feche com `## Handoff` e a conta. É o artefato que tudo depois cita pelo
número: [references/checks.md](references/checks.md).

**Build** — do agente (o `lumem-dev`, por fatia). Escreva os testes a partir dos checks, implemente,
rode cada prova, commite em pedaços coerentes. Sem lista de tasks:
[references/build.md](references/build.md).

**Verify** — quando o último commit da feature cair, dispare um `lumem-reviewer` novo **no mesmo
turno**. Não pergunte. Procedimento e formato do relatório: [references/verify.md](references/verify.md).

## Os comandos

| Quando | Comando |
|---|---|
| antes de apresentar o plano | `pnpm -s feature:check plan docs/features/NNN-nome` |
| antes de começar a construir | `pnpm -s feature:check checks docs/features/NNN-nome` |
| antes de declarar pronto | `pnpm -s feature:check verification docs/features/NNN-nome` |
| sempre | `pnpm docs:check` e o gate que o check nomeia |

Saída diferente de zero é **pare e conserte**. Pular o script só quando não houver ferramenta de
código — e aí diga, uma vez, que está no caminho degradado.

## Cadeia de conhecimento

Nesta ordem: o código e as convenções que existem, a documentação do projeto (`docs/adr/` primeiro),
a documentação da biblioteca (Context7), a web — e então **marque como incerto**. Nunca invente API,
flag, comando ou comportamento: uma invenção vira check, e depois um teste verde que não prova nada.
