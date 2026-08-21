import { Fragment, type ReactNode } from "react";

import { parseMarkdown, type Block, type Inline, type ListItem } from "../lib/markdown.js";

/**
 * O markdown de uma mensagem, como árvore de elementos.
 *
 * **Nunca `dangerouslySetInnerHTML`.** O texto vem de um modelo, e é a única
 * coisa nesta interface que chega de fora do produto — por isso ele é parseado
 * (`lib/markdown.ts`) e montado como elementos, em vez de virar HTML colado.
 *
 * A pintura toda mora no `.msg` do Open Design, em seletor de elemento: `h2`,
 * `ul`, `pre`, `table`. Isso é o que faz este componente não ter uma classe
 * própria por nó — a marcação é semântica, e o CSS pinta o que ela significa.
 */

export interface MarkdownProps {
  text: string;
  /**
   * Desenha o caret no fim.
   *
   * Vai **dentro** do último bloco quando ele tem texto, e depois dele quando é
   * cerca, lista ou tabela. Um caret solto embaixo de uma tabela é estranho; um
   * caret que empurra o último parágrafo para uma linha nova é pior.
   */
  streaming?: boolean;
}

export function Markdown({ text, streaming = false }: MarkdownProps) {
  const blocks = parseMarkdown(text);
  const last = blocks.length - 1;
  const caret = <span className="mcaret" aria-hidden="true" />;

  // Sem nada escrito ainda, o caret é a mensagem inteira — é o primeiro sinal de
  // que o turno começou.
  if (blocks.length === 0) return streaming ? <p>{caret}</p> : null;

  return (
    <>
      {blocks.map((block, at) => (
        <Fragment key={at}>{render(block, streaming && at === last ? caret : null)}</Fragment>
      ))}
    </>
  );
}

function render(block: Block, caret: ReactNode): ReactNode {
  switch (block.kind) {
    case "paragraph":
      return (
        <p>
          <Inlines nodes={block.content} />
          {caret}
        </p>
      );

    case "heading": {
      // O nível vem do texto, então ele é limitado aqui: `#######` não existe, e
      // um `h7` seria um elemento que o navegador não conhece.
      const Tag = `h${String(Math.min(block.level, 6))}` as "h1";
      return (
        <Tag>
          <Inlines nodes={block.content} />
          {caret}
        </Tag>
      );
    }

    case "code":
      return (
        <>
          <pre>
            <code {...(block.language === null ? {} : { "data-language": block.language })}>
              {block.text}
            </code>
          </pre>
          {caret}
        </>
      );

    case "quote":
      return (
        <blockquote>
          <Inlines nodes={block.content} />
          {caret}
        </blockquote>
      );

    case "list": {
      const Tag = block.ordered ? "ol" : "ul";
      return (
        <>
          <Tag>
            {block.items.map((item, at) => (
              <Item key={at} item={item} ordered={block.ordered} />
            ))}
          </Tag>
          {caret}
        </>
      );
    }

    case "table":
      return (
        <>
          {/* A rolagem é de um contêiner, e não da tabela: `overflow` numa
              `<table>` não é respeitado do mesmo jeito em todo navegador. */}
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {block.header.map((cell, at) => (
                    <th key={at}>
                      <Inlines nodes={cell} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.rows.map((row, at) => (
                  <tr key={at}>
                    {row.map((cell, column) => (
                      <td key={column}>
                        <Inlines nodes={cell} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {caret}
        </>
      );

    case "rule":
      return (
        <>
          <hr />
          {caret}
        </>
      );
  }
}

function Item({ item, ordered }: { item: ListItem; ordered: boolean }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <li>
      <Inlines nodes={item.content} />
      {item.children.length > 0 && (
        <Tag>
          {item.children.map((child, at) => (
            <Item key={at} item={child} ordered={ordered} />
          ))}
        </Tag>
      )}
    </li>
  );
}

function Inlines({ nodes }: { nodes: readonly Inline[] }) {
  return (
    <>
      {nodes.map((node, at) => (
        <Fragment key={at}>{inline(node)}</Fragment>
      ))}
    </>
  );
}

function inline(node: Inline): ReactNode {
  switch (node.kind) {
    case "text":
      return node.text;
    case "code":
      return <code>{node.text}</code>;
    case "strong":
      return (
        <strong>
          <Inlines nodes={node.children} />
        </strong>
      );
    case "em":
      return (
        <em>
          <Inlines nodes={node.children} />
        </em>
      );
    case "strike":
      return (
        <del>
          <Inlines nodes={node.children} />
        </del>
      );
    case "link":
      /*
       * `noreferrer` e nova aba, e sem exceção para link relativo.
       *
       * O que chega aqui é texto de um modelo: `href` pode ser qualquer coisa, e
       * abrir na própria aba trocaria o app por uma página. O `rel` fecha o
       * `window.opener`, que é a parte que importa quando o destino é remoto.
       */
      return (
        <a href={node.href} target="_blank" rel="noreferrer">
          <Inlines nodes={node.children} />
        </a>
      );
    case "break":
      return <br />;
  }
}
