/**
 * Testes da troca de unidade.
 *
 * Duas coisas aqui já tinham cobrado caro neste projeto e por isso têm teste
 * próprio: a barra do SEI traz DUAS cópias de cada elemento com o mesmo id, e
 * o `data-label` das tabelas não existe no HTML que vem do servidor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { lerUnidades, acharUnidadeNaBarra, urlDaTroca, TROCA } = await import(
  '../src/content/features/unidade/seletores.js'
);
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

/* ------------------------------------------------------- a barra do topo */

/**
 * A barra real do SEI 5.0.4: o mesmo `id` duas vezes, uma para tela estreita
 * (`d-md-none`) e outra para tela larga (`d-none d-md-flex`).
 */
function barraReal({ visivelEhASegunda = true } = {}) {
  const link = (texto) =>
    elemento('a', {
      id: 'lnkInfraUnidade',
      class: 'form-control infraAcaoBarraConjugada',
      title: 'Divisão de Estatísticas',
      href: '#',
    }, [texto]);

  const movel = link('NIT/NITTRANS/DIVEST');
  const padrao = link('NIT/NITTRANS/DIVEST');

  // O domFalso não tem layout; simulamos a visibilidade como o navegador a
  // reporta: getClientRects() vazio para quem está escondido.
  movel.getClientRects = () => (visivelEhASegunda ? [] : [{}]);
  padrao.getClientRects = () => (visivelEhASegunda ? [{}] : []);

  const raiz = elemento('div', { id: 'divInfraBarraSistema' }, [
    elemento('div', { id: 'divInfraBarraSistemaMovel', class: 'd-md-none' }, [movel]),
    elemento('div', { id: 'divInfraBarraSistemaPadraoD', class: 'd-none d-md-flex' }, [padrao]),
  ]);

  return { raiz, movel, padrao };
}

test('a barra tem duas cópias do mesmo id e pegamos a visível', () => {
  // getElementById devolveria a PRIMEIRA, que em tela larga é a escondida.
  // Foi esse erro que fez a marca "Assist" não aparecer.
  const { raiz, padrao } = barraReal();
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), padrao, 'a de tela larga é a visível aqui');
});

test('em tela estreita, a visível é a outra', () => {
  const { raiz, movel } = barraReal({ visivelEhASegunda: false });
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), movel);
});

test('barra sem unidade nenhuma não quebra', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['nada aqui'])]);
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), null);
});

/* ------------------------------------------------- a tela de troca */

/**
 * A tabela real de "Trocar Unidade".
 *
 * @param {boolean} comDataLabel  o HTML do servidor NÃO tem esses atributos;
 *   quem os põe é o JavaScript do SEI, depois. Por isso os dois casos.
 */
function telaDeTroca(unidades, { comDataLabel = true } = {}) {
  const th = (t) => elemento('th', { class: 'infraTh' }, [t]);

  const linha = (u, i) => {
    const radio = elemento('input', {
      id: `chkInfraItem${i}`,
      name: 'chkInfraItem',
      class: 'infraRadioInput',
      type: 'radio',
      title: u.sigla,
      ...(u.atual ? { checked: 'checked' } : {}),
    });

    const td = (rotulo, texto) =>
      elemento('td', comDataLabel ? { 'data-label': rotulo } : {}, [texto]);

    return elemento('tr', { class: 'infraTrClara' }, [
      elemento('td', comDataLabel ? { 'data-label': ' ' } : {}, [
        elemento('div', { class: 'infraRadioDiv' }, [
          radio,
          elemento('label', { class: 'infraRadioLabel', for: `chkInfraItem${i}` }, []),
        ]),
      ]),
      td('Sigla', u.sigla),
      td('Descrição', u.descricao),
      td('Órgão', u.orgao),
    ]);
  };

  return elemento('body', {}, [
    elemento('form', { id: 'frmInfraSelecaoUnidade' }, [
      elemento('table', { class: 'infraTableResponsiva infraTable' }, [
        elemento('tr', {}, [th(''), th('Sigla'), th('Descrição'), th('Órgão')]),
        ...unidades.map(linha),
      ]),
    ]),
  ]);
}

const TRES = [
  { sigla: 'NIT/NITTRANS/DIVEST', descricao: 'Divisão de Estatísticas', orgao: 'NITEROI', atual: true },
  { sigla: 'NIT/NITTRANS/DEPGM', descricao: 'Departamento Geral', orgao: 'NITEROI' },
  { sigla: 'NIT/NITTRANS/CHEFGAB', descricao: 'Chefia de Gabinete', orgao: 'NITEROI' },
];

test('lê as unidades da tela de troca', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));
  const lidas = lerUnidades(doc);

  assert.equal(lidas.length, 3);
  assert.deepEqual(lidas.map((u) => u.sigla), TRES.map((u) => u.sigla));
  assert.equal(lidas[0].descricao, 'Divisão de Estatísticas');
  assert.equal(lidas[0].idDoCampo, 'chkInfraItem0');
});

test('a unidade atual é a que está marcada', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));
  const lidas = lerUnidades(doc);

  assert.deepEqual(lidas.map((u) => u.atual), [true, false, false]);
});

test('sem data-label, lê pelo cabeçalho', () => {
  // O HTML que vem do servidor não tem data-label: quem põe é o JavaScript do
  // SEI. A lista de blocos com dois registros já foi lida como zero por causa
  // disso, em silêncio.
  const doc = instalarDocumento(telaDeTroca(TRES, { comDataLabel: false }));
  const lidas = lerUnidades(doc);

  assert.equal(lidas.length, 3);
  assert.equal(lidas[1].sigla, 'NIT/NITTRANS/DEPGM');
  assert.equal(lidas[1].descricao, 'Departamento Geral');
});

test('a linha de cabeçalho não vira unidade', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));

  assert.equal(
    lerUnidades(doc).some((u) => u.sigla === 'Sigla'),
    false,
  );
});

test('tela sem tabela devolve lista vazia, não erro', () => {
  const doc = instalarDocumento(elemento('body', {}, [elemento('p', {}, ['Nada'])]));

  assert.deepEqual(lerUnidades(doc), []);
});

test('o title do rádio salva quando a coluna Sigla não é encontrada', () => {
  // Rede para instalação com a tabela em outra forma: o rádio traz a sigla.
  const raiz = elemento('body', {}, [
    elemento('form', { id: 'frmInfraSelecaoUnidade' }, [
      elemento('table', { class: 'infraTable' }, [
        elemento('tr', {}, [elemento('th', {}, ['']), elemento('th', {}, ['Outra coisa'])]),
        elemento('tr', {}, [
          elemento('td', {}, [
            elemento('input', {
              id: 'chkInfraItem0',
              name: 'chkInfraItem',
              type: 'radio',
              title: 'NIT/NITTRANS/DEPGM',
            }),
          ]),
          elemento('td', {}, ['irrelevante']),
        ]),
      ]),
    ]),
  ]);

  assert.equal(lerUnidades(instalarDocumento(raiz))[0].sigla, 'NIT/NITTRANS/DEPGM');
});

/* ----------------------------------------------------------- a URL */

const URL_REAL =
  'https://leste.sei.rj.gov.br/sei/controlador.php?acao=procedimento_controlar&reset=1' +
  '&infra_sistema=100000100&infra_unidade_atual=110001775&infra_hash=55eb5f679a897b4d';

test('a URL da troca reaproveita os parâmetros de sessão', () => {
  // infra_hash muda a cada sessão. Montar a URL a partir da barra de endereços
  // evita guardar token nenhum — e evita link guardado envelhecer com a sessão.
  const url = new URL(urlDaTroca(URL_REAL));

  assert.equal(url.searchParams.get('acao'), TROCA.acao);
  assert.equal(url.searchParams.get('infra_hash'), '55eb5f679a897b4d');
  assert.equal(url.searchParams.get('infra_unidade_atual'), '110001775');
});

test('parâmetros que não são de sessão ficam de fora', () => {
  const url = new URL(urlDaTroca(URL_REAL));

  assert.equal(url.searchParams.get('reset'), null, 'reset é da outra tela');
});

test('URL sem parâmetros de sessão não vira link', () => {
  // Melhor não oferecer a troca do que mandar a pessoa para uma tela de erro.
  assert.equal(urlDaTroca('https://leste.sei.rj.gov.br/sei/controlador.php?acao=x'), null);
  assert.equal(urlDaTroca('nem é url'), null);
});

test('a marca de atual vale como atributo e como propriedade', () => {
  // No HTML buscado do servidor vem checked="checked"; na tela viva, um clique
  // muda a propriedade sem tocar no atributo. Ler só uma das duas erraria em
  // metade dos casos.
  const doc = instalarDocumento(telaDeTroca(TRES));
  assert.equal(lerUnidades(doc)[0].atual, true, 'pelo atributo');

  const semAtributo = instalarDocumento(
    telaDeTroca(TRES.map((u) => ({ ...u, atual: false }))),
  );
  semAtributo.getElementById('chkInfraItem1').checked = true;
  assert.deepEqual(lerUnidades(semAtributo).map((u) => u.atual), [false, true, false], 'pela propriedade');
});
