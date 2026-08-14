# Conductor (conductor.build)

> Documento de estudo para o projeto **Lumem-OS**. Pesquisa feita em 2026-08-13.
>
> **Metodologia:** o Conductor está instalado nesta máquina (`/Applications/Conductor.app`, v0.80.0) e em uso pesado
> (12 repos, ~85 workspaces históricos, 91.275 mensagens no banco local). Boa parte deste documento vem de
> **inspeção direta e somente-leitura** do bundle, do SQLite, dos scripts e dos diretórios de dados — não só da documentação.
> Achados verificados localmente estão marcados com **[local]**. Achados só da doc oficial, com **[doc]**.
> O que não consegui confirmar está marcado com `⚠️ não confirmado:`.

---

## 1. Visão geral

| Item | Valor |
|---|---|
| Produto | Conductor — "app para rodar vários agentes de código em paralelo, cada um num workspace isolado" |
| Empresa | **Melty Labs** (rodapé do site: `© 2026 Melty Labs`) |
| Fundadores | **Charlie Holtz** (CEO, ex-Replicate) e **Jackson de Campos** (ex-Netflix, infra de ML) |
| YC | **Summer 2024** — entraram com outro produto |
| Produto anterior | **Melty**, editor de código open source com IA (chat-first, cada mensagem virava commit). Pivotaram de chat → coding agents |
| Lançamento | **Show HN em 17/07/2025**, 228 pontos |
| Financiamento | **Series A de US$ 22 M** (~30/03/2026), liderada por **Spark** e **Matrix** (Ilya Sukhar entrou no board); também YC e fundadores de Notion e Linear |
| Time | 4–6 pessoas, San Francisco, **onsite obrigatório** |
| Tração | *"We've grown 10x since January"* (mai/2026). Marketing: *"Trusted by 100k+ builders"* (não auditado). Clientes citados: engenheiros de Stripe, Vercel, Notion, Linear, Supabase, Ramp |
| Plataforma | **macOS apenas** para o app desktop. `LSMinimumSystemVersion = 10.13`, binário **arm64** (Apple Silicon) **[local]** |
| Bundle ID | `com.conductor.app` **[local]** |
| URL scheme | `conductor://` (registrado em `CFBundleURLTypes`) **[local]** |
| Versão instalada | **0.80.0** (build de 2026-08-10) **[local]** |
| Última versão pública | **0.80.1** (2026-08-12) — "Grok 4.6" **[doc]** |
| Licença | **Proprietária** (`license: Proprietary` no SKILL.md embutido) **[local]** |
| Agentes suportados | Claude Code, Codex, Cursor, OpenCode **[local+doc]** |
| Distribuição extra | App iOS (cloud) e **API pública** + CLI **[doc]** |

### Preço **[doc: conductor.build/pricing]**

| Plano | Preço | O que dá |
|---|---|---|
| **Free** | $0 | Agentes em paralelo, **workspaces locais no seu Mac apenas**, BYO API key/assinatura. Sem cloud, sem multiplayer, sem app mobile |
| **Pro** | **$50/mês** | Tudo do Free + horas de **cloud workspace** incluídas, **multiplayer**, times até 5, acesso à **Conductor API**, app mobile (em breve) |
| **Teams** | **$60/usuário/mês** | Times 5+, portal de admin, billing centralizado, **SSO**. Invite-only |
| **Enterprise** | sob consulta | DPA, billing por PO, **SCIM**, controles custom de segurança, SLA |

Infra do cloud: **Vercel Sandboxes**, região `us-east-1`, **8 vCPU / 16 GB RAM** por workspace **[doc]**.

> ⚠️ **Discrepância na documentação:** o FAQ oficial ainda diz *"How does Conductor make money? Right now we don't.
> We're a small team running on seed funding..."*, enquanto a página `/pricing` já lista Pro a $50/mês e Teams a $60/usuário.
> O FAQ está desatualizado. Fonte: `conductor.build/docs/faq` vs `conductor.build/pricing`.

**Cronologia do preço:** 100% grátis de jul/2025 a jul/2026. Os planos pagos entraram em **30/07/2026 (v0.78.0)**,
junto com o GA do Conductor Cloud. **O uso local continua grátis e sem limite de agentes** — o paywall é
nuvem + colaboração, não a feature core. A FAQ de pricing avisa: *"Do I have to pay an additional fee for cloud
workspaces? **Not right now, but we plan to introduce usage-based pricing for cloud compute in the future.**"*
Não há self-hosting (*"our team is hard at work building a self-hosted cloud offering"*, só via Enterprise).

**O Conductor não vende inferência** — você traz sua assinatura/API key. Isso é a fonte do maior risco atual do produto:

> 🔴 **Risco de custo por mudança de preço da Anthropic (ago/2026).** O Conductor roda o Claude Code **via SDK**,
> não via TUI. Depois da mudança de cobrança da Anthropic, uso via SDK passa a ser cobrado como API após
> ~$200 em créditos. Charlie Holtz (fundador) confirmou: *"If you're on a max subscription you get $200 in credits
> and then can pay at API costs — **If you use Big Terminal Mode you won't be affected**."*
> Reação de usuários: *"if you are a heavy user of Claude code via conductor **you're going to be running up
> $1k/month in additional pricing**"* (@martinald) e *"Sadly this means **the end of using Claude in @conductor_build
> for most users**… We can still use it in the terminal mode but **it's not better than regular Conductor UI**"* (@imdhiva).
> O escape (Big Terminal Mode, que roda o TUI de verdade embutido) **elimina justamente a UI que é o valor do produto** —
> Charlie admite: *"you don't get notifications etc (yet)"*.
> **Lição direta pro Lumem-OS: se o harness for consumido via SDK, o modelo de cobrança do provider é um risco
> existencial de produto. Vale desenhar para suportar os dois modos (SDK e TUI embutido) desde o início.**
> ⚠️ os tweets acima vieram de snippets de busca (texto fiel), não das threads completas.

### Maturidade

Changelog vai de `0.0.16` até `0.80.1` — **9 páginas de changelog**, releases quase diárias. A numeração pulou de
`0.28.x` direto para a casa dos `0.3x–0.8x` num período curto, o que sugere aceleração forte de release
(⚠️ não confirmado: não inspecionei todas as páginas intermediárias do changelog).

Linha do tempo de features relevantes (do changelog) **[doc]**:

| Versão | Feature |
|---|---|
| 0.0.17 | Integração GitHub |
| 0.1.0 | MCPs + filas de mensagem |
| 0.2.0 | Repositórios e agentes locais |
| 0.10.0 | **Code review** |
| 0.11.0 | `conductor.json` (config por repo — hoje legado) |
| 0.14.0 | **Command palette** |
| 0.14.1 / 0.16.0 | Novo diff viewer + file explorer no diff |
| 0.15.0 | **Linear** |
| 0.15.2 | Criar workspace **a partir de PR** |
| 0.17.0 | **Múltiplos chats por workspace** |
| 0.17.4 | **Git status na sidebar** |
| 0.18.0 | **Codex** |
| 0.19.0 | **Checkpoints** |
| 0.21.0 | **Plan mode** |
| 0.25.3 | Workspaces **pinados** |
| 0.25.4 / 0.25.11 | Sincronizar comentários de PR do GitHub, marcar workspace como não lido |
| 0.25.6 | **Múltiplos repos git / fork workspaces** |
| 0.26.0 | Busca de workspaces |
| 0.27.0 | **Aba Notes** |
| 0.28.0 | Página de workspaces, contexto do Claude, planejamento interativo, navegação por teclado |
| 0.28.4 | **Todos** |
| 0.80.0 | **GitHub Stacks**, CLI pré-instalado no cloud, forward de portas, Chrome no sandbox |

---

## 2. Modelo mental / conceitos

A hierarquia real, confirmada pelo schema do SQLite **[local]** e pela CLI **[local]**:

```
Organization (nuvem; local = org implícita)
└── Repository / Project        ← 1 clone git "root"
    └── Workspace               ← 1 git worktree + 1 branch  (nome = cidade)
        ├── Session (chat)      ← N por workspace, cada uma com agente+modelo próprios
        │   └── session_message
        ├── Terminal session    ← N
        ├── Diff comments       ← threads de review inline
        ├── Todos               ← bloqueiam merge
        └── Notes
```

Conceitos-chave:

- **Repository** (na API pública chamada **Project**): um repo git adicionado ao Conductor. Tem `root_path`,
  `default_branch`, `remote`, ícone, scripts e prompts custom. **[local: tabela `repos`]**
- **Workspace**: a unidade de trabalho independente. **1 workspace = 1 worktree = 1 branch = 1 caminho de review/PR.**
  A doc é explícita: *"1 working tree belongs to 1 workspace"* e *"A branch can only be checked out in one workspace at a time"*.
- **Session / chat**: uma conversa com um agente **dentro** de um workspace. Vários chats compartilham o mesmo
  worktree, branch e estado de código. Introduzido em 0.17.0.
- **Nome do workspace = cidade** (`banjul`, `copenhagen`, `istanbul`, `rio-de-janeiro`, `curitiba`…). São **295 cidades** **[doc]**.
- **Nome da branch = descrição semântica do trabalho**, gerada pelo agente. Observado localmente **[local]**:
  `wasm-compile-dynamics-lib`, `mongo-to-postgres-migration-study`, `review-json-contratos-e-protocolo`,
  `engine-power-units-kw-or-w`, `spec-design-task-86aj7kdz1`.
- **A sidebar mostra o título do PR (se houver) ou o nome da branch** — não a cidade. A cidade é o *endereço em disco*,
  a branch é a *identidade do trabalho*. Doc: *"the work item is primary; the city name is the place where that work lives."*
- **Todos**: itens que **bloqueiam o merge** do workspace. Agentes podem criar; usuário pode adicionar. `@todos` no composer
  envia a lista pro agente.
- **Checks**: painel agregador de "prontidão pra merge" — git status, metadata do PR, CI, deployments, comentários do GitHub, todos.
- **Checkpoint**: snapshot automático do worktree antes de cada resposta do agente, guardado em ref git privada.
- **Local vs Cloud workspace**: local = worktree no Mac; cloud = sandbox Linux na "Cloud Computer" da org.

### A decisão de nomenclatura (importante pro Lumem-OS)

O Conductor separa **três identificadores** que a maioria das ferramentas colapsa em um só:

| Identificador | Exemplo | Estabilidade | Para quê |
|---|---|---|---|
| Nome do workspace (cidade) | `curitiba` | **Imutável** | Caminho em disco estável — agentes, shells, editores, IDEs sempre acham os mesmos arquivos |
| Nome da branch | `add-legacy-dynamics-submodules` | Renomeável | Identidade semântica; é o que aparece na UI |
| Título do PR | `feat(orchestrator): inject BATHYMETRY_BASE_DIR…` | Muda | Substitui a branch na sidebar quando existe |

Racional documentado: cidade dá *"a stable directory base, so agents, shells, editors, and other tools can keep finding
the same files on disk"*. Se o nome do diretório mudasse junto com a branch, todo caminho absoluto no contexto do agente,
no editor aberto e no terminal quebraria.

**Colisão:** quando uma cidade é reusada e ainda existe workspace ativo com ela, sufixa `-v2`, `-v3`
(observado localmente **[local]**: `tms-viewer-v1`, `dakar-v1`, `antananarivo-v1`, `perth-v1`, `los-angeles-v1`, `dushanbe-v1`).

Detalhe de UX: `⌘K → Passport` mostra "todas as cidades que você visitou" — gamificação leve **[doc: FAQ]**.

---

## 3. Arquitetura

### 3.1 Stack do app **[local — verificado por `otool`/`strings`/`file`]**

**É Tauri v2, não Electron.**

> 🔎 **Correção de um mito difundido.** A comunidade afirma repetidamente que o Conductor é Electron — ex.: no HN,
> *"I believe both [Conductor e Sculptor] are electron and run like sh\*t"* (MarcelOlsz,
> `news.ycombinator.com/item?id=46748446`). **Isso está errado**, e a inspeção local prova:
> não existe `Contents/Frameworks/` (Electron sempre embarca o Electron Framework lá), o executável é um
> **Mach-O arm64 único de 66 MB** linkado contra `WebKit.framework` do sistema, e o binário contém
> 85 ocorrências de `tauri`, 46 de `tauri-2`, 38 de `wry` e 13 de `tauri_runtime_wry`.
> A empresa nunca confirmou publicamente o stack — daí a especulação. **Fica registrado: Tauri v2 + WKWebView.**
> Isso também significa que as queixas de performance atribuídas a "Electron" têm outra causa
> (provavelmente o volume de dados no SQLite ou o streaming de terminal — ver §10).

```
/Applications/Conductor.app/Contents/
├── Info.plist                 CFBundleShortVersionString 0.80.0
├── MacOS/conductor            Mach-O 64-bit arm64, 66 MB  ← Tauri (Rust)
└── Resources/
    ├── icon.icns
    ├── bin/
    │   ├── conductor          sh shim → .internal/conductor-runtime cli
    │   ├── gh                 53 MB — GitHub CLI embutido
    │   ├── watchexec          7 MB — file watcher (usado no Spotlight testing)
    │   ├── checkpointer.sh    10.7 KB — snapshots via refs git privadas
    │   ├── git-busy-check.sh  1.6 KB — detecta rebase/merge/cherry-pick em curso
    │   ├── spotlighter.sh     3.9 KB — sync workspace → root em loop
    │   └── .internal/
    │       ├── conductor-runtime   77 MB — binário **Bun 1.3.14** compilado
    │       ├── cli / actions / internal / logger / sidecar   (shims sh)
    └── conductor-skill/       plugin Claude Code injetado nos agentes
        ├── .claude-plugin/plugin.json   {"name":"conductor"}
        └── skills/conductor/SKILL.md
```

Evidências do Tauri (contagem de ocorrências em `strings`):
`tauri` ×85, `tauri-2` ×46, `wry` ×38, `TAURI_INTERNALS__` ×36, `tao-` ×22, `tauri_runtime_wry` ×13.
Plugins Tauri detectados: `tauri-plugin-shell`, `tauri-plugin-updater`, `tauri-plugin-http`, `tauri-plugin-store`,
`tauri-plugin-fs`, `tauri-plugin-dialog`, `tauri-plugin-window-state`, `tauri-drag-region`.

Frameworks macOS linkados: `AppKit`, `WebKit` (WKWebView), `UserNotifications`, `Security` (Keychain),
`OSAKit` (AppleScript — provavelmente pra "Open in <app>"), `CoreData`, `CloudKit`, `Carbon`.

Crates Rust relevantes extraídos dos paths do cargo registry **[local]**:

| Crate | Para quê |
|---|---|
| `alacritty_terminal-0.26.0` | **Emulador de terminal embutido** — é por isso que o terminal do app é rápido e completo |
| `sqlx` (×91 refs) | Acesso ao SQLite com migrations versionadas |
| `tokio` (×234 refs) | Runtime async |
| `fsevent-sys`, `notify_debouncer_full` | Watch de arquivos (git status ao vivo, diffs incrementais) |
| `globset`, `glob` | `.worktreeinclude` / `file_include_globs` |
| `blake3` | Hash (provável cache de diffs/arquivos) |
| `arboard` | Clipboard |
| `hyper`/`h2`/`reqwest`, `cookie_store` | HTTP (GitHub API, provider, telemetria) |
| `async-compression`, `brotli`, `flate2` | Assets do frontend comprimidos no binário |

### 3.2 Modelo cliente-servidor — **mesmo local**

Achado importante **[local]**: existe um **servidor HTTP local efêmero**.

```
~/Library/Application Support/com.conductor.app/logs/latest-server.json
{"url":"http://127.0.0.1:60493","pid":40036,"updatedAt":"2026-08-11T18:59:56.751Z"}
```

Ou seja: o shell Tauri sobe um **sidecar Bun** que escuta em `127.0.0.1:<porta aleatória>`, e o WebView fala com ele.
Há atalho dedicado `⌘⇧L → Open sidecar logs`, confirmando que o sidecar é um componente de primeira classe.
Os subcomandos do runtime são `cli`, `sidecar`, `actions`, `internal`, `logger`.

**Isso valida diretamente a arquitetura cliente-servidor do Lumem-OS:** o Conductor chegou nela mesmo sendo um app
"local", porque precisava de um processo de vida longa que sobreviva à UI, gerencie PTYs, agentes e git.

### 3.3 Storage **[local]**

**SQLite:** `~/Library/Application Support/com.conductor.app/conductor.db` — **173 MB** nesta máquina.
**120 migrations** aplicadas via `sqlx`. Tabelas:

```
repos  workspaces  sessions  session_messages  attachments  diff_comments
terminal_sessions  port_forwards  env_vars  settings
symlinks_pending_deletion  migration_rollbacks  _sqlx_migrations
```

Colunas notáveis (schema real):

- **`repos`**: `root_path`, `default_branch`, `remote`, `setup_script`, `run_script`, `run_script_mode`,
  `archive_script`, `file_include_globs`, `spotlight_testing`, `display_order`, `hidden`, `icon`,
  e **6 prompts customizáveis**: `custom_prompt_code_review`, `custom_prompt_create_pr`, `custom_prompt_rename_branch`,
  `custom_prompt_fix_errors`, `custom_prompt_resolve_merge_conflicts`, `custom_prompt_general`.
- **`workspaces`**: `branch`, `directory_name`, `secondary_directory_name`, `workspace_path`, `state`,
  `derived_status` (default `'in-progress'`), `manual_status`, `unread`, `pinned_at`, `notes`,
  `initialization_parent_branch`, `intended_target_branch`, `archive_commit`, `pr_title`, `pr_description`,
  `setup_log_path`, `initialization_log_path`, `initialization_files_copied`, `linked_workspace_ids`,
  `linked_directory_paths`, `big_terminal_mode`, `sandbox_provider`, `hosting_server_url`,
  `user_set_workspace_name`, `user_set_branch_name`, `permission_level`, `creator_user_id`, `creator_client_id`,
  `organization_id`, `assignee_user_id`, `watcher_user_ids`, `workspace_template_id`, `remote_file_sync_enabled`,
  `is_computer_admin`.
- **`sessions`**: `agent_type`, `model`, `permission_mode`, `claude_effort_level`, `codex_thinking_level`,
  `fast_mode`, `agent_personality`, `context_token_count`, `context_used_percent`, `is_compacting`,
  `freshly_compacted`, `unread_count`, `title`, `queue_paused_at`, `resume_session_at`, `claude_session_id`.
- **`session_messages`**: `turn_id`, `queue_order`, `sent_at`, `cancelled_at`, `is_resumable_message`,
  `sdk_message_id`, `sender_id`, `sender_session_id`, `sender_api_key_name`.
  → **Fila de mensagens persistida no banco**: você enfileira várias mensagens enquanto o agente trabalha
  (`sent_at IS NULL AND cancelled_at IS NULL` tem índice parcial dedicado).
- **`diff_comments`**: `file_path`, `line_number`, `end_line_number`, `body`, `state`, `location`,
  `thread_id`, `reply_to_comment_id`, `is_resolved`, `is_outdated`, `author`, `author_avatar_url`, `remote_url`.
  → Modelo de review **completo, com threads e resolução**, espelhando o GitHub. Nesta máquina: 260 comentários,
  `state` ∈ {`pending`:259, `reviewed`:1}, `location` ∈ {`modified`:222, `file`:38}.
- **`port_forwards`**: `remote_port`, `local_port`, `protocol`, `label` — com **UNIQUE em `local_port`**
  e UNIQUE em `(workspace_id, remote_port)`. Alocação de portas é de responsabilidade do servidor.
- **`env_vars`**: `(key, scope, context)` UNIQUE — env vars com escopo (global/repo/workspace) e contexto (local/cloud).
- **`migration_rollbacks`**: `version` + `down_sql`. Guardam o SQL de rollback **no próprio banco** —
  permite downgrade do app sem quebrar o banco. Detalhe de engenharia bem pensado.
- **`symlinks_pending_deletion`**: fila de limpeza de symlinks (setup scripts criam symlinks pra `node_modules` etc.).

**Achado importante [local]:** nesta instalação, `repos`, `workspaces`, `sessions`, `terminal_sessions`,
`port_forwards` e `env_vars` estão com **0 linhas**, mas `session_messages` tem **91.275** e `diff_comments` 260.
Ao mesmo tempo, `settings` tem `roundhouse_client_user_id` e o estado do dispatcher referencia
`lastRepositoryIdByOrg` com um `organization_id`.
→ **Inferência:** o Conductor migrou o estado canônico de repos/workspaces/sessions para o **servidor** (org), mantendo
o SQLite como cache/histórico. `roundhouse` parece ser o codinome do backend.
⚠️ não confirmado: não validei se isso é sincronização bidirecional ou se o app opera "server-first" com cache local.

**Arquivos JSON auxiliares** (fora do SQLite) **[local]** — padrão "local-storage por subsistema com cota":

```
local-storage.metadata.json                       índice: subsystem → sizeLimit, totalSize, entries[]
local-storage.subsystem.terminal.json             (limite 100 MB)
local-storage.subsystem.composer-drafts.json      rascunhos do composer
local-storage.subsystem.claude-context-windows.json
local-storage.subsystem.dispatcher-state.json     último repo, target branch, draft, hostingTarget
local-storage.subsystem.workspace-importance.json flag "important" por workspace
local-storage.subsystem.run-script-history.json
local-storage.subsystem.route-user-state.json     grupos colapsados na sidebar, dirs abertos por workspace
local-storage.entries/
  ├── git-service-pr-v1/<workspace-id>.json               cache do PR
  ├── git-service-workspace-changes-v1/<workspace-id>.json cache do diff  (limite 25 MB)
  ├── terminal-history/<workspace>-<session>.json
  └── lottie-sprite-cache/                                 sprites de animação pré-renderizados
.window-state.json     .bin-source-markers.json
sidecar-v2-session-event-outbox/<id-utf16-b64>.json        outbox de eventos → servidor
draft-attachments/<uuid>/                                  anexos ainda não enviados
agent-binaries/{claude,codex,acp-providers}/ + .meta/claude-2.1.220.json …
app-icons/{vscode,cursor,ghostty,warp,xcode,sublime,rider,datagrip}.png
terminal-shell-integration/zsh/
```

O `sidecar-v2-session-event-outbox` é uma **outbox pattern** para envio confiável de eventos de sessão ao servidor.

### 3.4 Como fala com os agentes **[local + doc]**

- **Binários próprios, versionados:** o Conductor **empacota** o Claude Code e o Codex em
  `~/Library/Application Support/com.conductor.app/agent-binaries/`, com metadados por versão
  (`claude-2.1.220.json`, `claude-2.1.201.json`, `codex-0.146.0.json`, `codex-0.144.1.json`…).
  A doc diz explicitamente: *"Conductor comes bundled with its own installation of Claude Code and Codex,
  so that we can ensure compatibility. Do not update or modify them."*
  Existe fallback pro binário do sistema (`Settings → Storage → Use system Claude Code (from PATH)`).
- **Diretório `acp-providers/`** → suporte a **ACP (Agent Client Protocol)** para OpenCode/Cursor.
  ⚠️ não confirmado: não abri os providers pra confirmar que é o ACP do Zed.
- **Autenticação:** por padrão reusa os tokens já logados na máquina (Claude Pro/Max, API key, assinatura Codex).
  Override via `Settings → Harnesses` + `Settings → Environment`.
- **System prompts injetados:** *"Conductor injects system prompts that explain to the agent that it's running
  inside Conductor, what a workspace is..."*, mais prompts por ação (criar PR, review, renomear branch…),
  todos editáveis em `Settings → [repo] → Preferences`.
- **Skill/plugin injetado:** `Resources/conductor-skill/` é um **plugin Claude Code** completo com um `SKILL.md`
  de ~180 linhas que ensina o agente a operar o próprio Conductor (settings.toml, scripts, files-to-copy,
  troubleshooting). Isso é *self-documentation executável*.
- **Ferramentas expostas ao agente** (encontradas no runtime **[local]**): **`DiffComment`**, **`RunLocalCommand`**, `SendMessage`.
  - `DiffComment` — o agente deixa comentários de review que aparecem no painel Checks do app.
    O SKILL.md instrui: *"Do not post review feedback to GitHub unless the user explicitly asks."*
  - `RunLocalCommand` — **de um workspace cloud (Linux), rodar um comando one-shot no Mac do usuário.** Ponte cloud→local.
- **Env vars entregues a scripts e agentes** **[doc + local]**:
  `CONDUCTOR_WORKSPACE_NAME`, `CONDUCTOR_WORKSPACE_ID`, `CONDUCTOR_WORKSPACE_PATH`, `CONDUCTOR_ROOT_PATH`,
  `CONDUCTOR_DEFAULT_BRANCH`, `CONDUCTOR_PORT`, `CONDUCTOR_IS_LOCAL` (`1` local / `0` cloud).

### 3.5 API pública e CLI **[local — `conductor --help`]**

Host: `https://api.conductor.build`. Tokens gerenciados em `https://app.conductor.build/users/api-keys`,
guardados no **Keychain do macOS**.

```
conductor auth       login | logout | whoami | status
conductor projects   list | get <projectId> | workspaces <projectId>
conductor workspaces create | get | rename | archive | sessions | status
conductor sessions   create | get | rename | archive | messages | status | cancel
conductor messages   create | get
conductor models
conductor sql <query>      SELECT read-only sobre session_transcripts_view
```

`conductor workspaces create` aceita `--project-id --repo-url --branch --name --session-name --agent --model
--effort --env KEY=VALUE --channel`.

**`conductor sql` é a feature mais interessante da CLI.** Expõe uma view somente-leitura de **todos os transcripts
da organização**:

```
session_id, workspace_id, transcript, session_title, agent_type, model,
workspace_name, workspace_state, repo_url, session_created_at, transcript_updated_at
```

*"errors come back with the **Postgres** error message"* → **o backend é Postgres**, e o transcript de cada sessão é
indexado e pesquisável em texto (`transcript ILIKE '%database migration%'`). É essencialmente **memória
organizacional pesquisável dos agentes** — extremamente relevante pro pilar de *self-learning* do Lumem-OS.

Nota de UX embutida no próprio help: *"Use deep links instead of IDs to direct users to work you've started;
deep links are clickable, while IDs are not."*

### 3.6 Telemetria **[local]**

Strings encontradas no binário: `CONDUCTOR_HONEYCOMB_LOGS_ENABLED`, `HONEYCOMB_INGEST_API_KEY_{DEV,STAGING,PROD}`,
`CONDUCTOR_HONEYCOMB_USER_ID`, `CONDUCTOR_HONEYCOMB_LOG_EXPORT_INTERVAL_MS`, com kill-switch
`CONDUCTOR_HONEYCOMB_LOGS_DISABLED` / `CONDUCTOR_EXTERNAL_LOGGING_DISABLED`.
No runtime Bun: `/api/feature_flag/local_evaluation`, `/api/surveys/` → **PostHog** (feature flags + surveys in-app).

---

## 4. Ciclo de vida de um workspace/worktree

### Layout em disco **[local — verificado com `git worktree list`]**

```
~/conductor/
├── repos/<RepoName>/                    ← clone "root", fica na base branch
│   └── .conductor/settings.toml         ← config versionada do repo
│   └── .conductor/settings.local.toml   ← config só desta máquina (gitignored)
├── workspaces/<RepoName>/<cidade>/      ← git worktree
└── archived-contexts/<RepoName>/<cidade>/
    ├── data/
    ├── attachments/
    └── todos.md
```

Exemplo real desta máquina:

```
$ git -C ~/conductor/repos/tms-atlas worktree list
~/conductor/repos/tms-atlas                b4ec5f3 [main]
~/conductor/workspaces/tms-atlas/asuncion  fa42ec9 [wiki-code-discrepancy-report]
~/conductor/workspaces/tms-atlas/baghdad   b4ec5f3 [check-batimetria-task-links]
~/conductor/workspaces/tms-atlas/curitiba  fa42ec9 [add-legacy-dynamics-submodules]
~/conductor/workspaces/tms-atlas/monterrey 7670d65 [model-bridge-bc]
```

Note: **o repo root nunca é usado pelos agentes** — fica sempre na base branch, servindo de object store
compartilhado e de fonte pros arquivos a copiar.

### Passo a passo

**1. Criar** — `⌘N` (ou `⌘⇧N` / botão `...` ao lado de `New workspace`).
Abre uma **página dedicada de criação** (mudança recente, 0.80.0) com workspaces recentes abaixo do composer.
Origens possíveis: **task nova**, **branch existente**, **PR**, **issue do GitHub**, **issue do Linear**.
`⌘I` alterna o "create-from picker"; `Tab`/`⇧Tab` navegam as abas.

**2. Inicializar** —
   a. `git fetch origin` — *"a workspace starts from the latest remote commit even when the local checkout is behind
      (the fetch does not move the branch checked out in the root directory)"*. Detalhe fino e correto.
   b. `git worktree add` em `~/conductor/workspaces/<repo>/<cidade>` com branch nova baseada na base branch configurada.
   c. Aloca a cidade (295 disponíveis), sufixando `-v2`/`-v3` em colisão.
   d. **Files to copy**: copia arquivos gitignored que casam com os padrões (default `.env*`).
      Registrado em `workspaces.initialization_files_copied`.
   e. **Setup script** roda no diretório do workspace, em shell **não-interativo** (`zsh` no Mac, `bash` no cloud).
      Log em `workspaces.setup_log_path`; há um log separado de inicialização (`initialization_log_path`).
      Observado localmente: scripts materializados em
      `~/.conductor/projects/--Users--viniciusrosa--conductor--workspaces--schemr--boston/setup-setup:<uuid>.sh` **[local]**.
   f. Se `scripts.auto_run_after_setup = true`, já dispara o run script.

**3. Agente** — abre um chat, escolhe agente/modelo/effort. Antes de **cada** resposta o Conductor tira um
**checkpoint**. O agente é instruído (via prompt injetado) a **renomear a branch** pra descrever o trabalho.

**4. Testar** — botão **Run** (`⌘R`) com `$CONDUCTOR_PORT`, terminal, ou **Spotlight testing**.

**5. Review** — Diff Viewer (`⌘⇧D`), comentários inline, ação **Review** (`⌘⇧R`) onde um agente revisa o próprio diff
com critérios do repo. `⌥C` mostra changes, `⌥U` uncommitted, `⌥F` todos os arquivos, `⇧⌥C` checks, `⌥N` notes.

**6. Commit / PR** — `⌘⇧Y` commit and push, `⌘⇧P` Create PR (agente escreve a descrição a partir do diff),
`⌘⇧G` abre no GitHub, `⌘⇧X` fix errors, `⌘⇧L` pull latest from main, `⌘⇧M` merge PR.

**7. Checks** — painel agrega git status, metadata do PR, CI, deployments, comentários/threads do GitHub e todos.
**Merge é bloqueado por todos em aberto.**

**8. Arquivar** — `⌘⇧A`. Roda o **archive script** (limpeza de recursos *fora* do diretório do workspace).
Se `git.archive_on_merge = true` (ativo nesta máquina **[local]**), arquiva automaticamente quando o PR mergeia.
Se `git.delete_branch_on_archive`, apaga a branch.
O worktree é removido mas o **contexto é preservado** em `~/conductor/archived-contexts/<repo>/<cidade>/`
(`data/`, `attachments/`, `todos.md`). `workspaces.archive_commit` guarda o commit final.

**9. Restaurar** — painel **History** na sidebar restaura chat e estado. Se o diretório sumiu de fora do app,
a doc admite que pode falhar e recomenda recriar a partir da branch/PR.

---

## 5. Paralelismo de agentes

### Dois eixos de paralelismo **[doc: concepts/parallel-agents]**

| Quando | Use |
|---|---|
| Tarefas que devem virar branches/PRs independentes | **Múltiplos workspaces** |
| Trabalho que compartilha branch, estado de código e contexto (ex.: um implementa, outro revisa, outro conserta testes) | **Múltiplos chats no mesmo workspace** |

**Não existe limite documentado nem técnico de agentes simultâneos.** Nesta máquina há histórico de **~85 workspaces**
e até **7 worktrees vivas simultâneas** num único repo (`tms-atlas`) **[local]**.
⚠️ não confirmado: se existe throttle interno de agentes concorrentes.

Números reais relatados pela comunidade:
- `goobert` (fev/2026): *"**I use conductor with git worktrees and will literally have 10 or 20 running at a time
  getting pinged as they finish stuff for me to review** (…) the bottleneck has literally become the company doesn't
  have enough stuff to give me. **It only really works however because I have a lot of context and understanding of
  the codebase.**"* — https://news.ycombinator.com/item?id=46925489
- `dominicholmes`: padrão de "1 tarefa difícil + 4–8 tarefas simples" em paralelo.
- Reviews práticos sugerem **3–5** como número confortável.

> **O limite real é dinheiro e capacidade humana de revisão, não o software.** Guarde isso ao dimensionar o Lumem-OS:
> otimizar para 50 agentes é otimizar o recurso errado.

A doc reconhece o trade-off de múltiplos chats num mesmo workspace: *"**The tradeoff is that agents in the same
workspace can edit the same files.**"* — não há locking, é responsabilidade do usuário.

### Como o usuário acompanha

- **Sidebar** agrupada por repositório (com ícone do repo detectado do próprio código — `public/favicon.svg`,
  `apple-touch-icon.png`, etc.), grupos colapsáveis, seções **Pinned** / **My workspaces** / **Following**.
- **Git status na sidebar** (0.17.4) + **diffs coloridos na sidebar** (`colored_sidebar_diffs = true` **[local]**):
  o usuário vê +/- por workspace sem abrir nada.
- **`sidebar_resource_usage = true`** **[local]** — uso de recursos por workspace na sidebar.
- **Estados animados (Lottie)** — sprites cacheados **[local]**:
  `setting-up-loader`, `working-loader`, `running`, `waiting`, `typing`, `typing-detailed`, `conductor-loader`.
  Ou seja, o estado do agente é comunicado por **animação distinta por estado**, não por texto.
- **`unread` por workspace** e **`unread_count` por sessão** (migrations 3 e 17) — o modelo é de *inbox*.
- **`pinned_at`** (migration 50) e **workspace-importance** (flag `important` fora do banco).
- **`derived_status`** (default `in-progress`) vs **`manual_status`** — status inferido **e** status que o usuário
  força manualmente. Dois campos separados é uma decisão de design deliberada.
- **Contexto visível**: `sessions.context_token_count`, `context_used_percent`, `is_compacting`, `freshly_compacted`
  → o app mostra quanto do context window já foi usado e quando houve compactação.
- **Custo**: 0.80.0 — *"the workspace details popover now shows repository, status, and resources as rows and
  **rounds agent costs to cents**"*.

### Navegação entre agentes (o ponto alto)

| Atalho | Ação |
|---|---|
| **`⌥L` / `⌥H`** | **Próximo / anterior chat que precisa de atenção** |
| `⌘⌥↑` / `⌘⌥↓` | Workspace anterior / próximo |
| `⌘1`–`⌘9` | Ir direto pro workspace N |
| `⌃1`–`⌃9` | Trocar de **organização** |
| `⌘⇧[` / `⌘⇧]` (ou `⌃⇧Tab` / `⌃Tab`) | Aba anterior / próxima |
| `⌘[` / `⌘]` | Navegar back / forward (histórico tipo browser) |
| `⌘T` / `⌘W` / `⌘⇧T` | Nova aba / fechar / reabrir fechada |
| `⌘K` | Command palette |
| `⌘.` | Zen mode |
| `⌘P` | Quick open file |

**`⌥L` = "next chat needing attention" é a primitiva central do paralelismo.** Com 8 agentes rodando, o usuário não
escaneia a lista: aperta `⌥L` repetidamente e o app o leva a cada ponto de bloqueio. Isso transforma supervisão de
N agentes numa **fila de trabalho** em vez de um painel de monitoramento.

### Notificações

- Framework `UserNotifications` linkado + `NSUserNotificationCenterDelegate` **[local]**.
- Setting `sound_type` — migration 99: *"merge completion sound enabled setting into sound_type"*, ou seja,
  havia som separado de "completou" e foi unificado num seletor de tipo de som.
- Fila de mensagens: `queue_paused_at` em `sessions` — dá pra pausar a fila.
- ⚠️ não confirmado: não achei doc detalhando os gatilhos exatos de notificação (agente terminou / precisa de
  aprovação / check falhou) nem se são configuráveis por workspace.

### Aprovação de ferramentas

`tool_approvals_enabled` (user setting), `sessions.permission_mode`, e nesta máquina
`experimental_auto_permission_mode = true` **[local]**.
Atalhos: `↵` aprova tool request, `⌫` nega, `⌘↵` ação alternativa de aprovação, `⌘⇧⌫` cancela o agente,
`⇧Tab` alterna plan mode, `⌘⇧↵` aprova plano.

---

## 6. Isolamento de ambiente

### O que é isolado

| Recurso | Mecanismo |
|---|---|
| Código | **git worktree** — checkout próprio, mesmo object store/refs/remotes |
| Branch | 1 por workspace, exclusiva (limitação do git) |
| Dependências | **setup script** por workspace (`pnpm install`, etc.) |
| Arquivos gitignored (`.env`, certs) | **Files to copy** |
| Portas | **10 portas** por workspace: `CONDUCTOR_PORT` … `CONDUCTOR_PORT+9` (**local apenas**) |
| Env vars | tabela `env_vars` com `(key, scope, context)`; `environment_variables.local` / `.cloud` no settings do repo |
| Terminal | `terminal_sessions` com `cwd`, `cols`, `rows`, `rehydrate_sequences`, `alternate_screen`, `bracketed_paste` |
| Processos | ao parar um run script: **`SIGHUP` → espera 200 ms → `SIGKILL`** |

### O que **não** é isolado

**Não há sandbox.** FAQ oficial, textual:

> *"Agents in Conductor run with the same permissions as your user account. They can read and write files, run shell
> commands, and access anything you can access on your machine. **Agents run directly on your system without sandboxing.**
> Most users don't experience any problems with this. If you want to be extra safe, you can run Conductor on a separate
> machine or VM dedicated to development work."*

Banco de dados, cache, Docker, serviços externos são **compartilhados** entre workspaces — daí existir `run_mode`.

### Files to copy — ordem de resolução **[doc]**

1. `<repo>/.worktreeinclude` (sintaxe .gitignore: `#`, `!`, `*`, `?`, `/`, `**/`, `/**`)
2. `file_include_globs` no settings do repo
3. Default: `.env*`

Só copia arquivo que é **gitignored E** casa com o padrão. Arquivos rastreados já vêm pelo worktree.
Doc alerta explicitamente contra incluir `node_modules`, `.next`, `dist`, `target`:
*"can make workspace creation slower and can carry stale state"* → use setup script.

> **Decisão de design:** o Conductor **não** compartilha nem faz hardlink de `node_modules`. Ele **reinstala por workspace**.
> Trocou tempo/disco por correção. Existe `symlinks_pending_deletion` no schema, indicando que **setup scripts** de
> usuários criam symlinks e o app faz o GC deles no archive **[local]**.

### Scripts **[doc + schema]**

```toml
"$schema" = "https://conductor.build/schemas/settings.repo.schema.json"

[scripts]
setup = "pnpm install"
archive = "docker compose down"
run_mode = "concurrent"          # ou "nonconcurrent"
auto_run_after_setup = true

[scripts.run.dev]
command = "pnpm dev --port $CONDUCTOR_PORT"
args = []
options.cwd = "."
default = true
icon = "play"                    # nome Lucide kebab-case; inválido cai pra "play"
hide = false
available_in = ["local"]         # "local" | "cloud" | ambos

[scripts.run.test]
command = "pnpm test:watch"
icon = "test-tube"
```

- `concurrent` — vários workspaces rodam ao mesmo tempo (portas separadas, sem DB/Docker compartilhado).
- `nonconcurrent` — iniciar um run script **para** o run script de qualquer outro workspace.
- Shell **não-interativo** — a doc avisa repetidamente pra não depender de `.zshrc` interativo.
- *"When one run script starts multiple processes, keep them in the same process group (e.g. `concurrently`)
  instead of backgrounding with `&`."*

### Spotlight testing — a saída de emergência **[local: `spotlighter.sh` + `checkpointer.sh`]**

Para projetos que **não conseguem** rodar de um worktree (paths absolutos hardcoded, toolchains que exigem a raiz,
Docker bind mounts fixos). O mecanismo real, lido do script:

```
watchexec --watch . --project-origin . --emit-events-to=environment
          --ignore '*.tmp.*' --ignore '.context/**'
  → a cada mudança no worktree:
      checkpointer save --id cp-spotlight-<epoch>-<pid> --force     (no workspace)
      cd $CONDUCTOR_ROOT_PATH && checkpointer restore <id>          (no repo root)
```

Ou seja: **espelha continuamente o workspace no repo root** via checkpoints git, e abre um terminal na root.
Só **um** workspace pode estar "sob o holofote" por vez — daí o nome. Log em `/tmp/conductor-spotlight-$$.log`.
Se houver merge/rebase em curso (`exit 101`), pula o sync silenciosamente em vez de quebrar.

### Checkpointer **[local: `checkpointer.sh`, 10.7 KB de bash]**

Vale ler o arquivo inteiro — é a peça de engenharia mais caprichada do bundle.

- Refs privadas: **`refs/conductor-checkpoints/<id>`** — fora de `refs/heads`, não polui branches nem é enviado ao remote.
- Captura **HEAD + index + working tree + arquivos untracked**, **sem mover o HEAD e sem tocar nos arquivos**
  (usa um índice temporário em `$GIT_DIR/conductor-checkpoint-tmp/`).
- Guarda metadados no próprio commit object (lidos via `git cat-file commit` + `sed`).
- Códigos de saída semânticos: `101` merge/rebase em curso, `102` índice com conflitos não resolvidos,
  `103` **recusa operar** se o root resolvido é ancestral do cwd (proteção contra um `$HOME` versionado —
  senão `restore` faria `reset --hard` + `clean -fd` na sua home).
- Trata `SIGTERM`/`SIGINT` com `trap 'exit 143'` para que o trap de EXIT limpe o índice temporário
  (*"Conductor sends SIGTERM when a save times out"*).
- GC de índices temporários órfãos: só remove se `mtime > 60 min` **e** o `owner-pid` estiver morto.
- `git-busy-check.sh` detecta rebase (`rebase-merge`/`rebase-apply`), merge (`MERGE_HEAD`),
  squash-merge conflitado (`SQUASH_MSG` + `git ls-files -u` não vazio), cherry-pick, revert.

Na UI: hover na sua mensagem → ícone de reverter. **Destrutivo** — apaga mensagens e mudanças daquele turno em diante.
Doc avisa: cuidado com checkpoints quando há **vários chats no mesmo workspace**.

### Multi-diretório / monorepo **[doc]**

- **`/add-dir`** no chat vincula outros workspaces (de outros repos) ao atual → o agente lê/edita cross-repo.
  Persistido em `workspaces.linked_workspace_ids` / `linked_directory_paths` **[local]**.
- Microserviços simultâneos: um run script por repo. Doc admite: *"Conductor only supports automating testing
  one service at a time."*

---

## 7. Integração com git e git hosts

### Branches **[schema + local]**

```toml
[git]
archive_on_merge = true                      # arquiva quando o PR mergeia
branch_prefix_type = "github_username"       # como gerar o prefixo
branch_prefix = "..."                        # prefixo custom
delete_branch_on_archive = false
worktree_push_auto_setup_remote = true       # configura upstream no primeiro push
```

Fluxo de nomeação: branch temporária gerada na criação → **o agente renomeia** na primeira mensagem, via o prompt
`custom_prompt_rename_branch` (`prompts.rename_branch`). Resultado observado **[local]**: nomes semânticos
tipo `mongo-to-postgres-migration-study`, `feat/bridge-bc`, `issue-84`, `spec-design-task-86aj7kdz1`.
Note que padrões do usuário (`feat/`, `issue-N`) são preservados — o agente aprende a convenção do repo.

### Diff **[local: `git-service-workspace-changes-v1`]**

Modelo real do cache de diff:

```json
{ "workspaceId", "refreshedAt", "depth",
  "identity": { "workspacePath","hostKey","localBranch","diffTargetBranch",
                "diffTargetBranchIsLocal","targetBranch","remote","gitForge" },
  "mergeBase": "<sha>",
  "full":        { "files":[{path,status,linesAdded,linesRemoved,isBinary,lastModifiedTime,fileSize}],
                   "isUntrackedFilesTruncated": false },
  "uncommitted": { "files":[…], "isUntrackedFilesTruncated": false },
  "upstreamSyncStatus": { "branchExists", "ahead", "behind" },
  "targetSyncStatus": 0,
  "branchCommits": [ {hash,message,author,email,date} ] }
```

Pontos de design:
- **Três visões separadas** do diff: `full` (vs merge-base), `uncommitted`, e "all files" — com atalhos dedicados
  (`⌥C`, `⌥U`, `⌥F`). Reconhece que "o que mudou nesta branch" ≠ "o que ainda não commitei".
- **`mergeBase` explícito** — o diff é contra a merge-base, não contra o HEAD do target. Evita ruído de commits do target.
- **`targetBranch` mutável** (`workspaces.intended_target_branch`, changelog 0.28.7 "change target branch").
- **`ahead`/`behind`** vs upstream calculados e cacheados.
- **`isUntrackedFilesTruncated`** — degradação graciosa quando há arquivos untracked demais.
- **`gitForge`** — abstração de forge no modelo de dados.

### PRs **[local: `git-service-pr-v1`]**

Modelo real cacheado por workspace (exemplo verdadeiro desta máquina):

```json
{ "prInfo": {
    "prNumber": 104, "prUrl": "...", "baseRefName": "dev", "headRefName": "spec-design-task-86aj7kdz1",
    "headRefOid": "12458fb…", "isDraft": false, "isMerged": false, "isAutoMergeEnabled": false,
    "prTitle": "...", "prBody": "...", "prAuthorLogin": "vinihcrosa", "prAuthorAvatarUrl": "...",
    "mergeStateStatus": "DIRTY", "checksStatus": "passing", "numPendingChecks": 0, "numChecks": 2,
    "failingStatusCheckRollups": [],
    "statusCheckRollups": [ {conclusion, status, name, workflowName, detailsUrl, startedAt, completedAt} ],
    "reviewDecision": "REVIEW_REQUIRED", "numReviewRequests": 0, "viewerCanMerge": true },
  "repositoryId": "...", "localBranch": "spec-design-task-86aj7kdz1" }
```

É praticamente o schema GraphQL do GitHub espelhado localmente — inclusive `mergeStateStatus`, `reviewDecision`
e `viewerCanMerge`, que permitem decidir na UI se o botão Merge fica habilitado **sem round-trip**.

### Git hosts

- **GitHub**: cidadão de primeira classe. **`gh` CLI de 53 MB embutido** no bundle **[local]**.
  Auth via **GitHub App** próprio (`gh_cloud_token_app_client_id = Iv23liSjymghFQFM8MNK`,
  `gh_cloud_auth_method = conductor-app` **[local]**), com fallback pro `gh auth login` do usuário.
  Changelog 0.0.21: "fine-grained GitHub permissions". Respeita `GH_HOST` → **GitHub Enterprise**.
- **GitHub Stacks** (0.80.0): suporte a PR stacks; local exige `gh extension install github/gh-stack`,
  cloud já vem com a extensão. UI mostra o PR atual, permite trocar entre PRs da stack e informa se a stack está mergeável.
- **Linear**: integração nativa. Deep link `conductor://linear_id=<id>&prompt=<...>` resolve o repo e abre/cria workspace.
- **GitLab**: ⚠️ **não confirmado / provavelmente não suportado de verdade.** Achei `gitlab.svg` e `gitlab-open.svg`
  nos assets do frontend **[local]** e um campo `gitForge` no modelo de diff, mas **nenhuma menção a GitLab em toda a
  documentação**, e a autenticação/PR/checks são todos via `gh`/GitHub App. As strings `GitlabEnterpriseInstance*`
  no runtime Bun provavelmente vêm de uma dependência (detecção de CI). **Trate como: reconhece o forge para links,
  mas não faz MRs.**
- **Graphite**: existe setting `graphite_disabled` **[local]** → houve/há integração com Graphite.

### Review **[doc + schema local]**

- **Diff Viewer** `⌘⇧D`: unified diff, filtro por commit (revisar um commit por vez), file explorer,
  navegação por arquivo, `⌘F` find in file, `hide_whitespace_changes` (setting).
- **Comentários inline** viram **anexos no composer** — a doc justifica: *"more precise context than it would
  from a general chat message"*. Modelo com `thread_id`, `reply_to_comment_id`, `is_resolved`, `is_outdated`,
  `end_line_number` (comentário multi-linha), `location` ∈ {`file`, `modified`}.
- **Comentários de review do GitHub são sincronizados pra dentro do app** (0.25.4 / 0.25.11) e podem ser resolvidos ali.
- **Ação Review** (`⌘⇧R`): um agente revisa o próprio diff com critérios do repo. Modelo e effort **separados**
  dos de codificação: `models.review`, `models.claude_code.review_effort_level`, `models.codex.review_thinking_level`.
  Nesta máquina **[local]**: `default = "claude:opus-5-1m"`, `review = "opus-4-8-1m"` — modelo diferente pra revisar.
- **Ferramenta `DiffComment`** para o agente comentar dentro do app (não no GitHub).

---

## 8. UX / decisões de interface  ⭐ SEÇÃO PRIORITÁRIA

Estas são as decisões que valem estudar. Cada uma com o **problema que resolve**.

### 8.1 Separar identidade semântica de identidade física
Cidade (diretório, imutável) ≠ branch (semântica, renomeável) ≠ título do PR (o que aparece na UI).
**Problema resolvido:** renomear o trabalho não invalida caminhos absolutos no contexto do agente, no editor aberto,
no terminal, nos scripts. Ao mesmo tempo, o usuário nunca precisa lembrar que "curitiba" era o refactor de auth —
a UI mostra a branch/PR.

### 8.2 `⌥L` — "próximo chat que precisa de atenção"
A primitiva mais importante do app. Com N agentes, supervisão vira **fila**, não **dashboard**.
O usuário não escaneia: ele aperta `⌥L` até acabar o trabalho. `⌥H` volta.
**Isto é o que faz paralelismo escalar de 3 pra 10 agentes.**

### 8.3 Estado do agente por animação, não por texto
Sprites Lottie distintos e cacheados por estado: `setting-up`, `working`, `running`, `waiting`, `typing`.
**Problema resolvido:** numa sidebar com 15 workspaces, texto de status é ilegível; movimento periférico é
processado sem foco. "Parou de mexer" = "precisa de mim".

### 8.4 Modelo de inbox: `unread` por workspace + `unread_count` por sessão
Agentes assíncronos produzem output enquanto você olha outra coisa. Tratar isso como e-mail (não lido / lido)
é o modelo mental certo. Complementado por **pin** e por um flag separado de **"important"**.

### 8.5 `derived_status` **e** `manual_status` como campos separados
O app infere o status (rodando, esperando, precisa review) mas **o usuário pode sobrescrever** sem que a próxima
inferência apague a sobrescrita. Dois campos, não um. Detalhe pequeno, evita a briga clássica
"a UI insiste em mudar meu status".

### 8.6 Fila de mensagens persistida
`session_messages` com `sent_at NULL` = enfileirada, `queue_order`, `cancelled_at`, e `queue_paused_at` na sessão.
**Problema resolvido:** você pensa mais rápido que o agente responde. Em vez de esperar, você despeja 4 instruções
e elas são consumidas em ordem. Dá pra cancelar item específico e pausar a fila.

### 8.7 Comentário no diff → anexo no composer
Em vez de "chat sobre o código", o comentário inline **carrega o anchor (arquivo + linha)** pro prompt.
A doc explicita o porquê: contexto mais preciso que uma mensagem genérica.
Threads, replies e resolução espelham o GitHub — o usuário não aprende um modelo novo.

### 8.8 Três visões de diff com atalhos dedicados
`⌥C` changes (vs merge-base) · `⌥U` uncommitted · `⌥F` all files · `⇧⌥C` checks · `⌥N` notes.
Reconhece que "o que essa branch faz" e "o que ainda não commitei" são perguntas diferentes, feitas em momentos
diferentes, e ambas merecem uma tecla.

### 8.9 Checks como agregador único de "prontidão pra merge"
Um painel: git status + PR + CI + deployments + comentários + todos. **Todos em aberto bloqueiam o merge.**
**Problema resolvido:** com agente escrevendo código, o gargalo humano é decidir "isso está pronto?".
Centralizar todos os sinais numa tela — em vez de alternar entre app, GitHub e terminal — é o que torna
review de N branches viável.

### 8.10 O agente escreve o PR, o humano aprova
`⌘⇧P` → o agente redige título e corpo a partir do diff, com prompt customizável por repo
(`custom_prompt_create_pr`). O PR real desta máquina tem seções `## What / ## How / ## Tests / ## Manual AC / ## Notes`
e link pra task do ClickUp — porque o repo customizou o prompt. **Prompts por ação, versionados por repo,
são um ponto de alavancagem enorme.**

### 8.11 Seis prompts customizáveis por repositório
`code_review`, `create_pr`, `rename_branch`, `fix_errors`, `resolve_merge_conflicts`, `general`.
Cada botão da UI é um prompt editável e versionável. O app é um **shell de prompts**, não um conjunto de features fixas.

### 8.12 Modelo/effort diferentes para revisar e para codificar
`models.default` vs `models.review`; `default_effort_level` vs `review_effort_level`.
Reconhece que revisar exige mais raciocínio (e custa menos tokens) que gerar.

### 8.13 Checkpoints invisíveis + revert por hover
Snapshot antes de cada turno, sem o usuário pedir, sem sujar o histórico git (refs privadas).
Reverter = hover na mensagem, clicar. **Undo sem precisar saber git.**

### 8.14 Deep links `conductor://` como cola do sistema
```
conductor://prompt=<encoded>
conductor://prompt=<encoded>&path=<repo path absoluto, url-encoded>
conductor://linear_id=<issue ID>&prompt=<optional>
conductor://async?repo=<name>&plan=<base64 markdown>
```
Qualquer coisa (script, issue tracker, outro agente) consegue abrir um workspace pronto.
O help da CLI ensina o agente: *"Use deep links instead of IDs… deep links are clickable, while IDs are not."*
`⌘⇧C` copia o link do workspace.

### 8.15 O app se auto-documenta pro agente
`Resources/conductor-skill/` é um plugin Claude Code com um `SKILL.md` que ensina o agente a configurar e depurar
o próprio Conductor — incluindo *"facts that are easy to get wrong"* e uma seção de troubleshooting.
O agente vira suporte técnico do app. Padrão excelente e barato.

### 8.16 Onboarding com "Starter project"
Repo de exemplo local com 3 workspaces pré-criados (`banjul` → branch `1-start-here`,
`copenhagen` → `2-your-first-parallel-agent`, `kelowna` → `3-next-steps`) **[local]**.
Ensina paralelismo **mostrando** três workspaces vivos, não com um tour de tooltips.
Setting `sample_project_onboarding_seed_status = completed`.

### 8.17 Ícone do repositório extraído do próprio repositório
Procura em ordem: `public/apple-touch-icon.png`, `apple-touch-icon.png`, `public/favicon.svg`, … `src-tauri/icons/icon.png`.
Zero configuração, e a sidebar fica visualmente distinguível. Detalhe barato de altíssimo retorno.

### 8.18 "Open in" com MRU e ícones reais dos apps
`app-icons/` traz `vscode.png`, `cursor.png`, `ghostty.png`, `warp.png`, `xcode.png`, `sublime.png`, `rider.png`,
`datagrip.png` **[local]**. `open_in_mru_order = ["vscode","terminal"]` **[local]** — a lista se reordena por uso.
`⌘O` abre no app padrão, `⌘⇧O` abre o menu.

### 8.19 Terminal de verdade, embutido
`alacritty_terminal` como crate. `terminal_sessions` guarda `rehydrate_sequences`, `alternate_screen`,
`bracketed_paste` → o terminal é **reidratado** ao reabrir o workspace, com vim/tmux funcionando.
`big_terminal_mode` por workspace. `⌘J` toggle. Integração de shell zsh instalada em `terminal-shell-integration/zsh/`.

### 8.20 Portas automáticas
`CONDUCTOR_PORT` … `+9`. Dez portas, não uma — porque apps reais sobem web + API + HMR + DB.
Elimina a fricção nº1 de rodar N cópias do mesmo app.

### 8.21 Toques finais
- **Passport** (`⌘K → Passport`): todas as cidades que você "visitou". Gamificação leve, custo zero.
- **Conductor Wrapped** (changelog 0.25.1): retrospectiva anual de uso.
- **Legendary cities** (0.28.2): experimento de nomes.
- **"Choose the computer color"** no onboarding do cloud: *"This is just for fun :)"*.
- **Garry mode** (`⌃O`): expande tool calls. Nome interno virou feature nomeada.
- `markdown_style = "tufte"`, `code_theme`, fontes de terminal e mono configuráveis **[local]**.
- `⌘⌥T` alterna tema, `⌘.` zen mode, `⌘+`/`⌘-`/`⌘0` zoom.
- `⌘⌥F` mandar feedback direto do app; `⌘/` cheatsheet de atalhos contextual à lista em foco.

---

## 9. Pontos fortes (com o porquê)

1. **Worktree como unidade de trabalho, levada até o fim.** Não é "worktrees + um chat"; é worktree + branch +
   setup + portas + terminal + diff + checks + PR + arquivamento. **Por quê importa:** o valor não está em criar
   o worktree (`git worktree add` é uma linha), está em tudo que quebra depois — deps, `.env`, portas, review, cleanup.

2. **A cidade imutável.** Resolve o problema real de que o contexto do agente e o estado do editor contêm caminhos
   absolutos. Renomear a identidade sem mover bytes é a decisão certa.

3. **`⌥L` / fila de atenção.** Converte "monitorar N agentes" (não escala) em "processar uma fila" (escala).

4. **Checkpoints com refs privadas.** `refs/conductor-checkpoints/*` dá undo total sem poluir `refs/heads`, sem
   mexer no HEAD do usuário e sem risco de push acidental. O script trata conflitos, rebase em curso, timeouts,
   PIDs órfãos e até `$HOME` versionado. Nível de cuidado raro.

5. **Binários de agente embutidos e versionados.** Elimina a classe inteira de bugs "funciona na minha máquina" /
   "atualizei o Claude Code e quebrou". Com fallback explícito pro binário do sistema quando o usuário precisa
   do PATH dele.

6. **Prompts por ação, customizáveis e versionados no repo.** Cada botão é um prompt. O time inteiro herda o
   estilo de PR e os critérios de review via git.

7. **Checks como gate único de merge, com todos bloqueantes.** Quando o código é barato, o gargalo é o julgamento
   humano. Centralizar os sinais é o que destrava o throughput.

8. **`conductor sql` sobre transcripts da org.** Busca em texto sobre tudo que todos os agentes já fizeram.
   É memória organizacional que emerge de graça do produto — e é exatamente o insumo de *self-learning*.

9. **Escape hatch honesto (Spotlight testing).** Em vez de fingir que todo projeto roda de um worktree, oferece
   um modo que sincroniza de volta pra raiz. Reconhecer o caso difícil em vez de ignorá-lo.

10. **Sidecar separado da UI.** Servidor local com porta própria, logs próprios e atalho próprio. Estado sobrevive
    à janela; a arquitetura já estava pronta pra virar cloud/multiplayer — e virou.

11. **Degradação graciosa em toda parte.** `isUntrackedFilesTruncated`, exit code 101 no checkpointer,
    fallback de ícone Lucide inválido pra `play`, chats de workspace dormindo carregam sem acordar o sandbox.

---

## 10. Pontos fracos

### Confirmados pela própria documentação

1. **Sem sandbox nenhum.** *"Agents run directly on your system without sandboxing… they can access anything you
   can access on your machine."* A mitigação sugerida é *"run Conductor on a separate machine or VM"* — ou seja,
   o problema é reconhecido e não resolvido. Isolamento de código ≠ isolamento de execução.
   Fonte: `conductor.build/docs/faq`.

2. **Mac-only, Apple Silicon.** Binário arm64 puro **[local]**. Sem Linux, sem Windows, sem Intel.
   Descarta a maior parte dos times.

3. **Cmd+Z não funciona no composer.** Known issue oficial: *"The library we use to do @-mentions breaks the undo
   history. We're looking into other solutions."* Fonte: `docs/troubleshooting/issues`.

4. **Lixo visual ao trocar de terminal.** Known issue oficial: *"We're streaming output from your shell along to
   the UI, and at some point along the way, the stream is probably getting corrupted. We're still working to track
   down this bug."* Mesma fonte.

5. **Um serviço testável por vez.** *"Conductor only supports automating testing one service at a time."*
   Arquitetura de microserviços exige gambiarra (um run script por repo + `/add-dir`).
   Fonte: `docs/concepts/testing`.

6. **Spotlight testing é exclusivo e frágil.** Só um workspace por vez pode espelhar na raiz — ou seja, o
   escape hatch **mata o paralelismo** justamente nos projetos que mais precisam dele. Depende de um loop
   watchexec + checkpoint save/restore que silenciosamente desiste durante merge/rebase **[local: `spotlighter.sh`]**.

7. **Branch travada em um worktree.** Limitação do git, mas o app a herda: colaborar em uma branch já em uso exige
   arquivar o outro workspace ou criar branch nova. Documentado em `A branch is already checked out`.

8. **Workspace perdido se você mexer no diretório por fora.** *"If a workspace directory was moved or deleted
   outside Conductor, Conductor may not be able to open it… If restore fails, create a new workspace."*
   Estado do app e estado do disco podem divergir sem reconciliação.

9. **Migração legada com pegadinha.** Repos antigos têm worktrees aninhadas em `<repo>/.conductor/`, que confundem
   build tools. A "solução" oficial é remover e re-adicionar o repo — **"This deletes all workspaces and chats for
   that repository."** Perda de dados como passo de troubleshooting.

10. **Checkpoints × múltiplos chats.** A doc avisa pra ter cuidado com checkpoints quando há vários chats no mesmo
    workspace — os snapshots são do worktree, não da sessão, então reverter num chat descarta o trabalho do outro.
    Buraco conceitual no modelo "N chats, 1 worktree".

11. **Reverter é destrutivo e irreversível.** *"permanently delete all user and AI messages from the selected turn
    and later"*. Não há lixeira.

12. **Sem GitLab.** Toda a integração é GitHub (`gh` embutido, GitHub App, GraphQL espelhado, `gh stack`).
    Linear para issues. **Zero menção a GitLab na documentação** — só ícones soltos no frontend **[local]**.
    Para o Lumem-OS, que quer GitLab, não há nada aqui para copiar.

13. **Cloud tem tetos duros.** Sandbox dorme após **4 h** sem atividade e **morre em 23 h 50 min** mesmo ativo —
    *"which can interrupt running processes and agent turns"*. Sync de arquivos cloud→Mac é **unidirecional**
    e *"local changes don't sync back and may be overwritten"*. `CONDUCTOR_PORT` não existe no cloud, então run
    scripts precisam de `available_in = ["local"]`. Fonte: `docs/cloud/working-with-cloud-workspaces`.

14. **Custo de disco e I/O.** Sem compartilhamento de `node_modules`: N workspaces = N `node_modules`.
    Nesta máquina: `conductor.db` **173 MB**, `agent-binaries/` **664 MB**, `bin/` **131 MB**, app **195 MB** **[local]**.

15. **Documentação irregular.** `/docs/reference/spotlight-testing` retorna **404** (o link correto é
    `/docs/reference/scripts/spotlight-testing`) **[verificado]**. O FAQ diz que o produto não cobra, enquanto a
    página de preços cobra $50/mês. A página de keyboard shortcuts não renderiza a tabela sem JS.

16. **Telemetria por padrão.** Honeycomb + PostHog (feature flags e surveys) com opt-out por variável de ambiente,
    não por UI óbvia **[local]**. `enterprise_data_privacy` existe mas **desliga features** (títulos de chat gerados
    por IA, MCP servers custom) em vez de só cortar telemetria.

17. **Lock-in de dados.** Migrar de máquina é *"use Apple's Migration Assistant"* ou copiar manualmente
    `~/Library/Application Support/com.conductor.app` + `~/conductor` + `~/.claude` + `~/.codex`
    **com os apps fechados e nos mesmos paths exatos**. Não há export.

18. **Fila de mensagens sem garantia de contexto.** Você enfileira 4 mensagens, mas o agente pode mudar o estado
    do repo entre elas. ⚠️ não confirmado: não achei doc sobre invalidação de mensagens enfileiradas quando o
    contexto muda.

### Reclamações reais de usuários (com fonte)

> ⚠️ **Lacuna metodológica:** o **Reddit não pôde ser acessado** (bloqueio de crawler, API 403, proxies bloqueados),
> apesar de o Conductor ter subreddit oficial. As citações abaixo vêm de **Hacker News** (thread completa do Show HN
> + ~90 comentários de 2025-2026), blogs técnicos, Product Hunt e docs oficiais. Threads do X só via snippets de busca.

#### R1. Worktree vazio: `.env`, `node_modules`, dependências — **a reclamação nº 1, recorrente desde o lançamento**

`_1tem`, a crítica técnica mais substantiva do Show HN:
> *"I was really excited to try this but **this does NOT work the way I expected**. I wanted a simple git worktree
> manager for my existing, already-checked-out repository. Instead, it requests Github permissions and clones the repo
> from Github. **This is bad, because you need to run all the dependency installs, etc. for every workspace before being
> able to test anything.** (…) my project has way too many dependencies (…) plus there would be **DNS conflicts,
> external API conflicts**, among other issues."*
> — https://news.ycombinator.com/item?id=44628011

`pjm331`, o problema estrutural:
> *"the thing that tripped me up with git worktrees, which is maybe obvious in retrospect, is that **they don't include
> things that are not tracked by git — e.g. .env.development.local**. So starting a new worktree requires additional
> setup and isn't as simple as just checking out a new branch"* — https://news.ycombinator.com/item?id=44628546

Resposta do co-fundador `jacksondc` na época: *"If you want to copy node_modules instead of reinstalling, you can click
on the repo and add a setup script that does the copy. **Sorry it's a bit obscure**"*
— https://news.ycombinator.com/item?id=44629527

✅ **Em grande parte resolvido** hoje (Files to copy + setup script). **Mas a crítica de fundo persiste** — artigo de
fev/2026: *"Claude Squad creates worktrees but doesn't install deps. Agent Deck creates worktrees but doesn't copy your
`.env`. (…) **Git worktrees give you code isolation — your runtime environment is still shared.**"*
— https://dev.to/rohansx/every-ai-agent-tool-creates-git-worktrees-none-of-them-make-worktrees-actually-work-3ae9

#### R2. Conflitos de porta / Docker / banco de dados

`Atotalnoob` (abr/2026), descrevendo a dor exata:
> *"**with worktrees I am not really able to easily copy secrets, etc to run my app, ports conflict, I end up with a
> bunch of separate dbs and services, etc.** Does conductor help with this?"*
> — https://news.ycombinator.com/item?id=47871666

`shmoogy`: *"last I did I would run into **port conflicts with docker projects**."*
— https://news.ycombinator.com/item?id=47874122

`lmeyerov`: *"we don't have a clean flow for docker: shared system daemon & repository means need to manually tag & run
by branch/project (`docker compose -p ...`), which is **friction for the LLM and even more setup than we want**"*
— https://news.ycombinator.com/item?id=44628550

✅ Resolvível **se você escrever o script** (`$CONDUCTOR_PORT` + `COMPOSE_PROJECT_NAME=$CONDUCTOR_WORKSPACE_NAME`),
mas a doc de troubleshooting **ainda lista isso como falha comum**.

#### R3. Permissões do GitHub — a polêmica do lançamento

`itsalotoffun`, o comentário mais duro da thread:
> *"Full read-write access required to all your Github account's repos. Not just code. Settings, deploy keys. The works.
> Full access to your organisation settings. **Not a privacy policy in sight. Zero disclosure of data practices.
> You are INSANE to authorize this app on anything other than throwaway code.**"*
> — https://news.ycombinator.com/item?id=44628912

✅ Corrigido em ~4 dias (GitHub App com permissões granulares + opção de usar o `gh` local). **Mas o follow-up sobre
privacidade ficou sem resposta pública:** *"it's still concerning that the app potentially has access to sensitive data
and, **without it being open source, it's hard to trust what it's doing with that data**"* (`joshualyon`,
https://news.ycombinator.com/item?id=44663614), e perguntas técnicas sobre onde os tokens OAuth são guardados
ficaram sem resposta (`kernelbugs`, https://news.ycombinator.com/item?id=44789594).

#### R4. Perda do "feel" do Claude Code — a crítica de UX mais interessante

`aantix`:
> *"There's a 'feel' to the way Claude Code outputs the text. And for input as well. **Sadly, this is lost with
> conductor. I just don't feel as joyful using it.**"* — https://news.ycombinator.com/item?id=44630721

E o detalhamento, que é acionável:
> *"Is some of the intermediary output being suppressed? This gives the feeling of CC 'working' on my behalf.
> Being able to quickly hit escape to interject. Escape again to see the conversation history. **The key bindings
> should be exactly the same.** I don't think I'm looking for an interface to replace CC (…) **I just want a better
> way to manage the sessions.**"* — https://news.ycombinator.com/item?id=44635832

**Isto é a lição de UX mais valiosa do relatório inteiro pro Lumem-OS:** ao envolver um agente numa GUI, você troca
fidelidade por gerenciamento. Uma parte real dos usuários só quer **o gerenciamento**, com o agente intacto.

#### R5. Fluxo GitHub/PR imposto

`ookblah` (abr/2026): *"**conductor was a non-starter for [me] due to requiring the github + PR workflow.**
do you just allow management of a local repo without pushing us into a specific git flow?"*
— https://news.ycombinator.com/item?id=47627953

`cahaya`: *"**If Conductor would work with local branches I would switch from Crystal.**"*
— https://news.ycombinator.com/item?id=44633871

`henryaj`: *"**the working on PRs workflow seems broken — the local branch doesn't have the changes that are on the PR
so I can't pick it up and continue working on it.**"* — https://news.ycombinator.com/item?id=44634995

#### R6. Mac-only / closed source / sem sandbox

- `countfeng`: *"I don't deserve to own my Windows system"* — https://news.ycombinator.com/item?id=44633318
- `parsak` (mar/2026): *"i built pane specifically because **conductor and most of the other tools in this space were
  mac-first (or mac-only), and a huge chunk of the multi-agent dev community is on windows or linux**"*
  — https://news.ycombinator.com/item?id=47442230
- `throwaw12`: *"I like conductor.build (…) but **I don't want to give up my freedom and get heavily reliant on
  closed source**"* — https://news.ycombinator.com/item?id=46936390
- `MarcelOlsz` (jan/2026): *"**Getting Conductor to play nice with vm's was very tricky as their docs say they have no
  intention of implementing vm's and wrote a 'trust me bro, it won't erase your system' blurb about it in their docs**"*
  — https://news.ycombinator.com/item?id=46748446
- `jamie_ca`: bloqueio corporativo — *"I can't use it at work because we only have Copilot"*
  — https://news.ycombinator.com/item?id=47867353

#### R7. Multi-repo não suportado — **sem resposta do fundador**

`jerezzprime`: *"I work on a project that has frontend/packages and backend (separate repos instead of a monorepo for
good reasons) and I often develop features that cross both repos. (…) **all the tools for background/multiplexing are
always built around a single repo. Any chance I can get multi-repo tasks supported?**"*
— https://news.ycombinator.com/item?id=44631694

**Relevante direto pro Lumem-OS:** essa é exatamente a lacuna que a sua hierarquia *workspace > projetos > worktrees*
preenche. O `/add-dir` do Conductor é um paliativo, não um modelo de dados.

#### R8. Custo de rodar N agentes

> *"**Running four agents simultaneously means four times the token consumption. It's easy to spin up workspaces
> without thinking too hard about what that means for your bill.**"*
> — https://madewithlove.com/blog/conductor-running-multiple-ai-coding-agents-in-parallel/

`lvl155`, externalidade: *"**So this is why Claude Code is so slow now.** I am all for these but not at the cost of
other more casual users."* — https://news.ycombinator.com/item?id=44630140

#### R9. Perda de contexto entre workspaces — **o furo de self-learning**

> *"**When you start a new workspace or conversation, the agent has no memory of previous work, your coding
> conventions, past decisions, or codebase quirks.**"* — madewithlove.com

> *"Session managers and worktree apps (Claude Squad, Conductor, Crystal) keep each agent's context isolated — great
> for clean parallel attempts, but **the team forgets between runs**."* — munderdiffl.in

**Este é o ponto onde o Lumem-OS pode ganhar de fato.** O Conductor tem os transcripts no Postgres e a busca
`conductor sql`, mas **não fecha o loop** — nada lê aquilo automaticamente para o próximo workspace.

#### R10. Ceticismo com a categoria inteira

`oc1`, a crítica conceitual mais forte:
> *"it's overcomplicating most workflows more than being of a real use for agentic coding. The bottleneck was — for
> most workflows — never the ai not being able to write 10 different poc of my feature simultaneously — **but the
> human factor — needing to carefully review what ai produced and still steering ai in the right direction.
> git worktrees doesn't help solve any of these problems. it just adds an unnecessary layer on top.**"*
> — https://news.ycombinator.com/item?id=44633890

`petesergeant`: *"I am smart, capable, and have a lot of programming experience, and **can just about manage to stay
focused enough to properly review the output of a single Claude agent. I'm surprised people are running multiple
agents, and are able to check their outputs diligently.**"* — https://news.ycombinator.com/item?id=44632132

**Consequência de design:** se a crítica está certa, o gargalo é **review**, não geração. Isso reforça investir no
Diff Viewer, no painel de Checks e no `⌥L` — e não em "quantos agentes cabem".

#### R11. Churn — gente saindo do Conductor

- `robertn702` (ago/2026): *"+1 for Paseo. **Switched over to it a few weeks ago from conductor.build**"*
  — https://news.ycombinator.com/item?id=49237141
- `betaout` (jun/2026): *"**I have been a heavy user of conductor.build before switching off completely to Paseo.**"*
  — https://news.ycombinator.com/item?id=48456273
- `kasktra` (jul/2026): *"**I recently went back to using my terminal more instead of using tools like Conductor**"*
  — https://news.ycombinator.com/item?id=49107548
- `malkosta` (ago/2026): *"after trying this herdr, conductor, etc… **I always come back to ghostty+tmux+nvim**"*
  — https://news.ycombinator.com/item?id=49259291

#### R12. Instabilidade / regressões

Volume enorme de "Fixes" por release (v0.78.0 tem ~50), incluindo regressões básicas:
*"Fixed messages sent while an agent was working sometimes never reaching the agent"*,
*"Fixed several issues causing message replies to be lost"*, *"Fixed a crash when a second collaborator started typing
in a chat"*. **Pre-1.0 depois de 13 meses e ~150 releases.** — https://www.conductor.build/changelog

#### R13. Submodules não funcionam com worktrees

`clbrmbr`: *"From git-scm.com/docs/git-worktree: 'the support for submodules is incomplete'. (…) **My experience has
been that worktrees simply do not work with submodules.**"* — https://news.ycombinator.com/item?id=44634185
*(Limitação do git, herdada. Nesta máquina o repo `tms-api` tem um `settings.local.toml` com
`setup = "git submodule init\ngit submodule update"` — exatamente a gambiarra necessária **[local]**.)*

#### R14. Nuvem: seus dados ficam nos servidores deles

FAQ oficial de pricing, verbatim: *"**Does Conductor have access to my data in cloud workspaces? Yes.** Unlike with
local Conductor sessions, **chat messages sent in cloud workspaces are stored on Conductor's servers.**"*
Contra o local, onde *"Conductor never accesses your coding inputs / outputs"*.

---

### Elogios concretos de UX (o que as pessoas *especificamente* elogiam)

Vale registrar porque valida quais decisões da §8 realmente funcionam:

1. **"Extensão limpa, não substituição"** — `simonbw`: *"I tried a couple other apps but **they seemed to change too
   much without providing enough value for that change. This feels like just a nice clean simple extension of how
   Claude code already works that solves my most common pain points.**"*
   — https://news.ycombinator.com/item?id=44627897
2. **Dashboard de estado** — `trevor-e`: *"**When you're running several agents in parallel it becomes very handy
   compared to the terminal. I can easily see the status of each which I haven't found a good equivalent for when using
   terminal tabs.**"* — https://news.ycombinator.com/item?id=44934481
   E `freedomben`: *"**once I have about 3 or more running at a time it's very easy to forget about one and have it
   paused waiting for confirmation.**"* → valida o `⌥L`.
3. **Ciclo de vida com hooks (o elogio mais técnico)** — `jamie_ca`: *"the real gamechanger is (a) parallel threads in
   worktrees, with (b) **enough lifecycle hooks to treat them similarly to spinning up a VM**. (…) Postgres duplicating
   my local dev and test databases so I can test in isolation, and then when I close out a worktree it deletes those
   databases. **The best at that that I've found is Conductor**"* — https://news.ycombinator.com/item?id=47867353
   E sobre por que script sozinho não basta: *"The difference is removing friction, **having a UI that shows me what's
   set up, that I don't need to hit the filesystem or git status to check in**"*
   — https://news.ycombinator.com/item?id=47879779
4. **Sidebar orientada a worktree/PR, não a chat** — `huntercaron`: *"**Conductor/Composer/Superset etc realized making
   the sidebar PRs/worktree focused rather than chat focused can feel great.**"*
   — https://news.ycombinator.com/item?id=47632688
   E `babelfish`: *"**No per-agent auto-worktree? This is the killer feature of Conductor**"*
   — https://news.ycombinator.com/item?id=47619699
5. **"Agent lag time"** — `redhale`: *"with only a single Claude Code, I spent a lot of time waiting (…) I called it
   **'agent lag' time**. Now with these worktrees tools, I can easily bounce between tasks during these natural lulls."*
   — https://news.ycombinator.com/item?id=44645120
6. **Substituiu o Cursor num time inteiro** — `dominicholmes`: *"**Managing many agents, each in their own sandbox,
   felt like indisputably the future after using conductor for a day. We were a cursor company before conductor, but we
   cancelled all our seats (…) because conductor was vastly more productive.**"*
   — https://news.ycombinator.com/item?id=47621884
7. **Design** — o diferencial mais citado. O designer `julianfkelly` (ex-Messenger/Meta) explicou a filosofia:
   *"**I try to design our software to be functional, visually subtle, and chromatically warm.** (…) I've spent a lot
   of time studying manuscripts from the early middle ages"* — o logo é **insular majuscule**.
   — https://news.ycombinator.com/item?id=44629675
8. **Simon Willison**: *"it's a pretty slick macOS desktop app"* — https://news.ycombinator.com/item?id=45531558
   E `bjacobso`: *"**they really pioneered this whole direction of using git worktrees. Cursor will soon look like
   their app, Opencode will soon look like their app.**"* — https://news.ycombinator.com/item?id=45520043

### Contexto competitivo (relevante pra decidir escopo)

O mercado **se consolidou brutalmente** em 2026:

| Ferramenta | Status (ago/2026) |
|---|---|
| **Crystal** (open source, era a principal alternativa) | ⚰️ **Deprecado em fev/2026** |
| **Vibe Kanban** (Bloop) | ⚰️ **Empresa fechou em abr/2026**; projeto community-maintained |
| **Claude Squad** | Vivo, open source, UX "clunky" segundo usuários |
| **Sculptor** (Imbue), **Paseo**, **ctx**, **Superset**, herdr, cmux, Emdash, Orca, Bullet | Ativos; Paseo em ascensão (recebendo churn do Conductor) |
| **Conductor** | Sobrevivente com US$ 22 M |

Comparação técnica mais rigorosa que achei, do fundador do ctx (viés de concorrente, mas os 4 pontos são verificáveis):
> *"— Conductor relies mostly on the safety model of the underlying harnesses; **ctx can run work in VM/container-isolated
> environments with explicit network policy.** — ctx has a **local merge queue** for landing changes from multiple agent
> worktrees onto each other. — Conductor is a local Mac app; **ctx also works with Linux** and is designed for the
> 'local app + remote Linux runtime' model."* — https://news.ycombinator.com/item?id=47627137

E o contra-argumento mais honesto de todos: *"**The most honest Conductor alternative isn't an app at all** —
Conductor's core trick is isolating each agent so they don't stomp on each other's files, and **git worktrees do
exactly that, natively.**"* — munderdiffl.in

`ramesh31`: *"**There's probably a dozen new ones of these per week. It's the obvious idea at this point. Eventually the
model providers will do it, and that's what we'll all use.**"* — https://news.ycombinator.com/item?id=47170846

---

## 11. O que vale trazer pro Lumem-OS

**Modelo de dados**

1. **Três identificadores separados por worktree**: slug de diretório imutável (o Conductor usa cidades — pode ser
   qualquer dicionário estável), nome de branch semântico e renomeável, e título da task/MR como display name.
   Regra: **o diretório nunca muda depois de criado.**
2. **`derived_status` + `manual_status` como colunas distintas.** Inferência não sobrescreve intenção do usuário.
3. **Modelo de inbox**: `unread` no worktree, `unread_count` na sessão, `pinned_at`, e um flag de importância separado.
4. **Fila de mensagens persistida** com `queue_order`, `sent_at NULL` = pendente, `cancelled_at`, e pausa de fila.
5. **Comentários de review com `thread_id`, `reply_to_comment_id`, `is_resolved`, `is_outdated`, `end_line_number`,
   `location`.** Espelhar o modelo do host (GitHub/GitLab) evita ensinar um modelo novo ao usuário.
6. **`migration_rollbacks(version, down_sql)`** — guardar o SQL de downgrade no próprio banco. Barato, salva rollback de release.
7. **Cache de PR/MR com o schema do forge espelhado** (`mergeStateStatus`, `reviewDecision`, `viewerCanMerge`,
   `statusCheckRollups`) para decidir habilitação de botões sem round-trip.
8. **Diff sempre contra a merge-base**, com `ahead`/`behind` materializados e três visões (branch / uncommitted / all files).

**UX**

9. **"Próximo item que precisa de atenção"** como atalho global. É a feature que faz paralelismo escalar.
   Se trouxer só uma coisa deste documento, traga esta.
10. **Estado por animação distinta**, não por texto, na lista de worktrees.
11. **Comentário no diff vira anexo estruturado no prompt** (com arquivo+linha), não texto solto no chat.
12. **Painel único de "prontidão pra merge"** agregando git status + MR + CI + comentários + todos,
    com **todos bloqueando o merge**.
13. **Prompts por ação, versionados no repo** (`code_review`, `create_pr`, `rename_branch`, `fix_errors`,
    `resolve_conflicts`, `general`). Encaixa direto no *self-learning por projeto*: o prompt aprendido vira arquivo
    no repo e o time inteiro herda.
14. **Modelo/effort separados para revisar e para codificar.**
15. **Deep links `lumem://`** desde o dia 1, e ensinar os agentes a emitirem links em vez de IDs.
16. **Onboarding com projeto de exemplo e worktrees pré-criadas**, em vez de tour de tooltips.
17. **Ícone do projeto extraído do repo** (`public/favicon.svg`, `apple-touch-icon.png`, …). Custo trivial, ganho grande.
18. **`⌘/` com cheatsheet contextual** à lista em foco.

**Ambiente**

19. **Faixa de 10 portas por worktree** via env var, não uma porta só.
20. **Camadas de configuração com precedência explícita**:
    `managed > repo local > repo compartilhado > usuário > default`, TOML ganha de JSON legado.
    O Conductor documenta isso literalmente — copie a clareza.
21. **`.worktreeinclude` com sintaxe .gitignore** para arquivos gitignored a copiar, com default `.env*`.
    Melhor que uma lista em JSON: o usuário já conhece a sintaxe.
22. **Reinstalar dependências por worktree** em vez de compartilhar `node_modules`. Correção > velocidade;
    e ofereça setup script pra quem quiser symlinkar, com **GC de symlinks no archive**
    (tabela `symlinks_pending_deletion`).
23. **`run_mode: concurrent | nonconcurrent`** para projetos com recurso compartilhado.
24. **Sinalizar contexto local vs remoto ao agente** via env var (`CONDUCTOR_IS_LOCAL` → `LUMEM_IS_LOCAL`),
    e marcar scripts com `available_in`.
25. **Checkpoints em refs privadas** (`refs/lumem-checkpoints/<id>`) antes de cada turno. Estude o
    `checkpointer.sh` linha a linha — o tratamento de rebase em curso, índice conflitado, timeout com SIGTERM,
    GC por owner-PID e a proteção contra repo-root-ancestral são casos que você vai descobrir do jeito difícil.

**Arquitetura**

26. **Servidor local de vida longa com porta efêmera + arquivo de descoberta** (`latest-server.json`),
    logs próprios e atalho pra abri-los. Já é o desenho do Lumem-OS — o Conductor confirma que é o caminho.
27. **Outbox pattern** para eventos cliente→servidor (`sidecar-v2-session-event-outbox/`).
28. **Empacotar e versionar os binários dos agentes**, com fallback explícito pro PATH do sistema.
29. **Injetar um skill/plugin que ensina o agente a operar o próprio produto.** Barato, e transforma o agente em
    suporte técnico. O SKILL.md do Conductor é um ótimo template — em especial a seção
    *"This file covers the facts that are easy to get wrong."*
30. **Expor `sql` read-only sobre transcripts** como ferramenta de primeira classe (para humanos e agentes).
    Isto é literalmente o substrato do *self-learning por projeto e workspace*.
31. **CLI que espelha a API pública**, com token no Keychain — para agentes orquestrarem outros agentes.

**Lições vindas das críticas (o que o Conductor *não* fez e você deveria)**

32. **Suportar TUI embutido além do SDK.** Resolve duas coisas de uma vez: a queixa R4 (*"the key bindings should be
    exactly the same… I just want a better way to manage the sessions"*) e o risco de cobrança por API (§1).
    A casca de gerenciamento — worktree, diff, checks, PR, `⌥L` — deve funcionar por cima de **qualquer** modo
    de execução do agente.
33. **Fechar o loop do self-learning.** O Conductor tem transcripts pesquisáveis e prompts versionados e **não conecta
    os dois**. Um worktree novo do Lumem-OS deveria nascer sabendo o que os anteriores aprenderam (§13.17).
34. **Isolar runtime, não só código.** Servidor Linux + container por worktree resolve de verdade portas, DB e Docker,
    em vez de transferir o problema pro usuário via script (§13.18).
35. **Aceitar branch local sem exigir PR.** Várias pessoas descartaram o Conductor só por isso (R5).
    O fluxo de host/PR deve ser opcional, não o caminho único.
36. **Modelar multi-repo no dado, não como paliativo.** Sua hierarquia *workspace > projetos > worktrees* já é a
    resposta pra R7 — o `/add-dir` do Conductor não é.

---

## 12. O que NÃO trazer

1. **Rodar agentes sem sandbox.** O Conductor assume o risco e admite. Se o Lumem-OS é cliente-servidor e
   multi-máquina, você já tem a estrutura para isolar de verdade (container/VM por worktree). Não repita.
2. **Acoplamento a um único git host.** O Conductor é GitHub-only na prática. Modele **`GitHost`** como interface
   desde o início (GitHub, GitLab, self-hosted), com PR/MR, checks, comentários e reviews abstratos.
   O campo `gitForge` deles é vestigial; o seu tem que ser real.
3. **Mac-only / plataforma única.** Cliente fino + servidor é justamente o que evita esse teto.
4. **Spotlight testing como resolvido.** Espelhar arquivos de volta pra raiz via watcher+checkpoint é frágil,
   exclusivo e mata o paralelismo. Se um projeto não roda de um worktree, a resposta certa é
   **isolamento em container com bind mount**, não sincronizar arquivos.
5. **"Remova e re-adicione o repo (apaga todos os workspaces e chats)" como passo de troubleshooting.**
   Migração precisa ser não-destrutiva.
6. **Revert destrutivo sem lixeira.** Guarde os turnos revertidos por N dias.
7. **Checkpoints por worktree quando o modelo permite N sessões por worktree.** Ou o checkpoint é por sessão
   com merge de escopo, ou o app bloqueia revert quando há outra sessão ativa. Não deixe o usuário descobrir.
8. **Um único status agregado.** Já dito: derived + manual, separados.
9. **Um serviço testável por vez.** Se o Lumem-OS mira monorepos e microserviços, o grupo de run scripts precisa
   ser multi-serviço desde o design (compose por worktree, com faixa de portas).
10. **Telemetria opt-out só por env var.** Toggle explícito na UI, e não amarrado a desligar features de produto.
11. **Sem export de dados.** Ofereça `lumem export` desde cedo — inclusive porque o cliente-servidor torna a
    migração entre máquinas um caso normal, não excepcional.
12. **Documentação de atalhos que não renderiza sem JS** e links 404 no próprio SKILL. Se você vai injetar um skill
    que aponta pra URLs de doc, teste os links no CI.
13. **Numeração de versão errática** (0.28 → 0.80 em pouco tempo) — atrapalha usuários a saberem o que têm.
14. **Forçar o fluxo GitHub/PR como único caminho.** Foi dealbreaker explícito pra vários usuários (R5).
    Branch local sem PR precisa ser cidadão de primeira classe.
15. **Substituir a UI do agente sem oferecer o modo original.** A queixa R4 é real e não tem remédio depois:
    quem gosta do TUI vai embora. Ofereça o gerenciamento sem exigir a substituição.
16. **Prometer isolamento e entregar só isolamento de código.** Se o Lumem-OS disser "workspaces isolados",
    tem que valer pro runtime também — senão você herda a reclamação nº 1 da categoria inteira.
17. **Velocidade de release às custas de estabilidade.** ~150 releases, pre-1.0 aos 13 meses, com regressões básicas
    ("mensagens enviadas nunca chegavam ao agente", "replies perdidos"). Para um orquestrador que roda a noite inteira,
    perder mensagem é pior que atrasar feature.

---

## 13. Perguntas em aberto pro Vinicius decidir

1. **Qual o análogo da "cidade" no Lumem-OS?** Você quer um dicionário fixo (cidades, minerais, constelações) com
   colisão sufixada `-v2`, ou slug derivado da task + hash curto? A cidade dá memorabilidade e estabilidade;
   o slug dá legibilidade imediata. O Conductor escolheu memorabilidade e resolveu legibilidade mostrando a branch
   na UI. Dado que o Lumem-OS tem **tasks por workspace linkadas a projetos**, você já tem um ID de task —
   `<task-id>-<slug>` seria estável e legível ao mesmo tempo. Vale abrir mão da graça das cidades?

2. **Hierarquia: o "workspace" do Lumem-OS é o "workspace" do Conductor?** No Conductor,
   workspace = worktree. No seu modelo, **workspace > projeto > worktree**, e as tasks vivem no workspace.
   Isso significa que uma task pode gerar worktrees em **múltiplos projetos** ao mesmo tempo?
   Se sim, você tem um conceito que o Conductor não tem (ele resolve isso mal, com `/add-dir`) — e precisa decidir
   como fica o review: **um MR por projeto, ou uma visão de diff agregada cross-repo?** Esta é provavelmente
   a decisão de arquitetura mais consequente do projeto.

3. **Sandbox: container por worktree, VM, ou nada?** Custo alto (imagem, cold start, montagem de código) vs risco
   de agente com suas credenciais. O cliente-servidor permite rodar o servidor numa máquina dedicada — isso já
   é "isolamento suficiente" pro seu caso de uso, ou você quer isolamento por worktree?

4. **`node_modules` e dependências: reinstalar, symlinkar, ou overlay?** O Conductor reinstala (correto, lento,
   caro em disco). Com container você poderia usar layer cache / volume compartilhado. Qual o alvo de tempo de
   criação de worktree — 10 s ou 3 min?

5. **Multi-máquina: o servidor é único e os worktrees vivem nele, ou há agentes de máquina?** O Conductor foi de
   local puro → local + cloud sandbox, com uma ponte `RunLocalCommand` (cloud chama o Mac). Você quer desde já um
   modelo de **hosts registrados** onde um worktree tem afinidade a um host? Isso muda `workspace_path`,
   port forwarding e a UX de "abrir no editor".

6. **Portas: faixa fixa por worktree (estilo `CONDUCTOR_PORT..+9`) ou alocador dinâmico com registro?**
   O Conductor tem `port_forwards` com UNIQUE em `local_port` — ou seja, o servidor é a autoridade de alocação.
   Com multi-host, a faixa fixa quebra. Vale um serviço de alocação desde o início?

7. **GitLab: paridade completa ou subconjunto?** MRs, discussions com threads, approvals, pipelines e
   `merge_status` têm semânticas diferentes das do GitHub. Você abstrai um `GitHost` comum (denominador mínimo)
   ou modela os dois nativamente e a UI se adapta? Note que você já tem MCP de GitLab disponível —
   isso muda o cálculo?

8. **Self-learning: onde mora o conhecimento aprendido?** O Conductor tem três lugares distintos e não os conecta:
   prompts por repo (versionados em git), `settings.toml` (versionado), e transcripts (Postgres, pesquisável
   via `conductor sql`). Para o Lumem-OS, o aprendizado **por projeto** deveria ser commitado no repo (herdável
   pelo time, revisável em MR) e o aprendizado **por workspace** ficar no servidor? Ou tudo no servidor com
   export opcional? A versão commitada é auditável; a do servidor é automática.

9. **A busca sobre transcripts (`conductor sql`) é feature de usuário, de agente, ou de sistema?**
   No Conductor é as três coisas — a CLI é exposta aos agentes no cloud. Se o Lumem-OS expõe isso aos agentes,
   um agente pode consultar o que outros agentes já fizeram, o que é exatamente o insumo do self-learning —
   mas também é um vetor de vazamento de contexto entre projetos/clientes. Qual o escopo padrão da consulta?

10. **Checkpoints: por worktree ou por sessão?** O Conductor faz por worktree e o próprio doc admite que quebra com
    múltiplos chats. Se você permite N sessões por worktree (deveria), precisa decidir agora: checkpoint por sessão
    com detecção de conflito, ou lock de revert quando há outra sessão ativa?

11. **Qual o gate de merge do Lumem-OS?** O Conductor bloqueia por todos em aberto. Você quer todos, checks de CI,
    aprovação humana obrigatória, ou política configurável por projeto? E quem pode fazer override?

12. **Cliente: web, desktop nativo, ou ambos?** O Conductor é Tauri (Rust + WKWebView) — binário único, sem
    Chromium empacotado, com terminal nativo via `alacritty_terminal`. Se o Lumem-OS é cliente-servidor, um cliente
    **web** dá multi-plataforma de graça, mas você perde terminal nativo, notificações do SO, "abrir no editor",
    deep links e acesso ao filesystem local. Tauri te dá tudo isso mas amarra a um cliente instalado.
    Vale um híbrido (web para acompanhar, desktop para trabalhar)?

13. **Empacotar os binários dos agentes (Claude Code, Codex) ou usar o PATH do usuário?** O Conductor empacota e
    é enfático (*"Do not update or modify them"*) — elimina bugs de compatibilidade, mas custa 664 MB nesta máquina
    e quebra quem tem MCP/config custom no PATH. Com servidor centralizado, você empacota uma vez por servidor —
    isso muda a conta a seu favor?

14. **Preço/licença.** O Conductor virou freemium: local grátis, **cloud + colaboração pagos**. Se o Lumem-OS é
    interno, isso não importa; se um dia for produto, a lição é que **a fronteira monetizável é colaboração e
    execução remota**, não a orquestração local. Isso deveria influenciar onde você coloca a fronteira
    cliente/servidor agora?

15. **Quanto do modelo de "inbox" você adota?** unread + pinned + important + assignee + watchers + following é
    bastante máquina de estado. Começar só com `unread` + "próximo que precisa de atenção" entrega 80% do valor —
    o resto vale só quando houver multiplayer. Multiplayer está no roadmap do Lumem-OS?

16. **SDK ou TUI embutido — ou os dois?** Esta virou a pergunta mais urgente. O Conductor consome o Claude Code via
    **SDK**, o que dá controle total sobre a UI (status, notificações, diff, aprovações) mas **expõe o usuário à
    cobrança por API** depois da mudança de preço da Anthropic (§1). O escape deles ("Big Terminal Mode", TUI real
    embutido) preserva a assinatura mas perde notificações e todo o valor da UI. Você quer suportar **os dois modos
    desde o design**, com a mesma casca de gerenciamento (worktree, diff, checks, PR) funcionando em cima de qualquer
    um? Isso também endereça a crítica R4 ("perdi o feel do Claude Code") — quem quer o TUI puro tem o TUI puro,
    e ganha só o gerenciamento.

17. **Como fechar o loop do self-learning?** O Conductor tem todos os ingredientes e **não conecta nenhum**:
    transcripts pesquisáveis no Postgres, prompts por repo versionados em git, e nada que leia o histórico
    automaticamente ao criar um workspace novo. A queixa R9 é literal: *"the agent has no memory of previous work,
    your coding conventions, past decisions, or codebase quirks"*. Para o Lumem-OS: o aprendizado é **injetado
    automaticamente** no contexto de todo worktree novo (arriscado: polui contexto, custa tokens), **oferecido como
    ferramenta** que o agente consulta quando quiser (mais barato, mas o agente precisa lembrar de usar), ou
    **destilado periodicamente** por um job em regras versionadas no repo? Esta é a feature onde você pode ganhar
    do Conductor de verdade — é o buraco reconhecido da categoria inteira.

18. **Você resolve o isolamento de runtime ou só o de código?** A crítica mais dura e mais repetida (R1, R2) é que
    worktree isola *código*, não *runtime* — portas, DBs, Docker e `.env` continuam do usuário. O Conductor dá
    ferramentas (`CONDUCTOR_PORT`, files-to-copy, run_mode, Spotlight) mas **transfere o trabalho pro usuário
    escrever scripts**. Com container por worktree você resolveria de verdade (compose isolado, rede própria,
    volume de deps cacheado) ao custo de complexidade e cold start. **Dado que o Lumem-OS é cliente-servidor,
    o servidor pode ser Linux — o que torna container a opção natural, e não a exótica.** Vale ser esta a aposta
    diferencial?

19. **Qual o número-alvo de agentes simultâneos?** Os dados dizem: 3–5 é o confortável, 10–20 é possível só para quem
    já domina o codebase, e o gargalo é **revisão humana**, não compute. Otimizar a UI para 5 (foco, fila `⌥L`,
    diff excelente) é um produto diferente de otimizar para 50 (dashboards, agregação, auto-merge). Qual dos dois
    é o Lumem-OS?

---

## Fontes

### Inspeção local (somente leitura) — máquina do Vinicius, 2026-08-13

- `/Applications/Conductor.app/Contents/Info.plist` — versão 0.80.0, bundle ID, URL scheme, permissões macOS
- `/Applications/Conductor.app/Contents/MacOS/conductor` — `file`, `otool -L`, `strings` (Tauri v2, wry/tao, sqlx, tokio, alacritty_terminal, crates do cargo registry)
- `/Applications/Conductor.app/Contents/Resources/bin/` — `gh`, `watchexec`, `checkpointer.sh`, `git-busy-check.sh`, `spotlighter.sh`, shims
- `/Applications/Conductor.app/Contents/Resources/bin/.internal/conductor-runtime` — binário Bun 1.3.14; `strings` (endpoints PostHog, `api.conductor.build`, tools `DiffComment`/`RunLocalCommand`)
- `/Applications/Conductor.app/Contents/Resources/conductor-skill/skills/conductor/SKILL.md` — **documentação interna mais densa que a pública**; base das seções 2, 6 e 7
- `~/Library/Application Support/com.conductor.app/conductor.db` — schema completo via `sqlite3 "file:…?mode=ro&immutable=1" .schema`; 120 migrations; contagens agregadas
- `~/Library/Application Support/com.conductor.app/local-storage.*` — modelo de PR (`git-service-pr-v1`), modelo de diff (`git-service-workspace-changes-v1`), dispatcher-state, workspace-importance, route-user-state, lottie-sprite-cache
- `~/Library/Application Support/com.conductor.app/logs/latest-server.json` — servidor local em `127.0.0.1:60493`
- `~/Library/Application Support/com.conductor.app/agent-binaries/.meta/` — versões empacotadas de claude/codex
- `~/.conductor/settings.toml`, `~/.conductor/projects/` — settings do usuário, scripts de setup materializados
- `~/conductor/{repos,workspaces,archived-contexts}/` + `git worktree list` em 12 repos — layout em disco, nomes de cidade, nomes de branch, sufixos `-v1`
- `<repo>/.conductor/settings.toml` e `settings.local.toml` em `Starter project`, `tms-api`, `tms-atlas`
- `/Applications/Conductor.app/Contents/Resources/bin/conductor --help`, `conductor sql --help`, `conductor models`

### Documentação oficial (conductor.build)

- `/docs` · `/docs/faq` · `/docs/troubleshooting/issues`
- `/docs/concepts/workspaces-and-branches` · `/workflow` · `/parallel-agents` · `/agent-modes` · `/testing` · `/git-worktrees`
- `/docs/reference/scripts` · `/files-to-copy` · `/diff-viewer` · `/checks` · `/checkpoints` · `/todos` · `/cities` · `/deep-links` · `/keyboard-shortcuts` · `/settings` · `/security-and-permissions`
- `/docs/guides/review-and-merge` · `/parallel-agents/run-multiple-claude-code-sessions` · `/repositories/linking-multiple-directories`
- `/docs/cloud/getting-started` · `/collaboration` · `/working-with-cloud-workspaces`
- `/pricing` · `/changelog` (índice + sitemap com ~9 páginas de releases)
- `https://conductor.build/schemas/settings.schema.json` e `settings.repo.schema.json` — **lista autoritativa de chaves de configuração**
- `https://conductor.build/sitemap.xml` — enumeração completa das páginas

### Comunidade e imprensa

- **Show HN original (17/07/2025), 228 pontos — a fonte mais densa de todas:** https://news.ycombinator.com/item?id=44594584
  Contém a crítica de permissões do GitHub, a de `.env`/`node_modules`, a de "perdi o feel do Claude Code",
  a filosofia de design do designer e as respostas dos dois fundadores. **Vale ler na íntegra.**
- ~90 comentários adicionais do Hacker News (2025–2026), citados individualmente por ID de item na §10
- Página YC: https://www.ycombinator.com/companies/conductor · lançamento do Melty: https://www.ycombinator.com/launches/Llk-melty-open-source-ai-code-editor-for-10x-engineers
- Series A: https://x.com/charlieholtz/status/2039027121901957349 e https://news.ycombinator.com/item?id=47602101
- Mudança de preço da Anthropic: https://x.com/charlieholtz/status/2054695769916264638 ·
  https://x.com/martinald/status/2054714148378804417 · https://x.com/imdhiva/status/2054821178154598683
- Case study Vercel (infra do cloud): https://vercel.com/customers/how-conductor-moved-parallel-coding-agents-from-the-laptop-to-the-cloud-with-vercel-sandbox
- Reviews e comparativos: https://madewithlove.com/blog/conductor-running-multiple-ai-coding-agents-in-parallel/ ·
  https://julianastrada.com/blog/conductor-parallel-agents/ ·
  https://munderdiffl.in/blog/best-claude-code-multi-agent-tools/ ·
  https://dev.to/rohansx/every-ai-agent-tool-creates-git-worktrees-none-of-them-make-worktrees-actually-work-3ae9 ·
  https://dev.to/chand1012/the-best-way-to-do-agentic-development-in-2026-14mn ·
  https://nicholasjhenry.medium.com/building-isolated-phoenix-workspaces-for-ai-agents-with-conductor-a438d161f191
- Product Hunt (18 reviews, todas 5,0 — viés de seleção evidente):
  https://www.producthunt.com/products/conductor-aa77ddef-e6d3-4805-a179-7b2e17b6e22e

### Não obtido / lacunas conhecidas

- ⚠️ **Reddit inacessível** (r/ClaudeAI, r/ClaudeCode, r/conductorbuild) — bloqueio de crawler, API 403,
  `old.reddit.com` sem JS e proxy r.jina.ai também 403. Quatro rotas tentadas. O Conductor tem subreddit oficial
  linkado no rodapé do site; **vale consultar manualmente**.
- ⚠️ **Threads completas do X/Twitter** — `x.com` retorna 402, mirrors bloqueados por Cloudflare. As citações da §1
  vêm de snippets de busca (texto do tweet fiel, mas sem as respostas).
- ⚠️ **Changelog completo** (~150 releases) — a página só entrega as ~10 mais recentes sem JS; o resto foi
  reconstruído pelo `sitemap.xml`, que dá títulos e versões mas não o corpo das notas.
- ⚠️ **Discord oficial** — exige login.
- ⚠️ Artigos do The New Stack (review hands-on de out/2025) — site JS-rendered, mirror 403.
- ⚠️ Não há confirmação **oficial** da empresa sobre o stack do app; a conclusão "Tauri v2" é **minha, por inspeção
  local do binário** (§3.1), e contradiz o consenso da comunidade de que seria Electron.
- ⚠️ Sem números de receita, ARR ou usuários pagantes — só "100k+ builders" de marketing.
- ⚠️ Nenhuma resposta pública dos fundadores sobre **suporte multi-repo** (R7).
