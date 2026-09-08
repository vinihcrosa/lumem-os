---
title: O daemon é um bundle ESM que serve o web na própria porta
date: 2026-08-30
area: distribution
summary: O servidor vira um arquivo com só o par nativo por fora e passa a servir o web em produção, porque um processo e uma porta é o que faz `npm i -g` instalar algo que sobe — e o passo que prova isso é instalar o tarball num runner limpo.
feature: 014-distribution
---

## Contexto

O Lumem só rodava a partir do checkout: `pnpm dev`, dois processos, duas portas, um monorepo pnpm
inteiro no disco. Não havia como alguém usar o produto sem clonar e construir.

A restrição que bifurca a decisão: **o que quebra um pacote publicado não é o que quebra num
checkout.** `require` dinâmico dentro de uma dependência, prebuild nativo ausente numa plataforma,
arquivo necessário fora do `files` do `package.json` — nenhum desses aparece em typecheck, em teste
unitário ou em e2e rodando na árvore.

## Decisão

`packages/server` ganha um build: **um bundle ESM** feito com esbuild, com **só o que é nativo por
fora** (`better-sqlite3` e `node-pty`). Em produção o daemon **serve o web** na própria porta. O
binário `lumem` sobe tudo, e `npm i -g @vinihcrosa/lumem-os` instala.

E o passo central da pipeline de release é **instalar o tarball num runner limpo e subir** — em
ubuntu e macos.

## Alternativas consideradas

O desenho está no [§3 do PRD](../features/014-distribution/prd.md), e **foi medido, não suposto**:
bundle de `src/main.ts` em 2026-08-30, 3,0 MB num arquivo, 123 ms.

### Publicar o monorepo, sem bundle

- **O que era:** empacotar `packages/server` com as dependências declaradas, do jeito normal.
- **A favor:** nada de esbuild, nada de shim, e `require` dinâmico continua funcionando porque o
  runtime resolve tudo.
- **Contra:** o pacote publicado declara dezenas de dependências, e cada uma é uma chance de
  divergência entre o que foi testado e o que foi instalado.
- **Por que perdeu:** o bundle transforma *"o que ele precisa em runtime"* numa lista de **duas**
  dependências. Qualquer outra coisa que ele precise falha no smoke — o que faz do smoke uma prova,
  e não um teste a mais.

### Dois processos e duas portas em produção também

- **O que era:** manter vite servindo o web ao lado do daemon, como no desenvolvimento.
- **A favor:** um caminho só, dev e produção idênticos.
- **Contra:** duas portas para o usuário abrir, um proxy no meio, e uma dependência de dev no
  caminho de produção.
- **Por que perdeu:** *"o que a produção elimina é o segundo processo e a segunda porta, não o fluxo
  de trabalho de quem desenvolve"*. `pnpm dev` continua sendo vite + daemon com proxy. O custo é
  pagar **um** caminho a mais de código, e o ganho é o produto ter um comando só.

### Confiar no typecheck e no e2e da árvore

- **O que era:** não ter o passo de instalar o tarball num runner limpo.
- **A favor:** a pipeline fica mais curta e mais rápida.
- **Contra:** nenhuma das três falhas reais de empacotamento é visível dali.
- **Por que perdeu:** o `require` dinâmico já aconteceu, medido: **sem o shim, o bundle morre no
  boot** com `Error: Dynamic require of "process" is not supported`, dentro do `yaml@2.9.0`. Com um
  `--banner:js` criando `require` por `createRequire(import.meta.url)`, sobe. Um teste que não
  instala e não sobe **não teria visto isso** — nem o typecheck, nem o e2e da árvore.

## Consequências

### Bom

- `npm i -g @vinihcrosa/lumem-os` instala algo que sobe, e o e2e roda **uma vez em modo produção**:
  sem vite, contra `dist`.
- O pacote publicado declara **duas** dependências.
- Uma armadilha de layout saiu do mesmo teste e ficou fixada: `db/index.ts` resolve as migrações em
  relação ao próprio arquivo, **dois níveis acima**. O pacote tem que preservar essa distância —
  bundle em `dist/server/main.mjs`, `drizzle/` na raiz. Um bundle solto na raiz abriria um banco sem
  tabela nenhuma, e o que prova isso é o boot, não o typecheck.

### Ruim

- **Um shim de `require` no banner** é dívida silenciosa: ele existe porque uma dependência faz
  `require` dinâmico, e nada avisa quando outra passa a fazer. O que avisa é o smoke, depois.
- Dois caminhos de servir o web — vite no dev, Fastify em produção — e só o segundo é testado em
  modo produção.
- O par nativo por fora significa que **prebuild ausente numa plataforma é falha de instalação**, e
  a resposta é o README dizer o que é suportado. Windows não é.

### Riscos

- **O bundle pode esconder uma dependência de dev no caminho de produção**, e a única coisa que pega
  isso é o smoke. Se o smoke sair da pipeline, essa classe de defeito volta a ser invisível.
- A saída do esbuild depende de `import.meta.url` funcionar como o código espera. Foi verificado que
  há **um** `import.meta.url` no servidor fora de testes, e nenhum segundo caso escondido — mas isso
  é uma verificação de um momento, não um mecanismo.
