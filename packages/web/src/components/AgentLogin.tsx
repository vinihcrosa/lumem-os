import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

import { useLoginTerminal } from "../hooks/useLoginTerminal.js";
import { trpc } from "../lib/trpc.js";
import { Banner, Button, Glyph } from "../ui/index.js";
import { AgentConfigDialog } from "./AgentConfigDialog.js";

import "./agent-login.css";

const AGENT_CONFIGS_KEY = ["agentConfig", "list"];
const AGENTS_KEY = ["setup", "agents"];
const PROBE_KEY = ["setup", "probe"];

/** The name the connected configuration gets. Short: it labels the session tab. */
const AGENT_NAME = "claude";

/**
 * Conectar um agente: login, and that is all.
 *
 * The footer used to ask for a name, a transport, a command, arguments and an
 * adapter version — five fields only someone who maintains their own adapter can
 * answer. None of them is a choice a person using this makes: the command and the
 * version are the daemon's, the transport is the product's, and *how you log in*
 * is dictated by the agent itself, in the handshake. One real decision is left —
 * which account — and this panel is only that.
 *
 * Every button in it comes from `authMethods`. Measured, not assumed: the adapter
 * advertises nothing at all to a client that does not declare `auth.terminal`,
 * and with it declared it offers `claude-ai-login` and `console-login`, both
 * `type: "terminal"` — commands to run, not calls to `authenticate`. So a login
 * here is the adapter's own command running in a terminal the daemon owns, and
 * the browser that opens during a subscription login is opened by that command.
 */
export function AgentLogin() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [loginPty, setLoginPty] = useState<string | null>(null);
  const [stage, setStage] = useState<"idle" | "installing" | "handshaking">("idle");

  const configs = useQuery({
    queryKey: AGENT_CONFIGS_KEY,
    queryFn: () => trpc.agentConfig.list.query(),
  });

  const config = configs.data?.find((row) => row.transport === "acp");

  const agents = useQuery({
    queryKey: AGENTS_KEY,
    queryFn: () => trpc.setup.agents.query(),
    enabled: open,
    refetchOnWindowFocus: false,
  });

  const probe = useQuery({
    /*
     * Keyed on the command **and** the arguments, and probing with both.
     *
     * Sending only the command was a real bug, not just an e2e one: a
     * configuration whose command is `node` and whose argument is a script
     * spawns, with the argument dropped, a bare Node REPL — which answers no
     * handshake at all and hangs until the timeout. Every page load paid fifteen
     * seconds for it.
     */
    queryKey: [...PROBE_KEY, config?.command ?? "default", (config?.args ?? []).join(" ")],
    queryFn: () =>
      trpc.setup.probe.query(
        config === undefined ? undefined : { command: config.command, args: [...config.args] },
      ),
    // Only once there is something to probe. Standing an adapter up to find out
    // whether an adapter exists is the wrong order.
    enabled: config !== undefined,
    retry: false,
    refetchOnWindowFocus: false,
    /*
     * Not re-asked on every mount.
     *
     * A probe is a process: it spawns the adapter, shakes hands and kills it. That
     * is cheap in tokens (zero) and not free in time (~0.6 s), and the answer it
     * gives changes about as often as a credential expires. "Verificar de novo" is
     * the button for when it does.
     */
    staleTime: 5 * 60_000,
  });

  const reprobe = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: PROBE_KEY });
  }, [queryClient]);

  const terminal = useLoginTerminal({
    ptySessionId: loginPty,
    // What decides whether the login worked is the adapter answering, not the
    // command exiting zero and not a person clicking "já entrei".
    onFinished: () => {
      setLoginPty(null);
      void reprobe();
    },
  });

  /**
   * Install if needed, handshake, and write the configuration.
   *
   * One mutation rather than three buttons: the three lines the panel draws are
   * the *stages of this*, and a person who has to click "instalar" and then
   * "testar" and then "salvar" is a person doing the daemon's bookkeeping.
   */
  const connect = useMutation({
    mutationFn: async () => {
      let command = agents.data?.adapter.path ?? null;

      if (command === null) {
        setStage("installing");
        const installed = await trpc.setup.installAdapter.mutate();
        command = installed.path;
      }

      setStage("handshaking");
      const report = await trpc.setup.probe.query({ command });

      if (config === undefined) {
        await trpc.agentConfig.create.mutate({
          name: AGENT_NAME,
          command,
          args: [],
          transport: "acp",
          adapterVersion: report.agentInfo?.version ?? null,
        });
      }
      return report;
    },
    onSettled: async () => {
      setStage("idle");
      await queryClient.invalidateQueries({ queryKey: AGENT_CONFIGS_KEY });
      await queryClient.invalidateQueries({ queryKey: AGENTS_KEY });
      await reprobe();
    },
  });

  const login = useMutation({
    mutationFn: (methodId: string) =>
      trpc.setup.login.mutate({
        methodId,
        ...(config === undefined ? {} : { command: config.command, args: [...config.args] }),
      }),
    onSuccess: (started) => setLoginPty(started.ptySessionId),
  });

  const state = connectionState();

  if (!open) {
    return (
      <button
        type="button"
        className={`foot-row foot-row--${state.tone}`}
        onClick={() => setOpen(true)}
      >
        <Glyph tone="agent">◆</Glyph>
        <span className="foot-row__label">{config?.name ?? "conectar um agente"}</span>
        {state.tone === "on" && <span className="pip" />}
        <span className="foot-row__st">{state.word}</span>
      </button>
    );
  }

  return (
    <div className="setup" role="group" aria-label="conectar um agente">
      <div className="setup__head">
        <span className="setup__t">{title()}</span>
        <button type="button" className="setup__x" aria-label="fechar" onClick={() => setOpen(false)}>
          ✕
        </button>
      </div>
      {body()}
    </div>
  );

  /** What the footer says when the panel is closed. */
  function connectionState(): { tone: "on" | "off" | "err"; word: string } {
    if (connect.isPending || login.isPending || terminal.running) {
      return { tone: "off", word: "entrando…" };
    }
    if (config === undefined) return { tone: "off", word: "nenhum" };
    if (probe.isPending) return { tone: "off", word: "verificando" };
    if (probe.isError) return { tone: "err", word: "falhou" };
    if (probe.data?.authRequired === true) return { tone: "err", word: "expirado" };
    return { tone: "on", word: "conectado" };
  }

  function title(): string {
    if (custom) return "Outro agente ACP";
    if (advanced) return "Adaptador";
    if (connect.isPending) return "Preparando o Claude Code";
    if (terminal.running) return "Esperando o navegador";
    if (connect.isError) return "Não deu para conectar";
    if (config === undefined) return "Conectar agente";
    if (probe.isError) return "Não deu para conectar";
    if (probe.data?.authRequired === true) return "Entrar no Claude";
    return "Claude Code";
  }

  function body() {
    if (custom) {
      return (
        <>
          {/*
            The five fields did not disappear — they became a drawer nobody has to
            open to start. This is the one path that still needs them: an adapter
            the daemon does not install and cannot name.
          */}
          <AgentConfigDialog embedded onClose={() => setCustom(false)} />
          <button type="button" className="linkbtn" onClick={() => setCustom(false)}>
            voltar
          </button>
        </>
      );
    }

    if (advanced) return advancedDrawer();
    if (connect.isPending) return preparing();
    if (terminal.running || loginPty !== null) return waiting();
    if (connect.isError) return failure(connect.error.message);
    if (config === undefined) return chooseAgent();
    if (probe.isError) return failure(probe.error.message);
    if (probe.data?.authRequired === true) return loginOptions();
    return connected();
  }

  /** State 02: which agent. What is unavailable stays listed, with the reason. */
  function chooseAgent() {
    const claude = agents.data?.claude;

    return (
      <>
        <button
          type="button"
          className="opt opt--primary"
          /*
           * Also while the detection is in flight, and that is not politeness.
           *
           * `connect` decides whether to install by reading what the detection
           * found. Clicked before it answers, it reads "nothing found" and
           * installs an adapter that was already there — minutes of npm for
           * nothing, and the e2e is what caught it.
           */
          disabled={connect.isPending || agents.isPending}
          onClick={() => connect.mutate()}
        >
          <span className="opt__t">
            <span className="opt__g" aria-hidden="true">
              ◆
            </span>
            Claude Code
          </span>
          <span className="opt__d">
            {agents.isPending
              ? "procurando na sua máquina…"
              : claude?.path == null
                ? "o CLI não está no PATH — o adaptador precisa dele para trabalhar"
                : `encontrado na sua máquina · ${claude.version ?? "versão não lida"}`}
          </span>
        </button>
        <button type="button" className="opt" disabled>
          <span className="opt__t">
            <span className="opt__g" aria-hidden="true">
              ◆
            </span>
            Codex
          </span>
          <span className="opt__d">sem adaptador ACP publicado ainda</span>
        </button>
        <button type="button" className="linkbtn" onClick={() => setCustom(true)}>
          outro agente ACP…
        </button>
      </>
    );
  }

  /** State 03: what the daemon is doing for you, in three lines. */
  function preparing() {
    const rows: [string, "done" | "now" | "wait"][] = [
      ["CLI encontrado", agents.data?.claude.path == null ? "wait" : "done"],
      [
        "instalando o adaptador ACP",
        stage === "installing" ? "now" : stage === "handshaking" ? "done" : "wait",
      ],
      ["handshake", stage === "handshaking" ? "now" : "wait"],
    ];

    return (
      <>
        <div className="prep">
          {rows.map(([label, mark]) => (
            <div className={`prep__r prep__r--${mark}`} key={label}>
              <span className="prep__m" aria-hidden="true">
                {mark === "done" ? "✓" : mark === "now" ? "◐" : "○"}
              </span>
              {label}
            </div>
          ))}
        </div>
        <span className="setup__note">
          Nada para rodar no terminal: o adaptador é instalado <b>dentro da pasta do app</b> e fixado
          numa versão — nunca <code>@latest</code>, para uma atualização de madrugada não mudar o
          comportamento do agente.
        </span>
      </>
    );
  }

  /** State 04: the ways in, as the adapter listed them. */
  function loginOptions() {
    const methods = probe.data?.authMethods ?? [];
    const usable = methods.filter((method) => method.type === "terminal" && method.command !== null);

    if (usable.length === 0) {
      return (
        <>
          <Banner tone="warning">
            O adaptador não ofereceu nenhuma forma de entrar que o Lumem saiba executar
            {methods.length > 0 && <> — ele listou {methods.length}, de outro tipo</>}.
          </Banner>
          <Button size="sm" variant="ghost" onClick={() => void reprobe()}>
            verificar de novo
          </Button>
        </>
      );
    }

    return (
      <>
        {usable.map((method, index) => (
          <button
            type="button"
            key={method.id}
            // One filled button per panel: the path that works for almost
            // everyone. The second is a detour, not a twin.
            className={index === 0 ? "opt opt--primary" : "opt"}
            disabled={login.isPending}
            onClick={() => login.mutate(method.id)}
          >
            <span className="opt__t">
              <span className="opt__g" aria-hidden="true">
                {index === 0 ? "◆" : "⌘"}
              </span>
              {method.name}
            </span>
            <span className="opt__d">{method.description ?? "abre o navegador"}</span>
          </button>
        ))}
        <span className="setup__note">
          Estas opções vieram <b>do próprio adaptador</b>, no handshake. O Lumem não inventa método
          de login.
        </span>
        {login.isError && <Banner tone="danger">{login.error.message}</Banner>}
      </>
    );
  }

  /** State 05: the command is running. Nobody is asked to confirm anything. */
  function waiting() {
    return (
      <>
        <div className="prep">
          <div className="prep__r prep__r--done">
            <span className="prep__m" aria-hidden="true">
              ✓
            </span>
            adaptador de pé
          </div>
          <div className="prep__r prep__r--now">
            <span className="prep__m" aria-hidden="true">
              ◐
            </span>
            autorize no navegador e volte
          </div>
        </div>
        {terminal.output.length > 0 && (
          <div className="out out--short">
            {terminal.output.map((line, index) => (
              // Output lines have no identity and never reorder.
              // eslint-disable-next-line react/no-array-index-key
              <span className="l" key={index}>
                {line}
              </span>
            ))}
          </div>
        )}
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={() => setLoginPty(null)}>
            cancelar
          </Button>
        </div>
        <span className="setup__note">
          Terminou lá? Este painel muda sozinho — quem confirma é o adaptador respondendo, não você
          dizendo que entrou.
        </span>
      </>
    );
  }

  /** State 07: connected. */
  function connected() {
    const report = probe.data;

    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">agente</span>
            <span className="acct__v">
              <b>{report?.agentInfo?.title ?? config?.name}</b>
              {report?.agentInfo !== null && report?.agentInfo !== undefined && (
                <> · {report.agentInfo.version}</>
              )}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">entrada</span>
            <span className="acct__v">
              {report?.authMethods.length === 0
                ? "credencial local, já válida"
                : "credencial local"}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">padrão</span>
            <span className="acct__v">{report?.currentMode ?? "o padrão do agente"}</span>
          </div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="ghost" onClick={() => void reprobe()}>
            verificar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={() => setAdvanced(true)}>
            avançado
          </button>
          {/*
            A gap in the drawn screen, and the product needs it: with one agent
            connected there was no way to add a second. The design's state 07 has
            only "trocar conta" and "sair" — and "sair" cannot exist here at all.
          */}
          <button type="button" className="linkbtn" onClick={() => setCustom(true)}>
            outro agente ACP…
          </button>
        </div>
        {/*
          No "sair", and that is the protocol's answer rather than an omission:
          `logout` exists in ACP but is gated on `agentCapabilities.auth.logout`,
          and this adapter sends `auth: null`. A button here would mean nothing.
        */}
        <span className="setup__note">
          Trocar de conta é <code>claude /logout</code> no seu terminal: este adaptador não declara a
          capacidade <code>auth.logout</code>, então um botão aqui não faria nada.
        </span>
      </>
    );
  }

  /** The five old fields, as facts rather than a form. */
  function advancedDrawer() {
    return (
      <>
        <div className="acct">
          <div className="acct__r">
            <span className="acct__k">comando</span>
            <span className="acct__v">{config?.command ?? "—"}</span>
          </div>
          <div className="acct__r">
            <span className="acct__k">args</span>
            <span className="acct__v">
              {config?.args.length ? config.args.join(" ") : "nenhum"}
            </span>
          </div>
          <div className="acct__r">
            <span className="acct__k">versão</span>
            <span className="acct__v">{config?.adapterVersion ?? "não fixada"}</span>
          </div>
        </div>
        <span className="setup__note">
          Só para quem mantém o próprio adaptador. O Lumem usa o que instalou e a versão que fixou —
          para trocar, remova esta configuração em <b>outro agente ACP…</b> e crie a sua.
        </span>
        <button type="button" className="linkbtn" onClick={() => setAdvanced(false)}>
          voltar
        </button>
      </>
    );
  }

  /** The process failed. Its own words, in mono, under prose that explains. */
  function failure(message: string) {
    return (
      <>
        <div className="fail">
          <span className="fail__title">
            <span aria-hidden="true">✕</span>
            não deu para conectar
          </span>
          <span className="fail__body">
            O adaptador não respondeu ao handshake. O que ele disse está abaixo.
          </span>
          <div className="fail__cmd">{message}</div>
        </div>
        <div className="setup__acts">
          <Button size="sm" variant="primary" onClick={() => connect.mutate()}>
            tentar de novo
          </Button>
          <button type="button" className="linkbtn" onClick={() => setCustom(true)}>
            outro agente ACP…
          </button>
        </div>
      </>
    );
  }
}
