/**
 * Desenha as imagens do app, sem dependência: um PNG é um cabeçalho, um `IDAT` deflado e
 * um `IEND`, e o `node:zlib` já sabe as duas contas que faltam (`deflateSync`, `crc32`).
 *
 *     pnpm --filter @lumem/desktop exec tsx build-icons.ts
 *
 * As imagens vão versionadas em `assets/`; este arquivo é como elas nascem, e a razão de
 * ninguém precisar de um editor de imagem para mudar uma.
 *
 * Quatro estados, quatro **formas** — e não cores —, para o ícone dizer o estado também a
 * quem não distingue cor e ao macOS, que pinta os modelos de claro ou de escuro:
 *
 *   running    disco cheio
 *   stopped    anel vazio
 *   update     disco com uma seta para cima recortada
 *   attention  disco com uma exclamação recortada
 *
 * O macOS usa as quatro em preto, como *template*; o Linux, que não tem quem as inverta,
 * usa cópias cinza-médio (legíveis em painel claro e escuro), com o âmbar e o azul só onde a
 * pessoa precisa olhar.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { crc32, deflateSync } from "node:zlib";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type Shape = (x: number, y: number) => boolean;
type Rgb = readonly [number, number, number];

const disc: Shape = (x, y) => (x - 0.5) ** 2 + (y - 0.5) ** 2 <= 0.42 ** 2;
const ring: Shape = (x, y) => {
  const d = (x - 0.5) ** 2 + (y - 0.5) ** 2;
  return d <= 0.42 ** 2 && d >= 0.29 ** 2;
};
const rect = (x0: number, y0: number, x1: number, y1: number): Shape => (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1;
const triangle =
  (ax: number, ay: number, bx: number, by: number, cx: number, cy: number): Shape =>
  (x, y) => {
    const side = (px: number, py: number, qx: number, qy: number) => (x - qx) * (py - qy) - (px - qx) * (y - qy);
    const d1 = side(ax, ay, bx, by);
    const d2 = side(bx, by, cx, cy);
    const d3 = side(cx, cy, ax, ay);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0));
  };
const dot = (cx: number, cy: number, r: number): Shape => (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r ** 2;
const cut = (base: Shape, ...holes: Shape[]): Shape => (x, y) => base(x, y) && !holes.some((hole) => hole(x, y));

const STATES: Record<string, { shape: Shape; linux: Rgb }> = {
  running: { shape: disc, linux: [122, 122, 122] },
  stopped: { shape: ring, linux: [122, 122, 122] },
  update: {
    shape: cut(disc, triangle(0.5, 0.24, 0.3, 0.5, 0.7, 0.5), rect(0.43, 0.5, 0.57, 0.74)),
    linux: [74, 144, 217],
  },
  attention: {
    shape: cut(disc, rect(0.44, 0.24, 0.56, 0.58), dot(0.5, 0.71, 0.075)),
    linux: [224, 160, 48],
  },
};

const SUPERSAMPLE = 4;

function render(size: number, shape: Shape, rgb: Rgb): Buffer {
  const pixels = Buffer.alloc(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      let inside = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          if (shape((px + (sx + 0.5) / SUPERSAMPLE) / size, (py + (sy + 0.5) / SUPERSAMPLE) / size)) inside += 1;
        }
      }
      const offset = (py * size + px) * 4;
      pixels[offset] = rgb[0];
      pixels[offset + 1] = rgb[1];
      pixels[offset + 2] = rgb[2];
      pixels[offset + 3] = Math.round((inside / (SUPERSAMPLE * SUPERSAMPLE)) * 255);
    }
  }
  return pixels;
}

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const out = Buffer.alloc(body.length + 8);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), body.length + 4);
  return out;
}

function png(size: number, rgba: Buffer): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits por canal
  header[9] = 6; // RGBA
  const rows = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y += 1) rgba.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/** O ícone do app: um quadrado de cantos redondos, escuro, com o disco claro no meio. */
const appIcon: Shape = (x, y) => {
  const radius = 0.22;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
};

const here = dirname(fileURLToPath(import.meta.url));
const assets = join(here, "assets");
mkdirSync(assets, { recursive: true });

for (const [state, { shape, linux }] of Object.entries(STATES)) {
  writeFileSync(join(assets, `tray-${state}.png`), png(18, render(18, shape, [0, 0, 0])));
  writeFileSync(join(assets, `tray-${state}@2x.png`), png(36, render(36, shape, [0, 0, 0])));
  writeFileSync(join(assets, `tray-${state}-linux.png`), png(24, render(24, shape, linux)));
}

// O disco claro sobre o fundo escuro: dois desenhos, um por cor, somados pixel a pixel.
const back = render(512, appIcon, [27, 27, 31]);
const shrunk = (x: number, y: number): boolean => disc(0.5 + (x - 0.5) / 0.62, 0.5 + (y - 0.5) / 0.62);
const emblem = render(512, shrunk, [240, 240, 240]);
for (let i = 0; i < back.length; i += 4) {
  const a = (emblem[i + 3] ?? 0) / 255;
  for (let c = 0; c < 3; c += 1) back[i + c] = Math.round((back[i + c] ?? 0) * (1 - a) + (emblem[i + c] ?? 0) * a);
}
writeFileSync(join(assets, "icon.png"), png(512, back));
console.log(`escrito em ${assets}`);
