import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { RightPanel } from "../components/RightPanel.js";
import {
  Banner,
  Button,
  Card,
  CheckList,
  CheckRow,
  Chip,
  Choice,
  ChoiceGroup,
  Coach,
  CopyCommand,
  EmptyState,
  Field,
  Glyph,
  Input,
  Item,
  Menu,
  MenuItem,
  MetaGrid,
  RawOutput,
  Row,
  SectionHead,
  Skeleton,
  Steps,
  Tab,
  TabStrip,
  TabToggle,
  WizardCard,
  WizardSection,
} from "./index.js";

/**
 * Toda primitiva em todo estado.
 *
 * Isto existe porque uma primitiva errada contamina seis telas de uma vez, e
 * descobrir isso uma tela por vez custa seis vezes mais. Era a rota
 * `/styleguide`; virou story quando o desenho passou a morar no código.
 *
 * Os dados são falsos e plausíveis de propósito: uma primitiva que só viu
 * "Item 1" nunca foi perguntada sobre o que faz com um nome de branch que não
 * cabe.
 */
const meta: Meta = {
  title: "Primitivas",
};

export default meta;

type Story = StoryObj;

export const Glyphs: Story = {
  name: "Glyph",
  render: () => (
    <div className="sg__inline">
      <Glyph tone="workspace">◈</Glyph>
      <Glyph tone="project">■</Glyph>
      <Glyph tone="worktree">◇</Glyph>
      <Glyph tone="shell">●</Glyph>
      <Glyph tone="agent">◆</Glyph>
      <Glyph tone="warn">⚠</Glyph>
      <Glyph tone="off">■</Glyph>
    </div>
  ),
};

export const ColunaDeArquivos: Story = {
  name: "Coluna de arquivos",
  render: () => (
    <>
      <p className="sg__note">
        A coluna nasce fechada, e o interruptor dela mora na faixa de abas do checkout — o único
        lugar que existe em todas as abas de um escopo e em nenhum lugar fora dele. Desligado à
        esquerda, ligado à direita. Aqui a coluna aparece nas duas pontas da largura que o arrasto
        permite.
      </p>
      <div className="sg__inline">
        <TabToggle label="a coluna de arquivos" pressed={false} onToggle={() => undefined}>
          ▤
        </TabToggle>
        <TabToggle label="a coluna de arquivos" pressed onToggle={() => undefined}>
          ▤
        </TabToggle>
      </div>
      <div className="sg__columns">
        <div className="sg__column" style={{ width: "var(--size-panel-right-min)" }}>
          <RightPanel
            tab="files"
            onSelectTab={() => {}}
            changeCount={null}
            onReload={() => {}}
            onClose={() => {}}
            onResize={() => {}}
            footLeft="lido há 12 s"
            footRight="21 entradas"
          >
            <div className="rp__scroll">
              <p className="detail__hint">a mínima ainda cabe um caminho de três níveis</p>
            </div>
          </RightPanel>
        </div>
        <div className="sg__column" style={{ width: "var(--size-panel-right-max)" }}>
          <RightPanel
            tab="changes"
            onSelectTab={() => {}}
            changeCount={6}
            onReload={() => {}}
            onClose={() => {}}
            onResize={() => {}}
            footLeft="lido há 8 s"
            footRight="árvore de trabalho vs HEAD"
          >
            <div className="rp__scroll">
              <p className="detail__hint">a máxima, com a contagem na aba</p>
            </div>
          </RightPanel>
        </div>
      </div>
    </>
  ),
};

export const Buttons: Story = {
  name: "Button",
  render: () => (
    <>
      <div className="sg__inline">
        <Button variant="primary" glyph={<Glyph>◆</Glyph>}>
          Novo agente
        </Button>
        <Button glyph={<Glyph tone="shell">●</Glyph>}>Novo shell</Button>
        <Button variant="ghost">Renomear</Button>
        <Button variant="danger">Remover worktree</Button>
        <Button disabled>Remover</Button>
      </div>
      <div className="sg__inline">
        <Button size="sm" variant="primary">
          Tentar agora
        </Button>
        <Button size="sm">Novo agente aqui</Button>
        <Button size="sm" variant="ghost">
          Fechar sessão
        </Button>
        <Button size="sm" variant="danger">
          Encerrar
        </Button>
        <Button size="sm" disabled>
          Encerrar
        </Button>
      </div>
    </>
  ),
};

export const Chips: Story = {
  name: "Chip",
  render: () => (
    <div className="sg__inline">
      <Chip>3 worktrees</Chip>
      <Chip tone="branch" dot>
        teste-prd
      </Chip>
      <Chip tone="clean" dot>
        limpa
      </Chip>
      <Chip tone="dirty" dot>
        suja · 3 arquivos
      </Chip>
      <Chip tone="missing" dot>
        ausente do disco
      </Chip>
      <Chip tone="running" dot>
        running · 12 min
      </Chip>
      <Chip tone="exited" dot>
        exited (0)
      </Chip>
      <Chip tone="failed" dot>
        exited (1)
      </Chip>
      <Chip>
        <span className="ahead">↑2</span> <span className="dim">de main</span>
      </Chip>
    </div>
  ),
};

function RowGallery(): React.JSX.Element {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState("teste-prd");

  return (
    <div className="sg__panel">
      <Row
        depth={0}
        emphasis
        label="lorebase"
        glyph={<Glyph tone="project">■</Glyph>}
        expanded={expanded}
        onToggle={() => setExpanded((open) => !open)}
        selected={selected === "lorebase"}
        onSelect={() => setSelected("lorebase")}
      />
      {expanded && (
        <>
          <Row
            depth={1}
            label="shell"
            glyph={<Glyph tone="shell">●</Glyph>}
            selected={selected === "shell"}
            onSelect={() => setSelected("shell")}
          />
          <Row
            depth={1}
            label="teste-prd"
            glyph={<Glyph tone="worktree">◇</Glyph>}
            expanded={false}
            onToggle={() => undefined}
            count={3}
            selected={selected === "teste-prd"}
            onSelect={() => setSelected("teste-prd")}
          />
          <Row
            depth={1}
            label="feat/reconciliacao-de-boot-com-nome-comprido"
            glyph={<Glyph tone="worktree">◇</Glyph>}
            expanded={false}
            onToggle={() => undefined}
            selected={selected === "comprido"}
            onSelect={() => setSelected("comprido")}
          />
          <Row
            depth={1}
            muted
            label="ui-polish"
            glyph={<Glyph tone="warn">⚠</Glyph>}
            meta="ausente"
            expanded={false}
            onToggle={() => undefined}
            selected={selected === "ui-polish"}
            onSelect={() => setSelected("ui-polish")}
          />
        </>
      )}
      <Row
        depth={0}
        emphasis
        muted
        label="graphify-out"
        glyph={<Glyph tone="off">■</Glyph>}
        meta="sem disco"
        expanded={false}
        onToggle={() => undefined}
        selected={selected === "graphify-out"}
        onSelect={() => setSelected("graphify-out")}
      />
    </div>
  );
}

export const Rows: Story = {
  name: "Row",
  render: () => (
    <>
      <p className="sg__note">a árvore da sidebar — nome comprido tem de truncar</p>
      <RowGallery />
    </>
  ),
};

export const Items: Story = {
  name: "Item",
  render: () => (
    <>
      <p className="sg__note">linha de lista do detalhe — o caminho trunca antes do estado</p>
      <Item
        name="claude-code"
        glyph={<Glyph tone="agent">◆</Glyph>}
        detail="claude"
        state={{ label: "running", tone: "running" }}
        age="12 min"
        onSelect={() => undefined}
      />
      <Item
        name="shell"
        glyph={<Glyph tone="shell">●</Glyph>}
        detail="/bin/zsh -l · cwd ~/Documents/GitHub/lorebase"
        state={{ label: "exited (0)", tone: "exited" }}
        age="há 40 min"
        onSelect={() => undefined}
      />
      <Item
        name="feat/reconciliacao-de-boot-com-nome-comprido"
        glyph={<Glyph tone="worktree">◇</Glyph>}
        detail="~/.lumem/worktrees/lorebase/feat/reconciliacao-de-boot-com-nome-comprido"
        state={{ label: "limpa", tone: "clean" }}
        age="↑0 ↓4"
        onSelect={() => undefined}
      />
      <Item
        name="claude-code"
        glyph={<Glyph tone="agent">◆</Glyph>}
        detail="claude"
        state={{ label: "running", tone: "running" }}
        action={
          <Button size="sm" variant="ghost">
            Encerrar
          </Button>
        }
      />
    </>
  ),
};

export const MetaGridDefault: Story = {
  name: "MetaGrid",
  render: () => (
    <MetaGrid
      entries={[
        { label: "caminho", value: "~/.lumem/worktrees/lorebase/teste-prd" },
        {
          label: "branch",
          value: (
            <>
              teste-prd <span className="dim">nasceu de main · 8f3c1de</span>
            </>
          ),
        },
        { label: "criada", value: "hoje, 09:14" },
      ]}
    />
  ),
};

export const MetaGridRecap: Story = {
  name: "MetaGrid — recibo",
  render: () => (
    <>
      <p className="sg__note">a mesma dl, na densidade que se lê</p>
      <MetaGrid
        variant="recap"
        entries={[
          { label: "workspace", value: "pessoal" },
          { label: "agente", value: "claude-agent-acp 0.69.0 · credencial local" },
          { label: "worktree", value: "~/.lumem/worktrees/lorebase/primeira-tarefa" },
        ]}
      />
    </>
  ),
};

export const StepsStory: Story = {
  name: "Steps",
  render: () => (
    <>
      <p className="sg__note">decorativo: a posição também vem em texto</p>
      <Steps steps={["máquina", "agente", "workspace", "projeto", "tarefa"]} current={2} />
    </>
  ),
};

export const CheckRows: Story = {
  name: "CheckRow",
  render: () => (
    <>
      <p className="sg__note">os quatro estados</p>
      <CheckList label="pré-voo de exemplo">
        <CheckRow state="ok" what="git" value="2.45.1 · git worktree disponível" status="ok" />
        <CheckRow state="running" what="node" value="verificando…" status="lendo" />
        <CheckRow state="warn" what="~/.lumem" value="a pasta ainda não existe" status="vai criar" />
        <CheckRow
          state="fail"
          what="claude-agent-acp"
          value="adaptador ACP não está no PATH"
          status="falta"
          action={
            <Button size="sm" variant="ghost">
              verificar
            </Button>
          }
        />
      </CheckList>
    </>
  ),
};

export const Choices: Story = {
  name: "Choice",
  render: () => (
    <ChoiceGroup label="o que abre junto">
      <Choice
        title="Uma sessão do Claude"
        description="Abre a conversa já dentro da worktree, no modo Auto."
        meta="opus[1m] · Auto"
        glyph={<Glyph tone="agent">◆</Glyph>}
        selected
        onSelect={() => {}}
      />
      <Choice
        title="Só a worktree"
        description="Cria a pasta e a branch. Você abre sessão quando quiser."
        glyph={<Glyph tone="shell">●</Glyph>}
        selected={false}
        onSelect={() => {}}
      />
    </ChoiceGroup>
  ),
};

export const CopyCommandStory: Story = {
  name: "CopyCommand",
  render: () => (
    <>
      <p className="sg__note">o daemon nunca roda isto</p>
      <CopyCommand command="npm i -g @agentclientprotocol/claude-agent-acp" />
    </>
  ),
};

export const CoachStory: Story = {
  name: "Coach",
  render: () => (
    <Coach title="a primeira vez que isso aparece" onUnderstood={() => {}} onNever={() => {}}>
      O modo <b>Auto</b> resolve sozinho leitura e escrita dentro da worktree, e para em tudo que
      sai disso.
    </Coach>
  ),
};

export const WizardCardStory: Story = {
  name: "WizardCard",
  render: () => (
    <>
      <p className="sg__note">um passo inteiro</p>
      <div className="wizard">
        <WizardCard
          eyebrow="passo 2 de 5"
          title="Conecte o Claude Code"
          lede="O Lumem conversa com agentes por ACP — o daemon sobe o adaptador como processo."
          footer={
            <>
              <Button variant="primary">
                Testar conexão <span className="kbd">⏎</span>
              </Button>
              <span className="hint">
                <b>esc</b> volta
              </span>
            </>
          }
        >
          <WizardSection title="o que foi encontrado na sua máquina">
            <CheckList label="binários">
              <CheckRow
                state="ok"
                what="claude"
                value="2.0.14 · /opt/homebrew/bin/claude"
                status="ok"
              />
            </CheckList>
          </WizardSection>
        </WizardCard>
      </div>
    </>
  ),
};

export const SectionHeads: Story = {
  name: "SectionHead",
  render: () => (
    <>
      <SectionHead title="Sessões" count="2 · 1 rodando" />
      <SectionHead title="Worktrees" count="3" aside={<Button size="sm">Nova worktree</Button>} />
    </>
  ),
};

export const Banners: Story = {
  name: "Banner",
  render: () => (
    <>
      <Banner tone="info" actions={<Button size="sm">Novo agente aqui</Button>}>
        O buffer continua legível até você fechar a sessão.
      </Banner>
      <Banner tone="warning">
        <strong>3 arquivos modificados.</strong> A remoção apagaria trabalho não commitado.
      </Banner>
      <Banner tone="danger" actions={<Button size="sm">Tentar agora</Button>}>
        <strong>Daemon inacessível.</strong> Tentando reconectar a <code>ws://127.0.0.1:4317</code>.
      </Banner>
      <RawOutput
        label="saída do git"
        lines={[
          "$ git worktree add ~/.lumem/worktrees/lorebase/teste-prd -b teste-prd main",
          "fatal: a branch 'teste-prd' já existe",
          "exit 128",
        ]}
      />
    </>
  ),
};

export const EmptyAndSkeleton: Story = {
  name: "EmptyState e Skeleton",
  render: () => (
    <div className="sg__cols">
      <EmptyState
        title="Nenhum projeto em pessoal"
        action={<Button glyph={<Glyph>＋</Glyph>}>Adicionar projeto</Button>}
      >
        Aponte para a raiz de um repositório git que já está no disco. O Lumem não clona nada.
      </EmptyState>
      <Skeleton />
    </div>
  ),
};

export const CardFieldInput: Story = {
  name: "Card, Field e Input",
  render: () => (
    <div className="sg__cols">
      <Card
        title="Nenhum workspace ainda"
        lede="Um workspace agrupa os projetos que você acompanha junto."
      >
        <Field id="sg-ws" label="Nome">
          <Input id="sg-ws" defaultValue="pessoal" />
        </Field>
        <Button variant="primary">Criar workspace</Button>
      </Card>
      <Card>
        <Field
          id="sg-path"
          label="Caminho do repositório"
          error={
            <>
              Não é a raiz de um repositório git. O <code>.git</code> mais próximo está em{" "}
              <code>~/Documents/GitHub/lorebase</code>.
            </>
          }
        >
          <Input id="sg-path" invalid defaultValue="~/Documents/GitHub/lorebase/docs" />
        </Field>
        <Button size="sm">Usar ~/Documents/GitHub/lorebase</Button>
      </Card>
    </div>
  ),
};

export const TabStrips: Story = {
  name: "TabStrip",
  render: () => (
    <>
      <p className="sg__note">a aba do checkout e as duas ações ficam fixas; o meio rola</p>
      <TabStrip
        label="sessões de teste-prd"
        lead={
          <Tab
            label="teste-prd"
            glyph={<Glyph tone="worktree">◇</Glyph>}
            state="dirty"
            stateLabel="árvore suja · 3 arquivos"
            active
            onSelect={() => undefined}
          />
        }
        action={
          <button type="button" className="tabs-new">
            ＋ nova sessão
          </button>
        }
        end={
          <TabToggle label="a coluna de arquivos" pressed onToggle={() => undefined}>
            ▤
          </TabToggle>
        }
      >
        <Tab
          label="claude-code"
          glyph={<Glyph tone="agent">◆</Glyph>}
          state="running"
          onSelect={() => undefined}
          onClose={() => undefined}
        />
        <Tab
          label="claude-code"
          ordinal={2}
          glyph={<Glyph tone="agent">◆</Glyph>}
          state="running"
          onSelect={() => undefined}
          onClose={() => undefined}
        />
        <Tab
          label="shell"
          glyph={<Glyph tone="shell">●</Glyph>}
          state="running"
          onSelect={() => undefined}
          onClose={() => undefined}
        />
        {/* Sessão encerrada trazida de volta pra leitura: o ponto diz como
            terminou, a nota diz que não é trabalho vivo. */}
        <Tab
          label="shell"
          glyph={<Glyph tone="shell">●</Glyph>}
          state="failed"
          note="registro"
          onSelect={() => undefined}
          onClose={() => undefined}
        />
      </TabStrip>

      <TabStrip
        label="worktree sem sessão"
        lead={<Tab label="contexto" active onSelect={() => undefined} />}
        action={
          <button type="button" className="tabs-new">
            ＋ nova sessão
          </button>
        }
      />
    </>
  ),
};

export const Menus: Story = {
  name: "Menu",
  render: () => (
    <Menu label="nova sessão">
      <MenuItem glyph={<Glyph tone="agent">◆</Glyph>} hint="claude">
        claude-code
      </MenuItem>
      <MenuItem glyph={<Glyph tone="agent">◆</Glyph>} hint="fora do PATH" disabled>
        codex
      </MenuItem>
      <MenuItem glyph={<Glyph tone="shell">●</Glyph>} hint="/bin/zsh -l">
        shell de login
      </MenuItem>
    </Menu>
  ),
};
