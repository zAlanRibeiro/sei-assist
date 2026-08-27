/**
 * Testes do nucleo: elegibilidade de features, merge de configuracoes e
 * normalizacao de texto. Tudo aqui e logica pura, sem DOM e sem chrome.*
 *
 * Rodar:  node --test testes/
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { elegivel } from '../src/content/core/registry.js';
import { estadoDaFeature } from '../src/content/core/settings.js';
import { norm } from '../src/content/core/dom.js';
import features from '../src/content/features/index.js';

const ctx = (screen, role) => ({ screen, frame: { role } });
const feature = { id: 'x', telas: ['controle-processos'], frames: ['topo'], setup() {} };

test('elegivel: tela e frame precisam bater', () => {
  assert.equal(elegivel(feature, ctx('controle-processos', 'topo')), true);
  assert.equal(elegivel(feature, ctx('processo', 'topo')), false);
  assert.equal(elegivel(feature, ctx('controle-processos', 'arvore')), false);
});

test('elegivel: curinga e lista vazia liberam qualquer contexto', () => {
  assert.equal(elegivel({ ...feature, telas: ['*'] }, ctx('processo', 'topo')), true);
  assert.equal(elegivel({ ...feature, telas: [], frames: [] }, ctx('seja-la', 'arvore')), true);
});

test('elegivel: aplicaSe pode vetar mesmo com tela e frame corretos', () => {
  const vetada = { ...feature, aplicaSe: () => false };
  assert.equal(elegivel(vetada, ctx('controle-processos', 'topo')), false);
});

test('estadoDaFeature: usa os defaults quando nao ha nada salvo', () => {
  const f = { id: 'y', padraoAtiva: true, opcoesPadrao: { atalho: 'Ctrl+K', limite: 10 } };
  assert.deepEqual(estadoDaFeature({ features: {} }, f), {
    ativa: true,
    opcoes: { atalho: 'Ctrl+K', limite: 10 },
  });
});

test('estadoDaFeature: o salvo sobrepoe apenas a chave mexida', () => {
  const f = { id: 'y', padraoAtiva: true, opcoesPadrao: { atalho: 'Ctrl+K', limite: 10 } };
  const salvo = { features: { y: { ativa: false, opcoes: { limite: 99 } } } };
  assert.deepEqual(estadoDaFeature(salvo, f), {
    ativa: false,
    opcoes: { atalho: 'Ctrl+K', limite: 99 },
  });
});

test('estadoDaFeature: padraoAtiva ausente equivale a ligada', () => {
  assert.equal(estadoDaFeature({ features: {} }, { id: 'z' }).ativa, true);
});

test('norm: remove acento, caixa e espaco duplicado', () => {
  assert.equal(norm('  Ações   ESPECIAIS '), 'acoes especiais');
  assert.equal(norm('Gerar Documento'), 'gerar documento');
  assert.equal(norm(''), '');
});

test('catalogo: features validas e sem efeito colateral no import', () => {
  assert.ok(features.length > 0, 'o catalogo nao pode estar vazio');

  const ids = new Set();
  for (const f of features) {
    assert.ok(f.id, 'toda feature precisa de id');
    assert.equal(ids.has(f.id), false, `id duplicado no catalogo: ${f.id}`);
    ids.add(f.id);
    assert.equal(typeof f.setup, 'function', `${f.id}: setup deve ser funcao`);
    assert.ok(f.nome, `${f.id}: falta nome`);
    assert.ok(f.descricao, `${f.id}: falta descricao`);
  }
});

/* ---------------------------------------------------------------- loader */

const loader = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src/content/loader.js'),
  'utf8',
);

test('o loader detecta contexto invalidado antes de tentar carregar', () => {
  // Quando a extensão é recarregada com abas abertas, o content script antigo
  // continua vivo mas perde o vínculo: chrome.runtime.id some. Sem esta
  // checagem, o console enche de erro a cada recarga durante o desenvolvimento.
  assert.ok(loader.includes('chrome.runtime.id'), 'deve checar o vínculo com a extensão');
});

test('o loader libera a trava quando falha, para poder tentar de novo', () => {
  // O bug original: a trava era ligada ANTES do import. Se ele falhasse, a
  // página ficava marcada como "já carregada" e não havia segunda chance.
  const trava = loader.indexOf('window[MARCA] = true');
  const libera = loader.indexOf('window[MARCA] = false');

  assert.ok(trava !== -1, 'a trava contra carga dupla precisa existir');
  assert.ok(libera > trava, 'e precisa ser liberada em caso de falha');
});

test('o loader tenta uma segunda vez antes de desistir', () => {
  assert.ok(/tentativa\s*<\s*2/.test(loader), 'uma retentativa cobre a corrida na atualização');
});
