# Onde o Lumem guarda uma chave, e contra o que ela fica protegida

> **Estudo**, e ele sustenta uma decisão que **reverte** a minha de algumas horas antes: o Lumem
> passa a **guardar** as credenciais dos serviços de que depende, em vez de lê-las do ambiente.
>
> A decisão é do Vinicius, e a frase dela é curta: *"a decisão do `gh` e `glab` foi específica para
> eles, e a do Claude Code e Codex foi por simplicidade. De agora em diante, as chaves devem ser
> guardadas no Lumem de forma segura."*
>
> Escrito em **2026-09-13**.

---

## 1. O que este arquivo decide, e o que ele não decide

Ele decide **como** guardar, porque *"de forma segura"* tem pelo menos três leituras com custos muito
diferentes — e escolher em silêncio seria escolher a mais barata e chamá-la de segura.

Ele **não** decide *se* guardar. Isso já está decidido, e é o que o
[ADR](../adr/2026-09-13-1730-lumem-owns-the-keys-of-what-it-depends-on.md) registra.

---

## 2. As três leituras de *"de forma segura"*

| | Protege contra | **Não** protege contra | Custo |
|---|---|---|---|
| **(a)** arquivo `0600` em texto | git, backup ingênuo, outro usuário da máquina | quem lê seu `$HOME` como você | nenhum |
| **(b)** arquivo cifrado, chave ao lado | o acima **+** `cat` acidental, log, captura de tela, backup que leve só um dos dois | o mesmo: quem lê seu `$HOME` como você | pequeno |
| **(c)** cofre do sistema operacional | tudo acima **+** leitura local, porque o SO é quem decide quem abre | um processo seu que peça ao cofre | **alto** — ver §4 |

O degrau de (a) para (b) é menor do que parece e **não é zero**: o que ele compra é que o segredo
deixa de estar legível em qualquer lugar onde o arquivo apareça inteiro por acidente. O degrau de (b)
para (c) é o único que muda o modelo de ameaça de verdade.

---

## 3. O cofre do sistema, medido

Nesta máquina:

```
$ command -v security     → /usr/bin/security      (macOS, existe)
$ command -v secret-tool  → não existe             (é do Linux)
$ command -v cmdkey       → não existe             (é do Windows)
```

E o caminho de ida e volta funciona sem pedir senha, porque o daemon roda como você:

```
$ security add-generic-password -a lumem-probe -s lumem-probe -X <hex>
$ security find-generic-password -a lumem-probe -s lumem-probe -w   → segredo
```

**Dois achados, e os dois são contra.**

**O valor vai para o `argv`.** `-w <valor>` e `-X <hex>` põem o segredo na linha de comando, onde
qualquer processo da máquina o vê num `ps` durante a chamada. Tentei a saída óbvia e ela não existe:

```
$ printf 'valor' | security add-generic-password -a … -w
password data for new item: retype password for new item: passwords don't match
```

O `-w` sem valor **pede no terminal, duas vezes** — ele não lê de `stdin`. Não há como escrever no
chaveiro do macOS por essa CLI sem passar pelo `argv`.

**E são três implementações.** `security`, `secret-tool` e `cmdkey` são três CLIs com três sintaxes,
três formatos de erro e três comportamentos quando o cofre está trancado. É triplicar a superfície de
um caminho que precisa funcionar em silêncio.

---

## 4. A saída nativa custa o que a `014` pagou

A alternativa sem `argv` é um módulo nativo — `keytar` (sem manutenção desde 2023) ou
`@napi-rs/keyring`. Ela resolve o `argv` e as três sintaxes de uma vez.

E ela quebra um invariante que este produto **comprou caro**. O
[ADR de 2026-08-30](../adr/2026-08-30-0532-daemon-is-an-esm-bundle-that-serves-the-web.md):

> *"O servidor vira um arquivo com **só o par nativo por fora** […] O par nativo por fora significa
> que **prebuild ausente numa plataforma é falha de instalação**."*

São dois hoje — `better-sqlite3` e `node-pty` —, e o `smoke:install` existe justamente para pegar
prebuild faltando. Um terceiro é uma plataforma a mais onde `npm i -g @vinihcrosa/lumem-os` pode
falhar **na instalação**, por causa de uma feature que nem todo mundo usa.

---

## 5. A recomendação

> **(b): arquivo cifrado sob `~/.lumem/_system/`, com a chave num arquivo `0600` ao lado.**

Concretamente:

- `AES-256-GCM`, que o Node traz nativo — conferido: `getCiphers()` o inclui, e `scryptSync` existe;
- a chave é 32 bytes aleatórios em `_system/secrets.key`, criada no primeiro uso, `0600`;
- os segredos ficam em `_system/secrets.json`, cada um cifrado em separado com IV próprio;
- **os dois já estão fora do git**: o `_system/` inteiro está no bloco de `.gitignore` que o daemon
  mantém desde a [`007`](../features/007-workspace-memory/prd.md);
- a leitura devolve **presença** por default, e o valor só para quem vai usá-lo numa chamada.

### O que ela protege, dito sem floreio

O segredo não aparece em: o repositório git do `~/.lumem`, um `git remote` de backup daquela pasta,
um `cat` do banco, um log, uma captura de tela, ou a resposta de qualquer procedure para o navegador.

### O que ela **não** protege

**Quem consegue ler seu `$HOME` como você consegue ler a chave e decifrar.** Os dois arquivos estão
lado a lado, e isso é uma escolha e não um descuido — a alternativa que fecha esse buraco é a §4, e
ela custa um módulo nativo.

Escrever isso é a parte que importa: um produto que diz *"guardado com segurança"* sem dizer contra o
quê ensina alguém a confiar numa proteção que não existe.

---

## 6. O gatilho para subir para (c)

O dia em que o Lumem guardar uma credencial cujo vazamento **não é reversível por você** — uma chave
de escrita compartilhada por uma equipe, por exemplo. Chave pessoal de API é revogável em um clique;
o custo de (c) não se paga contra isso. Contra a outra, paga.

---

## 7. O que este estudo não decidiu

- **quem entra com a chave, e por onde.** A tela é desenho, e ela vai ao Open Design;
- **a migração dos que já leem do ambiente** — adaptadores e `gh`/`glab`. O Vinicius já disse que é
  uma feature posterior, e ela é: mudar o login dos agentes é mexer na
  [`009`](../features/009-agent-login/prd.md) inteira;
- **rotação.** Trocar uma chave é apagar e pôr outra na v1, e isso basta enquanto o Lumem guardar
  chave pessoal.
