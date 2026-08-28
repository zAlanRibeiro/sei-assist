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

const { lerUnidades, acharUnidadeNaBarra } = await import(
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

/* --------------------------------------------- a regra escrita com sangue */

import fs from 'node:fs';

/**
 * Só o CÓDIGO, sem comentários.
 *
 * A regra proíbe montar URL, não falar sobre montar URL — e o cabeçalho do
 * arquivo precisa justamente explicar por que isso derruba a sessão.
 */
function semComentarios(caminho) {
  return fs
    .readFileSync(caminho, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FONTE = semComentarios('src/content/features/unidade/index.js');
const FONTE_SELETORES = semComentarios('src/content/features/unidade/seletores.js');

test('esta feature nunca monta URL do SEI', () => {
  // A primeira versão montava a URL da tela de troca copiando os parâmetros
  // infra_* da página atual. O infra_hash é calculado POR AÇÃO — é token
  // contra falsificação de requisição. Copiado de uma ação para outra, dá
  // "hash inválido" na navegação e DERRUBA A SESSÃO numa busca em segundo
  // plano. Foi o que aconteceu com o usuário.
  //
  // A URL certa quem sabe é o link do próprio SEI. Aciona-se o link.
  for (const proibido of ['infra_hash', 'infra_sistema', 'controlador.php', 'new URL(']) {
    for (const [nome, fonte] of [
      ['index.js', FONTE],
      ['seletores.js', FONTE_SELETORES],
    ]) {
      assert.equal(
        fonte.includes(proibido),
        false,
        `${nome} monta URL do SEI ("${proibido}") — foi isso que derrubou a sessão`,
      );
    }
  }
});

test('esta feature não faz requisição nenhuma', () => {
  // A lista vem da tela que a pessoa abriu, não de uma consulta. Buscar em
  // segundo plano foi exatamente o caminho que matou a sessão.
  for (const proibido of ['rede.js', 'fetch(', 'buscarHtml', 'XMLHttpRequest']) {
    assert.equal(FONTE.includes(proibido), false, `index.js consulta o SEI ("${proibido}")`);
  }
});

test('a navegação sai do link do SEI, não de location.href', () => {
  assert.equal(
    /location\.href\s*=/.test(FONTE),
    false,
    'navegar por conta própria exige montar URL — e URL montada derruba a sessão',
  );
  assert.ok(FONTE.includes('ancora.click()'), 'a navegação tem de acionar o link do SEI');
});
