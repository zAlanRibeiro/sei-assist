/**
 * Testes do ciclo de vida do contexto da extensão.
 *
 * Recarregar a extensão invalida o contexto de todo content script já
 * injetado. Sem tratamento, a aba órfã continua observando o DOM e enchendo o
 * console de "Extension context invalidated" — foi exatamente o que apareceu
 * em uso real.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const rt = await import('../src/content/core/runtime.js');

test('reconhece o erro de contexto rompido', () => {
  assert.equal(rt.ehContextoInvalidado(new Error('Extension context invalidated.')), true);
  assert.equal(rt.ehContextoInvalidado(new Error('The message port closed')), true);
  assert.equal(rt.ehContextoInvalidado('Receiving end does not exist'), true);
});

test('não confunde erro comum com contexto rompido', () => {
  assert.equal(rt.ehContextoInvalidado(new Error('QUOTA_BYTES quota exceeded')), false);
  assert.equal(rt.ehContextoInvalidado(new TypeError('x is not a function')), false);
  assert.equal(rt.ehContextoInvalidado(null), false);
});

test('comContexto devolve o resultado quando está tudo bem', async () => {
  const valor = await rt.comContexto(async () => 42, 0, 'teste');
  assert.equal(valor, 42);
});

test('erro comum não derruba a extensão: devolve o padrão e segue', async () => {
  const valor = await rt.comContexto(
    async () => {
      throw new Error('falha qualquer');
    },
    'padrao',
    'teste',
  );
  assert.equal(valor, 'padrao');
  assert.equal(rt.contextoVivo(), true, 'um erro comum não invalida o contexto');
});

test('contexto rompido desliga tudo, uma vez só e em silêncio', async () => {
  let desligamentos = 0;
  rt.aoInvalidarContexto(() => desligamentos++);
  rt.aoInvalidarContexto(() => desligamentos++);

  const valor = await rt.comContexto(
    async () => {
      throw new Error('Extension context invalidated.');
    },
    'padrao',
    'teste',
  );

  assert.equal(valor, 'padrao');
  assert.equal(desligamentos, 2, 'todos os desligamentos rodam');
  assert.equal(rt.contextoVivo(), false, 'o contexto fica marcado como morto');

  // A partir daqui nada mais deve ser executado nem religado.
  let extra = 0;
  await rt.comContexto(async () => extra++, null, 'teste');
  assert.equal(extra, 0, 'nenhuma chamada nova ao chrome.* depois de morto');

  rt.marcarContextoInvalidado();
  assert.equal(desligamentos, 2, 'desligar de novo não repete o trabalho');
});
