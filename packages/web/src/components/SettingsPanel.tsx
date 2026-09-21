import { ADAPTERS } from "@lumem/shared";
import { useState, type ReactNode } from "react";

import { useSetupAgentsReport } from "../hooks/useAgentConfigs.js";
import { askNoticePermission } from "../hooks/notice.js";
import { useSecrets } from "../hooks/useSecrets.js";
import { useTaskSettings } from "../hooks/useTasks.js";
import { useWorkspaceMutations } from "../hooks/useWorkspace.js";
import { Skeleton } from "../ui/index.js";

import "./detail.css";
import "./settings.css";

/**
 * A tela de configurações (`030-settings`).
 *
 * **Tela cheia, e não modal** (Q1): `/settings` é um endereço, e endereço é o
 * que sobrevive a `F5` e ao botão voltar. Um modal teria que inventar o que
 * havia atrás. O modal fica com o que a `017-sidebar-actions` lhe deu — criar
 * coisa.
 *
 * **Quatro seções numa rolagem só**, sem abas internas: uma tela que se abre
 * para procurar onde está uma coisa não pode esconder três quartos dela.
 *
 * **Sem botão salvar**, e o motivo não é gosto: um botão no rodapé de uma tela
 * com quatro seções obriga a pessoa a lembrar que mexeu numa seção que já rolou
 * para fora. O produto inteiro grava no gesto — o autosave do editor, o
 * interruptor da esteira, a largura da coluna. O que isso cobra é o **retorno**,
 * e ele usa o vocabulário que já existe: as mesmas palavras e os mesmos
 * `--color-save-*` do editor.
 */

export interface SettingsPanelProps {
  workspaceId: string;
  workspaceName: string;
}

/**
 * De quem é um ajuste.
 *
 * Quatro, e não três como o pedido supunha: o quarto é o **repositório**. O mapa
 * de colunas do tracker mora no `<repo>/.lumem/project.toml` e viaja com o
 * clone, que é metade do valor dele.
 *
 * O vocabulário é **fechado**, e é isso que faz a repetição virar coluna em vez
 * de ruído: a mesma palavra no mesmo `x`, linha após linha, some quando você não
 * a procura. Uma quinta palavra recomeçaria a leitura em cada linha.
 */
export type Owner = "workspace" | "máquina" | "repositório" | "navegador";

export interface SettingRowProps {
  label: string;
  /** O que o ajuste faz, dito antes de alguém mexer nele. */
  description?: ReactNode;
  owner: Owner;
  /** `true` quando a tela mostra e não muda — a etiqueta ganha o traço. */
  readOnly?: boolean;
  children: ReactNode;
}

/**
 * Uma linha de ajuste: o que é, o controle, e de quem é.
 *
 * A etiqueta é **por controle e não por seção** (Q3), e a razão está na seção
 * `integrações`: ela não tem **um** dono — a chave é da máquina e o mapa de
 * colunas é do repositório. Uma frase de escopo no topo teria que mentir ali, ou
 * abrir exceção logo na terceira das quatro seções.
 */
export function SettingRow({
  label,
  description,
  owner,
  readOnly = false,
  children,
}: SettingRowProps) {
  const classes = ["own", readOnly ? "own--ro" : "", owner === "repositório" ? "own--wrap" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="set__row">
      <span className="set__what">
        <span className="set__lbl">{label}</span>
        {description !== undefined && <span className="set__d">{description}</span>}
      </span>
      <span className="set__ctl">{children}</span>
      <span className={classes}>{owner}</span>
    </div>
  );
}

export interface SettingSectionProps {
  title: string;
  description: ReactNode;
  children: ReactNode;
}

export function SettingSection({ title, description, children }: SettingSectionProps) {
  return (
    <section className="set__sec">
      <div className="set__sech">
        <h2 className="set__sect">{title}</h2>
      </div>
      <p className="set__secd">{description}</p>
      {children}
    </section>
  );
}

/** O que a linha diz sobre si mesma depois que você mexeu nela. */
type SaveState = { kind: "clean" } | { kind: "saving" } | { kind: "saved" } | { kind: "failed"; why: string };

function SaveMark({ state }: { state: SaveState }) {
  if (state.kind === "clean") return null;
  const label =
    state.kind === "saving" ? "salvando…" : state.kind === "saved" ? "salvo" : "não deu para salvar";
  return (
    <span className={`set__save set__save--${state.kind}`} title={state.kind === "failed" ? state.why : undefined}>
      <span className="set__save__dot" aria-hidden="true" />
      {label}
    </span>
  );
}

export interface NumberSettingProps {
  id: string;
  /** `null` é *sem teto*; `0` é *bloqueia tudo*. São coisas diferentes. */
  value: number | null;
  /** O que o campo vira quando está vazio. Só o paralelismo não aceita vazio. */
  nullable: boolean;
  /** Escrito antes do número, quando ele é dinheiro. */
  unit?: string;
  integer?: boolean;
  onCommit: (next: number | null) => Promise<unknown>;
  ariaLabel: string;
}

/**
 * Um número que grava sozinho, com os **três** estados que o banco distingue.
 *
 * `null` é *sem teto*, `0` é *bloqueia tudo*, e o campo vazio é o **gesto** de
 * tirar o teto — não um quarto estado. A `028` Parte 3 defendeu essa distinção
 * no banco; colapsá-la aqui a desfaria justamente onde ela precisa ser lida.
 *
 * Grava no `blur` e no `Enter`, e **não** a cada tecla: um teto digitado
 * caractere a caractere mandaria `1`, `12`, `120` para o daemon, e o `12` é um
 * teto que existiu de verdade por um instante.
 */
export function NumberSetting({
  id,
  value,
  nullable,
  unit,
  integer = false,
  onCommit,
  ariaLabel,
}: NumberSettingProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [state, setState] = useState<SaveState>({ kind: "clean" });
  const [error, setError] = useState<string | null>(null);

  const shown = draft ?? (value === null ? "" : format(value, integer));
  const empty = shown.trim() === "";

  async function commit(): Promise<void> {
    const text = shown.trim();

    if (text === "") {
      if (!nullable) {
        setError("este não pode ficar vazio");
        return;
      }
      await send(null);
      return;
    }

    const parsed = Number(text.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError("negativo não é teto");
      return;
    }
    if (integer && !Number.isInteger(parsed)) {
      setError("este conta inteiros");
      return;
    }
    await send(parsed);
  }

  async function send(next: number | null): Promise<void> {
    setError(null);
    setState({ kind: "saving" });
    try {
      await onCommit(next);
      setDraft(null);
      setState({ kind: "saved" });
    } catch (cause) {
      // A frase do daemon, e não uma nossa: ele é o único que sabe o que
      // recusou, e reescrever a recusa é como um `check` do SQLite vira "erro
      // inesperado" na tela.
      setState({ kind: "failed", why: cause instanceof Error ? cause.message : String(cause) });
    }
  }

  return (
    <>
      <SaveMark state={state} />
      {error !== null && (
        <span className="set__err" role="alert">
          {error}
        </span>
      )}
      {unit !== undefined && !empty && <span className="set__pre">{unit}</span>}
      <input
        id={id}
        className={`input set__num${error === null ? "" : " input--error"}`}
        aria-label={ariaLabel}
        aria-invalid={error === null ? undefined : true}
        inputMode="decimal"
        value={shown}
        placeholder={nullable ? "sem teto" : ""}
        onChange={(event) => {
          setDraft(event.target.value);
          setError(null);
          setState({ kind: "clean" });
        }}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") void commit();
          if (event.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
      />
    </>
  );
}

function format(value: number, integer: boolean): string {
  return integer ? String(value) : value.toFixed(2).replace(".", ",");
}

/** Os três degraus do §6 da `028`, em ordem de risco. */
const AUTONOMY_STEPS = [
  { value: "manual" as const, label: "manual" },
  { value: "assistido" as const, label: "assistido" },
  { value: "autonomo" as const, label: "autônomo" },
];

type Autonomy = (typeof AUTONOMY_STEPS)[number]["value"];

/**
 * A coluna é `text` no SQLite, e o domínio tem três valores.
 *
 * Estreitar aqui é o [ADR de 2026-09-13](../../../../docs/adr/2026-09-13-0038-our-model-is-king-outsiders-adapt.md)
 * aplicado ao banco: *o modelo é do Lumem, e o que vem de fora se adapta a ele*.
 * Um degrau que o produto não conhece vira `manual`, que é o único default
 * seguro — a esteira parada.
 */
function asAutonomy(value: string): Autonomy {
  const step = AUTONOMY_STEPS.find((row) => row.value === value);
  return step?.value ?? "manual";
}

export function SettingsPanel({ workspaceId, workspaceName }: SettingsPanelProps) {
  return (
    <div className="set">
      <header className="set__head">
        <div className="crumb">
          <span>{workspaceName}</span>
        </div>
        <div className="set__title">
          <h1>Configurações</h1>
          <span className="kind">/settings</span>
        </div>
        <p className="set__lede">
          Cada ajuste diz <b>de quem ele é</b>. Mudar um teto muda para o workspace{" "}
          <b>{workspaceName}</b>; conectar um agente muda para <b>esta máquina</b>, e para todo
          workspace dela.
        </p>
      </header>

      <ConveyorSection workspaceId={workspaceId} />
      <AgentsSection />
      <IntegrationsSection />
      <DisplaySection />
    </div>
  );
}

/**
 * Esteira e orçamento — a seção que **escreve** (Q4).
 *
 * `workspace.setBudget` existia, validado e testado, **sem nenhum chamador na
 * web**: os três tetos eram somente-leitura no produto inteiro, e o único jeito
 * de pôr um teto era um teste. Esta é a primeira tela que os grava.
 */
function ConveyorSection({ workspaceId }: { workspaceId: string }) {
  const settings = useTaskSettings(workspaceId);
  const { setAutonomy, setCleanup, setBudget } = useWorkspaceMutations(workspaceId);

  if (settings.isPending) {
    return (
      <SettingSection title="Esteira e orçamento" description="O que este workspace deixa a máquina gastar sozinha.">
        <Skeleton label="lendo os tetos do workspace" />
      </SettingSection>
    );
  }

  if (settings.data === undefined) {
    return (
      <SettingSection
        title="Esteira e orçamento"
        description="O que este workspace deixa a máquina gastar sozinha."
      >
        <p className="set__err" role="alert">
          {settings.error?.message ?? "o daemon não respondeu"}
        </p>
      </SettingSection>
    );
  }

  const data = settings.data;
  const caps = data.caps;

  function commitCap(field: "costPerTask" | "costPerDay" | "turnsPerSession") {
    return (next: number | null) =>
      setBudget.mutateAsync({ costPerTask: caps.costPerTask, costPerDay: caps.costPerDay, turnsPerSession: caps.turnsPerSession, [field]: next });
  }

  return (
    <SettingSection
      title="Esteira e orçamento"
      description={
        <>
          O que este workspace deixa a máquina gastar sozinha. <code>sem teto</code> e{" "}
          <code>0</code> são coisas diferentes: o primeiro não segura nada, o segundo bloqueia tudo.
        </>
      }
    >
      <div className="set__rows">
        <SettingRow
          label="Autonomia"
          description={
            <>
              Quem puxa a fila. <code>assistido</code> prepara tudo e para antes de enviar.
            </>
          }
          owner="workspace"
        >
          <span className="seg" role="group" aria-label="autonomia">
            {AUTONOMY_STEPS.map((step) => (
              <button
                key={step.value}
                type="button"
                className="seg__btn focus-ring"
                aria-pressed={asAutonomy(data.autonomy) === step.value}
                onClick={() => {
                  /*
                   * A permissão de notificar é pedida **aqui** (Q55 da `028`): é
                   * o único instante em que o pedido tem frase honesta, e é este
                   * clique que passa a produzir coisas que acontecem sem você.
                   */
                  if (step.value !== "manual") void askNoticePermission();
                  setAutonomy.mutate({ autonomy: step.value, maxParallel: data.maxParallel });
                }}
              >
                {step.label}
              </button>
            ))}
          </span>
        </SettingRow>

        <SettingRow
          label="Cartões em paralelo"
          description="Quantos a esteira toca ao mesmo tempo. Zero a segura sem desligá-la."
          owner="workspace"
        >
          <NumberSetting
            id="set-max-parallel"
            ariaLabel="cartões em paralelo"
            value={data.maxParallel}
            nullable={false}
            integer
            onCommit={(next) =>
              setAutonomy.mutateAsync({ autonomy: asAutonomy(data.autonomy), maxParallel: next ?? 0 })
            }
          />
        </SettingRow>

        <SettingRow
          label="Teto por tarefa"
          description="A esteira para ao cruzar; quem conduz é avisado e decide."
          owner="workspace"
        >
          <NumberSetting
            id="set-cost-task"
            ariaLabel="teto por tarefa"
            value={caps.costPerTask}
            nullable
            unit="US$"
            onCommit={commitCap("costPerTask")}
          />
        </SettingRow>

        <SettingRow
          label="Teto por dia"
          description="Somado no workspace inteiro, todos os agentes juntos."
          owner="workspace"
        >
          <NumberSetting
            id="set-cost-day"
            ariaLabel="teto por dia"
            value={caps.costPerDay}
            nullable
            unit="US$"
            onCommit={commitCap("costPerDay")}
          />
        </SettingRow>

        <SettingRow
          label="Turnos por sessão"
          description={
            <>
              O teto que protege quem não relata dinheiro — o Codex responde <code>cost: null</code>.
            </>
          }
          owner="workspace"
        >
          <NumberSetting
            id="set-turns"
            ariaLabel="turnos por sessão"
            value={caps.turnsPerSession}
            nullable
            integer
            onCommit={commitCap("turnsPerSession")}
          />
        </SettingRow>

        {/*
          Separado da esteira de propósito, e o texto é inteiro: ligar a
          autonomia não pode parecer que autoriza apagar rascunho.
        */}
        <SettingRow
          label="PR mesclada sempre remove a worktree"
          description="Inclusive com arquivo não commitado."
          owner="workspace"
        >
          <label className="set__switch">
            {/*
              `aria-label` com a frase inteira, e não só a palavra do estado: o
              nome acessível de uma caixa é o texto do rótulo que a envolve, e
              aqui esse texto é `ligado`/`desligado` — que descreve a posição do
              interruptor e não o que ele autoriza.
            */}
            <input
              type="checkbox"
              aria-label="PR mesclada sempre remove a worktree"
              checked={data.mergedAlwaysRemoves}
              onChange={(event) => setCleanup.mutate(event.target.checked)}
            />
            <span>{data.mergedAlwaysRemoves ? "ligado" : "desligado"}</span>
          </label>
        </SettingRow>

        {/*
          Variável de ambiente do processo do daemon: a tela mostra e diz onde se
          muda, que é o que faz existir **um** lugar que responde "onde eu mudo
          isso?" mesmo para o que não é campo.
        */}
        <SettingRow
          label="Tarefas que um agente pode criar a partir de uma"
          description={
            <>
              Muda em <code>{data.budgetEnv}</code>, no ambiente do daemon.
            </>
          }
          owner="máquina"
          readOnly
        >
          <span className="set__val">{data.budget}</span>
        </SettingRow>
      </div>
    </SettingSection>
  );
}

/**
 * Agentes — **leitura**, nesta feature.
 *
 * O login continua no rodapé da sidebar até a LUM-57, e a Q6 decidiu o que
 * acontece com ele lá: não sobra nada, o rodapé some inteiro. O que entra aqui
 * agora é o que já se sabe ler — quais agentes existem e qual versão o daemon
 * tem **no disco**, que é a regra do
 * [ADR de 2026-09-08](../../../../docs/adr/2026-09-08-0507-adapter-is-the-copy-the-daemon-owns.md):
 * o `PATH` não decide.
 */
function AgentsSection() {
  const agents = useSetupAgentsReport();

  return (
    <SettingSection
      title="Agentes"
      description={
        <>
          O adaptador é a cópia que o daemon instalou, e o <code>PATH</code> não decide. Conectar
          vale para <b>todo workspace desta máquina</b> — por enquanto o login mora no rodapé da
          coluna.
        </>
      }
    >
      <div className="set__rows">
        {ADAPTERS.map((spec) => {
          const found = agents.data?.adapters.find((row) => row.id === spec.id);
          const installed = found?.adapter.version ?? null;
          return (
            <SettingRow
              key={spec.id}
              label={spec.label}
              description={
                <>
                  {spec.package ?? spec.command} · pino <code>{spec.pinnedVersion}</code>
                </>
              }
              owner="máquina"
              readOnly
            >
              <span className="set__val">{installed ?? "não instalado"}</span>
            </SettingRow>
          );
        })}
      </div>
    </SettingSection>
  );
}

/**
 * Integrações — e é a seção que derrubou a proposta da Q3.
 *
 * Ela **não tem um dono**: a chave é da máquina (cifrada em `~/.lumem/_system`,
 * pelo ADR do cofre) e o mapa de colunas do tracker é do repositório. Uma frase
 * de escopo no topo teria que mentir aqui, ou abrir exceção na terceira das
 * quatro seções — e é por isso que a etiqueta é por linha.
 *
 * O catálogo é **fechado**, como o rodapé já dizia: os serviços que o Lumem sabe
 * guardar são os que ele sabe usar.
 */
function IntegrationsSection() {
  const slots = useSecrets();

  const list = slots.data ?? [];

  return (
    <SettingSection
      title="Integrações"
      description={
        <>
          A chave é da máquina; o mapa de colunas do tracker é do repositório. Quem separa os dois é
          a etiqueta de cada linha, e não uma frase no topo.
        </>
      }
    >
      <div className="set__rows">
        {list.map((slot) => (
          <SettingRow
            key={slot.id}
            label={slot.label}
            description={
              <>
                Cifrada em <code>~/.lumem/_system</code>. Quem já lê o seu <code>$HOME</code> como
                você decifra.
              </>
            }
            owner="máquina"
            readOnly
          >
            <span className="set__val">{slot.present ? "guardada" : "sem chave"}</span>
          </SettingRow>
        ))}
        {/*
          O que o GitHub não tem aqui é a decisão da `013`, e não um buraco: o
          estado vem do `gh` da sua máquina, e o Lumem não vê, não pede e não
          grava token. Não há o que mostrar porque não há o que guardar.
        */}
        <SettingRow
          label="GitHub e GitLab"
          description={
            <>
              Vêm do <code>gh</code> e do <code>glab</code> da sua máquina. O Lumem não vê, não pede
              e não grava token.
            </>
          }
          owner="máquina"
          readOnly
        >
          <span className="set__val">fora do cofre</span>
        </SettingRow>
      </div>
    </SettingSection>
  );
}

/**
 * Exibição — a seção que entra **sem o controle**, de propósito (Q7).
 *
 * O `tokens.css` tem 111 valores em `px` e zero `rem`, e é cópia do Open Design:
 * `html { font-size }` não move um pixel. A alavanca nasce no sistema de design,
 * não aqui. Desenhar o segmentado agora seria um botão que não faz nada, e a
 * diferença entre as duas coisas é o que separa uma tela honesta de uma que
 * promete.
 */
function DisplaySection() {
  return (
    <SettingSection
      title="Exibição"
      description={
        <>
          O que é deste navegador, e não viaja com você para outra máquina — como a largura da coluna
          de arquivos e o estado do rodapé já não viajam.
        </>
      }
    >
      <div className="set__todo">
        <span aria-hidden="true">⚠</span>
        <span>
          <b>Tamanho de fonte ainda não tem alavanca.</b> O <code>tokens.css</code> tem{" "}
          <b>111 valores em px e zero rem</b>, e é cópia do Open Design — então{" "}
          <code>html {"{ font-size }"}</code> não move um pixel. O <code>rem</code> nasce no sistema
          de design, e a preferência chega quando ele chegar.
        </span>
      </div>
    </SettingSection>
  );
}
