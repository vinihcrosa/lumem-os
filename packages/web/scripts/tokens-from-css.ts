/**
 * `tokens.css` → `tokens.ts`.
 *
 * O design é feito no Open Design, e `tokens.css` chega de lá pelo `design:sync`. Só
 * que CSS não serve para o tema do `xterm`, do CodeMirror e do Shiki: os três precisam
 * do hexadecimal em JavaScript, e `var(--token)` não é um valor que eles saibam ler.
 *
 * Então `tokens.ts` é **derivado**, e derivado é diferente de gerado: nada aqui decide
 * cor nenhuma. A transformação é mecânica e sem perda — os semânticos do CSS apontam
 * para primitiva por `var(--fam-degrau)`, que é exatamente a indireção que o TypeScript
 * reproduz —, e um teste do gate confere que o arquivo commitado é o que esta função
 * produz. Se divergir, alguém editou o derivado à mão.
 */

/** Famílias de primitiva, na ordem em que o CSS as declara. */
const FAMILIES = ["brand", "accent", "neutral", "success", "warning", "danger", "info"] as const;

export const DERIVED_HEADER =
  "// Design tokens — DERIVADO de tokens.css por scripts/design-sync.ts. Nao edite a mao.";

interface Parsed {
  primitives: Map<string, Map<string, string>>;
  /** `[{ comment }] | [{ token, family, step }]`, na ordem do arquivo. */
  colors: ({ comment: string } | { token: string; family: string; step: string })[];
  space: [string, number][];
  radius: [string, number][];
  size: [string, number][];
}

/**
 * O nome do token, de volta ao vocabulário do design.
 *
 * `--color-bg-brand-hover` é `bg/brand-hover`: a barra separa o **grupo** do resto, e o
 * grupo é sempre o primeiro segmento. Todos os 98 semânticos têm exatamente uma barra,
 * o que é o que torna a volta possível sem tabela.
 */
function slashed(name: string): string {
  const cut = name.indexOf("-");
  return cut === -1 ? name : `${name.slice(0, cut)}/${name.slice(cut + 1)}`;
}

function parse(css: string): Parsed {
  const out: Parsed = {
    primitives: new Map(FAMILIES.map((family) => [family, new Map()])),
    colors: [],
    space: [],
    radius: [],
    size: [],
  };

  // Só o bloco `:root` de cima. Um `@media` de tema, se um dia existir, redefine
  // token — e redefinição não é declaração: quem lê daqui quer o valor base.
  const root = css.slice(css.indexOf(":root {"), css.indexOf("\n}"));
  let inSemantic = false;

  for (const raw of root.split("\n")) {
    const line = raw.trim();

    if (line.startsWith("/* ----------")) {
      inSemantic = line.includes("semantica");
      continue;
    }
    // Comentário de grupo dentro dos semânticos: viaja para o TypeScript, porque é
    // ele que faz uma lista de 98 nomes ser legível.
    if (inSemantic && line.startsWith("/*")) {
      out.colors.push({ comment: line.replace(/^\/\*\s*/, "").replace(/\s*\*\/$/, "") });
      continue;
    }

    const primitive = /^--([a-z]+)-(\d+):\s*(#[0-9A-F]{6});$/.exec(line);
    if (primitive) {
      out.primitives.get(primitive[1]!)?.set(primitive[2]!, primitive[3]!);
      continue;
    }

    const semantic = /^--color-([a-z0-9-]+):\s*var\(--([a-z]+)-(\d+)\);$/.exec(line);
    if (semantic) {
      out.colors.push({ token: slashed(semantic[1]!), family: semantic[2]!, step: semantic[3]! });
      continue;
    }

    const scalar = /^--(space|radius|size)-([a-z0-9-]+):\s*(-?\d+)px;$/.exec(line);
    if (scalar) {
      const bucket = scalar[1] as "space" | "radius" | "size";
      const name = bucket === "size" ? slashed(scalar[2]!) : scalar[2]!;
      out[bucket].push([name, Number(scalar[3])]);
    }
  }

  return out;
}

/** O arquivo inteiro, como texto. */
export function tokensTsFromCss(css: string): string {
  const parsed = parse(css);
  const lines: string[] = [DERIVED_HEADER, "", "export const primitives = {"];

  for (const family of FAMILIES) {
    const steps = parsed.primitives.get(family)!;
    const body = [...steps].map(([step, hex]) => `'${step}': '${hex}'`).join(", ");
    lines.push(`  ${family}: { ${body} },`);
  }
  lines.push("} as const", "", "export const color = {");

  for (const entry of parsed.colors) {
    if ("comment" in entry) {
      lines.push(`  // ${entry.comment}`);
      continue;
    }
    const hex = parsed.primitives.get(entry.family)!.get(entry.step)!;
    lines.push(`  '${entry.token}': primitives.${entry.family}['${entry.step}'], // ${hex}`);
  }
  lines.push("} as const", "");

  const scalar = (name: string, entries: [string, number][]): string =>
    `export const ${name} = { ${entries.map(([k, v]) => `'${k}': ${v}`).join(", ")} } as const`;

  lines.push(scalar("space", parsed.space));
  lines.push(scalar("radius", parsed.radius));
  lines.push(scalar("size", parsed.size));
  lines.push("", "export type ColorToken = keyof typeof color", "");

  return lines.join("\n");
}
