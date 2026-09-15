---
title: O Lumem guarda as chaves dos serviços de que depende
date: 2026-09-13
area: security
summary: Decisão do Vinicius, e ela reverte a de algumas horas antes. O `gh` foi uma solução **daquele** caso, e ler a chave do ambiente foi **simplicidade**, não política — nenhuma das duas era uma regra a ser estendida. De agora em diante o Lumem guarda as credenciais dos serviços de que depende, cifradas, sob `~/.lumem/_system/`. Vale já para o tracker; agentes, GitHub e GitLab entram numa feature posterior. O que a cifra protege e o que ela **não** protege está escrito, porque dizer "guardado com segurança" sem dizer contra o quê ensina alguém a confiar numa proteção que não existe.
feature: 028-autonomous-orchestration
supersedes: 2026-09-13-1531-tracker-credentials-come-from-the-environment
---

## Contexto

Horas antes, eu escrevi que a credencial do tracker viria do ambiente do daemon, e justifiquei com
dois precedentes do próprio produto: o `apiKeyEnv` da [`021`](../features/021-second-agent/prd.md) e
o `gh` do [ADR de 2026-08-30](2026-08-30-0416-pr-status-comes-from-your-own-gh.md).

**Os dois precedentes não eram regra**, e quem os escreveu disse isso:

> *"A decisão do `gh` e `glab` foi específica para eles; a do Claude Code e Codex foi por
> simplicidade. De agora em diante, as chaves devem ser guardadas no Lumem de forma segura — o Lumem
> deve gerenciar essas chaves de serviços externos de que ele depende."*

É a diferença entre **uma solução que funcionou num caso** e **uma política**. O `gh` resolveu o
status da PR porque ele já estava ali, autenticado; ler `ANTHROPIC_API_KEY` do ambiente resolveu o
login do agente porque era o caminho curto. Generalizar qualquer um dos dois foi erro meu, e foi o
erro que o ADR anterior cometeu.

## Decisão

**O Lumem guarda as credenciais dos serviços externos de que depende**, e as guarda cifradas.

- **onde:** `~/.lumem/_system/secrets.json`, com a chave de cifra em `_system/secrets.key`. O
  `_system/` inteiro já está fora do git desde a [`007`](../features/007-workspace-memory/prd.md), e
  o `.gitignore` que o garante é mantido pelo daemon;
- **como:** `AES-256-GCM`, nativo do Node — nenhum módulo novo, e o §4 do
  [estudo](../project/secret-store.md) diz por que isso importa;
- **o que sai daqui:** **presença**, sempre. O valor só é lido por quem vai usá-lo numa chamada, e
  nunca atravessa uma resposta para o navegador;
- **escopo agora:** o tracker. **Agentes, GitHub e GitLab entram numa feature posterior**, e é o
  Vinicius quem já disse isso — mudar o login dos agentes é mexer na
  [`009`](../features/009-agent-login/prd.md) inteira.

### O que ela protege, e o que ela não protege

Isto não é rodapé; é metade da decisão.

**Protege contra:** o repositório git do `~/.lumem`, um `git remote` usado como backup daquela pasta,
um `cat` do banco, um log, uma captura de tela, e qualquer resposta do daemon para a tela.

**Não protege contra:** quem já consegue ler o seu `$HOME` como você. A chave está ao lado do
arquivo, e quem lê os dois decifra. É escolha, e não descuido — a alternativa que fecha esse buraco é
o cofre do sistema operacional, e o §4 do estudo mede o que ele custa.

## Alternativas

**Ler do ambiente** (o ADR que este supera). Não custa nada e não guarda nada — e é exatamente por
isso que ela perde: ela empurra a gestão da credencial para fora do produto, e o produto é quem
depende dela. Na prática ela também não é gratuita para quem usa: uma variável por serviço, num
`.zshrc` ou num `launchd`, é configuração que ninguém lembra de onde veio.

**O cofre do sistema operacional**, medido no [estudo](../project/secret-store.md) e recusado por
dois achados concretos. O primeiro: **o valor vai para o `argv`** — `security add-generic-password -w
<valor>` e `-X <hex>` põem o segredo na linha de comando, e a saída óbvia não existe, porque o `-w`
sem valor pede no terminal duas vezes em vez de ler `stdin`. O segundo: são **três CLIs** — `security`,
`secret-tool`, `cmdkey` — com três sintaxes e três comportamentos quando o cofre está trancado.

**Um módulo nativo de chaveiro** (`keytar`, `@napi-rs/keyring`), que resolve os dois. Ele quebra o
invariante que o [ADR de 2026-08-30](2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md)
comprou: *"um arquivo com **só o par nativo por fora**"*, e *"prebuild ausente numa plataforma é falha
de instalação"*. São dois hoje; um terceiro é uma plataforma a mais onde `npm i -g` pode falhar **na
instalação**, por causa de uma feature que nem todo mundo usa.

## Consequências

- **O ADR de 2026-08-30 continua em vigor**, e este o reafirma: o status da PR continua vindo do `gh`
  da sua máquina. Ele não foi generalizado — foi o contrário, foi **delimitado ao caso dele**. A
  feature posterior que trouxer GitHub e GitLab para cá é quem vai contradizê-lo, e ela deve fazer
  isso por escrito;
- o `apiKeyEnv` da `021` **continua como está** pela mesma razão, e pelo mesmo prazo;
- **o produto ganha uma superfície de segredo, e ela é permanente** — é literalmente o custo que o ADR
  de 2026-08-30 nomeou para não pagar. Pagá-lo agora é a decisão; o que este ADR garante é que ele
  seja pago **com o preço à vista**, e não com a palavra *"seguro"* cobrindo a conta;
- **rotação é apagar e pôr outra** na v1. Basta enquanto o que se guarda é chave pessoal, que é
  revogável em um clique;
- e o gatilho para subir para o cofre do sistema: **uma credencial cujo vazamento não seja reversível
  por você** — uma chave de escrita compartilhada por uma equipe. Contra chave pessoal, o custo do §4
  não se paga; contra aquela, paga.
