/**
 * Testes de parse de texto do SEI.
 *
 * Os exemplos vem de uma tela real de leste.sei.rj.gov.br (Niteroi/RJ), cujo
 * NUP NAO segue o formato do SEI federal - foi exatamente esse o bug que estes
 * testes travam.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { acharLinhaDeLinks, acharNup } from '../src/content/features/historico/seletores.js';
import { dadosDoTexto } from '../src/content/features/historico/captura.js';

test('acharNup: formato de Niteroi/RJ', () => {
  assert.equal(acharNup('NIT-050131/000463/2026'), 'NIT-050131/000463/2026');
  assert.equal(
    acharNup('Processo NIT-050131/003172/2026 aberto na unidade'),
    'NIT-050131/003172/2026',
  );
});

test('acharNup: formato CONARQ (SEI federal)', () => {
  assert.equal(acharNup('processo 00000.000123/2024-11 aqui'), '00000.000123/2024-11');
});

test('acharNup: nao confunde numero de documento com NUP', () => {
  assert.equal(acharNup('Despacho 00009405 NIT/NITTRANS/DIVEST'), null);
  assert.equal(acharNup('codigo verificador 00009400 e o codigo CRC 00E15CA6'), null);
});

test('acharNup: sigla da unidade nao vira NUP', () => {
  assert.equal(acharNup('NIT/NITTRANS/DIVEST'), null);
});

test('acharNup: texto sem NUP', () => {
  assert.equal(acharNup('Processo aberto somente na unidade.'), null);
  assert.equal(acharNup(''), null);
  assert.equal(acharNup(null), null);
});

test('acharNup: acha o NUP no meio de uma arvore inteira', () => {
  const arvore =
    'NIT-050131/000463/2026 Mensagem 1 1 (00009400) NIT/NITTRANS/DIVEST ' +
    'Despacho 00009405 NIT/NITTRANS/DIVEST Cartaz (00024592) NIT/NITTRANS/DIVEST';
  assert.equal(acharNup(arvore), 'NIT-050131/000463/2026');
});

test('dadosDoTexto: documento sem nome proprio', () => {
  assert.deepEqual(dadosDoTexto('Despacho 00009405 NIT/NITTRANS/DIVEST'), {
    numero: '00009405',
    tipo: 'Despacho',
  });
});

test('dadosDoTexto: documento com nome proprio (numero entre parenteses)', () => {
  assert.deepEqual(dadosDoTexto('Mensagem 1 1 (00009400) NIT/NITTRANS/DIVEST'), {
    numero: '00009400',
    tipo: 'Mensagem 1 1',
  });
  assert.deepEqual(dadosDoTexto('Anexo 1 hfhf (00013281) NIT/NITTRANS/DIVEST'), {
    numero: '00013281',
    tipo: 'Anexo 1 hfhf',
  });
  assert.deepEqual(dadosDoTexto('Cartaz (00024592) NIT/NITTRANS/DIVEST'), {
    numero: '00024592',
    tipo: 'Cartaz',
  });
});

test('dadosDoTexto: nome com espacos e numero solto no meio', () => {
  assert.deepEqual(dadosDoTexto('Despacho ddd (00009909) NIT/NITTRANS/DIVEST'), {
    numero: '00009909',
    tipo: 'Despacho ddd',
  });
});

test('dadosDoTexto: sem numero devolve so o tipo', () => {
  assert.deepEqual(dadosDoTexto('Consultar Andamento'), {
    numero: null,
    tipo: 'Consultar Andamento',
  });
});

test('dadosDoTexto: texto vazio', () => {
  assert.deepEqual(dadosDoTexto(''), { numero: null, tipo: null });
});


/* ------------------------------------------ linha de links do Controle de Processos */

/**
 * DOM de mentira, so com o que acharLinhaDeLinks() toca: querySelectorAll('a'),
 * textContent e parentElement. Suficiente porque a funcao nao usa mais nada -
 * e por isso ela foi escrita assim.
 */
function tela(grupos) {
  const todos = [];
  const containers = {};
  for (const [nome, textos] of Object.entries(grupos)) {
    const pai = { nome, filhos: [] };
    containers[nome] = pai;
    for (const texto of textos) {
      const link = { textContent: texto, parentElement: pai };
      pai.filhos.push(link);
      todos.push(link);
    }
  }
  return {
    containers,
    raiz: { querySelectorAll: (sel) => (sel === 'a' ? todos : []) },
  };
}

/** A tela do print: menu lateral a esquerda, linha de links sobre a lista. */
const CONTROLE_DE_PROCESSOS = {
  menu: [
    'Acompanhamento Especial',
    'Base de Conhecimento',
    'Blocos',
    'Controle de Processos',
    'Marcadores',
    'Pesquisa',
    'Relatórios',
  ],
  linha: [
    'Visualização resumida',
    'Configurar detalhe',
    'Ver atribuídos a mim',
    'Ver por marcadores',
    'Ver por tipo',
    'Ver por prioridade',
  ],
};

test('acha a linha de links no meio da tela inteira', () => {
  const { raiz, containers } = tela(CONTROLE_DE_PROCESSOS);
  const achado = acharLinhaDeLinks(raiz);

  assert.ok(achado, 'deveria achar a linha');
  assert.equal(achado.linha, containers.linha, 'pegou o container errado');
});

test('o menu lateral nao e confundido com a linha', () => {
  // Nenhum item do menu casa: "Marcadores" nao e "Ver por marcadores".
  // (Isto NAO depende de exato: true - a comparacao frouxa pergunta se o
  //  texto do link contem o rotulo, e "Marcadores" nao contem. Quem trava a
  //  comparacao exata e o teste seguinte.)
  const { raiz, containers } = tela({ menu: CONTROLE_DE_PROCESSOS.menu });
  assert.equal(acharLinhaDeLinks(raiz), null, 'nenhum item de menu deveria casar');

  const comLinha = tela(CONTROLE_DE_PROCESSOS);
  assert.notEqual(acharLinhaDeLinks(comLinha.raiz).linha, comLinha.containers.menu);
  assert.ok(containers.menu);
});

test('rotulo mais longo que apenas contem um dos nossos nao conta', () => {
  // Este e o caso que exige exato: true. Sem ele os dois links de cima
  // venceriam a linha verdadeira por 2 a 1, e o botao iria parar no lugar
  // errado da tela.
  const { raiz, containers } = tela({
    outros: ['Ver por tipo de acesso', 'Ver por tipo de documento'],
    linha: ['Visualização resumida'],
  });
  assert.equal(acharLinhaDeLinks(raiz).linha, containers.linha);
});

test('acento e caixa nao importam', () => {
  const { raiz } = tela({ linha: ['VER POR PRIORIDADE', 'Ver Atribuidos A Mim'] });
  assert.ok(acharLinhaDeLinks(raiz), 'norm() deveria tratar acento e caixa');
});

test('a tela detalhada tambem e reconhecida', () => {
  // "Visualizacao resumida" e "detalhada" sao o mesmo link alternando: a
  // extensao nao pode depender do modo em que a tela abriu.
  const { raiz, containers } = tela({
    linha: ['Visualização detalhada', 'Ver por tipo'],
  });
  assert.equal(acharLinhaDeLinks(raiz).linha, containers.linha);
});

test('devolve um link vizinho para servir de modelo de estilo', () => {
  // Sem o modelo nao da para copiar a classe do SEI, e o botao volta a
  // parecer enxertado.
  const { raiz, containers } = tela(CONTROLE_DE_PROCESSOS);
  const { modelo } = acharLinhaDeLinks(raiz);

  assert.ok(modelo, 'deveria devolver um modelo');
  assert.equal(modelo.parentElement, containers.linha);
});

test('entre dois candidatos, fica com o que tem mais links conhecidos', () => {
  const { raiz, containers } = tela({
    solto: ['Ver por tipo'],
    linha: ['Visualização resumida', 'Ver por marcadores', 'Ver por prioridade'],
  });
  assert.equal(acharLinhaDeLinks(raiz).linha, containers.linha);
});

test('um unico link ainda serve de ancora', () => {
  const { raiz, containers } = tela({ linha: ['Ver por prioridade'] });
  assert.equal(acharLinhaDeLinks(raiz).linha, containers.linha);
});

test('tela sem a linha devolve null em vez de chutar', () => {
  // Quando nao houver onde encaixar, o gatilho cai para a barra de comandos e
  // depois para o flutuante - nunca pendura o botao em lugar errado.
  const { raiz } = tela({ qualquer: ['Salvar', 'Cancelar', 'Pesquisar'] });
  assert.equal(acharLinhaDeLinks(raiz), null);
});

/* --------------------------------------- documentos de um bloco de assinatura */

const { documentosAssinadosNoBloco } = await import(
  '../src/content/features/historico/seletores.js'
);
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

/**
 * A tela real "Documentos do Bloco de Assinatura" (rel_bloco_protocolo_listar).
 *
 * A coluna "Assinaturas" vazia foi capturada de um bloco disponibilizado e
 * ainda não assinado — é o caso confirmado. O preenchido não foi visto, e por
 * isso a regra é "tem conteúdo = tem assinatura": não depende de saber COMO
 * ele é preenchido.
 */
function telaDoBloco(linhas) {
  const th = (t) => elemento('th', { class: 'infraTh' }, [t]);

  return elemento('body', {}, [
    elemento('table', { id: 'tblProtocolosBlocos', class: 'infraTable' }, [
      elemento('tr', {}, [
        th(''),
        th('Seq.'),
        th('Processo'),
        th('Documento'),
        th('Tipo'),
        th('Assinaturas'),
        th('Anotações'),
        th('Ações'),
      ]),
      ...linhas.map(([numero, assinaturas], i) =>
        elemento('tr', { id: `trPos${i}` }, [
          elemento('td', {}, ['']),
          elemento('td', { 'data-label': 'Seq.' }, [String(i + 1)]),
          elemento('td', { 'data-label': 'Processo' }, ['NIT-050131/004049/2026']),
          elemento('td', { 'data-label': 'Documento' }, [
            elemento('a', { class: 'protocoloAberto', href: '#' }, [numero]),
          ]),
          elemento('td', { 'data-label': 'Tipo' }, ['Despacho']),
          elemento('td', { 'data-label': 'Assinaturas' }, [assinaturas]),
          elemento('td', { 'data-label': 'Anotações' }, ['']),
          elemento('td', { 'data-label': 'Ações' }, ['']),
        ]),
      ),
    ]),
  ]);
}

test('documento sem assinatura não é dado por assinado', () => {
  // É o caso confirmado na captura: bloco disponibilizado, coluna vazia.
  const raiz = telaDoBloco([['00102458', '']]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), []);
});

test('coluna Assinaturas preenchida marca o documento', () => {
  const raiz = telaDoBloco([['00102458', 'Alan Doyle Costa Ribeiro']]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), ['00102458']);
});

test('espaço em branco não conta como assinatura', () => {
  // A célula vazia da captura vem com espaço; tratar isso como conteúdo
  // resolveria como assinado tudo que estivesse no bloco.
  const raiz = telaDoBloco([['00102458', '   ']]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), []);
});

test('separa assinados de não assinados na mesma tela', () => {
  const raiz = telaDoBloco([
    ['00102458', 'Alan'],
    ['00102679', ''],
    ['00098310', 'Naiara'],
  ]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), ['00102458', '00098310']);
});

test('a linha de cabeçalho não vira documento', () => {
  const raiz = telaDoBloco([['00102458', 'Alan']]);
  instalarDocumento(raiz);

  assert.equal(documentosAssinadosNoBloco(raiz).includes('Documento'), false);
});

test('outra tela qualquer devolve lista vazia', () => {
  // A varredura roda em todo lugar: não pode inventar nada fora desta tela.
  const raiz = elemento('body', {}, [elemento('p', {}, ['Controle de Processos'])]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), []);
});

test('lê a tabela do bloco, e não outra tabela da mesma página', () => {
  // A tela do SEI tem mais tabelas. Sem o id, a primeira da página venceria —
  // e ela pode ter colunas de nome parecido.
  const outra = elemento('table', { class: 'infraTable' }, [
    elemento('tr', {}, [
      elemento('th', {}, ['Documento']),
      elemento('th', {}, ['Assinaturas']),
    ]),
    elemento('tr', {}, [
      elemento('td', {}, ['00000000']),
      elemento('td', {}, ['não é daqui']),
    ]),
  ]);

  const doBloco = telaDoBloco([['00102458', 'Alan']]);
  const raiz = elemento('body', {}, [outra, ...doBloco.children]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), ['00102458']);
});

test('tabela sem as colunas esperadas não produz nada', () => {
  const raiz = elemento('body', {}, [
    elemento('table', { id: 'tblProtocolosBlocos' }, [
      elemento('tr', {}, [elemento('th', {}, ['Outra']), elemento('th', {}, ['Coisa'])]),
      elemento('tr', {}, [elemento('td', {}, ['x']), elemento('td', {}, ['y'])]),
    ]),
  ]);
  instalarDocumento(raiz);

  assert.deepEqual(documentosAssinadosNoBloco(raiz), []);
});
