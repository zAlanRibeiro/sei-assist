/**
 * empacotar.mjs - monta o .zip para enviar à Chrome Web Store.
 *
 * Inclui só o que a extensão precisa para rodar. Testes, documentação e
 * scripts de desenvolvimento ficam de fora: eles não fazem falta ao usuário,
 * aumentam o pacote e dão ao revisor da loja mais superfície para questionar.
 *
 * O zip é escrito por testes/zip.mjs, e não por ferramenta do sistema — o
 * porquê está documentado lá. No fim o pacote é reaberto e conferido: a
 * primeira versão deste script gerou um zip com os 53 arquivos na raiz, onde
 * os vários `index.js` se sobrescreveram, e o defeito só apareceria depois de
 * gastar uma revisão da loja.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { escreverZip, caminhosDoZip } from './zip.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** O que entra no pacote. Lista explícita, nunca "tudo menos". */
const INCLUIR = ['manifest.json', 'src', 'assets'];

/** O que nunca entra, mesmo estando dentro das pastas acima. */
const EXCLUIR = [/\.map$/, /\.test\.mjs$/, /^\./];

/** Caminhos que precisam existir no zip, exatamente assim. */
const OBRIGATORIOS = [
  'manifest.json',
  'src/content/loader.js',
  'src/content/main.js',
  'src/background/service-worker.js',
  'src/styles/content.css',
  'assets/icons/icon128.png',
];

function coletar(alvo, saida = []) {
  const completo = path.join(raiz, alvo);
  if (EXCLUIR.some((p) => p.test(path.basename(alvo)))) return saida;
  if (!fs.existsSync(completo)) throw new Error(`faltando no pacote: ${alvo}`);

  if (fs.statSync(completo).isDirectory()) {
    for (const entrada of fs.readdirSync(completo)) coletar(path.join(alvo, entrada), saida);
    return saida;
  }

  saida.push({
    caminho: alvo.split(path.sep).join('/'),
    conteudo: fs.readFileSync(completo),
    quando: fs.statSync(completo).mtime,
  });
  return saida;
}

const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));
const nome = `sei-assist-${manifest.version}.zip`;
const destino = path.join(raiz, nome);

/* --------------------------------- o que a loja recusaria, conferido antes */

const problemas = [];
// O padrão de web_accessible_resources aceita esquema e host, e o caminho
// tem de ser exatamente /*. Já tentei restringir para *://*/sei/* achando
// que apertava a segurança, e o Chrome recusou o manifest inteiro: a
// extensão parou de carregar com "Invalid match pattern".
const PADRAO_WAR = /^[a-z*]+:\/\/[^/]+\/\*$/;
for (const recurso of manifest.web_accessible_resources || []) {
  for (const padrao of recurso.matches || []) {
    if (!PADRAO_WAR.test(padrao)) {
      problemas.push(`padrão inválido em web_accessible_resources: ${padrao}`);
    }
  }
}
if (manifest.host_permissions) {
  problemas.push('host_permissions presente — a extensão não precisa de nenhum');
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) {
  problemas.push(`versão em formato inesperado: ${manifest.version}`);
}
if (problemas.length) {
  console.error('Não empacotei:');
  for (const p of problemas) console.error(`  - ${p}`);
  process.exit(1);
}

/* ------------------------------------------------------------- montagem */

const arquivos = INCLUIR.flatMap((alvo) => coletar(alvo));
if (fs.existsSync(destino)) fs.rmSync(destino);
escreverZip(destino, arquivos);

/* ------------------------------------------------------------ conferência */

const dentro = caminhosDoZip(destino);
const faltando = OBRIGATORIOS.filter((f) => !dentro.includes(f));
const achatados = dentro.filter((f) => !f.includes('/') && f !== 'manifest.json');
const comContrabarra = dentro.filter((f) => f.includes('\\'));

if (faltando.length || achatados.length || comContrabarra.length) {
  console.error('\nO pacote saiu errado:');
  for (const f of faltando) console.error(`  - faltando: ${f}`);
  for (const f of achatados) console.error(`  - na raiz, deveria estar em pasta: ${f}`);
  for (const f of comContrabarra) console.error(`  - separador errado: ${f}`);
  process.exit(1);
}

const tamanho = (fs.statSync(destino).size / 1024).toFixed(0);
console.log(`\n${nome} — ${arquivos.length} arquivos, ${tamanho} KB, estrutura conferida`);
console.log('Antes de enviar, veja docs/publicacao.md.');
