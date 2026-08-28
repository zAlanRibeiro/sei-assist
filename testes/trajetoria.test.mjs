/**
 * Testes da trajetória do processo.
 *
 * Os eventos aqui têm a forma que `lerAndamentos()` produz a partir da tela
 * real, com os textos que o SEI escreve.
 *
 * O que mais merece teste é a contagem de tempo: um processo com prazo em que
 * a extensão diz "parado há 3 dias" quando são 13 é pior que não dizer nada.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const {
  trajetoria,
  duracaoLegivel,
  siglaCurta,
  emUmaLinha,
  resumir,
  paradoHa,
} = await import('../src/content/features/trajetoria/trajetoria.js');

const DIVCC = 'NIT/NITTRANS/DIVCC';
const DEPOT = 'NIT/NITTRANS/DEPOT';
const DIVEST = 'NIT/NITTRANS/DIVEST';

const em = (dia, hora = '09:00') => `2026-06-${String(dia).padStart(2, '0')}T${hora}:00.000Z`;
const AGORA = new Date(em(30)).getTime();

const criado = (unidade, dia) => ({ tipo: 'processoCriado', unidade, quando: em(dia) });
const remetido = (unidade, dia) => ({ tipo: 'remetido', unidade, quando: em(dia) });
const recebido = (unidade, dia) => ({ tipo: 'recebido', unidade, quando: em(dia) });

/* ------------------------------------------------------------ as paradas */

test('processo criado e ainda parado na origem', () => {
  const paradas = trajetoria([criado(DIVCC, 10)], AGORA);

  assert.equal(paradas.length, 1);
  assert.equal(paradas[0].unidade, DIVCC);
  assert.equal(paradas[0].atual, true);
});

test('a trajetória segue a sequência de unidades', () => {
  const paradas = trajetoria(
    [
      criado(DIVCC, 1),
      remetido(DIVCC, 4),
      recebido(DEPOT, 4),
      remetido(DEPOT, 9),
      recebido(DIVEST, 10),
    ],
    AGORA,
  );

  assert.deepEqual(paradas.map((p) => p.unidade), [DIVCC, DEPOT, DIVEST]);
  assert.deepEqual(paradas.map((p) => p.atual), [false, false, true]);
});

test('conta os dias de cada parada', () => {
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DEPOT, 4)],
    AGORA,
  );

  assert.equal(duracaoLegivel(paradas[0].duracaoMs), '3 dias');
  // A parada aberta conta até agora, não até o último evento.
  assert.equal(duracaoLegivel(paradas[1].duracaoMs), '26 dias');
});

test('vários recebimentos na mesma unidade não viram paradas separadas', () => {
  // Cada pessoa da unidade que abre o processo gera uma linha no andamento.
  // Sem esta regra, a trajetória viraria DEPOT → DEPOT → DEPOT.
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DEPOT, 4), recebido(DEPOT, 5), recebido(DEPOT, 6)],
    AGORA,
  );

  assert.deepEqual(paradas.map((p) => p.unidade), [DIVCC, DEPOT]);
});

test('processo que volta para uma unidade abre parada nova', () => {
  // Voltar não é o mesmo que nunca ter saído: são dois períodos distintos.
  const paradas = trajetoria(
    [
      criado(DIVEST, 1),
      remetido(DIVEST, 3),
      recebido(DEPOT, 3),
      remetido(DEPOT, 8),
      recebido(DIVEST, 8),
    ],
    AGORA,
  );

  assert.deepEqual(paradas.map((p) => p.unidade), [DIVEST, DEPOT, DIVEST]);
  assert.equal(paradas[0].atual, false, 'a primeira passagem foi fechada');
  assert.equal(paradas[2].atual, true);
});

test('remetido sem recebido: o processo não está em lugar nenhum', () => {
  // A unidade de destino ainda não abriu o processo. O andamento não diz para
  // onde ele foi — só que saiu.
  const paradas = trajetoria([criado(DIVCC, 1), remetido(DIVCC, 4)], AGORA);

  assert.equal(paradas.length, 1);
  assert.equal(paradas[0].atual, false);
  assert.equal(paradoHa(paradas, AGORA), null);
});

test('eventos sem unidade são ignorados', () => {
  // A criação de documento entra no andamento e não move o processo.
  const paradas = trajetoria(
    [criado(DIVCC, 1), { tipo: 'documentoCriado', unidade: null, quando: em(2) }],
    AGORA,
  );

  assert.equal(paradas.length, 1);
});

test('lista vazia não quebra', () => {
  assert.deepEqual(trajetoria([], AGORA), []);
  assert.deepEqual(trajetoria(null, AGORA), []);
  assert.equal(resumir([], AGORA), '');
});

/* ---------------------------------------------------------- a linguagem */

test('a duração é dita como gente diz', () => {
  assert.equal(duracaoLegivel(3 * 24 * 60 * 60 * 1000), '3 dias');
  assert.equal(duracaoLegivel(24 * 60 * 60 * 1000), '1 dia');
  assert.equal(duracaoLegivel(5 * 60 * 60 * 1000), '5 horas');
  assert.equal(duracaoLegivel(60 * 1000), 'menos de 1 hora');
});

test('meses e anos em vez de números grandes de dias', () => {
  // "parado há 95 dias" é pior de ler que "há 3 meses".
  assert.equal(duracaoLegivel(95 * 24 * 60 * 60 * 1000), '3 meses');
  assert.equal(duracaoLegivel(400 * 24 * 60 * 60 * 1000), '1 ano');
});

test('a sigla é encurtada para o que distingue', () => {
  // O prefixo é igual para todas as unidades do órgão e ocupa a linha toda.
  assert.equal(siglaCurta(DIVEST), 'DIVEST');
  assert.equal(siglaCurta('DIVEST'), 'DIVEST');
  assert.equal(siglaCurta(''), '');
});

test('a linha da trajetória usa as siglas curtas', () => {
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DEPOT, 4)],
    AGORA,
  );
  assert.equal(emUmaLinha(paradas), 'DIVCC → DEPOT');
});

test('o resumo responde as perguntas que se faz', () => {
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DEPOT, 4), remetido(DEPOT, 9), recebido(DIVEST, 10)],
    AGORA,
  );
  const texto = resumir(paradas, AGORA);

  assert.match(texto, /Começou na DIVCC em 01\/06\/2026/);
  assert.match(texto, /passou por 3 unidades/);
  assert.match(texto, /está na DIVEST há 20 dias/);
});

test('processo que nunca saiu tem resumo curto', () => {
  const paradas = trajetoria([criado(DIVEST, 20)], AGORA);
  const texto = resumir(paradas, AGORA);

  assert.match(texto, /Começou na DIVEST/);
  assert.match(texto, /está na DIVEST há 10 dias/);
  assert.equal(/passou por/.test(texto), false, 'não passou por unidade nenhuma');
});

test('processo remetido e não recebido diz que saiu, não que está parado', () => {
  const paradas = trajetoria([criado(DIVCC, 1), remetido(DIVCC, 4)], AGORA);
  const texto = resumir(paradas, AGORA);

  assert.match(texto, /saiu da DIVCC em 04\/06\/2026/);
  assert.equal(/está na/.test(texto), false);
});

test('paradoHa mede desde a chegada, não desde a criação', () => {
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DIVEST, 25)],
    AGORA,
  );
  assert.equal(duracaoLegivel(paradoHa(paradas, AGORA)), '5 dias');
});

test('duas passagens pela mesma unidade fecham cada uma no seu tempo', () => {
  // O que garante isso é a condição de parada ABERTA: a primeira passagem já
  // está fechada quando o segundo "remetido" chega, então ele não a reabre
  // nem a sobrescreve.
  const paradas = trajetoria(
    [
      criado(DIVEST, 1),
      remetido(DIVEST, 3),
      recebido(DEPOT, 3),
      remetido(DEPOT, 8),
      recebido(DIVEST, 8),
      remetido(DIVEST, 12),
    ],
    AGORA,
  );

  assert.deepEqual(paradas.map((p) => p.unidade), [DIVEST, DEPOT, DIVEST]);
  assert.deepEqual(paradas.map((p) => p.atual), [false, false, false]);
  assert.equal(duracaoLegivel(paradas[0].duracaoMs), '2 dias', 'primeira passagem');
  assert.equal(duracaoLegivel(paradas[2].duracaoMs), '4 dias', 'segunda passagem');
});

/* ------------------------------------------------------ a faixa na tela */

import fs from 'node:fs';

test('toda caixa da faixa declara a própria cor', () => {
  // Herança de cor não funciona dentro do HTML do SEI: ela só vale quando
  // NENHUMA regra casa com o elemento, e o tema escuro do SEI tem regra para
  // span. A regra deles ganha, e o texto sai branco sobre o fundo claro da
  // faixa — invisível. Aconteceu de verdade, com o histórico inteiro em
  // branco na tela.
  const fonte = fs.readFileSync('src/content/features/trajetoria/index.js', 'utf8');
  const blocos = [...fonte.matchAll(/const (ESTILO[A-Z_]*) = \{([^}]*)\}/g)];

  assert.ok(blocos.length >= 8, 'os estilos da faixa deveriam estar todos aqui');
  for (const [, nome, corpo] of blocos) {
    assert.ok(corpo.includes('color:'), `${nome} não declara cor`);
  }
});
