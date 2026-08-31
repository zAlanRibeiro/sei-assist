/**
 * Testes da ponte de toasts.
 *
 * Existem por causa de um achado de segurança: a ponte aceitava `message` de
 * QUALQUER origem, e o envio usava targetOrigin '*'. Um frame de terceiro
 * dentro da página do SEI podia fazer aparecer, com a cara da extensão, o
 * texto que quisesse — e o texto dos nossos toasts, que carrega número de
 * processo, era entregue a quem estivesse embutindo o SEI.
 *
 * Decisão de segurança sem teste é só um comentário.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.chrome = { runtime: { id: 'teste' } };

const { aceitaMensagem, tipoSeguro, TIPOS_DE_TOAST } = await import('../src/content/core/ui.js');

const SEI = 'https://leste.sei.rj.gov.br';
const msg = (extra = {}) => ({ origin: SEI, data: { tipo: 'seix:toast', texto: 'oi' }, ...extra });

/* ------------------------------------------------------------ a origem */

test('mensagem da mesma origem passa', () => {
  assert.equal(aceitaMensagem(msg(), SEI), true);
});

test('mensagem de outra origem é recusada', () => {
  // O ataque: um frame de terceiro dentro da página do SEI postando para o
  // topo, com a aparência da extensão.
  assert.equal(aceitaMensagem(msg({ origin: 'https://malicioso.example' }), SEI), false);
});

test('origem parecida não engana', () => {
  // Prefixo comum não é mesma origem.
  assert.equal(aceitaMensagem(msg({ origin: `${SEI}.malicioso.example` }), SEI), false);
  assert.equal(aceitaMensagem(msg({ origin: 'http://leste.sei.rj.gov.br' }), SEI), false, 'http não é https');
});

test('frame sem origem definida é recusado', () => {
  // about:blank e srcdoc reportam "null".
  assert.equal(aceitaMensagem(msg({ origin: 'null' }), SEI), false);
});

test('mensagem que não é nossa é ignorada', () => {
  assert.equal(aceitaMensagem(msg({ data: { tipo: 'outra-coisa' } }), SEI), false);
  assert.equal(aceitaMensagem({ origin: SEI }, SEI), false, 'sem data');
  assert.equal(aceitaMensagem(null, SEI), false);
});

/* -------------------------------------------------------------- o tipo */

test('só os tipos conhecidos viram classe', () => {
  // O tipo vira NOME DE CLASSE e chega pela ponte. Sem a lista fechada,
  // qualquer frame aplicava a classe que quisesse ao nosso elemento.
  for (const t of TIPOS_DE_TOAST) assert.equal(tipoSeguro(t), t);
});

test('tipo desconhecido vira info', () => {
  assert.equal(tipoSeguro('erro" onload="alert(1)'), 'info');
  assert.equal(tipoSeguro('infraAreaTela'), 'info', 'nem classe do próprio SEI');
  assert.equal(tipoSeguro(undefined), 'info');
  assert.equal(tipoSeguro(null), 'info');
});

/* ------------------------------------------------------------- o envio */

test('o envio nunca usa targetOrigin curinga', () => {
  // É a metade do defeito que vazava dado: com '*', o texto do toast ia para
  // qualquer página que estivesse embutindo o SEI.
  const src = fs.readFileSync('src/content/core/ui.js', 'utf8');
  const envio = src.slice(src.indexOf('window.top.postMessage'), src.indexOf('window.top.postMessage') + 220);

  assert.equal(/,\s*'\*'\s*\)/.test(envio), false, "targetOrigin '*' de volta no envio");
  assert.match(envio, /destino/, 'o envio deveria mirar a origem lida do topo');
});

test('a recepção é guardada por aceitaMensagem', () => {
  // O teste das funções puras não prova que a ponte as usa.
  const src = fs.readFileSync('src/content/core/ui.js', 'utf8');
  const ponte = src.slice(src.indexOf('ativarPonteDeToasts'));

  assert.match(ponte, /if \(!aceitaMensagem\(ev, location\.origin\)\) return;/);
});
