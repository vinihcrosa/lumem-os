---
title: O daemon se atualiza sozinho, sob um supervisor do sistema, e só avisa por padrão
date: 2026-09-29
area: distribution
summary: Decisão do Vinicius. O daemon pergunta ao npm se há versão nova (a cada 6 h e no boot), instala por cima com o gerenciador dono da cópia e sai com 0 para o launchd ou o systemd o subir de novo. Por padrão só avisa; atualizar sozinho quando ocioso é opt-in. Ocioso é nenhum turno em voo e nenhum script rodando. A consulta ao registry não é telemetria, e desliga. Reabre se "baixar agora e aplicar depois" for pedido, o que exige cópias versionadas.
feature: 038-desktop-and-updates
---

## Contexto

A [`014-distribution`](../features/014-distribution/prd.md) §7 deixou o auto-update de fora: *"Continua
sendo manual: nada se atualiza sozinho"*. Desde 2026-09-06 existe o `lumem upgrade`
(`packages/cli/src/upgrade.ts`), que pergunta ao registry, instala com o gerenciador dono da cópia e
avisa que o daemon de pé *"ainda está na vX: pare e suba de novo para valer"* (`:191`).

Três fatos, lidos na discovery de 2026-09-29 (*Menu bar app and auto-update*, no Outline):

- **Releases são frequentes:** sete versões em 23 dias, de `0.1.0` (2026-08-30) a `0.6.0` (2026-09-22),
  todas minor.
- **Atualizar é reiniciar, e reiniciar mata o que está vivo.** No boot, `reconcileOrphanSessions` marca
  toda sessão `running` como `exited` (`server/src/boot/reconcile.ts:121`): turno no meio, shell e
  script de projeto morrem; a conversa ACP é retomável.
- **Instalar por cima com o daemon de pé quebra a web dele**, por leitura: o `@fastify/static` com
  `wildcard: false` registra uma rota por arquivo que existe no boot (`server/src/web/static.ts:82`); o
  `index.html` novo aponta para assets que o daemon velho não conhece. É o experimento 1 da fase 0.

## Decisão

O daemon verifica sozinho se há versão nova e, quando manda atualizar, instala **por cima** e **sai com
0**, para o supervisor do sistema — launchd no macOS, `systemd --user` no Linux — subi-lo de novo. Instalar
e reiniciar são **um gesto só**, nunca dois.

O que isso implica:

- **A verificação mora no daemon**, a cada 6 h e uma vez no boot, só no dist-tag `latest`. Web e app leem
  o resultado dele.
- **Por padrão, só avisa.** Atualizar sozinho é uma escolha em `/settings`: *atualizar quando ocioso*.
- **Ocioso** é nenhum turno em voo (`AcpManager.liveTurns()` vazio) e nenhum script de projeto rodando.
  Um shell aberto avisa, mas não impede, porque ele nunca fecha sozinho.
- **Sem supervisor, não há atualização pelo daemon.** Quem roda em primeiro plano (`lumem run`) recebe o
  aviso e o comando `lumem upgrade`.
- **Sob `0.x`, qualquer bump do `latest` vale; depois de `1.0`, nunca atravessa um major** sozinho.
- **O banco é copiado antes da migração** quando a versão muda. Não existe rollback automático.
- **Não é telemetria:** é um `GET` ao `registry.npmjs.org` sem identificador além do IP e do
  user-agent. `LUMEM_NO_UPDATE_CHECK=1` e o interruptor de `/settings` o desligam.

## Alternativas

### Continuar manual

- **O que era:** o `lumem upgrade` de hoje.
- **Contra:** com uma versão a cada três dias, é trabalho repetido; e o gesto tem dois passos, com a
  página em branco no meio.
- **Por que perdeu:** o pedido é o auto-update; o manual continua existindo, agora em um passo.

### Baixar agora, aplicar no próximo boot (o modelo do instalador nativo do Claude Code)

- **O que era:** cópias versionadas em `~/.lumem/versions/<v>/` atrás de um lançador, como o daemon já
  faz com o adaptador ([ADR de 2026-09-08](2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md)).
- **A favor:** nunca reinicia sem aviso; troca de versão é atômica.
- **Contra:** um lançador, coleta de cópias velhas e um segundo caminho de instalação ao lado do
  `npm i -g`.
- **Por que perdeu:** custa uma feature inteira, e o gesto único resolve a página em branco. Fica no
  backlog.

### Aplicar assim que publicar

- **Contra:** mata agente no meio do turno.
- **Por que perdeu:** o produto existe para os agentes trabalharem sem você olhar.

### O app de desktop instala

- **Contra:** quem usa só o CLI e o navegador ficaria sem; e o app pode estar em outra versão.
- **Por que perdeu:** o daemon é o único que sabe se está ocioso.

## Consequências

### Bom

- Uma versão nova chega sem ninguém abrir terminal, e nunca no meio de um turno.
- A página em branco depois do `upgrade` deixa de existir.

### Ruim

- O daemon passa a fazer uma requisição para fora sozinho, o que precisa estar escrito e desligável.
- Uma migração que der errado não volta sozinha; a cópia do banco é o caminho manual.

### Riscos — e o gatilho que traz a pergunta de volta

- **A definição de ocioso errar** e matar um agente: o modo automático é opt-in e vem por último, depois de
  o gesto manual rodar um tempo.
- **Um `npm i -g` sem permissão de escrita no prefixo:** a instalação falha, o daemon continua na
  versão atual e diz o código de saída.
- **Alguém pedir "aplicar no próximo boot":** reabre as cópias versionadas.
