#!/usr/bin/env node
/**
 * Verifica um prototipo HTML autocontido.
 *
 *   node verify_prototype.mjs prototipo.html [--out .preview] [--width 1440]
 *
 * Faz duas coisas, e as duas importam:
 *   1. Valida estaticamente que todo var(--x) usado existe, e denuncia valores
 *      literais de cor/espaco fora do bloco de tokens.
 *   2. Renderiza em Chromium e salva um PNG por tela (elementos .screen, ou a
 *      pagina inteira se nao houver).
 *
 * IMPORTANTE: gerar o PNG nao e a verificacao. Depois de rodar, ABRA cada PNG
 * com a ferramenta Read e inspecione: texto cortado, sobreposicao, espacamento
 * fora da escala, contraste ruim, elemento invisivel. Erro de CSS nao aparece
 * lendo codigo.
 *
 * Requer: npx playwright install chromium  (uma vez)
 */
import { readFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const getFlag = (n, d) => {
  const i = args.indexOf('--' + n);
  return i !== -1 && args[i + 1] ? args[i + 1] : d;
};

if (!file) {
  console.error('uso: node verify_prototype.mjs <arquivo.html> [--out .preview] [--width 1440]');
  process.exit(2);
}

const path = resolve(file);
const outDir = resolve(getFlag('out', '.preview'));
const width = parseInt(getFlag('width', '1440'), 10);
const html = readFileSync(path, 'utf8');

let failed = false;

// ---------------------------------------------------------------- 1. estatico
console.log('='.repeat(64));
console.log('VALIDACAO ESTATICA');
console.log('='.repeat(64));

const defined = new Set([...html.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]));
const inline = new Set([...html.matchAll(/style="[^"]*?(--[a-zA-Z0-9-]+)\s*:/g)].map((m) => m[1]));
const used = new Set([...html.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)/g)].map((m) => m[1]));
const missing = [...used].filter((v) => !defined.has(v) && !inline.has(v));

console.log(`  variaveis definidas : ${defined.size}`);
console.log(`  variaveis usadas    : ${used.size}`);
if (missing.length) {
  failed = true;
  console.log(`  X  QUEBRADAS (${missing.length}): ${missing.join(', ')}`);
} else {
  console.log('  OK  toda var() resolve');
}

// literais fora do bloco de tokens: pega o CSS depois do ultimo '--...-1000:' etc.
// heuristica simples: analisa apenas regras que nao estao dentro de :root
const outsideRoot = html.replace(/:root\s*\{[\s\S]*?\n\}/g, '');
const hexes = [...outsideRoot.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((m) => m[0]);
const pxs = [...outsideRoot.matchAll(/(?<![-\w])(\d{2,})px/g)]
  .map((m) => m[0])
  .filter((v) => parseInt(v) > 2);

if (hexes.length) {
  failed = true;
  console.log(`  X  cor literal fora dos tokens (${hexes.length}): ${[...new Set(hexes)].slice(0, 8).join(', ')}`);
} else {
  console.log('  OK  nenhuma cor literal fora do bloco de tokens');
}
if (pxs.length) {
  console.log(`  !   ${pxs.length} valores px literais — confirme se sao intencionais: ${[...new Set(pxs)].slice(0, 10).join(', ')}`);
} else {
  console.log('  OK  nenhum px literal suspeito');
}

// ---------------------------------------------------------------- 2. render
console.log('\n' + '='.repeat(64));
console.log('RENDERIZACAO');
console.log('='.repeat(64));

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  console.log('  !   playwright ausente. Instale com:  npm i -D playwright && npx playwright install chromium');
  console.log('      (validacao estatica acima continua valida)');
  process.exit(failed ? 1 : 0);
}

mkdirSync(outDir, { recursive: true });

const launchOpts = {};
if (existsSync('/opt/pw-browsers/chromium')) launchOpts.executablePath = '/opt/pw-browsers/chromium';

const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: 2 });

const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto('file://' + path);
await page.waitForTimeout(400);

const stem = basename(path).replace(/\.html?$/, '');
const tabs = await page.$$('.tab');
const shots = [];

if (tabs.length) {
  for (let i = 0; i < tabs.length; i++) {
    const label = (await tabs[i].innerText()).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await tabs[i].click();
    await page.waitForTimeout(300);
    const out = `${outDir}/${stem}-${i + 1}-${label}.png`;
    await page.screenshot({ path: out, fullPage: true });
    shots.push(out);
  }
} else {
  const out = `${outDir}/${stem}.png`;
  await page.screenshot({ path: out, fullPage: true });
  shots.push(out);
}

await browser.close();

shots.forEach((s) => console.log('  gerado: ' + s));
if (errors.length) {
  failed = true;
  console.log(`  X  ${errors.length} erro(s) de console/JS:`);
  errors.slice(0, 5).forEach((e) => console.log('     ' + e));
} else {
  console.log('  OK  sem erro de console');
}

console.log('\n' + '='.repeat(64));
console.log('AGORA LEIA OS PNG COM A FERRAMENTA Read E INSPECIONE DE VERDADE.');
console.log('Procure: texto cortado ou sobreposto, espacamento fora da escala,');
console.log('contraste ruim em uso real, alinhamento quebrado, elemento invisivel.');
console.log('Gerar a imagem nao e verificar. Olhar e.');
console.log('='.repeat(64));

process.exit(failed ? 1 : 0);
