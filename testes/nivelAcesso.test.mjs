/**
 * Testes do nível de acesso e da política de rascunho.
 *
 * O que está em jogo aqui não é conveniência: é conteúdo de documento oficial
 * indo para o disco sem cifra. Errar para o lado permissivo guarda o que não
 * devia; errar para o lado restritivo mata a funcionalidade sem avisar. Os
 * dois erros têm teste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { classificar, ehFechado, lerNivel, diagnosticar, PUBLICO, RESTRITO, SIGILOSO, DESCONHECIDO } =
  await import('../src/content/features/editor/nivelAcesso.js');
const { podeGuardar } = await import('../src/content/features/editor/rascunho.js');
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

/* ---------------------------------------------------- a classificação */

test('as três palavras viram os três estados', () => {
  assert.equal(classificar('Público'), PUBLICO);
  assert.equal(classificar('Restrito'), RESTRITO);
  assert.equal(classificar('Sigiloso'), SIGILOSO);
});

test('sem acento e no meio da frase também', () => {
  assert.equal(classificar('Nivel de Acesso: publico'), PUBLICO);
  assert.equal(classificar('optRestrito'), RESTRITO);
});

test('o mais fechado ganha quando a tela diz as duas coisas', () => {
  // Uma tela pode trazer o rótulo "Público" de outro campo junto. Tratar como
  // restrito é o erro barato; o contrário vaza conteúdo.
  assert.equal(classificar('Público ... Restrito'), RESTRITO);
  assert.equal(classificar('Restrito ... Sigiloso'), SIGILOSO);
});

test('texto vazio ou sem nível nenhum é desconhecido', () => {
  assert.equal(classificar(''), DESCONHECIDO);
  assert.equal(classificar('Despacho 00098329'), DESCONHECIDO);
  assert.equal(classificar(null), DESCONHECIDO);
});

test('só restrito e sigiloso escondem conteúdo', () => {
  assert.equal(ehFechado(RESTRITO), true);
  assert.equal(ehFechado(SIGILOSO), true);
  assert.equal(ehFechado(PUBLICO), false);
  assert.equal(ehFechado(DESCONHECIDO), false);
});

/* ------------------------------------------------------- a leitura */

/** Os três rádios que o SEI põe na tela, com um deles marcado. */
function telaComRadios(marcado) {
  const radio = (id) => {
    const no = elemento('input', { id, type: 'radio', name: 'rdoNivelAcesso' });
    no.checked = id === marcado;
    return no;
  };
  return elemento('div', {}, [radio('optPublico'), radio('optRestrito'), radio('optSigiloso')]);
}

test('rádio não marcado não decide nada', () => {
  // ESTE é o teste que importa. A tela do SEI traz as três opções sempre.
  // Sem exigir `checked`, achar #optRestrito no HTML marcaria TODO documento
  // como restrito e o rascunho morreria para todo mundo.
  const raiz = telaComRadios('optPublico');
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), PUBLICO);
});

test('o rádio marcado é o que vale', () => {
  const raiz = telaComRadios('optRestrito');
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), RESTRITO);
});

test('sem campo nenhum, o rótulo no texto serve', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['Nível de Acesso: Restrito'])]);
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), RESTRITO);
});

test('tela que não diz nada devolve desconhecido, e não público', () => {
  // Confundir "não achei" com "é público" transformaria falha de leitura em
  // permissão para guardar.
  const raiz = elemento('div', {}, [elemento('p', {}, ['Corpo do documento'])]);
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), DESCONHECIDO);
});

test('o diagnóstico relata sem decidir', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['Nível de Acesso: Público'])]);
  const doc = instalarDocumento(raiz);

  const relato = diagnosticar(doc);
  assert.equal(relato.nivel, PUBLICO);
  assert.equal(relato.temRotulo, true);
  assert.deepEqual(relato.palavrasNaTela, ['público']);
});

/* -------------------------------------------------------- a política */

test('documento restrito nunca vira rascunho', () => {
  // Não é opção: é o motivo de tudo isto existir.
  assert.deepEqual(podeGuardar({ nivel: RESTRITO }), { pode: false, motivo: RESTRITO });
  assert.deepEqual(podeGuardar({ nivel: SIGILOSO }), { pode: false, motivo: SIGILOSO });
});

test('nem com a opção ligada o restrito passa', () => {
  const r = podeGuardar({ nivel: RESTRITO, guardarRascunho: true, soPublicos: false });
  assert.equal(r.pode, false);
});

test('documento público é guardado', () => {
  assert.equal(podeGuardar({ nivel: PUBLICO }).pode, true);
});

test('desconhecido é guardado por padrão', () => {
  // A detecção ainda não foi confirmada contra tela real. Recusar tudo que não
  // reconheço mataria a funcionalidade para todo mundo.
  assert.equal(podeGuardar({ nivel: DESCONHECIDO }).pode, true);
});

test('desconhecido é recusado quando se pede só públicos', () => {
  const r = podeGuardar({ nivel: DESCONHECIDO, soPublicos: true });
  assert.equal(r.pode, false);
  assert.equal(r.motivo, 'nivel-desconhecido', 'o motivo distingue de "é restrito"');
});

test('a opção desligada vence tudo', () => {
  const r = podeGuardar({ nivel: PUBLICO, guardarRascunho: false });
  assert.deepEqual(r, { pode: false, motivo: 'desligado' });
});

test('sem argumento nenhum não guarda às cegas', () => {
  // Chamada malformada não pode virar permissão.
  assert.equal(podeGuardar().motivo, DESCONHECIDO);
});

test('o rótulo acentuado é lido inteiro', () => {
  // A primeira versão da expressão usava [a-zçãí] e engolia o "ú" de
  // "Público": capturava só o "P" e devolvia desconhecido. Documento público
  // caindo no caso desconhecido é o tipo de erro que só aparece com acento.
  for (const [texto, esperado] of [
    ['Nível de Acesso: Público', PUBLICO],
    ['Nível de Acesso: Restrito', RESTRITO],
    ['Nível de Acesso: Sigiloso', SIGILOSO],
  ]) {
    const doc = instalarDocumento(elemento('div', {}, [elemento('span', {}, [texto])]));
    assert.equal(lerNivel(doc), esperado, texto);
  }
});
