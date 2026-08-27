/**
 * Testes do parser de andamento (envios).
 *
 * lerLinha() recebe as celulas ja extraidas, entao da para testar toda a
 * logica sem DOM. lerAndamentos(), que depende de <table>, so roda no
 * navegador - por isso a logica dificil mora em lerLinha/extrairEnvios.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  lerLinha,
  extrairEnvios,
  extrairCriacoes,
} from '../src/content/features/historico/andamento.js';

const REMETIDO = [
  '02/07/2026 16:59',
  'NIT/NITTRANS/DIVEST',
  'alan.ribeiro',
  'Processo remetido pela unidade NIT/NITTRANS/DIVEST',
];

test('le uma linha de envio', () => {
  const e = lerLinha(REMETIDO);
  assert.equal(e.tipo, 'remetido');
  assert.equal(e.unidade, 'NIT/NITTRANS/DIVEST');
  assert.equal(e.usuario, 'alan.ribeiro');
  assert.equal(new Date(e.quando).getFullYear(), 2026);
  assert.equal(new Date(e.quando).getHours(), 16);
  assert.equal(new Date(e.quando).getMinutes(), 59);
});

test('le uma linha de recebimento', () => {
  const e = lerLinha([
    '02/07/2026 17:05',
    'NIT/OUTRA',
    'maria.souza',
    'Processo recebido na unidade NIT/OUTRA',
  ]);
  assert.equal(e.tipo, 'recebido');
  assert.equal(e.unidade, 'NIT/OUTRA');
});

test('nao depende da ordem das colunas', () => {
  const trocada = [
    'Processo remetido pela unidade NIT/NITTRANS/DIVEST',
    'alan.ribeiro',
    '02/07/2026 16:59',
    'NIT/NITTRANS/DIVEST',
  ];
  const e = lerLinha(trocada);
  assert.equal(e.tipo, 'remetido');
  assert.equal(e.usuario, 'alan.ribeiro');
  assert.equal(new Date(e.quando).getMinutes(), 59);
});

test('linha sem data e ignorada', () => {
  assert.equal(lerLinha(['NIT/X', 'Processo remetido pela unidade NIT/X']), null);
});

test('linha sem padrao conhecido e ignorada', () => {
  assert.equal(
    lerLinha(['02/07/2026 16:59', 'NIT/X', 'alan', 'Reabertura do processo na unidade NIT/X']),
    null,
  );
});

test('data impossivel e rejeitada', () => {
  assert.equal(lerLinha(['99/99/2026 16:59', 'NIT/X', 'a', 'Processo remetido pela unidade NIT/X']), null);
});

test('linha vazia nao quebra', () => {
  assert.equal(lerLinha([]), null);
  assert.equal(lerLinha(['', '  ']), null);
});

test('extrairEnvios casa remetido com o recebido do mesmo horario', () => {
  const eventos = [
    lerLinha(REMETIDO),
    lerLinha(['02/07/2026 16:59', 'NIT/DESTINO', 'maria', 'Processo recebido na unidade NIT/DESTINO']),
  ];

  const [envio] = extrairEnvios(eventos);
  assert.equal(envio.origem, 'NIT/NITTRANS/DIVEST');
  assert.equal(envio.destino, 'NIT/DESTINO', 'o destino vem da entrada "recebido"');
  assert.equal(envio.usuario, 'alan.ribeiro');
});

test('envio sem recebimento correspondente fica com destino nulo', () => {
  const [envio] = extrairEnvios([lerLinha(REMETIDO)]);
  assert.equal(envio.destino, null, 'a unidade destino ainda nao abriu o processo');
  assert.equal(envio.origem, 'NIT/NITTRANS/DIVEST');
});

test('recebimento distante no tempo nao e casado como destino', () => {
  const eventos = [
    lerLinha(REMETIDO),
    lerLinha(['05/07/2026 09:00', 'NIT/OUTRA', 'jose', 'Processo recebido na unidade NIT/OUTRA']),
  ];
  assert.equal(extrairEnvios(eventos)[0].destino, null);
});

test('varios envios do mesmo processo viram varios registros', () => {
  const eventos = [
    lerLinha(REMETIDO),
    lerLinha(['10/07/2026 08:00', 'NIT/OUTRA', 'jose', 'Processo remetido pela unidade NIT/OUTRA']),
  ];
  assert.equal(extrairEnvios(eventos).length, 2);
});

test('o usuario do andamento pode ser o e-mail institucional', () => {
  // Neste orgao o login do SEI e o e-mail completo, bem mais longo que um
  // login curto - o heuristico de coluna precisa continuar acertando.
  const e = lerLinha([
    '02/07/2026 16:59',
    'NIT/NITTRANS/DIVEST',
    'alan.ribeiro@nittrans.niteroi.rj.gov.br',
    'Processo remetido pela unidade NIT/NITTRANS/DIVEST',
  ]);

  assert.equal(e.usuario, 'alan.ribeiro@nittrans.niteroi.rj.gov.br');
  assert.equal(e.unidade, 'NIT/NITTRANS/DIVEST', 'a sigla nao foi confundida com usuario');
});

test('e-mail continua sendo usuario mesmo com as colunas trocadas', () => {
  const e = lerLinha([
    'Processo remetido pela unidade NIT/NITTRANS/DIVEST',
    'alan.ribeiro@nittrans.niteroi.rj.gov.br',
    'NIT/NITTRANS/DIVEST',
    '02/07/2026 16:59',
  ]);
  assert.equal(e.usuario, 'alan.ribeiro@nittrans.niteroi.rj.gov.br');
});

/* --------------------------------------------------------- criacoes */

test('le a criacao de um processo', () => {
  const e = lerLinha([
    '02/07/2026 09:12',
    'NIT/NITTRANS/DIVEST',
    'alan.ribeiro@nittrans.niteroi.rj.gov.br',
    'Processo público gerado',
  ]);

  assert.equal(e.tipo, 'processoCriado');
  assert.equal(e.usuario, 'alan.ribeiro@nittrans.niteroi.rj.gov.br');
  assert.equal(e.unidade, 'NIT/NITTRANS/DIVEST', 'a unidade vem da coluna, nao do texto');
  assert.equal(e.documento, null);
});

test('aceita as variacoes de nivel de acesso', () => {
  for (const texto of ['Processo gerado', 'Processo restrito gerado', 'Processo sigiloso gerado']) {
    const e = lerLinha(['02/07/2026 09:12', 'NIT/X', 'alan@x.br', texto]);
    assert.equal(e && e.tipo, 'processoCriado', texto);
  }
});

test('le a criacao de um documento e guarda o numero', () => {
  const e = lerLinha([
    '02/07/2026 10:30',
    'NIT/NITTRANS/DIVEST',
    'alan.ribeiro@nittrans.niteroi.rj.gov.br',
    'Documento público 00009400 gerado',
  ]);

  assert.equal(e.tipo, 'documentoCriado');
  assert.equal(e.documento, '00009400', 'o numero nao pode cair no campo de unidade');
  assert.equal(e.unidade, 'NIT/NITTRANS/DIVEST');
});

test('criacao de documento sem numero no texto nao quebra', () => {
  const e = lerLinha(['02/07/2026 10:30', 'NIT/X', 'alan@x.br', 'Documento gerado']);
  assert.equal(e.tipo, 'documentoCriado');
  assert.equal(e.documento, null);
});

test('extrairCriacoes traduz para o vocabulario do historico', () => {
  const eventos = [
    lerLinha(['02/07/2026 09:12', 'NIT/X', 'alan@x.br', 'Processo público gerado']),
    lerLinha(['02/07/2026 10:30', 'NIT/X', 'alan@x.br', 'Documento público 00009400 gerado']),
    lerLinha(REMETIDO),
  ];

  const criacoes = extrairCriacoes(eventos);
  assert.deepEqual(criacoes.map((c) => c.tipoEvento), ['processo-criado', 'documento-criado']);
  assert.equal(criacoes[1].documento, '00009400');
});

test('criacao e envio nao se misturam', () => {
  const eventos = [
    lerLinha(['02/07/2026 09:12', 'NIT/X', 'alan@x.br', 'Processo público gerado']),
    lerLinha(REMETIDO),
  ];

  assert.equal(extrairEnvios(eventos).length, 1, 'so o remetido vira envio');
  assert.equal(extrairCriacoes(eventos).length, 1, 'so o gerado vira criacao');
});

test('a ordem das palavras na criacao nao importa', () => {
  const variantes = [
    'Processo público gerado',
    'Gerado o processo público',
    'Processo gerado na unidade',
  ];
  for (const texto of variantes) {
    const e = lerLinha(['02/07/2026 09:12', 'NIT/X', 'alan@x.br', texto]);
    assert.equal(e && e.tipo, 'processoCriado', texto);
  }
});

test('numero do documento e achado nas duas ordens', () => {
  for (const texto of ['Documento público 00009400 gerado', 'Gerado documento público 00009400']) {
    const e = lerLinha(['02/07/2026 10:30', 'NIT/X', 'alan@x.br', texto]);
    assert.equal(e && e.tipo, 'documentoCriado', texto);
    assert.equal(e.documento, '00009400', texto);
  }
});

test('criacao de processo nao e confundida com criacao de documento', () => {
  const proc = lerLinha(['02/07/2026 09:12', 'NIT/X', 'alan@x.br', 'Processo público gerado']);
  const doc = lerLinha(['02/07/2026 10:30', 'NIT/X', 'alan@x.br', 'Documento público 00009400 gerado']);

  assert.equal(proc.tipo, 'processoCriado');
  assert.equal(doc.tipo, 'documentoCriado');
});
