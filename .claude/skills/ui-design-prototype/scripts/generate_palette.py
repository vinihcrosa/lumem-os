#!/usr/bin/env python3
"""
Gera design tokens a partir de uma especificacao em OKLCH e valida contraste WCAG.

Por que OKLCH: e perceptualmente uniforme, entao uma escala de luminosidade
compartilhada produz degraus com o mesmo peso visual em qualquer matiz. Rampas
escolhidas a olho nao tem essa propriedade.

Uso:
    python3 generate_palette.py                 # imprime relatorio e escreve os arquivos
    python3 generate_palette.py --check         # so valida, nao escreve (bom para CI)
    python3 generate_palette.py --out src/styles

Edite o bloco CONFIG. O resto do arquivo nao precisa mudar.
Sem dependencias: apenas biblioteca padrao.
"""
import argparse
import json
import math
import os
import sys

# ============================================================================
# CONFIG — edite daqui
# ============================================================================

# Escala de luminosidade compartilhada por TODAS as rampas.
# Calibrada para que: 600 sobre branco >= 4.5:1 (botao com label branco),
# 500 sobre branco >= 3:1 (texto terciario), 400 sobre fundo escuro >= 4.5:1.
STEPS   = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
L_SCALE = [0.978, 0.951, 0.902, 0.843, 0.765, 0.658, 0.556, 0.468, 0.388, 0.303, 0.237]
# Multiplicador de cromia: pico no meio da rampa, cai nas pontas (claros e
# escuros saturados demais parecem sujos).
C_MULT  = [0.13, 0.24, 0.45, 0.68, 0.88, 1.00, 0.97, 0.86, 0.72, 0.55, 0.42]

# nome -> (matiz em graus, cromia de pico)
RAMPS = {
    "brand":   (272.0, 0.196),
    "accent":  ( 72.0, 0.166),
    "neutral": (272.0, 0.016),   # cinza levemente tingido com a marca: da coesao
    "success": (152.0, 0.148),
    "warning": ( 78.0, 0.166),
    "danger":  ( 26.0, 0.192),
    "info":    (238.0, 0.170),
}

# Degraus extras de cinza para interface escura. Numero MAIOR = MAIS ESCURO.
# Precisa de degraus finos para separar base/painel/cartao/input sem borda.
DARK_LADDER = {
    "925": 0.270,   # borda forte
    "960": 0.213,   # borda sutil
    "970": 0.192,   # input, hover de superficie
    "980": 0.172,   # cartao, superficie elevada
    "990": 0.153,   # painel, sidebar
    "1000": 0.134,  # fundo raiz
}

DARK_FIRST = True   # False = tema claro como padrao

# Camada semantica: (token, primitiva). Componente le SO daqui.
SEMANTIC = [
    ("superficies", [
        ("bg/base", "neutral/1000"), ("bg/panel", "neutral/990"),
        ("bg/surface", "neutral/980"), ("bg/raised", "neutral/970"),
        ("bg/inset", "neutral/1000"), ("bg/hover", "neutral/960"),
        ("bg/active", "neutral/925"), ("bg/selected", "brand/950"),
    ]),
    ("marca", [
        ("bg/brand", "brand/500"), ("bg/brand-hover", "brand/400"),
        ("bg/brand-subtle", "brand/950"), ("bg/brand-muted", "brand/900"),
    ]),
    ("fundos de status", [
        ("bg/success-subtle", "success/950"), ("bg/warning-subtle", "warning/950"),
        ("bg/danger-subtle", "danger/950"), ("bg/info-subtle", "info/950"),
        ("bg/neutral-subtle", "neutral/925"),
    ]),
    ("texto", [
        ("text/primary", "neutral/50"), ("text/secondary", "neutral/400"),
        ("text/tertiary", "neutral/500"), ("text/disabled", "neutral/700"),
        ("text/inverse", "neutral/1000"), ("text/on-brand", "neutral/1000"),
        ("text/brand", "brand/400"), ("text/link", "brand/400"),
        ("text/code", "neutral/300"), ("text/success", "success/400"),
        ("text/warning", "warning/400"), ("text/danger", "danger/400"),
        ("text/info", "info/400"),
    ]),
    ("bordas", [
        ("border/subtle", "neutral/960"), ("border/default", "neutral/925"),
        ("border/strong", "neutral/800"), ("border/brand", "brand/500"),
        ("border/danger", "danger/500"), ("border/focus", "brand/400"),
    ]),
    # ---- TOKENS DE DOMINIO: substitua pelos conceitos do SEU produto ----
    ("dominio", [
        ("status/running", "success/400"), ("status/waiting", "warning/400"),
        ("status/error", "danger/400"), ("status/queued", "info/400"),
        ("status/idle", "neutral/500"), ("status/stopped", "neutral/600"),
    ]),
]

# Ancora de densidade: altura da linha de lista. Derive o resto dela.
ROW_HEIGHT = 28

SPACING = [0, 1, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64]  # nome = valor em px
RADIUS  = [("none", 0), ("xs", 2), ("sm", 4), ("md", 6),
           ("lg", 8), ("xl", 12), ("2xl", 16), ("full", 9999)]
SIZING  = [
    ("control/xs", 20), ("control/sm", 24), ("control/md", ROW_HEIGHT),
    ("control/lg", 32), ("control/xl", 40),
    ("icon/xs", 12), ("icon/sm", 14), ("icon/md", 16), ("icon/lg", 20),
    ("row/compact", ROW_HEIGHT), ("row/cozy", ROW_HEIGHT + 4),
    ("target/min", 24),
]
BORDER_WIDTH = [("none", 0), ("thin", 1), ("thick", 2), ("focus", 2)]

FONT_SANS = 'Inter, ui-sans-serif, system-ui, sans-serif'
FONT_MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace'

# nome, tamanho, altura de linha, tracking em em, peso, mono?
TYPE = [
    ("display-lg", 28, 34, -0.020, 600, False),
    ("display-md", 22, 28, -0.015, 600, False),
    ("heading-lg", 18, 24, -0.010, 600, False),
    ("heading-md", 15, 20, -0.005, 600, False),
    ("heading-sm", 13, 18,  0.000, 600, False),
    ("body-lg",    14, 20,  0.000, 400, False),
    ("body-md",    13, 18,  0.000, 400, False),   # base
    ("body-sm",    12, 16,  0.000, 400, False),
    ("label-md",   13, 16,  0.000, 500, False),
    ("label-sm",   12, 16,  0.000, 500, False),
    ("label-xs",   11, 14,  0.015, 500, False),
    ("caption",    11, 14,  0.000, 400, False),
    ("mono-lg",    13, 20,  0.000, 400, True),
    ("mono-md",    12, 18,  0.000, 400, True),
    ("mono-sm",    11, 16,  0.000, 400, True),
]

# Sombras: mais opacas que no tema claro, senao somem sobre fundo escuro.
ELEVATION = {
    "sm": "0 1px 2px 0 rgb(0 0 0 / 0.32)",
    "md": "0 2px 4px -1px rgb(0 0 0 / 0.34), 0 4px 8px -2px rgb(0 0 0 / 0.30)",
    "lg": "0 4px 8px -2px rgb(0 0 0 / 0.38), 0 12px 24px -4px rgb(0 0 0 / 0.36)",
    "xl": "0 8px 16px -4px rgb(0 0 0 / 0.42), 0 24px 48px -8px rgb(0 0 0 / 0.44)",
}

# Pares REAIS de uso. Adicione um par aqui sempre que introduzir uma combinacao
# nova na interface. (rotulo, token de frente, token de fundo, minimo)
CONTRAST_CHECKS = [
    ("texto primario / superficie",   "text/primary",   "bg/surface", 4.5),
    ("texto secundario / superficie", "text/secondary", "bg/surface", 4.5),
    ("texto terciario / superficie",  "text/tertiary",  "bg/surface", 3.0),
    ("texto primario / fundo",        "text/primary",   "bg/base",    4.5),
    ("texto secundario / fundo",      "text/secondary", "bg/base",    4.5),
    ("label do botao / botao",        "text/on-brand",  "bg/brand",   4.5),
    ("link / fundo",                  "text/link",      "bg/base",    4.5),
    ("texto de codigo / inset",       "text/code",      "bg/inset",   4.5),
    ("erro / superficie",             "text/danger",    "bg/surface", 4.5),
    ("sucesso / superficie",          "text/success",   "bg/surface", 4.5),
    ("alerta / superficie",           "text/warning",   "bg/surface", 4.5),
    ("info / superficie",             "text/info",      "bg/surface", 4.5),
    ("status ocioso / superficie",    "status/idle",    "bg/surface", 3.0),
]

# ============================================================================
# fim do CONFIG
# ============================================================================


def oklab_to_linear_srgb(L, a, b):
    l_ = L + 0.3963377774 * a + 0.2158037573 * b
    m_ = L - 0.1055613458 * a - 0.0638541728 * b
    s_ = L - 0.0894841775 * a - 1.2914855480 * b
    l, m, s = l_ ** 3, m_ ** 3, s_ ** 3
    return (+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
            -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
            -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s)


def _linear_to_srgb(c):
    return 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def oklch_to_hex(L, C, H):
    """Reduz a cromia por busca binaria ate a cor caber no gamut sRGB."""
    h = math.radians(H)
    lo, hi, best = 0.0, C, (0.0, 0.0, 0.0)
    for _ in range(64):
        mid = (lo + hi) / 2
        lin = oklab_to_linear_srgb(L, mid * math.cos(h), mid * math.sin(h))
        if all(-1e-4 <= c <= 1 + 1e-4 for c in lin):
            best, lo = lin, mid
        else:
            hi = mid
    r, g, b = (min(1, max(0, _linear_to_srgb(c))) for c in best)
    return "#%02X%02X%02X" % (round(r * 255), round(g * 255), round(b * 255))


def relative_luminance(hex_color):
    h = hex_color.lstrip("#")
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (f(int(h[i:i + 2], 16)) for i in (0, 2, 4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def contrast_ratio(fg, bg):
    a, b = relative_luminance(fg), relative_luminance(bg)
    lo, hi = min(a, b), max(a, b)
    return (hi + 0.05) / (lo + 0.05)


def build_palette():
    p = {}
    for name, (hue, cpeak) in RAMPS.items():
        p[name] = {str(step): oklch_to_hex(L_SCALE[i], cpeak * C_MULT[i], hue)
                   for i, step in enumerate(STEPS)}
    p["neutral"]["0"] = "#FFFFFF"
    for step, L in DARK_LADDER.items():
        p["neutral"][step] = oklch_to_hex(L, RAMPS["neutral"][1] * 0.8, RAMPS["neutral"][0])
    return p


def resolve(palette, primitive):
    ramp, step = primitive.split("/")
    return palette[ramp][step]


def check_monotonic(palette):
    """Numero maior deve ser sempre mais escuro. Quebra aqui envenena o resto."""
    steps = sorted(palette["neutral"], key=lambda s: int(s))
    problems, prev = [], None
    for s in steps:
        y = relative_luminance(palette["neutral"][s])
        if prev is not None and y >= prev:
            problems.append(f"neutral/{s} nao e mais escuro que o degrau anterior")
        prev = y
    return problems


def check_contrast(palette):
    sem = {name: target for _, group in SEMANTIC for name, target in group}
    rows, failures = [], []
    for label, fg_tok, bg_tok, minimum in CONTRAST_CHECKS:
        if fg_tok not in sem or bg_tok not in sem:
            failures.append((label, 0.0, minimum, "token inexistente"))
            continue
        fg, bg = resolve(palette, sem[fg_tok]), resolve(palette, sem[bg_tok])
        ratio = contrast_ratio(fg, bg)
        ok = ratio >= minimum
        grade = "AAA" if ratio >= 7 else "AA" if ratio >= 4.5 else "AA-large" if ratio >= 3 else "reprovado"
        rows.append((ok, label, ratio, minimum, grade))
        if not ok:
            failures.append((label, ratio, minimum, ""))
    return rows, failures


def css_var(figma_name, prefix=""):
    return "--" + (prefix + figma_name).replace("/", "-").lower()


def emit_css(palette):
    o = ["/* Design tokens — GERADO por scripts/generate_palette.py. Nao edite a mao. */",
         "/* Rampas em OKLCH, contraste WCAG validado na geracao. */", "", ":root {",
         "  /* ---------- primitivas — nunca use direto em componente ---------- */"]
    for ramp in palette:
        o.append(f"  /* {ramp} */")
        for step in sorted(palette[ramp], key=lambda s: int(s)):
            o.append(f"  --{ramp}-{step}: {palette[ramp][step]};")
    o += ["", "  /* ---------- semantica — use estas ---------- */"]
    for group, tokens in SEMANTIC:
        o.append(f"  /* {group} */")
        for name, target in tokens:
            o.append(f"  {css_var(name, 'color-')}: var(--{target.replace('/', '-')});")
    o += ["", "  /* ---------- espacamento (nome = valor em px) ---------- */"]
    o += [f"  --space-{v}: {v}px;" for v in SPACING]
    o += ["", "  /* ---------- raio ---------- */"]
    o += [f"  --radius-{n}: {v}px;" for n, v in RADIUS]
    o += ["", "  /* ---------- dimensoes ---------- */"]
    o += [f"  --size-{n.replace('/', '-')}: {v}px;" for n, v in SIZING]
    o += [f"  --border-width-{n}: {v}px;" for n, v in BORDER_WIDTH]
    o += ["", "  /* ---------- tipografia ---------- */",
          f"  --font-family-sans: {FONT_SANS};",
          f"  --font-family-mono: {FONT_MONO};"]
    for name, size, lh, tracking, weight, mono in TYPE:
        fam = "var(--font-family-mono)" if mono else "var(--font-family-sans)"
        o.append(f"  --text-{name}: {weight} {size}px/{lh}px {fam};")
        if tracking:
            o.append(f"  --tracking-{name}: {tracking}em;")
    o += ["", "  /* ---------- elevacao ---------- */"]
    o += [f"  --elevation-{k}: {v};" for k, v in ELEVATION.items()]
    o += ["  --focus-ring: 0 0 0 1px var(--color-bg-base), 0 0 0 3px var(--color-border-focus);",
          "}", "",
          "/* Anel de foco padrao — aplique em todo alvo interativo */",
          ".focus-ring:focus-visible { outline: none; box-shadow: var(--focus-ring); }"]
    return "\n".join(o) + "\n"


def emit_ts(palette):
    o = ["// Design tokens — GERADO por scripts/generate_palette.py. Nao edite a mao.", "",
         "export const primitives = {"]
    for ramp in palette:
        entries = ", ".join(f"'{s}': '{palette[ramp][s]}'"
                            for s in sorted(palette[ramp], key=lambda x: int(x)))
        o.append(f"  {ramp}: {{ {entries} }},")
    o += ["} as const", "", "export const color = {"]
    for group, tokens in SEMANTIC:
        o.append(f"  // {group}")
        for name, target in tokens:
            ramp, step = target.split("/")
            o.append(f"  '{name}': primitives.{ramp}['{step}'], // {resolve(palette, target)}")
    o += ["} as const", "",
          "export const space = { " + ", ".join(f"'{v}': {v}" for v in SPACING) + " } as const",
          "export const radius = { " + ", ".join(f"'{n}': {v}" for n, v in RADIUS) + " } as const",
          "export const size = { " + ", ".join(f"'{n}': {v}" for n, v in SIZING) + " } as const",
          "", "export type ColorToken = keyof typeof color"]
    return "\n".join(o) + "\n"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=".", help="diretorio de saida")
    ap.add_argument("--check", action="store_true", help="so valida, nao escreve")
    args = ap.parse_args()

    palette = build_palette()

    print("=" * 70)
    print("RAMPAS")
    print("=" * 70)
    for ramp in palette:
        shown = [s for s in ["50", "200", "400", "500", "600", "700", "900"] if s in palette[ramp]]
        print(f"  {ramp:<9} " + "  ".join(f"{s}:{palette[ramp][s]}" for s in shown))

    mono_problems = check_monotonic(palette)
    rows, failures = check_contrast(palette)

    print("\n" + "=" * 70)
    print("CONTRASTE WCAG (pares reais de uso)")
    print("=" * 70)
    for ok, label, ratio, minimum, grade in rows:
        print(f"{'OK ' if ok else 'X  '} {label:<34} {ratio:5.2f}:1  min {minimum}  [{grade}]")

    print("\n" + "=" * 70)
    print("ESCADA DE CINZAS (numero maior deve ser mais escuro)")
    print("=" * 70)
    if mono_problems:
        for p in mono_problems:
            print("  X  " + p)
    else:
        print("  OK  monotonica")

    if failures or mono_problems:
        print(f"\nREPROVADO: {len(failures)} contraste(s), {len(mono_problems)} de escala.")
        print("Ajuste L_SCALE / C_MULT / DARK_LADDER no CONFIG e rode de novo.")
        print("NAO siga para o prototipo com reprovacao.")
        sys.exit(1)

    print(f"\nTUDO APROVADO — {len(rows)} pares de contraste, escala monotonica.")

    if args.check:
        print("(--check: nada foi escrito)")
        return

    os.makedirs(args.out, exist_ok=True)
    css_path = os.path.join(args.out, "tokens.css")
    ts_path = os.path.join(args.out, "tokens.ts")
    json_path = os.path.join(args.out, "palette.json")
    open(css_path, "w").write(emit_css(palette))
    open(ts_path, "w").write(emit_ts(palette))
    open(json_path, "w").write(json.dumps(palette, indent=2))
    n_sem = sum(len(t) for _, t in SEMANTIC)
    n_prim = sum(len(v) for v in palette.values())
    print(f"\nEscrito: {css_path}, {ts_path}, {json_path}")
    print(f"  {n_prim} primitivas, {n_sem} semanticos, {len(TYPE)} estilos de texto")


if __name__ == "__main__":
    main()
