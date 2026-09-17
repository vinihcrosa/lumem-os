import type { ReactNode } from "react";

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
 * interruptor da esteira, a largura da coluna —, e a tela de configuração não
 * pode ser o único lugar onde mudar não basta.
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
  const classes = [
    "own",
    readOnly ? "own--ro" : "",
    owner === "repositório" ? "own--wrap" : "",
  ]
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

      <SettingsSections workspaceId={workspaceId} />
    </div>
  );
}

/**
 * As quatro seções.
 *
 * Separado do cabeçalho para a fase seguinte preencher uma de cada vez sem
 * mexer no que já está de pé — e porque o cabeçalho não precisa de `workspaceId`
 * nenhum.
 */
function SettingsSections({ workspaceId }: { workspaceId: string }) {
  return (
    <>
      <SettingSection
        title="Esteira e orçamento"
        description={
          <>
            O que este workspace deixa a máquina gastar sozinha. Os três tetos já existiam e{" "}
            <b>nenhuma tela os escrevia</b> — o único jeito de pôr um teto era um teste.
          </>
        }
      >
        <div className="set__rows" data-workspace={workspaceId} />
      </SettingSection>

      <SettingSection
        title="Agentes"
        description={
          <>
            O adaptador é a cópia que o daemon instalou, e o <code>PATH</code> não decide. Conectar
            aqui vale para <b>todo workspace desta máquina</b>.
          </>
        }
      >
        <div className="set__rows" />
      </SettingSection>

      <SettingSection
        title="Integrações"
        description={
          <>
            A chave é da máquina; o mapa de colunas é do repositório. Quem separa os dois é a
            etiqueta de cada linha, e não uma frase no topo.
          </>
        }
      >
        <div className="set__rows" />
      </SettingSection>

      <SettingSection
        title="Exibição"
        description={
          <>
            O que é deste navegador, e não viaja com você para outra máquina — como a largura da
            coluna de arquivos e o estado do rodapé já não viajam.
          </>
        }
      >
        <div className="set__rows" />
      </SettingSection>
    </>
  );
}
