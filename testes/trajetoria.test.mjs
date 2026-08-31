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
  abertas,
  selo,
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
  assert.deepEqual(abertas(paradas), []);
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

test('o tempo parado conta desde a chegada, não desde a criação', () => {
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DIVEST, 25)],
    AGORA,
  );
  assert.equal(duracaoLegivel(abertas(paradas)[0].duracaoMs), '5 dias');
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

  // O piso existe para o caso de a expressão parar de casar com qualquer
  // coisa: um laço sobre zero blocos passaria calado.
  assert.ok(blocos.length >= 3, 'os estilos da faixa deveriam estar todos aqui');
  for (const [, nome, corpo] of blocos) {
    assert.ok(corpo.includes('color:'), `${nome} não declara cor`);
  }
});

/* ------------------------------------------------------------ a tela real */

const { lerLinha, extrairEnvios } = await import('../src/content/core/andamento.js');

/**
 * O andamento inteiro de um processo real, copiado da tela do SEI 5.0.4 de
 * NIT/NITTRANS: 16 linhas, quatro unidades, um bloco de assinatura pelo meio.
 *
 * Vale mais que qualquer caso montado à mão, porque foi ele que revelou o
 * erro: nesta instância o recebimento não traz sigla nenhuma na descrição —
 * quem diz a unidade é a coluna. Como o padrão exigia a sigla, nenhum
 * recebimento era reconhecido e a trajetória parava na primeira parada.
 *
 * As colunas estão na ordem da tela: Data/Hora, Unidade, Usuário, Descrição.
 */
const TELA = [
  ['27/08/2026 13:55', 'NIT/NITTRANS/DIVEST', 'leonardo.boechat@nittrans.niteroi.rj.gov.br', 'Ciência no processo'],
  ['27/08/2026 13:55', 'NIT/NITTRANS/DIVEST', 'leonardo.boechat@nittrans.niteroi.rj.gov.br', 'Processo recebido na unidade'],
  ['24/08/2026 23:13', 'NIT/NITTRANS/DIVEST', 'ana.maciel@nittrans.niteroi.rj.gov.br', 'Processo remetido pela unidade NIT/NITTRANS/DEPGM'],
  ['24/08/2026 23:12', 'NIT/NITTRANS/DEPGM', 'ana.maciel@nittrans.niteroi.rj.gov.br', 'Assinado Documento 00086058 (Despacho) por ana.maciel@nittrans.niteroi.rj.gov.br'],
  ['24/08/2026 23:10', 'NIT/NITTRANS/DEPGM', 'ana.maciel@nittrans.niteroi.rj.gov.br', 'Gerado documento público 00086058 (Despacho)'],
  ['24/08/2026 23:06', 'NIT/NITTRANS/DEPGM', 'ana.maciel@nittrans.niteroi.rj.gov.br', 'Processo recebido na unidade'],
  ['24/08/2026 12:24', 'NIT/NITTRANS/DEPGM', 'manuella.guedes@nittrans.niteroi.rj.gov.br', 'Processo remetido pela unidade NIT/NITTRANS/CHEFGAB'],
  ['24/08/2026 12:20', 'NIT/NITTRANS/PRES', 'nelsongoda@nittrans.niteroi.rj.gov.br', 'Bloco 3097 retornado para NIT/NITTRANS/CHEFGAB'],
  ['24/08/2026 12:20', 'NIT/NITTRANS/PRES', 'nelsongoda@nittrans.niteroi.rj.gov.br', 'Assinado Documento 00083236 (Despacho) por nelsongoda@nittrans.niteroi.rj.gov.br'],
  ['24/08/2026 12:18', 'NIT/NITTRANS/CHEFGAB', 'manuella.guedes@nittrans.niteroi.rj.gov.br', 'Bloco 3097 disponibilizado para NIT/NITTRANS/PRES'],
  ['24/08/2026 12:18', 'NIT/NITTRANS/CHEFGAB', 'manuella.guedes@nittrans.niteroi.rj.gov.br', 'Documento 00083236 (Despacho) inserido no bloco 3097'],
  ['24/08/2026 12:16', 'NIT/NITTRANS/CHEFGAB', 'manuella.guedes@nittrans.niteroi.rj.gov.br', 'Gerado documento público 00083236 (Despacho)'],
  ['06/08/2026 15:50', 'NIT/NITTRANS/CHEFGAB', 'manuella.guedes@nittrans.niteroi.rj.gov.br', 'Processo recebido na unidade'],
  ['06/08/2026 15:38', 'NIT/NITTRANS/CHEFGAB', 'juliana.queires@nittrans.niteroi.rj.gov.br', 'Processo remetido pela unidade NIT/NITTRANS/ASTEC'],
  ['06/08/2026 15:36', 'NIT/NITTRANS/ASTEC', 'juliana.queires@nittrans.niteroi.rj.gov.br', 'Registro de documento externo público 00037790 (Anexo)'],
  ['06/08/2026 15:34', 'NIT/NITTRANS/ASTEC', 'juliana.queires@nittrans.niteroi.rj.gov.br', 'Processo público gerado'],
];

const eventosDaTela = () =>
  TELA.map(lerLinha)
    .filter(Boolean)
    .sort((a, b) => (a.quando < b.quando ? -1 : 1));

test('a tela real produz a trajetória inteira', () => {
  const paradas = trajetoria(eventosDaTela(), new Date('2026-08-28T10:00:00').getTime());

  assert.equal(emUmaLinha(paradas), 'ASTEC → CHEFGAB → DEPGM → DIVEST');
  assert.equal(paradas[paradas.length - 1].atual, true, 'está na DIVEST');
});

test('o recebimento sem sigla tira a unidade da coluna', () => {
  const recebimentos = eventosDaTela().filter((e) => e.tipo === 'recebido');

  assert.equal(recebimentos.length, 3, 'os três recebimentos têm de ser reconhecidos');
  assert.deepEqual(recebimentos.map((e) => e.unidade), [
    'NIT/NITTRANS/CHEFGAB',
    'NIT/NITTRANS/DEPGM',
    'NIT/NITTRANS/DIVEST',
  ]);
});

test('no envio, a sigla da descrição ganha da coluna', () => {
  // Na coluna vai o DESTINO; na descrição, a ORIGEM. Trocar as duas inverteria
  // a trajetória inteira sem que nada quebrasse visivelmente.
  const envios = eventosDaTela().filter((e) => e.tipo === 'remetido');

  assert.deepEqual(envios.map((e) => e.unidade), [
    'NIT/NITTRANS/ASTEC',
    'NIT/NITTRANS/CHEFGAB',
    'NIT/NITTRANS/DEPGM',
  ]);
});

test('a unidade do bloco de assinatura não vira parada', () => {
  // O bloco foi para a PRES e voltou; o PROCESSO nunca saiu do CHEFGAB.
  const paradas = trajetoria(eventosDaTela(), new Date('2026-08-28T10:00:00').getTime());

  assert.equal(
    paradas.some((p) => p.unidade.endsWith('PRES')),
    false,
  );
});

test('o destino do envio sai da coluna quando o recebimento é tardio', () => {
  // Nesta instância a unidade recebe horas ou dias depois: o par de 60s quase
  // nunca existe, e todo envio retroativo ficava com destino desconhecido.
  const envios = extrairEnvios(eventosDaTela());

  assert.deepEqual(
    envios.map((e) => `${siglaCurta(e.origem)} → ${siglaCurta(e.destino)}`),
    ['ASTEC → CHEFGAB', 'CHEFGAB → DEPGM', 'DEPGM → DIVEST'],
  );
});

test('coluna igual à origem não vira destino', () => {
  // Se outra instância puser a origem na coluna, as duas coincidem. Preferimos
  // não saber a inventar um destino que é a própria origem.
  const [envio] = extrairEnvios([
    lerLinha([
      '06/08/2026 15:38',
      'NIT/NITTRANS/ASTEC',
      'juliana.queires@nittrans.niteroi.rj.gov.br',
      'Processo remetido pela unidade NIT/NITTRANS/ASTEC',
    ]),
  ]);

  assert.equal(envio.destino, null);
});

/* ------------------------------------------------------ envio simultâneo */

/**
 * No SEI um processo pode ser enviado para várias unidades de uma vez, e fica
 * aberto em todas. O andamento registra uma linha de "remetido" por destino,
 * no mesmo instante, e cada unidade recebe quando abre — dias depois, cada uma
 * no seu tempo.
 */
const PARALELO = [
  criado(DIVCC, 1),
  remetido(DIVCC, 3),
  remetido(DIVCC, 3), // a segunda linha, do segundo destino
  recebido(DEPOT, 4),
  recebido(DIVEST, 8),
];

test('duas unidades que recebem juntas aparecem lado a lado', () => {
  // "DEPOT → DIVEST" diria que uma veio depois da outra. Vieram juntas.
  const paradas = trajetoria(PARALELO, AGORA);

  assert.equal(emUmaLinha(paradas, AGORA), 'DIVCC → DEPOT + DIVEST');
});

test('o segundo remetido do mesmo envio não fecha nada por engano', () => {
  // A parada da origem já foi fechada pelo primeiro. O segundo não encontra
  // parada aberta daquela unidade e passa reto — que é o certo.
  const paradas = trajetoria(PARALELO, AGORA);

  assert.equal(paradas.length, 3);
  assert.equal(duracaoLegivel(paradas[0].duracaoMs), '2 dias', 'a origem fecha no envio');
});

test('com envio simultâneo o processo está em mais de um lugar', () => {
  const emAberto = abertas(trajetoria(PARALELO, AGORA));

  assert.equal(emAberto.length, 2);
  assert.deepEqual(emAberto.map((p) => siglaCurta(p.unidade)), ['DEPOT', 'DIVEST']);
  // Cada uma com o seu relógio: uma recebeu no dia 4, a outra no dia 8.
  assert.equal(duracaoLegivel(emAberto[0].duracaoMs), '26 dias');
  assert.equal(duracaoLegivel(emAberto[1].duracaoMs), '22 dias');
});

test('trajetória sequencial não vira grupo', () => {
  // Aqui o DEPOT devolveu antes de a DIVEST receber: são momentos distintos.
  const paradas = trajetoria(
    [criado(DIVCC, 1), remetido(DIVCC, 3), recebido(DEPOT, 4), remetido(DEPOT, 8), recebido(DIVEST, 9)],
    AGORA,
  );

  assert.equal(emUmaLinha(paradas, AGORA), 'DIVCC → DEPOT → DIVEST');
});

test('três em paralelo formam um grupo só', () => {
  // Todas abertas ao mesmo tempo: um grupo só, não três momentos.
  const paradas = trajetoria(
    [
      criado(DIVCC, 1),
      remetido(DIVCC, 3),
      remetido(DIVCC, 3),
      remetido(DIVCC, 3),
      recebido(DEPOT, 4),
      recebido('NIT/NITTRANS/OUTRA', 5),
      remetido(DEPOT, 6),
      recebido(DIVEST, 7),
    ],
    AGORA,
  );

  assert.equal(emUmaLinha(paradas, AGORA), 'DIVCC → DEPOT + OUTRA + DIVEST');
});

test('entra no grupo quem conviveu com qualquer um dele, não só com o último', () => {
  // DEPOT ficou do dia 4 ao 12. OUTRA passou pelo meio, do 5 ao 6. A DIVEST
  // recebeu no dia 8: não conviveu com a OUTRA, que já tinha devolvido, mas
  // conviveu com o DEPOT. São três unidades do mesmo envio, e a linha tem de
  // mostrar isso — comparar só com a parada anterior partiria o grupo.
  const paradas = trajetoria(
    [
      criado(DIVCC, 1),
      remetido(DIVCC, 3),
      remetido(DIVCC, 3),
      remetido(DIVCC, 3),
      recebido(DEPOT, 4),
      recebido('NIT/NITTRANS/OUTRA', 5),
      remetido('NIT/NITTRANS/OUTRA', 6),
      recebido(DIVEST, 8),
      remetido(DEPOT, 12),
    ],
    AGORA,
  );

  assert.deepEqual(paradas.map((p) => siglaCurta(p.unidade)), ['DIVCC', 'DEPOT', 'OUTRA', 'DIVEST']);
  assert.equal(emUmaLinha(paradas, AGORA), 'DIVCC → DEPOT + OUTRA + DIVEST');
});

test('o envio fecha a parada certa mesmo não sendo a última', () => {
  // O DEPOT devolve no dia 12, quando a DIVEST já está aberta depois dele na
  // lista. Olhar só o fim da lista fecharia a parada errada.
  const paradas = trajetoria(
    [
      criado(DIVCC, 1),
      remetido(DIVCC, 3),
      remetido(DIVCC, 3),
      recebido(DEPOT, 4),
      recebido(DIVEST, 8),
      remetido(DEPOT, 12),
    ],
    AGORA,
  );

  const depot = paradas.find((p) => p.unidade === DEPOT);
  const divest = paradas.find((p) => p.unidade === DIVEST);
  assert.equal(depot.atual, false, 'o DEPOT devolveu');
  assert.equal(divest.atual, true, 'a DIVEST continua com ele');
  assert.equal(duracaoLegivel(depot.duracaoMs), '8 dias');
});

/* ------------------------------------------------------------------ o selo */

test('com uma unidade só, o selo nomeia e data', () => {
  const marca = selo(trajetoria([criado(DIVCC, 1), remetido(DIVCC, 4), recebido(DEPOT, 4)], AGORA));

  assert.equal(marca.texto, 'aqui há 26 dias');
  assert.equal(marca.detalhe, 'Sem sair da DEPOT desde 04/06/2026');
});

test('com envio simultâneo, o selo conta e detalha uma por linha', () => {
  // Foi este o erro: o selo media a primeira aberta e o título nomeava a
  // última. Com duas abertas não existe "aqui" — existem duas.
  const marca = selo(trajetoria(PARALELO, AGORA));

  assert.equal(marca.texto, 'em 2 unidades');
  assert.deepEqual(marca.detalhe.split('\n'), ['DEPOT há 26 dias', 'DIVEST há 22 dias']);
});

test('processo que saiu e ainda não chegou não tem selo', () => {
  assert.equal(selo(trajetoria([criado(DIVCC, 1), remetido(DIVCC, 4)], AGORA)), null);
});

/* ------------------------------------- o processo aberto em várias unidades */

const { lerUnidadesAbertasEm, lerUnidadesAbertas } = await import('../src/content/core/andamento.js');
const { frasearAbertas } = await import('../src/content/features/trajetoria/trajetoria.js');
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

const DIVIT = 'NIT/NITTRANS/DIVIT';
const DEPGM = 'NIT/NITTRANS/DEPGM';

/**
 * O andamento real do processo NIT-050131/004049/2026, resumido às linhas que
 * movem o processo. Foi ele que mostrou os dois erros do modelo antigo.
 *
 * Ordem das colunas: Data/Hora, Unidade, Usuário, Descrição.
 */
const QUATRO_MIL = [
  ['28/08/2026 15:50', DIVIT, 'lilian.pollard', 'Processo público gerado'],
  // Envio simultâneo: duas linhas no mesmo minuto, mesma origem, colunas
  // diferentes. A coluna é o DESTINO.
  ['28/08/2026 16:28', DEPGM, 'lilian.pollard', `Processo remetido pela unidade ${DIVIT}`],
  ['28/08/2026 16:28', DIVEST, 'lilian.pollard', `Processo remetido pela unidade ${DIVIT}`],
  ['28/08/2026 16:30', DIVEST, 'alan.ribeiro', 'Processo recebido na unidade'],
  ['28/08/2026 16:35', DIVIT, 'leonardo.boechat', `Processo remetido pela unidade ${DIVEST}`],
];

const eventosQuatroMil = () =>
  QUATRO_MIL.map(lerLinha)
    .filter(Boolean)
    .sort((a, b) => (a.quando < b.quando ? -1 : 1));

const AGORA_4K = new Date('2026-08-28T17:00:00').getTime();

test('enviar já abre o processo no destino', () => {
  // O DEPGM nunca recebeu — ninguém de lá abriu o processo — e sumia da rota
  // inteira. No SEI, enviar já abre no destino: o "recebido" só aparece
  // quando alguém de lá abre pela primeira vez, e pode nunca acontecer.
  const paradas = trajetoria(eventosQuatroMil(), AGORA_4K);

  assert.ok(
    paradas.some((p) => p.unidade === DEPGM),
    'o DEPGM tem de estar na rota',
  );
  assert.equal(paradas.find((p) => p.unidade === DEPGM).atual, true, 'e continua aberto lá');
});

test('o recebimento depois do envio não abre parada em dobro', () => {
  // A DIVEST foi aberta pelo envio das 16:28 e recebida às 16:30. É a mesma
  // passagem, não duas.
  const paradas = trajetoria(eventosQuatroMil(), AGORA_4K);

  assert.equal(paradas.filter((p) => p.unidade === DIVEST).length, 1);
});

test('a rota do processo real sai completa', () => {
  const paradas = trajetoria(eventosQuatroMil(), AGORA_4K);

  assert.equal(emUmaLinha(paradas, AGORA_4K), 'DIVIT → DEPGM + DIVEST + DIVIT');
});

/* ------------------------------------------- a caixa "aberto nas unidades" */

test('lê as unidades abertas da caixa do SEI', () => {
  const doc = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('div', {}, ['Processo aberto nas unidades:']),
        elemento('div', {}, [DEPGM]),
        elemento('div', {}, [DIVEST]),
        elemento('div', {}, [DIVIT]),
      ]),
    ]),
  );

  assert.deepEqual(lerUnidadesAbertasEm(doc), [DEPGM, DIVEST, DIVIT]);
});

test('tela sem a caixa devolve null, e não lista vazia', () => {
  // null significa "não sei"; lista vazia significaria "não está aberto em
  // lugar nenhum". Quem chama trata os dois de forma diferente.
  const doc = instalarDocumento(elemento('body', {}, [elemento('p', {}, ['Nada aqui'])]));

  assert.equal(lerUnidadesAbertasEm(doc), null);
});

test('a caixa não arrasta as siglas da tabela de andamento', () => {
  // Sem pegar o MENOR elemento que contém o rótulo, o primeiro casamento
  // seria o <div> que embrulha a página, e viriam junto as unidades que já
  // devolveram o processo.
  const doc = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('div', {}, [
          elemento('div', {}, ['Processo aberto nas unidades:']),
          elemento('div', {}, [DIVEST]),
        ]),
        elemento('table', {}, [
          elemento('tr', {}, [elemento('td', {}, [`Processo remetido pela unidade ${DIVIT}`])]),
        ]),
      ]),
    ]),
  );

  assert.deepEqual(lerUnidadesAbertasEm(doc), [DIVEST]);
});

test('a lista do SEI manda no selo', () => {
  // A DIVEST remeteu às 16:35 e mesmo assim continua aberta: foi enviada com
  // "manter aberto na unidade atual", escolha que o andamento não registra em
  // lugar nenhum. Só a caixa do SEI sabe.
  const paradas = trajetoria(eventosQuatroMil(), AGORA_4K);
  const marca = selo(paradas, [DEPGM, DIVEST, DIVIT]);

  assert.equal(marca.texto, 'em 3 unidades');
  assert.equal(marca.detalhe.split('\n').length, 3);
});

test('sem a caixa, o selo volta a deduzir do andamento', () => {
  const paradas = trajetoria(eventosQuatroMil(), AGORA_4K);

  assert.equal(selo(paradas, null).texto, 'em 2 unidades', 'DEPGM e DIVIT, pelo andamento');
});

test('a frase de abertas lê como gente fala', () => {
  assert.equal(frasearAbertas([DIVEST]), 'Aberto na DIVEST');
  assert.equal(frasearAbertas([DEPGM, DIVEST, DIVIT]), 'Aberto em DEPGM, DIVEST e DIVIT');
  assert.equal(frasearAbertas([]), '');
  assert.equal(frasearAbertas(null), '');
});

test('siglas em elementos irmãos não se colam numa só', () => {
  // textContent concatena os filhos SEM separador: <div>A</div><div>B</div>
  // vira "AB". Procurar a sigla no texto do conjunto produzia uma sigla
  // gigante e inexistente — "NIT/NITTRANS/DEPGMNIT/NITTRANS/DIVEST" —, e é
  // assim que a caixa do SEI é montada, uma unidade por linha.
  const doc = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('span', {}, ['Processo aberto nas unidades:']),
        elemento('div', {}, [DEPGM]),
        elemento('div', {}, [DIVEST]),
      ]),
    ]),
  );

  const lidas = lerUnidadesAbertasEm(doc);
  assert.deepEqual(lidas, [DEPGM, DIVEST]);
  assert.equal(lidas.every((s) => s.split('/').length === 3), true, 'nenhuma sigla grudada');
});

test('a caixa é procurada em todos os frames alcançáveis', () => {
  // A tela do SEI é feita de frames irmãos, e a caixa pode não estar no mesmo
  // frame da tabela de andamento. Procurar só no local devolvia null — e o
  // selo caía na dedução pelo andamento, que NÃO tem como acertar: ela não
  // sabe do "manter aberto na unidade atual" e só erra para menos.
  const semCaixa = instalarDocumento(elemento('body', {}, [elemento('p', {}, ['tabela aqui'])]));
  const comCaixa = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('span', {}, ['Processo aberto nas unidades:']),
        elemento('div', {}, [DEPGM]),
        elemento('div', {}, [DIVEST]),
        elemento('div', {}, [DIVIT]),
      ]),
    ]),
  );

  assert.equal(lerUnidadesAbertas([semCaixa]), null, 'só o frame sem a caixa');
  assert.deepEqual(lerUnidadesAbertas([semCaixa, comCaixa]), [DEPGM, DIVEST, DIVIT]);
});

test('frame inacessível não derruba a busca', () => {
  // Frame de outra origem lança ao ser lido. Um erro ali não pode impedir de
  // achar a caixa no frame seguinte.
  const explode = {
    get body() {
      throw new Error('outra origem');
    },
  };
  const comCaixa = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('span', {}, ['Processo aberto na(s) unidade(s):']),
        elemento('div', {}, [DIVEST]),
      ]),
    ]),
  );

  assert.deepEqual(lerUnidadesAbertas([explode, comCaixa]), [DIVEST]);
});

test('o rótulo com parêntese de plural também casa', () => {
  // "Processo aberto na(s) unidade(s):" aparece em telas do SEI, e a
  // expressão antiga — n[a]s? — não cobria o parêntese.
  const doc = instalarDocumento(
    elemento('body', {}, [
      elemento('div', {}, [
        elemento('span', {}, ['Processo aberto na(s) unidade(s):']),
        elemento('div', {}, [DIVEST]),
      ]),
    ]),
  );

  assert.deepEqual(lerUnidadesAbertasEm(doc), [DIVEST]);
});
