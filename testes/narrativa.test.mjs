/**
 * Testes da narrativa do andamento.
 *
 * O risco aqui não é a frase sair feia — é ela sair ERRADA ou sair de menos.
 * Um histórico "completo" que engole uma linha é pior que nenhum, porque a
 * pessoa deixa de olhar a tabela confiando nele. Por isso os testes que mais
 * importam são os dois do fim: nada some, e o que não se entende é repetido.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { narrar, frasear, encurtarSiglas, dataHoraLegivel } = await import(
  '../src/content/features/trajetoria/narrativa.js'
);

const DIVCC = 'NIT/NITTRANS/DIVCC';
const DEPOT = 'NIT/NITTRANS/DEPOT';

const em = (dia, hora = '09:00') => new Date(`2026-06-${String(dia).padStart(2, '0')}T${hora}:00`).toISOString();

const ev = (tipo, dia, hora, extra = {}) => ({
  tipo,
  quando: em(dia, hora),
  unidade: null,
  documento: null,
  usuario: null,
  descricao: '',
  ...extra,
});

/* ------------------------------------------------------------- as frases */

test('processo aberto', () => {
  assert.equal(
    frasear(ev('processoCriado', 1, '09:00', { unidade: DIVCC, usuario: 'alan.ribeiro' })),
    'Processo aberto na DIVCC por alan.ribeiro.',
  );
});

test('documento criado leva o número', () => {
  assert.equal(
    frasear(ev('documentoCriado', 1, '09:00', { unidade: DIVCC, documento: '00009400' })),
    'Documento 00009400 criado na DIVCC.',
  );
});

test('envio com destino conhecido vira uma frase só', () => {
  assert.equal(
    frasear(ev('remetido', 4, '16:59', { unidade: DIVCC }), DEPOT),
    'Enviado da DIVCC para a DEPOT.',
  );
});

test('envio sem destino conhecido não inventa destino', () => {
  // O SEI só diz de onde saiu. Chutar para onde foi seria mentir.
  assert.equal(frasear(ev('remetido', 4, '16:59', { unidade: DIVCC })), 'Enviado pela DIVCC.');
});

test('linha que a extensão não entende sai com a frase do SEI', () => {
  const frase = frasear(
    ev(null, 5, '10:00', { descricao: 'Conclusão do processo na unidade NIT/NITTRANS/DIVCC' }),
  );
  assert.equal(frase, 'Conclusão do processo na unidade DIVCC.');
});

/* ------------------------------------------------------------- as siglas */

test('a sigla longa é encurtada dentro do texto', () => {
  assert.equal(encurtarSiglas(`Reabertura na ${DEPOT} hoje`), 'Reabertura na DEPOT hoje');
});

test('abreviação curta com barra é preservada', () => {
  // "S/N" virando "N" mudaria o sentido da frase.
  assert.equal(encurtarSiglas('Endereço S/N confirmado'), 'Endereço S/N confirmado');
});

test('texto sem sigla nenhuma passa intacto', () => {
  assert.equal(encurtarSiglas('Processo reaberto'), 'Processo reaberto');
});

test('data e hora no formato de quem lê', () => {
  assert.equal(dataHoraLegivel(em(2, '16:59')), '02/06/2026 16:59');
  assert.equal(dataHoraLegivel('nada disso'), '');
});

/* ---------------------------------------------------------- a montagem */

test('remetido e recebido do mesmo minuto viram um registro só', () => {
  const linhas = narrar([
    ev('remetido', 4, '16:59', { unidade: DIVCC, usuario: 'alan.ribeiro' }),
    ev('recebido', 4, '16:59', { unidade: DEPOT, usuario: 'alan.ribeiro' }),
  ]);

  assert.equal(linhas.length, 1);
  assert.equal(linhas[0].texto, 'Enviado da DIVCC para a DEPOT por alan.ribeiro.');
});

test('recebimento em outro dia aparece sozinho', () => {
  // A unidade de destino só abriu o processo depois; são dois fatos.
  const linhas = narrar([
    ev('remetido', 4, '16:59', { unidade: DIVCC }),
    ev('recebido', 8, '09:10', { unidade: DEPOT, usuario: 'maria.souza' }),
  ]);

  assert.equal(linhas.length, 2);
  assert.equal(linhas[0].texto, 'Enviado pela DIVCC.');
  assert.equal(linhas[1].texto, 'Recebido na DEPOT por maria.souza.');
});

test('nada some do histórico', () => {
  // A promessa é "completo". O único descarte permitido é o "recebido" que já
  // foi dito junto com o "remetido" do mesmo instante.
  const eventos = [
    ev('processoCriado', 1, '09:00', { unidade: DIVCC }),
    ev(null, 2, '11:00', { descricao: 'Assinatura do documento 00009400' }),
    ev(null, 3, '08:30', { descricao: 'Processo incluído no bloco de assinatura 42' }),
    ev('remetido', 4, '16:59', { unidade: DIVCC }),
    ev('recebido', 4, '16:59', { unidade: DEPOT }),
    ev(null, 9, '14:00', { descricao: 'Conclusão do processo na unidade ' + DEPOT }),
  ];

  const linhas = narrar(eventos);

  assert.equal(linhas.length, eventos.length - 1, 'só o recebido pareado sai');
  for (const bruto of eventos) {
    if (bruto.tipo || !bruto.descricao) continue;
    const pedaco = bruto.descricao.split(' ').slice(0, 3).join(' ');
    assert.ok(
      linhas.some((l) => l.texto.startsWith(pedaco)),
      `sumiu do histórico: ${bruto.descricao}`,
    );
  }
});

test('o intervalo só aparece a partir de um dia', () => {
  const linhas = narrar([
    ev('processoCriado', 1, '09:00', { unidade: DIVCC }),
    ev(null, 1, '15:00', { descricao: 'Assinatura do documento' }),
    ev(null, 6, '15:00', { descricao: 'Reabertura do processo' }),
  ]);

  assert.equal(linhas[0].intervalo, '', 'o primeiro não tem anterior');
  assert.equal(linhas[1].intervalo, '', 'seis horas depois é ruído');
  assert.equal(linhas[2].intervalo, '5 dias');
});

test('o intervalo conta desde o registro anterior mostrado', () => {
  // O "recebido" engolido não pode levar a âncora junto. Contar a partir dele
  // ou a partir do envio daria o mesmo (são do mesmo minuto) — o que este
  // teste cerca é o descarte zerar a âncora e a linha seguinte ficar sem
  // intervalo nenhum.
  const linhas = narrar([
    ev('remetido', 4, '09:00', { unidade: DIVCC }),
    ev('recebido', 4, '09:00', { unidade: DEPOT }),
    ev(null, 10, '09:00', { descricao: 'Reabertura do processo' }),
  ]);

  assert.equal(linhas.length, 2);
  assert.equal(linhas[1].intervalo, '6 dias');
});

test('lista vazia não quebra', () => {
  assert.deepEqual(narrar([]), []);
  assert.deepEqual(narrar(null), []);
});

/* ------------------------------------------------------------ os e-mails */

const { encurtarEmails } = await import('../src/content/features/trajetoria/narrativa.js');
const EMAIL_INST = 'alan.ribeiro@nittrans.niteroi.rj.gov.br';

test('o e-mail institucional vira só o nome', () => {
  // O domínio é o mesmo para todo mundo do órgão: não distingue ninguém, e
  // sozinho é mais comprido que a frase toda.
  assert.equal(encurtarEmails(EMAIL_INST), 'alan.ribeiro');
});

test('texto sem e-mail passa intacto', () => {
  assert.equal(encurtarEmails('Reabertura do processo'), 'Reabertura do processo');
});

test('o usuário da frase sai sem o domínio', () => {
  assert.equal(
    frasear(ev('processoCriado', 1, '09:00', { unidade: DIVCC, usuario: EMAIL_INST })),
    'Processo aberto na DIVCC por alan.ribeiro.',
  );
});

test('o e-mail dentro da frase do SEI também encurta', () => {
  // É a linha real do andamento: assinatura não é um tipo que a extensão
  // entenda, então a frase é repetida — e é aí que o e-mail aparece inteiro.
  assert.equal(
    frasear(ev(null, 2, '15:34', { descricao: `Assinado Documento 00098329 por ${EMAIL_INST}` })),
    'Assinado Documento 00098329 por alan.ribeiro.',
  );
});
