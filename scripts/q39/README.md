# A bancada da Q39

O que sustenta o **§4bis** de
[`orchestration-measurements.md`](../../docs/project/orchestration-measurements.md).

Fica no repositório e não num `/tmp` descartável porque a medição **custou dinheiro** (US$ 4,60) e o
que a torna discutível é poder rodar de novo. Os `turns-*.json` são a saída bruta: um objeto por
turno, com o `stopReason`, o `git show --stat` do commit, o texto do agente e o custo.

| Arquivo | O quê |
|---|---|
| `lab.ts` | o repositório de laboratório — um por turno, com o bug plantado |
| `measure.ts` | os 5 × 2 turnos. `Q39_MODEL`, `Q39_ARM`, `Q39_OUT` por variável de ambiente |
| `report.ts` | classifica e conta. `npx tsx scripts/q39/report.ts scripts/q39/turns-*.json` |
| `probe.ts`, `one.ts`, `smoke.ts` | os três passos que vieram antes: o adaptador sobe, quais modelos ele oferece, e um turno fecha |
| `turns-haiku.json`, `turns-opus.json` | a corrida boa |
| `turns-*-v1.json` | a corrida **errada**, guardada de propósito — ver abaixo |

## Por que a v1 fica

O braço de conversa dela **não pedia commit**, então `committed: false` media *"ninguém mandou
commitar"* e não *"não terminou"*. Os cinco turnos deram `false` por construção, e o número teria
saído espetacular e falso: *"autônomo termina 5/5, conversa 0/5"*.

Ela fica porque o texto dos turnos continua valendo — foi nela que a tarefa impossível virou
`src/catalog.ts` inventado — e porque um desenho de experimento que se corrige em silêncio é um
desenho que ninguém pode conferir.

## Rodar de novo

```sh
Q39_MODEL=haiku Q39_OUT=scripts/q39/turns-haiku.json npx tsx scripts/q39/measure.ts
npx tsx scripts/q39/report.ts scripts/q39/turns-haiku.json scripts/q39/turns-opus.json
```

**Gasta token de verdade**, contra o adaptador que o daemon instalou, e roda o agente em
`bypassPermissions` — só dentro do repositório de laboratório em `/tmp`, recriado a cada turno.
