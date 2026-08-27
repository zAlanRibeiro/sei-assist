/**
 * Testes do escritor de zip.
 *
 * O pacote enviado à loja é gerado por código próprio (ver zip.mjs), então ele
 * precisa de teste como qualquer outra coisa. O que se verifica aqui é o que
 * já deu errado na prática:
 *
 *   - caminhos achatados (a primeira versão do empacotador pôs os 53 arquivos
 *     na raiz, e os vários `index.js` se sobrescreveram);
 *   - separador `\` em vez de `/`, que viola a especificação;
 *   - conteúdo corrompido, que só apareceria quando alguém instalasse.
 *
 * O conteúdo é conferido descomprimindo de volta: se o deflate ou o CRC
 * estiverem errados, a leitura falha aqui e não no navegador de um usuário.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

import { escreverZip, caminhosDoZip } from './zip.mjs';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function temporario(nome) {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'seix-zip-')), nome);
}

/** Lê e descomprime uma entrada do zip, pelo diretório central. */
function lerEntrada(arquivo, alvo) {
  const b = fs.readFileSync(arquivo);

  for (let i = 0; i < b.length - 4; i++) {
    if (b.readUInt32LE(i) !== 0x02014b50) continue;

    const tamanhoNome = b.readUInt16LE(i + 28);
    const nome = b.toString('utf8', i + 46, i + 46 + tamanhoNome);
    if (nome !== alvo) continue;

    const comprimido = b.readUInt32LE(i + 20);
    const local = b.readUInt32LE(i + 42);
    // O cabeçalho local tem tamanho variável: nome e campo extra próprios.
    const nomeLocal = b.readUInt16LE(local + 26);
    const extraLocal = b.readUInt16LE(local + 28);
    const inicio = local + 30 + nomeLocal + extraLocal;

    return zlib.inflateRawSync(b.subarray(inicio, inicio + comprimido));
  }
  return null;
}

const arquivos = [
  { caminho: 'manifest.json', conteudo: Buffer.from('{"name":"x"}', 'utf8') },
  { caminho: 'src/content/loader.js', conteudo: Buffer.from('// carregador\n', 'utf8') },
  { caminho: 'src/content/features/bloco/index.js', conteudo: Buffer.from('export default 1;\n', 'utf8') },
  { caminho: 'src/content/features/marca/index.js', conteudo: Buffer.from('export default 2;\n', 'utf8') },
];

test('preserva a estrutura de pastas', () => {
  // O defeito real: com os caminhos achatados, os dois index.js viram um só.
  const zip = temporario('estrutura.zip');
  escreverZip(zip, arquivos);

  assert.deepEqual(caminhosDoZip(zip).sort(), arquivos.map((a) => a.caminho).sort());
});

test('arquivos de mesmo nome em pastas diferentes sobrevivem', () => {
  const zip = temporario('homonimos.zip');
  escreverZip(zip, arquivos);

  const dentro = caminhosDoZip(zip);
  assert.equal(dentro.filter((c) => c.endsWith('index.js')).length, 2);
});

test('usa barra normal, nunca contrabarra', () => {
  // Compress-Archive do PowerShell grava `\`, o que viola a especificação ZIP.
  const zip = temporario('barras.zip');
  escreverZip(zip, arquivos);

  assert.equal(caminhosDoZip(zip).some((c) => c.includes('\\')), false);
});

test('o manifest fica na raiz, sem prefixo', () => {
  // O tar.exe do Windows prefixa tudo com "./", e a loja precisa do manifest
  // na raiz do pacote.
  const zip = temporario('raiz.zip');
  escreverZip(zip, arquivos);

  assert.ok(caminhosDoZip(zip).includes('manifest.json'));
  assert.equal(caminhosDoZip(zip).some((c) => c.startsWith('./')), false);
});

test('o conteúdo volta idêntico ao que entrou', () => {
  const zip = temporario('conteudo.zip');
  escreverZip(zip, arquivos);

  for (const arquivo of arquivos) {
    assert.deepEqual(
      lerEntrada(zip, arquivo.caminho),
      arquivo.conteudo,
      `${arquivo.caminho} voltou diferente`,
    );
  }
});

test('conteúdo binário atravessa sem corromper', () => {
  // Os ícones são PNG. Um escritor que trate tudo como texto os destrói.
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff, 0xfe, 0x0d, 0x0a, 0x1a]);
  const zip = temporario('binario.zip');
  escreverZip(zip, [{ caminho: 'assets/icons/icon16.png', conteudo: bytes }]);

  assert.deepEqual(lerEntrada(zip, 'assets/icons/icon16.png'), bytes);
});

test('acento no conteúdo sobrevive', () => {
  const texto = Buffer.from('// histórico de assinaturas e envios\n', 'utf8');
  const zip = temporario('acento.zip');
  escreverZip(zip, [{ caminho: 'src/x.js', conteudo: texto }]);

  assert.equal(lerEntrada(zip, 'src/x.js').toString('utf8'), texto.toString('utf8'));
});

test('arquivo vazio não quebra o pacote', () => {
  const zip = temporario('vazio.zip');
  escreverZip(zip, [{ caminho: 'vazio.js', conteudo: Buffer.alloc(0) }]);

  assert.deepEqual(caminhosDoZip(zip), ['vazio.js']);
  assert.equal(lerEntrada(zip, 'vazio.js').length, 0);
});

/* ------------------------------------------------- o pacote de verdade */

test('o pacote publicado tem o que a extensão precisa para rodar', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));
  const zip = path.join(RAIZ, `sei-assist-${manifest.version}.zip`);

  // Só corre quando o pacote já foi gerado: `npm test` não deve exigir
  // `npm run empacotar` antes.
  if (!fs.existsSync(zip)) return;

  const dentro = caminhosDoZip(zip);
  for (const arquivo of ['manifest.json', ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])])]) {
    assert.ok(dentro.includes(arquivo), `o manifest referencia ${arquivo}, que não está no pacote`);
  }
  assert.ok(dentro.includes(manifest.background.service_worker));
  assert.ok(dentro.includes(manifest.options_ui.page));
  assert.ok(dentro.includes(manifest.action.default_popup));
});
