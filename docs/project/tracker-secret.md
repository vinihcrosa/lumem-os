# O segredo do tracker — onde ele mora, e o que cada lugar custa

> **Estudo**, e ele sustenta uma decisão: as Partes 5 e 6 da
> [`028`](../features/028-autonomous-orchestration/prd.md) — a entrada de tarefas por um tracker
> externo e a escrita de volta nele.
>
> O §11 da PRD guardou isto com nome: *"um relé multiusuário guardaria credencial de escrita no
> tracker de terceiros, o que contraria de frente o [ADR de 2026-08-30](../adr/2026-08-30-0416-pr-status-comes-from-your-own-gh.md)
> (**o Lumem não guarda segredo**). Reverter aquilo, se for o caso, é um ADR novo."*
>
> Escrito em **2026-09-13**.

---

## 1. O que já foi medido, e o que ele tirou da mesa

O [§3.4 do estudo de orquestração](orchestration-measurements.md) mediu a saída confortável e a
eliminou: **não existe o `gh` do Linear.** Reconferido hoje, e a lista cresceu:

```
$ command -v linear    → não existe
$ command -v lnr       → não existe
$ command -v jira      → não existe
$ command -v jira-cli  → não existe
$ command -v clickup   → não existe
```

O ADR de 2026-08-30 nunca foi sobre GitHub. Ele foi sobre **já existir na máquina uma ferramenta
autenticada que não é nossa** — e para tracker essa ferramenta não existe. *"Faz como o `gh` fez"* não
é uma opção; é uma frase sem referente.

O estudo listou três saídas e disse que a medição não escolhia entre elas. **Ele não viu a quarta**, e
ela é o assunto deste arquivo.

---

## 2. A quarta saída já está no produto, e foi entregue duas vezes

O Lumem **já lida com credencial de terceiro**, e não guarda nenhuma. O mecanismo é o
`apiKeyEnv` do catálogo de adaptadores, da [`021`](../features/021-second-agent/prd.md):

```ts
/**
 * The **name** of the key variable found in the daemon's environment, or null.
 *
 * The name, never the value: […] a key echoed back into a browser would be a
 * secret leaving the daemon for no reason at all.
 */
apiKeyEnv: string | null;
```

E a [`009`](../features/009-agent-login/prd.md) entregou a segunda metade — o `redact` do
`agent-auth.ts`, que existe porque *"um adaptador que ecoa a credencial na mensagem de erro é
plausível, e a frase dele vai para a tela"*.

Ou seja: **o produto já tem uma política de segredo escrita e implementada**, e ela não é *"não
tocar"*. Ela é:

| Regra | Onde ela já vale |
|---|---|
| a credencial vem do **ambiente do daemon**, e nada a escreve | `ADAPTERS[].apiKeyEnv` |
| a tela recebe o **nome**, nunca o valor | `AdapterReport.apiKeyEnv` |
| mensagem de erro de terceiro é **redigida** antes de subir | `agent-auth.ts` → `redact` |
| nada sobrevive ao processo | `agent-auth.ts`, cabeçalho |

---

## 3. Onde um segredo guardado encostaria

Vale escrever, porque é o custo que o ADR de 2026-08-30 chamou de **permanente** — *"onde guarda,
como cifra, o que faz no backup, o que vaza no log, e uma tela de configuração por host"*. Medido
contra este repositório, e não contra a lembrança:

- **o `~/.lumem` é um repositório git que o daemon commita sozinho**
  ([`007`](../features/007-workspace-memory/prd.md), Q36). O `lumem.db` está no bloco de `.gitignore`
  que o daemon mantém, então um token no banco **não** iria para o histórico — mas essa proteção é
  uma linha de `.gitignore` que o próprio daemon reescreve, e o comentário dela já diz que repô-la é
  o remédio para o caso de alguém a apagar. É uma proteção, não uma garantia;
- **backup.** O mesmo Q36 vende `git remote` como o backup da memória. Um token no `~/.lumem` passa a
  ser um token cujo backup é uma decisão de outra feature;
- **tela.** Configuração por host é tela nova, e cada host tem uma forma de credencial diferente;
- **cifra.** E aí a pergunta seguinte é onde mora a chave que cifra — que é o mesmo problema uma
  camada acima.

Nada disso desaparece depois de escrito. É o argumento do ADR original, e ele continua de pé.

---

## 4. As quatro saídas, lado a lado

| | Onde o segredo mora | Funciona offline | Superfície nova | Contraria o ADR de 2026-08-30 |
|---|---|---|---|---|
| **(a)** o Lumem guarda | `~/.lumem` | sim | **toda a do §3** | sim, de frente |
| **(b)** camada gerenciada | terceiro | **não** | conta em terceiro, +~2 s por chamada | o segredo do usuário passa a morar fora da máquina dele |
| **(c)** sem tracker | — | — | nenhuma | não — e derruba o UC1, que abriu a PRD |
| **(d)** ambiente do daemon | **em lugar nenhum** | sim | nenhuma nova: é o `apiKeyEnv` | **não** — reafirma o motivo dele |

O **~2 s** da opção (b) é do [§3.1 do estudo de orquestração](orchestration-measurements.md), medido:
a camada gerenciada custa isso por chamada contra ~345 ms do caminho direto.

---

## 5. A diferença honesta entre (d) e o que já existe

Para **adaptador**, o daemon nunca toca no valor: ele lança um processo filho, e o filho herda o
ambiente. O daemon sabe que a variável existe e nada além disso.

Para **tracker**, quem faz a chamada HTTP é o daemon. **O valor passa pela memória dele.** Isso é um
degrau a mais, e fingir que não é seria o tipo de omissão que este repositório não permite.

O que muda, concretamente, e o que não muda:

| | adaptador (hoje) | tracker (proposta) |
|---|---|---|
| valor em disco | nunca | nunca |
| valor no browser | nunca | nunca |
| valor na memória do daemon | não | **sim, durante a chamada** |
| valor em log | `redact` cobre a mensagem do agente | precisa da mesma cobertura |
| tela mostra | o **nome** da variável | o **nome** da variável |

O degrau é real e é pequeno: um segredo em memória de processo enquanto ele monta um cabeçalho é
o que qualquer cliente HTTP faz. O que a política protege é o resto — e o resto é onde mora o custo
permanente.

---

## 6. A recomendação

> **(d): a credencial do tracker vem do ambiente do daemon, e o Lumem continua não guardando
> segredo nenhum.**

Concretamente:

- uma variável por host — `LINEAR_API_KEY` é a primeira —, declarada num catálogo como `ADAPTERS` já
  é declarado;
- a tela reporta **presença e nome**, nunca valor, e é assim que ela diz *"o tracker vai funcionar"*
  antes de a primeira chamada acontecer;
- **sem a variável, a feature não aparece** — não é erro, é ausência, do mesmo jeito que um projeto
  sem `test` declarado não ganha portão;
- toda mensagem de erro que vier do host passa pelo mesmo `redact` que a `009` escreveu.

## 7. O que este estudo **não** decidiu

- **o mapa de colunas** da Parte 6 — *"atrás de um mapa de colunas explícito por projeto"* é o §6, e é
  desenho, não segredo;
- **como o evento externo chega** (polling × webhook × relé), que é outro item do §11. O polling já
  foi medido: cabe em **2,4% da cota** do Linear. Webhook e relé continuam guardados, e o relé é
  precisamente o que a opção (b) exigiria;
- **escrita multiusuário.** Um relé com credencial de escrita de várias pessoas é a opção (b) com
  outro nome, e continua fora.
