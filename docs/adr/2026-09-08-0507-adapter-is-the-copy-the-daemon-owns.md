---
title: O adaptador é a cópia que o daemon instalou, e o PATH nunca decide qual
date: 2026-09-08
area: transport
summary: A resolução do binário de adaptador perde o fallback para o PATH e passa a ser só o diretório do daemon, no pino, conferido no boot — porque a alternativa não é hipotética: esta máquina rodou nove dias no `0.40.0` global enquanto o pino dizia `0.75.1`, sem Opus 5 na lista e com a janela relatada em 200K.
feature: 027-adapter-provenance
---

## Contexto

A [`006-acp-sessions`](../features/006-acp-sessions/prd.md) fez a sessão de agente ser um processo
que o daemon lança e com quem ele fala ACP. Quem é esse processo é o **adaptador**, e a
[`021-second-agent`](../features/021-second-agent/prd.md) transformou as cinco constantes de um
adaptador no catálogo `ADAPTERS`, com `pinnedVersion` sempre literal — a A12, cujo motivo escrito é
que *"uma publicação noturna de um adaptador de terceiro não muda como o agente se comporta sem
alguém ter revisado"*.

O pino existia. O que faltava era ele **decidir** o que roda.

Duas funções resolviam o binário com a mesma forma, e a forma tinha um `else`:

```ts
// packages/server/src/routers/setup.ts:57
function commandFor(spec: AdapterSpec, stateDir: string): string {
  const managed = adapterBinaryPath(adaptersDir(stateDir), spec);
  return existsSync(managed) ? managed : spec.command;
}
```

`spec.command` é `"claude-agent-acp"` — um nome, resolvido pelo PATH. Numa máquina sem instalação
gerenciada, o `else` é o caminho normal, não o excepcional. E o comentário acima dessa função já
narrava um defeito anterior desse mesmo `else` — a LUM-54, *"duas versões numa máquina, e a que
respondia era a que ninguém escolheu"* —, consertado para **relatar** a cópia certa e não para
**lançar** ela.

### O que foi medido, em 2026-09-08

Nesta máquina, com o pino em `0.75.1` desde a fase 0 da `second-agent`:

| Onde | O quê |
|---|---|
| `~/.lumem/adapters/` | **não existia** — a instalação gerenciada nunca rodou |
| `agent_config` (`~/.lumem` e `~/.lumem-dev/shared`) | `command = /…/nvm/…/bin/claude-agent-acp`, `adapter_version = 0.40.0`, `created_at == updated_at = 2026-08-30 19:57` |
| `npm ls -g` | `@agentclientprotocol/claude-agent-acp@0.40.0` |
| dependência dele | `@anthropic-ai/claude-agent-sdk@0.3.160` — o Claude Code **2.1.160** |

Nove dias de sessões, todas no `0.40.0`. E o que isso custou não é abstrato — está gravado no
`type:"config"` dos transcripts em `~/.lumem/transcripts/*.db`, que é literalmente a lista que o
adaptador entregou:

| `0.40.0` (o que rodava) | `0.75.1` (o pino), medido |
|---|---|
| `default` — Opus 4.8 with 1M context | `default` — Opus (1M context) |
| `sonnet` — Sonnet 4.6 | `opus[1m]` — **Opus 5** with 1M context |
| `haiku` — Haiku 4.5 | `claude-fable-5-1[1m]` — **Fable 5.1** |
| `claude-fable-5-1[1m]` — **`Custom model`** | `sonnet` — Sonnet 5 |
| | `haiku` — Haiku 4.5 |

Sem Opus 5. E a quarta linha da coluna esquerda é a prova de segunda ordem: o Fable 5.1 aparecia só
porque o `~/.claude/settings.json` da máquina o pedia, e um SDK que não conhece a string a ecoa crua,
rotulada `Custom model`. O `0.75.1` a chama de `Fable` e diz o preço.

A janela é o mesmo defeito visto por outro lado. O Lumem **não calcula** janela: o
`translate.ts:284-299` repassa o `size` do `usage_update` verbatim. O `0.40.0` mandou os dois
valores — `1000000` em cinco sessões e `200000` na de 2026-09-08 04:47:58, com `default` selecionado
o tempo todo e um único evento de config. Um turno real no `0.75.1` mandou `size: 1000000` nos três
eventos, com `cost` e `_claude/rateLimit` presentes.

E o `else` do PATH não é a única superfície: `agent_config` guarda o **caminho absoluto** resolvido no
dia em que a linha nasceu, o router não tem `update`, e o `resume` relança `row.command` — o caminho
congelado da sessão morta. Uma instalação gerenciada correta não desalojaria nenhum dos três.

## Decisão

**O adaptador que o daemon lança é a cópia que o daemon instalou, no `pinnedVersion`, e o PATH nunca
participa dessa escolha.**

Em três partes, porque a decisão morre se qualquer uma faltar:

1. **A resolução não tem `else`.** `commandFor` devolve o caminho gerenciado ou **recusa com uma
   frase** — nunca `spec.command`. Uma spec sem `package` deixa de ser "esperada no PATH" e passa a
   ser irresolvível por construção: o campo continua existindo, e o que muda é que ele não abre
   caminho para um binário que ninguém escolheu.
2. **O boot confere.** O daemon compara a versão **no disco** com o pino antes de a primeira sessão
   existir, e reconcilia. Foi a ausência disso que deixou nove dias passarem: o pino subiu num
   commit e nada na máquina releu.
3. **O caminho não é dado de sessão.** A invocação é resolvida da spec a cada `spawn` e a cada
   `resume`. O que a linha de `agent_config` guarda é *qual adaptador*, não *onde ele estava em
   agosto*.

O que **continua** vindo do PATH, nomeado para não ser confundido com o que acabou de ser proibido:

- **`npm`**, para instalar — já era assim, e `installAdapter` diz isso com as palavras do próprio npm
  quando falta;
- **o ambiente do processo filho.** Medido: com `PATH` contendo só `node`, o `session/prompt` do
  `0.75.1` responde `Authentication required`; acrescentando `/usr/bin/security` — o keychain do
  macOS — o mesmo turno fecha em `end_turn` com `size: 1000000`. O adaptador precisa de um PATH
  utilizável; ele não precisa que o PATH diga **quem ele é**.

O `cli` do `CLAUDE_ADAPTER` cai para `null`. Medido três vezes: o `0.75.1` completa `initialize` e
`session/new` com o `claude` fora do PATH; o daemon em execução spawna
`@anthropic-ai/claude-agent-sdk-darwin-arm64/claude`, de dentro do pacote; e os `authMethods` que ele
oferece têm `args: ["--cli", "auth", "login", "--claudeai"]` — o `--cli` é do próprio adaptador. O
comentário do catálogo que dizia *"um adaptador que dirige um binário que tem que existir"* era
verdade no `0.40.0` e deixou de ser.

## Alternativas

**Manter o fallback para o PATH.** É o que havia, e a seção de contexto é o boletim de danos: nove
dias, uma lista de modelos sem o modelo, e `200000` carimbado numa sessão rotulada *"1M context"*. O
argumento a favor é real — numa máquina sem npm ou sem rede, o PATH é a única cópia que existe. A
resposta é que essa máquina prefere uma recusa que diz o que falta a uma sessão silenciosa numa
versão que ninguém escolheu; e que o modo de falha do fallback é pior justamente porque **não falha**.

**O adaptador como dependência de verdade do pacote publicado** — `dependencies` do `lumem`,
resolvido por `createRequire(import.meta.url).resolve(...)`. Isto é "embutido" na acepção forte:
nada de npm em tempo de execução, nada de rede no primeiro boot, nada de diretório de estado
guardando 243 MB. Foi pedido nestes termos, e foi recusado **por tamanho medido**: o
`claude-agent-acp@0.75.1` instala **243 MB** e o `codex-acp@1.10.0` **301 MB** — um `npm i -g
@vinihcrosa/lumem-os` passaria de ~550 MB, e cobraria os dois de quem usa um. Some-se que o
[daemon é um bundle ESM com só o par nativo por fora](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md):
dois CLIs de terceiro entram como *externals*, não como bundle, e o `smoke:install` — o passo que
existe para pegar `require` dinâmico e arquivo fora do pacote — passaria a baixar meio giga por
execução. A propriedade que o pedido nomeia (*"não deve ficar na mão do PATH"*) é entregue inteira
pela decisão acima; o que a dependência acrescenta é **pré-pagar o download**, e esse é um trade-off
de distribuição, não de proveniência. Fica no [backlog](../project/backlog.md) com o gatilho: se o
primeiro boot sem rede virar reclamação real, ou se um adaptador encolher para dezenas de MB.

**Conferir por `<binário> --version`** em vez do `package.json` do pacote instalado. Já respondido
pelo `install-adapter.ts`, e a medição está no comentário dele: `claude-agent-acp@0.40.0` responde
`--version` com **string vazia e exit 0**. O binário não sabe dizer o que é.

## Consequências

- Primeiro boot numa máquina nova precisa de `npm` e de rede, e a falha disso é uma frase, não uma
  sessão degradada.
- Uma cópia global de `claude-agent-acp` deixa de ter efeito sobre o produto. O `setup.agents`
  continua **relatando** o que achou no PATH — informação é útil, e o `BinaryReport.managed` já
  distingue —, mas nenhum caminho de execução a consulta.
- Subir o `pinnedVersion` num commit passa a mudar o que roda no próximo boot. Era o que a A12 já
  prometia e não cumpria.
- O `rateLimit` do rodapé volta a acender: o `0.75.1` aninha `utilization` em
  `_claude/rateLimit.unifiedWindows.<janela>`, e `rateLimitOf` exigia o campo na raiz — por isso
  `rateLimit: null` em todo transcript. Não é regressão desta decisão; é um defeito que ela expõe.
- Duas `configOptions` novas aparecem no `0.75.1` — `effort` (`category: thought_level`) e `agent`
  (persona de thread principal). Estão fora do escopo desta decisão e vão para o backlog.
