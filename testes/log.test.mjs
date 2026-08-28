/**
 * Testes do log.
 *
 * Existem por causa de um sintoma concreto: a página de erros da extensão
 * mostrava "[SEI Assist] bloco de assinatura: nada relevante [object Object]".
 * O diagnóstico inteiro — que existe justamente para dizer o que houve —
 * chegava ao usuário como cinco palavras inúteis.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { formatar, log } = await import('../src/content/core/log.js');

test('objeto simples vira JSON legível', () => {
  // É o caso que motivou tudo: a página de erros converte cada argumento em
  // texto, e um objeto vira "[object Object]".
  const diagnostico = { lidos: 0, relevantes: 0, unidade: 'NIT/NITTRANS/DIVEST' };

  assert.equal(
    formatar(diagnostico),
    '{"lidos":0,"relevantes":0,"unidade":"NIT/NITTRANS/DIVEST"}',
  );
  assert.equal(String(formatar(diagnostico)).includes('[object Object]'), false);
});

test('lista também', () => {
  assert.equal(formatar(['a', 'b']), '["a","b"]');
});

test('Error passa inteiro', () => {
  // É a pilha que interessa num erro; serializar apagaria justamente ela.
  const erro = new Error('falhou');

  assert.equal(formatar(erro), erro);
});

test('texto e número passam intactos', () => {
  assert.equal(formatar('já é texto'), 'já é texto');
  assert.equal(formatar(42), 42);
  assert.equal(formatar(null), null);
  assert.equal(formatar(undefined), undefined);
});

test('objeto com ciclo não derruba o log', () => {
  // Um log que explode ao registrar um erro esconde o erro que importava.
  const cicliico = { nome: 'x' };
  cicliico.eu = cicliico;

  assert.equal(formatar(cicliico), cicliico, 'devolve o objeto em vez de lançar');
});

test('objeto de classe passa intacto', () => {
  // Só objeto simples vira JSON: um Document ou um elemento serializado daria
  // ruído gigante, e a árvore do DevTools é melhor para eles.
  class Coisa {
    constructor() {
      this.a = 1;
    }
  }

  const coisa = new Coisa();
  assert.equal(formatar(coisa), coisa);
});

test('o log realmente formata o que passa por ele', () => {
  // Os testes acima cobrem a FUNÇÃO; este cobre a FIAÇÃO. Sabotei trocando
  // `args.map(formatar)` por `args` e nenhum teste caiu — pela terceira vez
  // nesta sessão, a função estava testada e o uso dela não.
  const original = console.warn;
  const recebidos = [];
  console.warn = (...args) => recebidos.push(args);

  try {
    log.warn('diagnóstico:', { lidos: 0, unidade: 'DIVEST' });
  } finally {
    console.warn = original;
  }

  assert.equal(recebidos.length, 1);
  assert.equal(recebidos[0][2], '{"lidos":0,"unidade":"DIVEST"}');
  assert.equal(
    recebidos[0].some((a) => String(a).includes('[object Object]')),
    false,
    'era exatamente isto que o usuário via',
  );
});
