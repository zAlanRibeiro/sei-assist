/**
 * Testes da lista de blocos de assinatura.
 *
 * Os dados vêm do HTML real de leste.sei.rj.gov.br (SEI 5.0.4), tela
 * `bloco_assinatura_listar`. As células chegam já reduzidas a
 * { rotulo, texto } — mesma divisão que o andamento.js usa, e que permite
 * exercitar a interpretação sem navegador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const {
  comparar,
  contar,
  ehDaUnidade,
  estaAberto,
  lerLinhaDeBloco,
  primeiraLeitura,
  relevantes,
} = await import('../src/content/features/bloco/blocos.js');

const MINHA = 'NIT/NITTRANS/DIVEST';

/** A linha real capturada da tela, com as colunas que o SEI entrega. */
function linha({ numero = '2146', estado = 'Recebido', unidades = [MINHA] } = {}) {
  return [
    { rotulo: '', texto: '' }, // coluna do checkbox
    { rotulo: 'Número', texto: numero },
    { rotulo: 'Sinalizações', texto: '' },
    { rotulo: 'Atribuição', texto: '' },
    { rotulo: 'Estado', texto: estado },
    { rotulo: 'Geradora', texto: 'NIT/NITTRANS/DIVCC' },
    { rotulo: 'Disponibilização', texto: unidades.join(''), unidades },
    { rotulo: 'Grupo', texto: '' },
    { rotulo: 'Descrição', texto: '' },
    { rotulo: 'Ações', texto: '' },
  ];
}

/* ------------------------------------------------------------ uma linha */

test('lê a linha real da tela de blocos', () => {
  const bloco = lerLinhaDeBloco(
    linha({ unidades: ['NIT/NITTRANS/DEPOT', MINHA, 'NIT/NITTRANS/DIVIT'] }),
  );

  assert.equal(bloco.numero, '2146');
  assert.equal(bloco.estado, 'Recebido');
  assert.equal(bloco.geradora, 'NIT/NITTRANS/DIVCC');
  assert.deepEqual(bloco.unidades, ['NIT/NITTRANS/DEPOT', MINHA, 'NIT/NITTRANS/DIVIT']);
});

test('a coluna é achada pelo rótulo, não pela posição', () => {
  // O data-label da célula dispensa contar colunas. Se o SEI acrescentar uma
  // coluna no meio, isto continua funcionando.
  const embaralhada = [...linha()].reverse();
  assert.equal(lerLinhaDeBloco(embaralhada).numero, '2146');
  assert.equal(lerLinhaDeBloco(embaralhada).estado, 'Recebido');
});

test('acento e caixa do rótulo não importam', () => {
  const bloco = lerLinhaDeBloco([
    { rotulo: 'NUMERO', texto: '9' },
    { rotulo: 'estado', texto: 'Gerado' },
  ]);
  assert.equal(bloco.numero, '9');
  assert.equal(bloco.estado, 'Gerado');
});

test('linha sem número não vira bloco', () => {
  // Cabeçalho e linha de "nenhum registro" caem aqui.
  assert.equal(lerLinhaDeBloco([{ rotulo: 'Número', texto: '' }]), null);
  assert.equal(lerLinhaDeBloco([]), null);
  assert.equal(lerLinhaDeBloco(null), null);
});

/* --------------------------------------------------------------- filtros */

test('só estado aberto interessa', () => {
  for (const estado of ['Gerado', 'Disponibilizado', 'Recebido', 'Retornado']) {
    assert.equal(estaAberto({ estado }), true, `${estado} deveria contar`);
  }
  // A própria tela do SEI já vem com o filtro de Concluído desmarcado.
  assert.equal(estaAberto({ estado: 'Concluído' }), false);
});

test('bloco de outra unidade não gera alerta', () => {
  const bloco = lerLinhaDeBloco(linha({ unidades: ['NIT/NITTRANS/DIVIT'] }));
  assert.equal(ehDaUnidade(bloco, MINHA), false);
});

test('bloco disponibilizado para a sua unidade entre várias conta', () => {
  const bloco = lerLinhaDeBloco(
    linha({ unidades: ['NIT/NITTRANS/DEPOT', MINHA, 'NIT/NITTRANS/DIVIT'] }),
  );
  assert.equal(ehDaUnidade(bloco, MINHA), true);
});

test('sem lista de unidades, assume que é seu', () => {
  // O SEI nem sempre preenche a coluna. Perder o seu bloco é pior que um
  // alerta a mais.
  assert.equal(ehDaUnidade({ unidades: [] }, MINHA), true);
  assert.equal(ehDaUnidade({ unidades: [MINHA] }, ''), true);
});

test('o corte por relevância vem antes da comparação', () => {
  const lista = [
    lerLinhaDeBloco(linha({ numero: '1', estado: 'Recebido', unidades: [MINHA] })),
    lerLinhaDeBloco(linha({ numero: '2', estado: 'Concluído', unidades: [MINHA] })),
    lerLinhaDeBloco(linha({ numero: '3', estado: 'Recebido', unidades: ['NIT/OUTRA'] })),
  ];
  assert.deepEqual(relevantes(lista, MINHA).map((b) => b.numero), ['1']);
});

/* ------------------------------------------------------------ comparação */

test('bloco que não existia antes é novo', () => {
  const antes = [lerLinhaDeBloco(linha({ numero: '2146' }))];
  const agora = [...antes, lerLinhaDeBloco(linha({ numero: '2147' }))];

  const { novos, mudados } = comparar(antes, agora);
  assert.deepEqual(novos.map((b) => b.numero), ['2147']);
  assert.deepEqual(mudados, []);
});

test('bloco que mudou de estado é "mudado", não "novo"', () => {
  // A distinção importa: novo é "chegou trabalho", mudado costuma ser
  // "voltou para você". O texto do alerta é diferente.
  const antes = [lerLinhaDeBloco(linha({ estado: 'Disponibilizado' }))];
  const agora = [lerLinhaDeBloco(linha({ estado: 'Recebido' }))];

  const { novos, mudados } = comparar(antes, agora);
  assert.deepEqual(novos, []);
  assert.equal(mudados.length, 1);
  assert.equal(mudados[0].estadoAnterior, 'Disponibilizado');
  assert.equal(mudados[0].estado, 'Recebido');
});

test('mais unidades no mesmo bloco também é mudança', () => {
  // O bloco foi disponibilizado para mais gente desde a última olhada.
  const antes = [lerLinhaDeBloco(linha({ unidades: [MINHA] }))];
  const agora = [lerLinhaDeBloco(linha({ unidades: [MINHA, 'NIT/OUTRA'] }))];
  assert.equal(comparar(antes, agora).mudados.length, 1);
});

test('nada mudou: nenhum alerta', () => {
  const lista = [lerLinhaDeBloco(linha())];
  assert.deepEqual(comparar(lista, lista), { novos: [], mudados: [] });
  assert.equal(contar(comparar(lista, lista)), 0);
});

test('bloco que sumiu da lista não vira alerta', () => {
  // Foi assinado ou concluído: é o desfecho normal, não uma novidade.
  const antes = [lerLinhaDeBloco(linha({ numero: '1' })), lerLinhaDeBloco(linha({ numero: '2' }))];
  const agora = [lerLinhaDeBloco(linha({ numero: '1' }))];
  assert.equal(contar(comparar(antes, agora)), 0);
});

/* --------------------------------------------------------- primeira vez */

test('a primeira leitura não alerta', () => {
  // Instalar a extensão com quinze blocos parados não pode disparar quinze
  // avisos de "chegou agora".
  assert.equal(primeiraLeitura(null), true);
  assert.equal(primeiraLeitura(undefined), true);
});

test('lista vazia guardada não é primeira leitura', () => {
  // Diferença sutil e importante: já olhamos antes e não havia nada. Um bloco
  // que aparecer agora É novidade.
  assert.equal(primeiraLeitura([]), false);
  assert.deepEqual(comparar([], [lerLinhaDeBloco(linha())]).novos.length, 1);
});

/* ------------------------------------------------- ritmo e redesenho */

const { estaNaHora } = await import('../src/content/features/bloco/armazenamento.js');
const { precisaRedesenhar } = await import('../src/content/features/bloco/aviso.js');

const AGORA = new Date('2026-08-27T10:00:00Z').getTime();
const atras = (min) => new Date(AGORA - min * 60 * 1000).toISOString();

test('nunca consultado: consulta agora', () => {
  assert.equal(estaNaHora(null, 10 * 60 * 1000, AGORA), true);
});

test('o intervalo é contado pelo relógio, não por timer', () => {
  // O content script morre a cada navegação e o SEI navega o tempo todo. Sem
  // o carimbo guardado, trocar de tela cinquenta vezes daria cinquenta
  // consultas.
  assert.equal(estaNaHora(atras(3), 10 * 60 * 1000, AGORA), false);
  assert.equal(estaNaHora(atras(11), 10 * 60 * 1000, AGORA), true);
});

test('relógio para trás não trava a consulta para sempre', () => {
  // Troca de fuso ou ajuste de hora deixaria um carimbo no futuro.
  const futuro = new Date(AGORA + 60 * 60 * 1000).toISOString();
  assert.equal(estaNaHora(futuro, 10 * 60 * 1000, AGORA), true);
});

test('carimbo corrompido não trava a consulta', () => {
  assert.equal(estaNaHora('nao é data', 10 * 60 * 1000, AGORA), true);
});

test('não redesenha o menu quando nada mudou', () => {
  // Quem chama marcarMenu é um MutationObserver sobre o body. Redesenhar sem
  // necessidade dispara o observer, que redesenha de novo: laço infinito.
  assert.equal(precisaRedesenhar(['3', '3'], 3), false);
  assert.equal(precisaRedesenhar([], 0), false);
});

test('redesenha quando o número muda ou o selo sumiu', () => {
  assert.equal(precisaRedesenhar(['3', '3'], 4), true);
  assert.equal(precisaRedesenhar([], 2), true);
  // O SEI remonta o menu ao expandir e leva o selo junto.
  assert.equal(precisaRedesenhar(['3'], 3), false);
  assert.equal(precisaRedesenhar(['3', '2'], 3), true, 'selos dessincronizados');
});

test('zerar apaga os selos existentes', () => {
  assert.equal(precisaRedesenhar(['3', '3'], 0), true);
});
