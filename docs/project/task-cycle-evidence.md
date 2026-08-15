# Evidência do ciclo de tasks

Registro de custo e achados do ciclo `lumem-dev` → `lumem-reviewer` → rework → commit, orquestrado
pela skill [`lumem-task-cycle`](../../.claude/skills/lumem-task-cycle/SKILL.md).

Este arquivo existe por uma regra da própria skill: **regra que cita número precisa de arquivo que
sobreviva a `clone`**. Sem ele, a skill viaja com estimativas sem lastro e ninguém consegue dizer se
ela está calibrada ou se está repetindo folclore.

---

## Estado atual

**Zero lotes medidos.** A skill foi escrita em 2026-08-14 a partir de regras medidas em **outro
projeto** — um serviço .NET/DDD, com gates de dezenas de minutos, suíte de ~1500 testes e interop
nativo. Nenhum número dela vem daqui.

Enquanto esta seção disser "zero lotes", toda estimativa de custo que a skill der ao usuário é
**chute honesto herdado**, e tem de ser apresentada como tal.

---

## O que registrar ao fechar cada lote

Uma linha na tabela de lotes, mais uma seção própria quando o lote produzir achado que vale
argumento — regra nova, regra refutada, ou defeito de classe não vista antes.

### Tabela de lotes

| Lote | Tasks | Perfil | Diff | Dev | Review r1 | Rework r1 | Review r2 | Total | Rounds | Bloqueantes | Mutações sobreviventes |
|---|---|---|---|---|---|---|---|---|---|---|---|
| — | — | — | — | — | — | — | — | — | — | — | — |

Tokens e tool calls saem do relatório de cada sub-agente. O total inclui só sub-agentes: a
verificação independente do orquestrador não é isolada na medição, mas **não é ruído** — anote
quando for cara (execução de suíte cheia, mutação manual, derivação de valor da fonte normativa).

### Por lote, também

* **achados por destino** — dev resolve / orquestrador decide / usuário responde;
* **achados de costura** (entre tasks) versus internos a uma task. É a métrica que decide se o
  agrupamento está no tamanho certo;
* **mutações sobreviventes** encontradas pelo revisor, e o teste que deveria tê-las pegado;
* **o que a verificação independente do orquestrador pegou** — ou, se não pegou nada, dizer isso.
  Uma verificação que nunca refuta ainda tem valor (autoriza pular um round), mas isso precisa ser
  registrado para não virar cerimônia invisível;
* **premissas derrubadas pelo dev** — as três do projeto de origem foram o achado mais valioso do
  método;
* **o que o passe a frio encontrou** que o orquestrador com contexto não via.

---

## Números herdados — não medidos aqui

Origem: projeto .NET/DDD, 6 experimentos, ~15 lotes. Reproduzidos porque a skill os cita, e a regra
é que número citado tenha lastro visível. **Não são deste repositório.**

| Perfil | Dev | Review (1 round) | Rework | Total, 1 round |
|---|---|---|---|---|
| declarativo | ~110k/task | ~145k/lote | ~165k | — |
| lógica | ~200k/task | ~150k/lote | ~200k | — |
| fronteira / crítico | ~290k/task | ~145k/lote | ~230k | ~700k/task |

Multiplicador de round: cada round adicional ≈ +300k. Tasks críticas ficaram em ~1,6 rounds.

Achados estruturais que sustentam as três leis da skill:

| Medição | Resultado |
|---|---|
| custo do review vs. tamanho do diff | 5,4× de diff → 1,28× de token; 9× de diff → 1,35× de token |
| lote de 1 task declarativa | 438k tokens, saída líquida de **um comentário** |
| lote de 3 tasks declarativas | 1,04M tokens, **5 bloqueantes**, 3 deles invisíveis a review por task |
| task crítica sozinha | ~700k a >1M, ~1,6 rounds |
| classe dominante de bloqueante | defeito **entre** tasks, 4 ocorrências |
| verificação independente do orquestrador | 1 refutação em 9 lotes |

---

## O que este projeto pode desmentir

Hipóteses que a skill assume e que a primeira medição aqui deve testar. Estão listadas para que a
medição seja feita **com pergunta**, não como coleta cega.

1. **A Lei 1 (custo de review quase constante) transfere?** No projeto de origem, boa parte do
   custo do review era rodar gates lentos. Aqui `pnpm gate:quick` roda em segundos. Se o custo do
   review for dominado por leitura de PRD e código, a lei transfere; se era dominado por espera de
   gate, o overhead fixo cai e o lote grande perde vantagem relativa.

2. **O perfil `lógica` — o menos calibrado, e o mais frequente aqui.** Repositórios, routers e
   componentes são a maior parte das 34 tasks do walking-skeleton. Os pontos amostrais fortes do
   projeto de origem eram declarativo, fronteira e crítico.

3. **A bateria de mutação muda a conta?** É eixo obrigatório do `lumem-reviewer` e não existia no
   revisor do projeto de origem. Deve encarecer o review e aumentar o achado — em quanto, e vale?

4. **Fronteira continua sendo o perfil que engana?** A Fase 0 deste repositório é evidência forte a
   favor: config pura, diff pequeno, **seis rodadas** de review adversarial, e todas as armadilhas
   de [testing.md](testing.md) nasceram ali. Mas isso foi medido sem a skill, com o ciclo
   informal — não é ponto amostral do método.

5. **Quanto custa o passe a frio aqui?** No projeto de origem, ~104k a ~179k tokens e captura alta.
   Repositório menor pode significar passe mais barato e captura menor.

---

## Registro de lotes

_Vazio. Primeira entrada quando o primeiro lote fechar._
