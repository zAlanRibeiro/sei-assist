/**
 * Simulação da tela "Blocos de Assinatura".
 *
 * Os testes de blocos.test.mjs exercitam a lógica pura, com as células já
 * prontas. Aqui o caminho é o de verdade: a estrutura HTML capturada de
 * leste.sei.rj.gov.br (SEI 5.0.4) é montada nó a nó e passa por
 * `lerBlocos()` — a camada que toca o DOM, e a que não tinha cobertura.
 *
 * A estrutura abaixo é cópia fiel da captura: mesmos ids, mesmas classes,
 * mesmos `data-label`, mesma coluna de Disponibilização com um div por
 * unidade. Se o SEI mudar, é aqui que se vê primeiro.
 *
 * O que isto NÃO prova: se o Chrome deixa o fetch sair. Só um navegador
 * responde isso.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { elemento, instalarDocumento } from './domFalso.mjs';

globalThis.chrome = { runtime: { id: 'teste' } };

const MINHA = 'NIT/NITTRANS/DIVEST';

/* ------------------------------------------------- a tabela real do SEI */

const COLUNAS = [
  'Número',
  'Sinalizações',
  'Atribuição',
  'Estado',
  'Geradora',
  'Disponibilização',
  'Grupo',
  'Descrição',
  'Ações',
];

function cabecalho() {
  return elemento('tr', {}, [
    // A primeira coluna é a do "Selecionar Tudo", sem rótulo.
    elemento('th', { class: 'infraTh' }, [elemento('a', { id: 'lnkInfraCheck' })]),
    ...COLUNAS.map((rotulo) =>
      elemento('th', { class: 'infraTh' }, [
        // O SEI embrulha o rótulo em divs de ordenação, com âncoras que só
        // contêm <img>. É por isso que o textContent ainda dá o rótulo.
        elemento('div', { class: 'infraDivOrdenacao' }, [
          elemento('div', { class: 'infraDivRotuloOrdenacao' }, [rotulo]),
          elemento('div', { class: 'infraDivSetaOrdenacao' }, [
            elemento('a', {}, [elemento('img', { class: 'infraImgOrdenacao' })]),
          ]),
        ]),
      ]),
    ),
  ]);
}

function celulaDisponibilizacao(unidades) {
  return elemento(
    'td',
    { 'data-label': 'Disponibilização' },
    unidades.map((sigla, i) =>
      elemento('div', { id: `divUnidadeDisp${i}`, class: 'unidadeDisp' }, [
        elemento('img', { class: 'infraImg', title: 'Aguardando Devolução' }),
        elemento('a', { class: 'ancoraSigla', href: 'javascript:void(0);' }, [sigla]),
      ]),
    ),
  );
}

function linhaDeBloco({ numero = '2146', estado = 'Recebido', unidades = [MINHA] } = {}) {
  return elemento('tr', { class: 'infraTrClara' }, [
    elemento('td', {}, [
      elemento('a', { id: `lnkInfraID-${numero}`, name: `ID-${numero}` }),
      elemento('div', { class: 'infraCheckboxDiv' }, [
        elemento('input', { id: 'chkInfraItem0', type: 'checkbox', title: numero }),
      ]),
    ]),
    elemento('td', { 'data-label': 'Número' }, [
      elemento(
        'a',
        { class: 'ancoraPadraoPreta', href: '...acao=rel_bloco_protocolo_listar...' },
        [numero],
      ),
    ]),
    elemento('td', { 'data-label': 'Sinalizações' }, [
      elemento('a', {}, [elemento('img', { class: 'infraImg' })]),
    ]),
    elemento('td', { 'data-label': 'Atribuição' }),
    elemento('td', { 'data-label': 'Estado' }, [estado]),
    elemento('td', { 'data-label': 'Geradora' }, [
      elemento('a', { class: 'ancoraSigla' }, ['NIT/NITTRANS/DIVCC']),
    ]),
    celulaDisponibilizacao(unidades),
    elemento('td', { 'data-label': 'Grupo' }),
    elemento('td', { 'data-label': 'Descrição' }),
    elemento('td', { 'data-label': 'Ações' }, [
      elemento('a', {}, [elemento('img', { title: 'Assinar Documentos do Bloco' })]),
    ]),
  ]);
}

/** O menu lateral, com "Blocos" > "Assinatura", como na captura. */
function menuLateral() {
  const assinatura = elemento('li', {}, [
    elemento('a', { id: 'linkMenu3', href: '...acao=bloco_assinatura_listar...' }, [
      elemento('span', {}, ['Assinatura']),
    ]),
  ]);

  return elemento('ul', { id: 'infraMenu' }, [
    elemento('li', {}, [
      elemento('a', { id: 'linkMenu1', href: '...acao=base_conhecimento_pesquisar...' }, [
        elemento('span', {}, ['Base de Conhecimento']),
      ]),
    ]),
    elemento('li', {}, [
      elemento('a', { id: 'linkMenu2', class: 'infraAnchorMenu', href: '#infraSubMenu2' }, [
        elemento('img', {}),
        elemento('span', {}, ['Blocos']),
        elemento('img', { class: 'infraImgSetaMenu' }),
      ]),
      elemento('ul', { id: 'infraSubMenu2', class: 'collapse show' }, [
        assinatura,
        elemento('li', {}, [
          elemento('a', { id: 'linkMenu4', href: '...acao=bloco_interno_listar...' }, [
            elemento('span', {}, ['Internos']),
          ]),
        ]),
      ]),
    ]),
  ]);
}

/** A página inteira: barra do topo, menu e tabela. */
function pagina(linhas) {
  return elemento('body', {}, [
    elemento('div', { id: 'divInfraBarraSistema' }, [
      elemento('a', { id: 'lnkInfraUnidade', href: '#' }, [MINHA]),
    ]),
    menuLateral(),
    elemento('div', { id: 'divInfraAreaTabela' }, [
      elemento('table', { id: 'tblBlocos', class: 'infraTableResponsiva infraTable' }, [
        elemento('tbody', {}, [cabecalho(), ...linhas]),
      ]),
    ]),
  ]);
}

const raiz = pagina([linhaDeBloco()]);
instalarDocumento(raiz);

const { lerBlocos, mapaDeColunas, unidadeAtual, urlDaLista } = await import(
  '../src/content/features/bloco/seletores.js'
);
const { comparar, contar, relevantes } = await import(
  '../src/content/features/bloco/blocos.js'
);
const { marcarMenu, limparSelos } = await import('../src/content/features/bloco/aviso.js');

/* --------------------------------------------------------- leitura da tela */

test('lê o bloco 2146 da estrutura real', () => {
  const blocos = lerBlocos(raiz);

  assert.equal(blocos.length, 1, 'o cabeçalho não pode virar bloco');
  const [bloco] = blocos;
  assert.equal(bloco.numero, '2146');
  assert.equal(bloco.estado, 'Recebido');
  assert.equal(bloco.geradora, 'NIT/NITTRANS/DIVCC');
});

test('separa as unidades da coluna Disponibilização', () => {
  // São três divs numa célula só. Guardar o texto corrido perderia a divisão
  // entre elas, e com ela a resposta de "este bloco é meu?".
  const alvo = pagina([
    linhaDeBloco({ unidades: ['NIT/NITTRANS/DEPOT', MINHA, 'NIT/NITTRANS/DIVIT'] }),
  ]);
  const [bloco] = lerBlocos(alvo);

  assert.deepEqual(bloco.unidades, ['NIT/NITTRANS/DEPOT', MINHA, 'NIT/NITTRANS/DIVIT']);
});

test('o cabeçalho vira mapa de colunas mesmo com as divs de ordenação', () => {
  // As âncoras de ordenar só têm <img>, então o texto que sobra é o rótulo.
  const tabela = raiz.querySelector('#tblBlocos');
  const mapa = mapaDeColunas(tabela);

  assert.equal(mapa['numero'], 1, 'a coluna 0 é a do checkbox');
  assert.equal(mapa['estado'], 4);
});

test('tela sem tabela devolve lista vazia, não erro', () => {
  assert.deepEqual(lerBlocos(elemento('body')), []);
});

test('a URL da lista sai do menu, com o hash da sessão', () => {
  // Montar a URL na mão erraria o infra_hash e derrubaria a sessão.
  assert.equal(urlDaLista(raiz), '...acao=bloco_assinatura_listar...');
});

test('acha a unidade atual na barra do topo', () => {
  assert.equal(unidadeAtual(raiz), MINHA);
});

/* ------------------------------------------------- o ciclo do alerta */

test('primeira olhada registra, segunda acusa o bloco novo', () => {
  const antes = relevantes(lerBlocos(pagina([linhaDeBloco({ numero: '2146' })])), MINHA);
  assert.equal(antes.length, 1);

  const depois = relevantes(
    lerBlocos(pagina([linhaDeBloco({ numero: '2146' }), linhaDeBloco({ numero: '2147' })])),
    MINHA,
  );

  const mudanca = comparar(antes, depois);
  assert.equal(contar(mudanca), 1);
  assert.equal(mudanca.novos[0].numero, '2147');
});

test('bloco de outra unidade não entra na contagem', () => {
  const lista = lerBlocos(
    pagina([
      linhaDeBloco({ numero: '1', unidades: [MINHA] }),
      linhaDeBloco({ numero: '2', unidades: ['NIT/NITTRANS/DIVIT'] }),
    ]),
  );
  assert.deepEqual(relevantes(lista, MINHA).map((b) => b.numero), ['1']);
});

test('bloco concluído não entra na contagem', () => {
  const lista = lerBlocos(pagina([linhaDeBloco({ numero: '9', estado: 'Concluído' })]));
  assert.deepEqual(relevantes(lista, MINHA), []);
});

/* ------------------------------------------------------ marcador no menu */

test('o selo aparece em Blocos e em Assinatura', () => {
  const alvo = pagina([linhaDeBloco()]);
  instalarDocumento(alvo);

  assert.equal(marcarMenu(3, alvo), 2, 'os dois itens do menu devem receber selo');

  const selos = alvo.querySelectorAll('.seix-bloco-selo');
  assert.equal(selos.length, 2);
  assert.ok(selos.every((s) => s.textContent === '3'));

  // Onde cada um foi parar: o de "Assinatura" no próprio link do submenu...
  const assinatura = alvo.querySelector('#linkMenu3');
  assert.equal(assinatura.querySelectorAll('.seix-bloco-selo').length, 1);

  // ...e o de "Blocos" no link que fica visível com o submenu recolhido.
  const blocos = alvo.querySelector('#linkMenu2');
  assert.equal(blocos.querySelectorAll('.seix-bloco-selo').length, 1);
});

test('redesenhar com o mesmo número não mexe no DOM', () => {
  // É o que impede o laço infinito: quem chama marcarMenu é um observer sobre
  // o body, e reescrever o que se observa trava a aba.
  const alvo = pagina([linhaDeBloco()]);
  instalarDocumento(alvo);

  marcarMenu(2, alvo);
  const antes = alvo.querySelectorAll('.seix-bloco-selo');
  marcarMenu(2, alvo);
  const depois = alvo.querySelectorAll('.seix-bloco-selo');

  assert.equal(depois.length, 2);
  assert.equal(depois[0], antes[0], 'o selo deveria ser o MESMO nó, não um novo');
});

test('mudar o número troca os selos', () => {
  const alvo = pagina([linhaDeBloco()]);
  instalarDocumento(alvo);

  marcarMenu(2, alvo);
  marcarMenu(5, alvo);

  const selos = alvo.querySelectorAll('.seix-bloco-selo');
  assert.equal(selos.length, 2, 'não pode acumular selo velho');
  assert.ok(selos.every((s) => s.textContent === '5'));
});

test('zerar apaga os dois selos', () => {
  const alvo = pagina([linhaDeBloco()]);
  instalarDocumento(alvo);

  marcarMenu(4, alvo);
  marcarMenu(0, alvo);
  assert.deepEqual(alvo.querySelectorAll('.seix-bloco-selo'), []);
});

test('limparSelos tira o que sobrou', () => {
  const alvo = pagina([linhaDeBloco()]);
  instalarDocumento(alvo);

  marcarMenu(1, alvo);
  limparSelos(alvo);
  assert.deepEqual(alvo.querySelectorAll('.seix-bloco-selo'), []);
});

/* ------------------------------------- HTML cru, sem os data-label do SEI */

/**
 * A mesma linha, como o SERVIDOR entrega: sem `data-label`.
 *
 * Os data-label são postos pelo JavaScript do SEI depois que a página carrega
 * (a tabela é `infraTableResponsiva`). O Inspetor captura o DOM já processado,
 * o fetch recebe o HTML cru — e foi essa diferença que fez a consulta em
 * segundo plano ler zero bloco numa lista com dois.
 *
 * Aqui a coluna só pode ser achada pelo cabeçalho.
 */
function linhaCrua({ numero = '3353', estado = 'Recebido', unidades = [MINHA] } = {}) {
  return elemento('tr', { class: 'infraTrClara' }, [
    elemento('td', {}, [elemento('div', { class: 'infraCheckboxDiv' })]),
    elemento('td', {}, [elemento('a', { class: 'ancoraPadraoPreta' }, [numero])]),
    elemento('td', {}, [elemento('a', {}, [elemento('img', {})])]),
    elemento('td'),
    elemento('td', {}, [estado]),
    elemento('td', {}, [elemento('a', { class: 'ancoraSigla' }, ['NIT/NITTRANS/CHEFGAB'])]),
    elemento(
      'td',
      {},
      unidades.map((sigla, i) =>
        elemento('div', { id: `divUnidadeDisp${i}`, class: 'unidadeDisp' }, [
          elemento('img', {}),
          elemento('a', { class: 'ancoraSigla' }, [sigla]),
        ]),
      ),
    ),
    elemento('td', {}, ['teste']),
    elemento('td'),
    elemento('td', {}, [elemento('a', {})]),
  ]);
}

test('lê a lista mesmo sem os data-label, pelo cabeçalho', () => {
  const alvo = pagina([linhaCrua({ numero: '3353' }), linhaCrua({ numero: '2146' })]);
  const blocos = lerBlocos(alvo);

  assert.deepEqual(
    blocos.map((b) => b.numero),
    ['3353', '2146'],
    'sem data-label a coluna tem de sair do cabeçalho',
  );
  assert.equal(blocos[0].estado, 'Recebido');
  assert.deepEqual(blocos[0].unidades, [MINHA]);
});

test('sem data-label, o filtro de unidade continua valendo', () => {
  const alvo = pagina([
    linhaCrua({ numero: '3353', unidades: [MINHA] }),
    linhaCrua({ numero: '9999', unidades: ['NIT/NITTRANS/DIVIT'] }),
  ]);
  assert.deepEqual(
    relevantes(lerBlocos(alvo), MINHA).map((b) => b.numero),
    ['3353'],
  );
});

test('cabeçalho montado com <td> também serve de mapa', () => {
  // Há versão do SEI que entrega o cabeçalho em <td> e deixa o JavaScript
  // promover para <th>. Sem esta rede o mapa sai vazio, toda célula fica sem
  // rótulo e a lista inteira é lida como zero — em silêncio.
  const cabecalhoEmTd = elemento('tr', {}, [
    elemento('td', {}, ['']),
    ...COLUNAS.map((r) => elemento('td', {}, [r])),
  ]);
  const alvo = elemento('body', {}, [
    elemento('table', { id: 'tblBlocos' }, [
      elemento('tbody', {}, [cabecalhoEmTd, linhaCrua({ numero: '3353' })]),
    ]),
  ]);

  assert.deepEqual(lerBlocos(alvo).map((b) => b.numero), ['3353']);
});

test('a linha de cabeçalho não vira bloco', () => {
  // Ela passa pelo mesmo laço das outras: só não tem número.
  const alvo = pagina([linhaCrua()]);
  assert.equal(lerBlocos(alvo).length, 1);
});
