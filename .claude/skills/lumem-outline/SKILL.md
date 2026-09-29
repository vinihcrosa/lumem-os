---
name: lumem-outline
description: Escreve no Outline do Lumem (wiki.cazimi.tech) pelo MCP — discovery antes de uma decisão, runbook, postmortem, custo, a entrada da crônica no History e os instantâneos do Work log. Use quando pedirem para abrir uma discovery, registrar um incidente, escrever um runbook, fechar uma feature no History, ou quando uma discovery decidir algo e precisar descer para o repositório. Não use para ADR, PRD, checks ou tasks — esses moram no repositório.
---

# O Outline do Lumem

A decisão está no [ADR de 2026-09-28](../../../docs/adr/2026-09-28-1726-outline-discusses-the-repo-decides.md):
**o Outline discute e opera; o repositório decide e executa.** Nada no Outline está em vigor.

## 1. O que vai para onde

| O quê | Coleção › página-mãe | Por quê |
|---|---|---|
| **Discovery** — discussão antes da decisão | `Lumem · Team` › Discoveries | comentário por parágrafo, sem PR |
| **Runbook** | `Lumem · Team` › Runbooks | descreve acesso e ordem de operação |
| **Postmortem** | `Lumem · Team` › Postmortems (tem template) | cita decisão e erro de uma pessoa |
| **Custo real**, número que não pode ser público | `Lumem · Team` | o repositório é **público** |
| **Endereço de credencial** — onde está, quem concede | `Lumem · Team` › Secrets and credentials | nunca o valor |
| **A crônica de uma feature que fechou** | `Lumem` › Work log › History | o `CLAUDE.md` guarda só a linha |
| **Instantâneo** — passagem de bastão, diário | `Lumem` › Work log | envelhece por definição |
| **Explicação para pessoa** — onboarding, glossário | `Lumem` | se não repetir número nem tabela do repositório |

**Não vai para o Outline:** ADR, PRD, `open-questions.md`, `checks.md`/`tasks.md`, `testing.md`,
backlog, estudo que sustenta ADR — tudo de que o código, o gate ou um agente dependem, e tudo que muda
no mesmo PR que o código.

IDs, para o MCP: coleção `Lumem` `cc2a9ddb-dc98-46a8-b6df-484031979ae8`; `Lumem · Team`
`acea3591-499d-454e-84a4-88084fa7050a`. Páginas-mãe: Work log `8d1dca6b-3432-43e3-b2a8-8e080249b704`,
History `397ece48-b320-4e71-9e74-84933b5a279d`, Discoveries `7f54fe54-eb39-4f16-87c6-4992fea5a9a3`,
Runbooks `523e691f-e5c6-4669-ae0d-16e72bd24eb9`, Postmortems `4f282779-fb93-42da-b336-4c51825a87d3`.
Se um ID não resolver, liste a coleção (`list_collection_documents`) em vez de adivinhar.

## 2. As regras

- **O Outline nunca repete conteúdo normativo escrito à mão.** Uma página sobre uma regra diz em uma
  frase o que ela é e **linka** para o arquivo no GitHub
  (`https://github.com/vinihcrosa/lumem-os/blob/main/<caminho>`). Espelhos escritos à mão foram medidos
  dois ADRs e nove arquivos atrás em seis dias.
- **Nenhum segredo colado.** Nem na coleção privada: wiki tem histórico, export e busca, e um segredo
  colado sobrevive ao apagar. Escreve-se o **endereço** — qual cofre, qual variável, quem concede.
- **O conteúdo não começa com H1** — o título é um campo à parte (`title`).
- **Editar é `patch`**, não `replace`: `update_document` com `editMode: "patch"` e o trecho exato em
  `findText` preserva comentário e formatação do resto da página.
- **Privado por padrão é o erro mais comum.** Antes de pôr algo no `Team`, pergunte *o que exatamente
  vaza se isto for aberto*. Sem resposta concreta, vai para a coleção aberta.

## 3. Fechar uma discovery

Uma discovery que decidiu algo **desce para o repositório** — senão a decisão fica num lugar que o
agente não lê:

1. a decisão difícil de reverter vira ADR (skill `lumem-adr`); o escopo vira feature (skill
   `lumem-feature`);
2. a página da discovery ganha, **no topo**, o link para o ADR e a PRD, e a frase *"decidido em
   AAAA-MM-DD: ver <link>"*;
3. nada da decisão é reescrito no Outline — ele passa a apontar.

## 4. Fechar uma feature no History

Quando uma feature fica `completa`, dois lugares:
- **o `CLAUDE.md`**: a linha dela na tabela do §Estado atual (número, status, uma frase);
- **o History** (`397ece48-…`): um parágrafo com o que a medição mudou e os defeitos que o e2e achou,
  com links para o GitHub. É a crônica, e ela é narrativa: o que surpreendeu, com o número.
