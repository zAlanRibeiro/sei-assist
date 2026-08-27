/**
 * Testes do parser do bloco de assinatura.
 *
 * O texto base foi tirado de uma tela real do SEI de Niteroi/RJ (leste.sei.rj.gov.br).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  lerAssinaturas,
  lerCodigoVerificador,
} from '../src/content/features/historico/blocoAssinatura.js';

const REAL =
  'Niterói, na data da assinatura ' +
  'Documento assinado eletronicamente por Alan Doyle Costa Ribeiro, Estagiário, ' +
  'em 02/07/2026, às 16:59, conforme art. 1º, III, "b", da Lei 11.419/2006. ' +
  'A autenticidade deste documento pode ser conferida no site ' +
  'https://leste.sei.rj.gov.br/sei/controlador_externo.php?acao=documento_conferir&id_orgao_acesso_externo=0, ' +
  'informando o código verificador 00009400 e o código CRC 00E15CA6.';

test('le a assinatura da tela real', () => {
  const [a] = lerAssinaturas(REAL);
  assert.equal(a.assinante, 'Alan Doyle Costa Ribeiro');
  assert.equal(a.cargo, 'Estagiário');
  assert.equal(new Date(a.quando).getFullYear(), 2026);
  assert.equal(new Date(a.quando).getMonth(), 6, 'julho');
  assert.equal(new Date(a.quando).getDate(), 2);
  assert.equal(new Date(a.quando).getHours(), 16);
  assert.equal(new Date(a.quando).getMinutes(), 59);
});

test('le o codigo verificador', () => {
  assert.equal(lerCodigoVerificador(REAL), '00009400');
  assert.equal(lerCodigoVerificador('sem codigo aqui'), null);
});

test('varias assinaturas no mesmo documento', () => {
  const texto =
    'Documento assinado eletronicamente por Ana Beatriz Lopes Maciel, Diretora, em 01/03/2026, às 09:05, conforme art. 1º. ' +
    'Documento assinado eletronicamente por Alan Doyle Costa Ribeiro, Estagiário, em 02/03/2026, às 14:30, conforme art. 1º.';

  const lista = lerAssinaturas(texto);
  assert.equal(lista.length, 2);
  assert.deepEqual(lista.map((a) => a.assinante), [
    'Ana Beatriz Lopes Maciel',
    'Alan Doyle Costa Ribeiro',
  ]);
});

test('o mesmo bloco repetido nao vira dois registros', () => {
  const um = 'Documento assinado eletronicamente por Fulano de Tal, Analista, em 05/05/2026, às 10:00, conforme.';
  assert.equal(lerAssinaturas(um + ' ' + um).length, 1);
});

test('aceita variacoes de acento e espacamento', () => {
  const semAcento = 'Documento assinado eletronicamente por Fulano de Tal, Analista, em 5/5/2026, as 9:07, conforme';
  const [a] = lerAssinaturas(semAcento);
  assert.equal(a.assinante, 'Fulano de Tal');
  assert.equal(new Date(a.quando).getHours(), 9);
  assert.equal(new Date(a.quando).getMinutes(), 7);
});

test('assinatura sem cargo nao quebra', () => {
  const [a] = lerAssinaturas('Documento assinado eletronicamente por Fulano de Tal, em 05/05/2026, às 10:00,');
  assert.equal(a.assinante, 'Fulano de Tal');
  assert.equal(a.cargo, null);
});

test('tolera a falta da virgula antes de "em"', () => {
  const [a] = lerAssinaturas('Documento assinado eletronicamente por Fulano de Tal em 05/05/2026, às 10:00,');
  assert.equal(a.assinante, 'Fulano de Tal');
});

test('cargo que contem a palavra "em" nao confunde o parser', () => {
  const [a] = lerAssinaturas(
    'Documento assinado eletronicamente por Joana Lima, Analista em Sistemas, em 07/07/2026, às 11:20, conforme',
  );
  assert.equal(a.assinante, 'Joana Lima');
  assert.equal(a.cargo, 'Analista em Sistemas');
});

test('usuario externo tambem e reconhecido', () => {
  const [a] = lerAssinaturas(
    'Documento assinado eletronicamente por Maria Souza, Usuário Externo, em 10/01/2026, às 08:00, conforme',
  );
  assert.equal(a.assinante, 'Maria Souza');
  assert.equal(a.cargo, 'Usuário Externo');
});

test('texto sem assinatura devolve lista vazia', () => {
  assert.deepEqual(lerAssinaturas('Processo aberto somente na unidade NIT/NITTRANS/DIVEST.'), []);
  assert.deepEqual(lerAssinaturas(''), []);
  assert.deepEqual(lerAssinaturas(null), []);
});

test('data invalida e descartada', () => {
  assert.deepEqual(lerAssinaturas('assinado eletronicamente por X, Y, em 99/99/2026, às 10:00,'), []);
});
