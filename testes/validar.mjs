/**
 * validar.mjs - checagens estaticas que nao dependem do navegador.
 *
 *   1. sintaxe ESM de todo .js em src/
 *   2. todo import relativo aponta para um arquivo que existe
 *   3. todo caminho citado no manifest.json existe
 *   4. todo modulo carregado dinamicamente esta em web_accessible_resources
 *   5. chaves balanceadas nos .css
 *
 * Rodar:  node testes/validar.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seix-'));
let erros = 0;

const falhar = (rotulo, msg) => {
  erros++;
  console.log(`${rotulo.padEnd(9)}${msg}`);
};

function arquivos(dir, ext, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, ext, saida);
    else if (p.endsWith(ext)) saida.push(p);
  }
  return saida;
}

const rel = (p) => path.relative(raiz, p).split(path.sep).join('/');

// 1. sintaxe
const js = arquivos(path.join(raiz, 'src'), '.js');
for (const f of js) {
  const alvo = path.join(tmp, rel(f).replace(/\//g, '_') + '.mjs');
  fs.copyFileSync(f, alvo);
  try {
    execFileSync(process.execPath, ['--check', alvo], { stdio: 'pipe' });
  } catch (err) {
    falhar('SINTAXE', `${rel(f)}\n${String(err.stderr).trim()}`);
  }
}
console.log(`sintaxe: ${js.length} arquivos .js`);

// 2. imports relativos
let imports = 0;
for (const f of js) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
    imports++;
    if (!fs.existsSync(path.resolve(path.dirname(f), m[1]))) {
      falhar('IMPORT', `${rel(f)} -> ${m[1]} (nao existe)`);
    }
  }
}
console.log(`imports: ${imports} relativos resolvidos`);

// 3. caminhos do manifest
const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
const refs = [];
const colher = (v) => {
  if (typeof v === 'string' && /\.(js|css|html|png)$/.test(v)) refs.push(v);
  else if (Array.isArray(v)) v.forEach(colher);
  else if (v && typeof v === 'object') Object.values(v).forEach(colher);
};
colher(manifest);
for (const r of new Set(refs)) {
  if (r.includes('*')) continue; // padrao glob, nao caminho
  if (!fs.existsSync(path.join(raiz, r))) falhar('MANIFEST', `${r} (nao existe)`);
}
console.log(`manifest: ${new Set(refs).size} caminhos citados`);

// 4. web_accessible_resources
const war = (manifest.web_accessible_resources || []).flatMap((b) => b.resources);
function glob(padrao, texto) {
  const partes = padrao.split('*');
  let i = 0;
  for (let n = 0; n < partes.length; n++) {
    const parte = partes[n];
    if (n === 0) {
      if (!texto.startsWith(parte)) return false;
      i = parte.length;
      continue;
    }
    if (n === partes.length - 1) return texto.length >= i + parte.length && texto.endsWith(parte);
    const achou = texto.indexOf(parte, i);
    if (achou === -1) return false;
    i = achou + parte.length;
  }
  return true;
}
for (const f of js) {
  const caminho = rel(f);
  const precisa = caminho.startsWith('src/content/') || caminho.startsWith('src/shared/');
  if (precisa && !war.some((p) => glob(p, caminho))) {
    falhar('WAR', `${caminho} fora de web_accessible_resources`);
  }
}
console.log('web_accessible_resources: ok');

// 5. css
for (const f of arquivos(path.join(raiz, 'src'), '.css')) {
  const s = fs.readFileSync(f, 'utf8');
  const abre = (s.match(/{/g) || []).length;
  const fecha = (s.match(/}/g) || []).length;
  if (abre !== fecha) falhar('CSS', `${rel(f)}: ${abre} '{' para ${fecha} '}'`);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(erros === 0 ? '\nOK - nenhum problema encontrado' : `\n${erros} problema(s)`);
process.exit(erros ? 1 : 0);
