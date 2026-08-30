import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import type { RunDockState } from "../hooks/useRunDock.js";
import { useScriptActions, useScripts, type ScriptStatus } from "../hooks/useScripts.js";
import type { Scope } from "../hooks/useSessionsByScope.js";
import { useSessionsByScope } from "../hooks/useSessionsByScope.js";
import { relativeAge } from "../lib/relative-time.js";
import { sessionsKey } from "../lib/queryKeys.js";
import { trpc } from "../lib/trpc.js";
import { Button, Chip, Glyph } from "../ui/index.js";
import { Terminal } from "./Terminal.js";

import "./run-dock.css";
import "./terminal.css";

export type DockTab = "setup" | "run" | "test" | "terminal";

export interface RunDockProps {
  scope: Scope;
  dock: RunDockState;
  /**
   * Abre uma conversa nova já com o pedido dentro.
   *
   * O rodapé sabe **o que** perguntar; quem sabe pôr uma aba na frente é o `App`,
   * porque as abas são do painel central. Ausente quando não há onde abrir.
   */
  onAskAgent?: (sessionId: string, prompt: string) => void;
}

/**
 * O rodapé de execução: setup, run e terminal, abaixo da árvore de arquivos.
 *
 * As três abas são a **mesma primitiva** — sessão com terminal, anexada por
 * WebSocket —, e o que muda entre elas é quem escolheu o comando: o `project.toml`
 * nas duas primeiras, você na terceira. É por isso que não há um renderizador de
 * saída aqui: é o `Terminal` de sempre, com o id da sessão que estiver viva.
 *
 * Ele pertence ao **checkout**, como a árvore: trocar de aba de sessão não muda o
 * que está rodando; trocar de worktree, muda.
 */
export function RunDock({ scope, dock, onAskAgent }: RunDockProps) {
  const [tab, setTab] = useState<DockTab>("run");
  const status = useScripts(scope);
  const actions = useScriptActions(scope);

  if (!dock.open) {
    return <FoldedDock scope={scope} status={status.data} onOpen={dock.toggle} />;
  }

  return (
    <div className="dock" style={{ height: `${String(dock.height)}px` }} data-testid="run-dock">
      <span
        className="dock__grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="altura do rodapé"
        onPointerDown={dock.beginResize}
      />

      <div className="dock__bar" role="tablist" aria-label="execução do checkout">
        <button
          type="button"
          className="dock__fold"
          title="recolher o rodapé"
          aria-label="recolher o rodapé"
          onClick={dock.toggle}
        >
          ⌄
        </button>
        <DockTabButton
          label="Setup"
          active={tab === "setup"}
          dot={dotFor(status.data?.setup)}
          onClick={() => setTab("setup")}
        />
        <DockTabButton
          label="Run"
          active={tab === "run"}
          dot={dotFor(status.data?.run)}
          onClick={() => setTab("run")}
        />
        {/*
          Testes ao lado do run, e não escondido atrás de um menu: rodar a suíte é
          a coisa que mais se repete num dia de trabalho, e o ponto na aba responde
          "passou?" sem ninguém abrir nada.
        */}
        <DockTabButton
          label="Testes"
          active={tab === "test"}
          dot={dotFor(status.data?.test)}
          onClick={() => setTab("test")}
        />
        <DockTabButton label="Terminal" active={tab === "terminal"} onClick={() => setTab("terminal")} />

        <span className="dock__spacer" />
        <div className="dock__acts">
          {tab === "run" && <RunActions status={status.data} actions={actions} />}
          {(tab === "setup" || tab === "test") && (
            <PhaseActions phase={tab} status={status.data} actions={actions} />
          )}
        </div>
      </div>

      {tab === "terminal" ? (
        <TerminalTab scope={scope} />
      ) : status.isError ? (
        // O caso que o e2e achou: `[scripts]` com TOML quebrado. O daemon recusa
        // com o motivo — e sem isto a tela ficava para sempre em "lendo o
        // checkout…", que é a pior forma de dizer "não consegui".
        <div className="dock__idle" role="alert">
          <span>{status.error.message}</span>
        </div>
      ) : (
        <PhasePanel
          scope={scope}
          phase={tab}
          status={status.data}
          actions={actions}
          onAskAgent={onAskAgent}
        />
      )}
    </div>
  );
}

type PhaseStatus = ScriptStatus["run"];
type Actions = ReturnType<typeof useScriptActions>;

/**
 * O ponto que a aba carrega.
 *
 * Verde é "tem coisa de pé", vermelho é "a última falhou", verde-escuro é "a
 * última passou". As duas primeiras perguntas são as que trazem alguém ao rodapé,
 * e escondê-las dentro da aba obrigaria a abrir para descobrir.
 */
function dotFor(phase: PhaseStatus | undefined): "run" | "fail" | "ok" | null {
  if (!phase?.last) return null;
  if (phase.last.running) return "run";
  return phase.last.exitCode === 0 ? "ok" : "fail";
}

function DockTabButton({
  label,
  active,
  dot = null,
  onClick,
}: {
  label: string;
  active: boolean;
  dot?: "run" | "fail" | "ok" | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={`dtab${active ? " dtab--active" : ""}`}
      onClick={onClick}
    >
      {dot !== null && <span className={`dtab__dot dtab__dot--${dot}`} data-testid={`dot-${label.toLowerCase()}`} />}
      {label}
    </button>
  );
}

function RunActions({
  status,
  actions,
}: {
  status: ScriptStatus | undefined;
  actions: Actions;
}) {
  const live = status?.run.last?.running === true;
  const port = status?.port ?? null;

  if (!live) {
    return (
      <Button
        size="sm"
        variant="primary"
        disabled={status?.run.command === null || actions.start.isPending}
        onClick={() => actions.start.mutate("run")}
      >
        ▶ rodar
      </Button>
    );
  }

  return (
    <>
      {port !== null && (
        <>
          {/* De onde veio o número, escrito ao lado do botão que o usa (S6). */}
          <span className="openbtn__from dock__note">
            {port.source === "env" ? "porta de LUMEM_RUN_PORT" : "porta lida da saída"}
          </span>
          <a
            className="openbtn"
            href={`http://127.0.0.1:${String(port.port)}`}
            target="_blank"
            rel="noreferrer"
          >
            <span>Abrir</span>
            <span className="openbtn__port">:{port.port}</span>
          </a>
        </>
      )}
      <Button
        size="sm"
        glyph={<span className="stopglyph">⏹</span>}
        disabled={actions.stop.isPending}
        onClick={() => actions.stop.mutate("run")}
      >
        parar
      </Button>
    </>
  );
}

/**
 * As ações de uma fase que **termina** — `setup` e `test`.
 *
 * Uma função para as duas porque o gesto é o mesmo: rodar, ver como foi, rodar de
 * novo. O `run` tem as suas, e a diferença não é cosmética — ele não termina, então
 * o que ele oferece é abrir a porta e parar.
 */
function PhaseActions({
  phase,
  status,
  actions,
}: {
  phase: "setup" | "test";
  status: ScriptStatus | undefined;
  actions: Actions;
}) {
  if (status === undefined || status[phase].command === null) return null;
  const last = status[phase].last;

  if (last?.running === true) {
    return (
      <Button size="sm" glyph={<span className="stopglyph">⏹</span>} onClick={() => actions.stop.mutate(phase)}>
        parar
      </Button>
    );
  }

  const failed = last !== null && last.exitCode !== 0;
  return (
    <Button
      size="sm"
      variant={failed ? "primary" : "default"}
      disabled={actions.start.isPending}
      onClick={() => actions.start.mutate(phase)}
    >
      ▶ {last === null ? "rodar" : failed ? "tentar de novo" : "rodar de novo"}
    </Button>
  );
}

/** `Setup` e `Run`: o que está vivo, o que falhou, ou o que ainda não existe. */
function PhasePanel({
  scope,
  phase,
  status,
  actions,
  onAskAgent,
}: {
  scope: Scope;
  phase: "setup" | "run" | "test";
  status: ScriptStatus | undefined;
  actions: Actions;
  onAskAgent?: ((sessionId: string, prompt: string) => void) | undefined;
}) {
  if (!status) return <div className="dock__idle">lendo o checkout…</div>;

  const declared = status[phase].command;
  if (declared === null) {
    return <NoScripts scope={scope} status={status} onAskAgent={onAskAgent} />;
  }
  if (!status.trusted) return <TrustGate status={status} phase={phase} actions={actions} />;

  const last = status[phase].last;
  const failed = last !== null && !last.running && last.exitCode !== 0;

  return (
    <>
      {phase === "setup" && failed && (
        <div className="dock__banner" role="status">
          <Glyph tone="warn">⚠</Glyph>
          <span>
            <strong>A worktree foi criada; o setup dela falhou.</strong> Ela funciona — só não está
            preparada.
          </span>
        </div>
      )}

      <div className="dock__state">
        {last === null ? (
          <Chip>nunca rodou</Chip>
        ) : last.running ? (
          <Chip tone="clean" dot>
            rodando · {relativeAge(last.startedAt)}
          </Chip>
        ) : (
          <Chip dot>
            saiu {last.exitCode ?? "?"} · {relativeAge(last.finishedAt ?? last.startedAt)}
          </Chip>
        )}
        <span className="dock__cmd">{declared}</span>
        <span className="dock__spacer" />
        <span className="dock__note">
          {status.reservedPort === null ? "" : `porta reservada :${String(status.reservedPort)}`}
        </span>
      </div>

      {last !== null && !last.outputAvailable ? (
        // O buffer vive na memória do daemon: reiniciar o daemon apaga a saída e
        // deixa a linha. Dizer isso é melhor que um retângulo preto vazio.
        <div className="dock__idle">
          <span>
            A saída desta execução não existe mais — ela vivia na memória do daemon, e ele
            reiniciou desde então.
          </span>
        </div>
      ) : last === null ? (
        // Sem botão aqui: `▶ rodar` já está na barra, dois passos acima. Duas
        // cópias do mesmo gesto a uma mão de distância é o defeito que a sidebar
        // já tinha evitado com o `adicionar projeto`.
        <div className="dock__idle">
          <span>
            Este checkout ainda não rodou {phase === "test" ? "os testes" : `o ${phase}`}. O botão
            está ali em cima.
          </span>
        </div>
      ) : (
        <div className="dock__out">
          <Terminal
            // Por sessão: cada execução é um processo, e o buffer de uma não é
            // continuação do buffer da outra.
            key={last.sessionId}
            sessionId={last.sessionId}
            readOnly={!last.running}
          />
        </div>
      )}
    </>
  );
}

/**
 * O prompt que o botão manda.
 *
 * Escrito aqui, e não digitado por quem clica, porque o valor do gesto é
 * exatamente esse: o pedido já vem com as três fases, com o que cada uma
 * significa, e com a instrução que separa "escreveu um script" de "escreveu o
 * script deste repositório" — **leia antes de inventar**.
 */
export function askScriptsPrompt(file: string): string {
  return [
    "Este checkout ainda não diz ao Lumem como rodar.",
    "",
    `Escreva a tabela \`[scripts]\` em \`${file}\`, com as quatro fases:`,
    "",
    "- `setup`: deixa um checkout novo pronto para trabalhar — instalar dependências, preparar banco, o que for. Precisa ser idempetente: rodar de novo não pode estragar nada.",
    "- `run`: sobe a aplicação em primeiro plano (nada de daemon em background). Se ela aceitar porta configurável, use `$LUMEM_RUN_PORT` — é a porta que o Lumem reserva para este checkout, e é o que faz duas worktrees rodarem ao mesmo tempo.",
    "- `test`: roda a suíte de testes do projeto, uma vez e até o fim (nada de modo watch — o rodapé quer um código de saída, não um processo que fica).",
    "- `teardown`: desfaz o que sobrevive ao diretório — container, volume, porta presa. Se não houver nada assim, omita a linha.",
    "",
    "Antes de escrever, **leia o repositório** para descobrir os comandos de verdade: `package.json`, `Makefile`, `docker-compose.yml`, `README`, e o que mais existir. Não invente comando que não está lá; se não achar o de alguma fase, diga isso em vez de chutar.",
    "",
    "Cada valor é uma string só, executada pelo shell de login no diretório do checkout. Preserve o resto do arquivo — ele pode já ter o `id` do projeto dentro, e ele é do time.",
    "",
    "Não commite: eu reviso a mudança.",
  ].join("\n");
}

/**
 * O vazio que ensina o arquivo.
 *
 * Este é o estado **normal**, não o excepcional: é assim que todo projeto entra no
 * Lumem, e é a única superfície do produto onde alguém descobre que esse arquivo
 * existe.
 *
 * O gesto principal é **pedir para o agente**, e não escrever um arquivo de
 * exemplo: um `run = "pnpm dev"` chutado pelo produto está errado na maioria dos
 * repositórios, e o agente é quem consegue ler o `package.json` antes de responder.
 */
function NoScripts({
  scope,
  status,
  onAskAgent,
}: {
  scope: Scope;
  status: ScriptStatus;
  onAskAgent?: ((sessionId: string, prompt: string) => void) | undefined;
}) {
  const queryClient = useQueryClient();
  const configs = useQuery({
    queryKey: ["agentConfig", "list"],
    queryFn: () => trpc.agentConfig.list.query(),
  });

  // Só conversa serve: o pedido é uma pergunta em texto, e um agente por PTY é um
  // terminal — mandar texto nele seria digitar no prompt de outra coisa.
  const agent = (configs.data ?? []).find((config) => config.transport === "acp") ?? null;

  const ask = useMutation({
    mutationFn: async () => {
      if (agent === null) throw new Error("nenhum agente conectado");
      const created = await trpc.session.createAgent.mutate({
        scopeType: scope.scopeType,
        scopeId: scope.scopeId,
        agentConfigId: agent.id,
      });
      await queryClient.invalidateQueries({
        queryKey: sessionsKey(scope.scopeType, scope.scopeId),
      });
      return created.id;
    },
    onSuccess: (sessionId) => onAskAgent?.(sessionId, askScriptsPrompt(status.file)),
  });

  const example = useMemo(
    () =>
      [
        "# o id já está aqui; o que falta é o resto",
        'id = "prj_…"',
        "",
        "[scripts]",
        'setup    = "./scripts/setup.sh"',
        'run      = "pnpm dev"',
        'test     = "pnpm test"',
        'teardown = "./scripts/teardown.sh"',
      ].join("\n"),
    [],
  );

  return (
    <div className="noscripts">
      <span className="noscripts__t">Este projeto não diz como rodar.</span>
      <p className="noscripts__d">
        O Lumem lê os comandos de um arquivo <strong>do repositório</strong>, versionado junto com o
        código: quem clonar depois herda o mesmo setup, com Lumem ou sem. Enquanto ele não existir, as
        abas <code>Setup</code> e <code>Run</code> ficam vazias — o <code>Terminal</code> continua
        funcionando.
      </p>
      <span className="noscripts__where">{status.file}</span>
      <pre className="toml">{example}</pre>
      <div className="noscripts__acts">
        <Button
          size="sm"
          variant="primary"
          disabled={agent === null || onAskAgent === undefined || ask.isPending}
          onClick={() => ask.mutate()}
        >
          {ask.isPending ? "abrindo a conversa…" : "pedir para o agente criar"}
        </Button>
        <Button size="sm" onClick={() => void navigator.clipboard?.writeText(example)}>
          copiar o exemplo
        </Button>
        {agent === null && (
          // O motivo ao lado do botão desabilitado, como o `remover workspace` faz.
          <span className="trust__note">
            conecte um agente na barra da esquerda para pedir — ou escreva o arquivo à mão
          </span>
        )}
        {ask.isError && (
          <span className="trust__note" role="alert">
            {ask.error.message}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * O portão de confiança (S11).
 *
 * O comando aparece **antes** de virar processo — o mesmo padrão do `worktree.plan`,
 * que já mostra o comando de git antes de rodar.
 */
function TrustGate({
  status,
  phase,
  actions,
}: {
  status: ScriptStatus;
  phase: "setup" | "run" | "test";
  actions: Actions;
}) {
  return (
    <div className="trust">
      <div className="trust__head">
        <span className="trust__glyph">⚠</span>
        Este comando vem do repositório, não de você.
      </div>
      <p className="trust__why">
        Este projeto foi clonado de uma URL. O que está abaixo estava dentro dele, e vai rodar na sua
        máquina com as suas permissões.
      </p>
      <div className="trust__cmd">{status[phase].command}</div>
      <div className="trust__acts">
        <Button
          size="sm"
          variant="primary"
          disabled={actions.trust.isPending}
          onClick={() => actions.trust.mutate()}
        >
          confiar neste projeto
        </Button>
        <span className="trust__note">
          Vale para este projeto nesta máquina — e volta a perguntar se o comando mudar.
        </span>
      </div>
    </div>
  );
}

/** A aba `Terminal`: a sessão de shell que o daemon já sabe abrir, no checkout. */
function TerminalTab({ scope }: { scope: Scope }) {
  const queryClient = useQueryClient();
  const sessions = useSessionsByScope(scope);
  const [current, setCurrent] = useState<string | null>(null);

  const shells = (sessions.data ?? []).filter(
    (session) => session.kind === "shell" && session.state === "running",
  );
  const active = shells.find((shell) => shell.id === current) ?? shells[0] ?? null;

  async function open(): Promise<void> {
    const created = await trpc.session.createShell.mutate(scope);
    setCurrent(created.id);
    await queryClient.invalidateQueries({ queryKey: sessionsKey(scope.scopeType, scope.scopeId) });
  }

  if (active === undefined || active === null) {
    return (
      <div className="dock__idle">
        <span>Nenhum terminal aberto neste checkout.</span>
        <Button size="sm" onClick={() => void open()}>
          ＋ abrir terminal
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className="dock__state">
        <Chip tone="clean" dot>
          {shells.length} viva{shells.length > 1 ? "s" : ""}
        </Chip>
        <span className="dock__cmd dock__cmd--dim">cwd {active.cwd}</span>
        <span className="dock__spacer" />
        <button type="button" className="dock__new" onClick={() => void open()}>
          ＋ outro terminal
        </button>
      </div>
      <div className="dock__out">
        <Terminal key={active.id} sessionId={active.id} />
      </div>
    </>
  );
}

/** Recolhido, e ainda dizendo o que está vivo. */
function FoldedDock({
  scope,
  status,
  onOpen,
}: {
  scope: Scope;
  status: ScriptStatus | undefined;
  onOpen: () => void;
}) {
  const running = status?.run.last?.running === true;
  const port = status?.port ?? null;

  return (
    <div className="dock dock--collapsed" data-testid="run-dock-folded">
      <div className="dock__folded">
        <button type="button" className="dock__fold" aria-label="abrir o rodapé" onClick={onOpen}>
          ⌃
        </button>
        {running ? (
          <span className="runmark">
            <span className="runmark__glyph">▶</span>
            {port === null ? "run" : `run · :${String(port.port)}`}
          </span>
        ) : (
          <span>setup, run e terminal</span>
        )}
        <span className="dock__spacer" />
        <span className="dock__note">{scope.scopeType === "worktree" ? "worktree" : "projeto"}</span>
      </div>
    </div>
  );
}
