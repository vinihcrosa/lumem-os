import { useState } from "react";

import {
  Banner,
  Button,
  Card,
  Chip,
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
  Tab,
  TabStrip,
} from "./index.js";
import "./styleguide.css";

/**
 * Every primitive in every state, on one page.
 *
 * This exists because a wrong primitive contaminates six screens at once, and
 * finding that out one screen at a time costs six times as much. Mounted only
 * in development — see open-questions Q11.
 *
 * The data is fake but plausible on purpose: a primitive that only ever saw
 * "Item 1" has never been asked what it does with a branch name that does not
 * fit.
 */
export function Styleguide() {
  const [expanded, setExpanded] = useState(true);
  const [selected, setSelected] = useState("teste-prd");

  return (
    <div className="sg">
      <h1 className="sg__title">Primitivas</h1>
      <p className="sg__lede">
        Cada bloco em cada estado. Se algo aqui está errado, está errado em todas as telas.
      </p>

      <Section title="Glyph">
        <div className="sg__inline">
          <Glyph tone="workspace">◈</Glyph>
          <Glyph tone="project">■</Glyph>
          <Glyph tone="worktree">◇</Glyph>
          <Glyph tone="shell">●</Glyph>
          <Glyph tone="agent">◆</Glyph>
          <Glyph tone="warn">⚠</Glyph>
          <Glyph tone="off">■</Glyph>
        </div>
      </Section>

      <Section title="Button">
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
      </Section>

      <Section title="Chip">
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
      </Section>

      <Section title="Row" note="a árvore da sidebar — nome comprido tem de truncar">
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
      </Section>

      <Section title="Item" note="linha de lista do detalhe — o caminho trunca antes do estado">
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
      </Section>

      <Section title="MetaGrid">
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
      </Section>

      <Section title="SectionHead">
        <SectionHead title="Sessões" count="2 · 1 rodando" />
        <SectionHead title="Worktrees" count="3" aside={<Button size="sm">Nova worktree</Button>} />
      </Section>

      <Section title="Banner">
        <Banner tone="info" actions={<Button size="sm">Novo agente aqui</Button>}>
          O buffer continua legível até você fechar a sessão.
        </Banner>
        <Banner tone="warning">
          <strong>3 arquivos modificados.</strong> A remoção apagaria trabalho não commitado.
        </Banner>
        <Banner tone="danger" actions={<Button size="sm">Tentar agora</Button>}>
          <strong>Daemon inacessível.</strong> Tentando reconectar a{" "}
          <code>ws://127.0.0.1:4317</code>.
        </Banner>
        <RawOutput
          label="saída do git"
          lines={[
            "$ git worktree add ~/.lumem/worktrees/lorebase/teste-prd -b teste-prd main",
            "fatal: a branch 'teste-prd' já existe",
            "exit 128",
          ]}
        />
      </Section>

      <Section title="EmptyState e Skeleton">
        <div className="sg__cols">
          <EmptyState
            title="Nenhum projeto em pessoal"
            action={<Button glyph={<Glyph>＋</Glyph>}>Adicionar projeto</Button>}
          >
            Aponte para a raiz de um repositório git que já está no disco. O Lumem não clona nada.
          </EmptyState>
          <Skeleton />
        </div>
      </Section>

      <Section title="Card, Field e Input">
        <div className="sg__cols">
          <Card title="Nenhum workspace ainda" lede="Um workspace agrupa os projetos que você acompanha junto.">
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
      </Section>

      <Section title="TabStrip" note="a aba de contexto e a ação ficam fixas; o meio rola">
        <TabStrip
          label="sessões de teste-prd"
          lead={<Tab label="contexto" active onSelect={() => undefined} />}
          action={<button type="button" className="tabs-new">＋ nova sessão</button>}
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
        </TabStrip>

        <TabStrip
          label="worktree sem sessão"
          lead={<Tab label="contexto" active onSelect={() => undefined} />}
          action={<button type="button" className="tabs-new">＋ nova sessão</button>}
        />
      </Section>

      <Section title="Menu">
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
      </Section>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="sg__section">
      <h2 className="sg__heading">
        {title}
        {note !== undefined && <span className="sg__note">{note}</span>}
      </h2>
      <div className="sg__body">{children}</div>
    </section>
  );
}
