import { useState } from "react";

import { describeMethod, needsKey, type AuthMethodView } from "./agent-words.js";
import type { AgentConfigView } from "./AgentRow.js";
import {
  useAgentLoginByCall,
  useAgentLoginByCommand,
  useAuthState,
  useCancelAuth,
} from "./queries.js";
import { useLoginTerminal } from "./useLoginTerminal.js";
import { Banner, Button, CopyCommand, Input } from "../../ui/index.js";

/**
 * Os jeitos de entrar, como o adaptador os listou — e são de duas naturezas.
 *
 * Um método `type: "terminal"` é um **comando**: o daemon abre um PTY e roda o que
 * o adaptador nomeou. Qualquer outro é uma **chamada**: `authenticate`, que pode
 * pedir uma chave ou mandar mostrar uma URL com um código. Medido na fase 0 da
 * `second-agent`: o `claude-agent-acp` só oferece comandos e o `codex-acp` só
 * oferece chamadas, então esta é a tela em que os dois agentes divergem mais.
 *
 * **Nenhum caminho aqui inventa método.** Se o adaptador não ofereceu nada que dê
 * para executar, o painel diz isso — nunca um botão que não existe.
 */
export function LoginOptions({
  config,
  methods,
  onDone,
}: {
  config: AgentConfigView;
  methods: readonly AuthMethodView[];
  onDone: () => void;
}) {
  const [loginPty, setLoginPty] = useState<string | null>(null);
  const [keyFor, setKeyFor] = useState<AuthMethodView | null>(null);
  const [apiKey, setApiKey] = useState("");
  const [loginId, setLoginId] = useState<string | null>(null);

  const terminal = useLoginTerminal({
    ptySessionId: loginPty,
    // Quem confirma o login é o adaptador respondendo, nunca a pessoa afirmando.
    onFinished: () => {
      setLoginPty(null);
      onDone();
    },
  });

  const target = { command: config.command, args: [...config.args] };

  const byCommand = useAgentLoginByCommand();
  const byCall = useAgentLoginByCall();

  /*
   * O estado da chamada, perguntado enquanto ela dura.
   *
   * Um `authenticate` de método de navegador espera uma **pessoa** autorizar noutro
   * lugar, e o pedido de mostrar a URL chega no meio dessa espera — não no fim
   * dela. Por isso o daemon devolve um id e a tela pergunta: é o mesmo desenho do
   * login por comando, que devolvia um `ptySessionId` para o cliente acompanhar.
   */
  const attempt = useAuthState(loginId);
  const cancel = useCancelAuth();

  const state = attempt.data?.state;

  if (loginPty !== null || terminal.running) return waitingForCommand();
  if (loginId !== null && state === "ok") return entered();
  if (loginId !== null && (state === "running" || state === undefined)) return waitingForCall();
  if (keyFor !== null) return keyForm(keyFor);

  /*
   * O que o Lumem sabe executar.
   *
   * Um método `terminal` sem comando é o adaptador dizendo "eu mesmo", e adivinhar
   * qual dos nomes dele está nesta máquina é justamente o palpite que já produziu
   * um comando de instalação errado. Os métodos de **chamada** não têm esse
   * problema: o id basta.
   */
  const usable = methods.filter((method) => method.type !== "terminal" || method.command !== null);

  if (usable.length === 0) {
    return (
      <>
        <Banner tone="warning">
          O adaptador não ofereceu nenhuma forma de entrar que o Lumem saiba executar
          {methods.length > 0 && <> — ele listou {methods.length}, e nenhuma delas dá para rodar</>}.
        </Banner>
        <Button size="sm" variant="ghost" onClick={onDone}>
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
          // Um preenchido por painel: o caminho que serve para quase todo mundo.
          // O segundo é contorno, não gêmeo.
          className={index === 0 ? "opt opt--primary" : "opt"}
          disabled={byCommand.isPending || byCall.isPending}
          onClick={() => {
            if (method.type === "terminal") {
              byCommand.mutate(
                { methodId: method.id, ...target },
                { onSuccess: (started) => setLoginPty(started.ptySessionId) },
              );
              return;
            }
            // Uma chave é a única coisa que a pessoa tem que digitar; ela ganha um
            // campo antes da chamada. Os outros métodos vão direto.
            if (needsKey(method)) {
              setKeyFor(method);
              return;
            }
            byCall.mutate(
              { methodId: method.id, ...target },
              { onSuccess: (started) => setLoginId(started.id) },
            );
          }}
        >
          <span className="opt__t">
            <span className="opt__g" aria-hidden="true">
              {index === 0 ? "◆" : "◇"}
            </span>
            {method.name}
          </span>
          <span className="opt__d">{describeMethod(method)}</span>
        </button>
      ))}
      <span className="setup__note">
        Estas opções vieram <b>do próprio adaptador</b>, no handshake. O Lumem não inventa método de
        login.
      </span>
      {byCommand.isError && <Banner tone="danger">{byCommand.error.message}</Banner>}
      {byCall.isError && <Banner tone="danger">{byCall.error.message}</Banner>}
      {state === "failed" && attempt.data?.message != null && (
        <Banner tone="danger">{attempt.data.message}</Banner>
      )}
    </>
  );

  /** O comando do adaptador rodando num terminal do daemon. */
  function waitingForCommand() {
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

  /** A chamada em andamento — e a URL com o código, quando o agente pede uma. */
  function waitingForCall() {
    const elicitation = attempt.data?.elicitation ?? null;

    return (
      <>
        {elicitation !== null && (
          <div className="dcode">
            <span className="dcode__k">abra em qualquer aparelho</span>
            <CopyCommand command={elicitation.url} />
            {/*
              O código é o único texto grande desta tela, e por um motivo medido:
              ele é o único número que a pessoa vai **ler e digitar** em outro
              lugar. O protocolo não tem campo para ele — o adaptador o escreve
              dentro da frase —, então o daemon destaca o que parece um código e a
              tela mostra a frase inteira embaixo. Sem código reconhecível, a frase
              é tudo, e ela continua ali.
            */}
            {elicitation.code !== null && (
              <>
                <span className="dcode__k">e digite este código</span>
                <span className="dcode__v">{elicitation.code}</span>
              </>
            )}
            <span className="setup__note">{elicitation.message}</span>
          </div>
        )}
        <div className="prep">
          <div className="prep__r prep__r--now">
            <span className="prep__m" aria-hidden="true">
              ◐
            </span>
            {elicitation === null ? "entrando…" : "esperando você autorizar"}
          </div>
        </div>
        <div className="setup__acts">
          <Button
            size="sm"
            variant="ghost"
            disabled={cancel.isPending}
            onClick={() => cancel.mutate(loginId ?? "", { onSuccess: () => setLoginId(null) })}
          >
            cancelar
          </Button>
        </div>
        <span className="setup__note">
          {elicitation === null
            ? "Terminou lá? Este painel muda sozinho — quem confirma é o adaptador respondendo."
            : "Nada abre aqui, e é de propósito: o daemon pode estar noutra máquina."}
        </span>
      </>
    );
  }

  /** Entrou. O painel fecha quando o probe novo disser que não há mais o que pedir. */
  function entered() {
    return (
      <>
        <div className="prep">
          <div className="prep__r prep__r--done">
            <span className="prep__m" aria-hidden="true">
              ✓
            </span>
            credencial aceita pelo adaptador
          </div>
        </div>
        <div className="setup__acts">
          <Button
            size="sm"
            variant="primary"
            onClick={() => {
              setLoginId(null);
              onDone();
            }}
          >
            continuar
          </Button>
        </div>
      </>
    );
  }

  /** Colar, não digitar: um campo, sem confirmação em dois passos. */
  function keyForm(method: AuthMethodView) {
    return (
      <>
        <div className="key-in">
          <Input
            type="password"
            aria-label="chave de API"
            placeholder="sk-…"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
          />
          <Button
            size="sm"
            variant="primary"
            disabled={apiKey.trim() === "" || byCall.isPending}
            onClick={() => {
              byCall.mutate(
                { methodId: method.id, apiKey: apiKey.trim(), ...target },
                { onSuccess: (started) => setLoginId(started.id) },
              );
              // Apagada da tela no mesmo gesto que a envia: ela atravessa o daemon
              // e não tem por que continuar existindo aqui.
              setApiKey("");
              setKeyFor(null);
            }}
          >
            usar
          </Button>
        </div>
        <span className="setup__note">
          Ela <b>atravessa</b> o daemon e vai para o adaptador. O Lumem não grava chave: não vai para
          o <code>~/.lumem</code>, não vai para log, e não volta para esta tela.
        </span>
        <button type="button" className="linkbtn" onClick={() => setKeyFor(null)}>
          voltar aos jeitos de entrar
        </button>
      </>
    );
  }
}
