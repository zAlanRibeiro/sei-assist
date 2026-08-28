/**
 * Testes do nível de acesso e da política de rascunho.
 *
 * O que está em jogo aqui não é conveniência: é conteúdo de documento oficial
 * indo para o disco sem cifra. Errar para o lado permissivo guarda o que não
 * devia; errar para o lado restritivo mata a funcionalidade sem avisar. Os
 * dois erros têm teste.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { classificar, ehFechado, lerNivel, diagnosticar, PUBLICO, RESTRITO, SIGILOSO, DESCONHECIDO } =
  await import('../src/content/features/editor/nivelAcesso.js');
const { podeGuardar } = await import('../src/content/features/editor/rascunho.js');
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

/* ---------------------------------------------------- a classificação */

test('as três palavras viram os três estados', () => {
  assert.equal(classificar('Público'), PUBLICO);
  assert.equal(classificar('Restrito'), RESTRITO);
  assert.equal(classificar('Sigiloso'), SIGILOSO);
});

test('sem acento e no meio da frase também', () => {
  assert.equal(classificar('Nivel de Acesso: publico'), PUBLICO);
  assert.equal(classificar('optRestrito'), RESTRITO);
});

test('o mais fechado ganha quando a tela diz as duas coisas', () => {
  // Uma tela pode trazer o rótulo "Público" de outro campo junto. Tratar como
  // restrito é o erro barato; o contrário vaza conteúdo.
  assert.equal(classificar('Público ... Restrito'), RESTRITO);
  assert.equal(classificar('Restrito ... Sigiloso'), SIGILOSO);
});

test('texto vazio ou sem nível nenhum é desconhecido', () => {
  assert.equal(classificar(''), DESCONHECIDO);
  assert.equal(classificar('Despacho 00098329'), DESCONHECIDO);
  assert.equal(classificar(null), DESCONHECIDO);
});

test('só restrito e sigiloso escondem conteúdo', () => {
  assert.equal(ehFechado(RESTRITO), true);
  assert.equal(ehFechado(SIGILOSO), true);
  assert.equal(ehFechado(PUBLICO), false);
  assert.equal(ehFechado(DESCONHECIDO), false);
});

/* ------------------------------------------------------- a leitura */

/** Os três rádios que o SEI põe na tela, com um deles marcado. */
function telaComRadios(marcado) {
  const radio = (id) => {
    const no = elemento('input', { id, type: 'radio', name: 'rdoNivelAcesso' });
    no.checked = id === marcado;
    return no;
  };
  return elemento('div', {}, [radio('optPublico'), radio('optRestrito'), radio('optSigiloso')]);
}

test('rádio não marcado não decide nada', () => {
  // ESTE é o teste que importa. A tela do SEI traz as três opções sempre.
  // Sem exigir `checked`, achar #optRestrito no HTML marcaria TODO documento
  // como restrito e o rascunho morreria para todo mundo.
  const raiz = telaComRadios('optPublico');
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), PUBLICO);
});

test('o rádio marcado é o que vale', () => {
  const raiz = telaComRadios('optRestrito');
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), RESTRITO);
});

test('sem campo nenhum, o rótulo no texto serve', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['Nível de Acesso: Restrito'])]);
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), RESTRITO);
});

test('tela que não diz nada devolve desconhecido, e não público', () => {
  // Confundir "não achei" com "é público" transformaria falha de leitura em
  // permissão para guardar.
  const raiz = elemento('div', {}, [elemento('p', {}, ['Corpo do documento'])]);
  const doc = instalarDocumento(raiz);

  assert.equal(lerNivel(doc), DESCONHECIDO);
});

test('o diagnóstico relata sem decidir', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['Nível de Acesso: Público'])]);
  const doc = instalarDocumento(raiz);

  const relato = diagnosticar(doc);
  assert.equal(relato.nivel, PUBLICO);
  assert.equal(relato.temRotulo, true);
  assert.deepEqual(relato.palavrasNaTela, ['público']);
});

/* -------------------------------------------------------- a política */

test('documento restrito nunca vira rascunho', () => {
  // Não é opção: é o motivo de tudo isto existir.
  assert.deepEqual(podeGuardar({ nivel: RESTRITO }), { pode: false, motivo: RESTRITO });
  assert.deepEqual(podeGuardar({ nivel: SIGILOSO }), { pode: false, motivo: SIGILOSO });
});

test('nem com a opção ligada o restrito passa', () => {
  const r = podeGuardar({ nivel: RESTRITO, guardarRascunho: true, soPublicos: false });
  assert.equal(r.pode, false);
});

test('documento público é guardado', () => {
  assert.equal(podeGuardar({ nivel: PUBLICO }).pode, true);
});

test('desconhecido é guardado por padrão', () => {
  // A detecção ainda não foi confirmada contra tela real. Recusar tudo que não
  // reconheço mataria a funcionalidade para todo mundo.
  assert.equal(podeGuardar({ nivel: DESCONHECIDO }).pode, true);
});

test('desconhecido é recusado quando se pede só públicos', () => {
  const r = podeGuardar({ nivel: DESCONHECIDO, soPublicos: true });
  assert.equal(r.pode, false);
  assert.equal(r.motivo, 'nivel-desconhecido', 'o motivo distingue de "é restrito"');
});

test('a opção desligada vence tudo', () => {
  const r = podeGuardar({ nivel: PUBLICO, guardarRascunho: false });
  assert.deepEqual(r, { pode: false, motivo: 'desligado' });
});

test('sem argumento nenhum não guarda às cegas', () => {
  // Chamada malformada não pode virar permissão.
  assert.equal(podeGuardar().motivo, DESCONHECIDO);
});

test('o rótulo acentuado é lido inteiro', () => {
  // A primeira versão da expressão usava [a-zçãí] e engolia o "ú" de
  // "Público": capturava só o "P" e devolvia desconhecido. Documento público
  // caindo no caso desconhecido é o tipo de erro que só aparece com acento.
  for (const [texto, esperado] of [
    ['Nível de Acesso: Público', PUBLICO],
    ['Nível de Acesso: Restrito', RESTRITO],
    ['Nível de Acesso: Sigiloso', SIGILOSO],
  ]) {
    const doc = instalarDocumento(elemento('div', {}, [elemento('span', {}, [texto])]));
    assert.equal(lerNivel(doc), esperado, texto);
  }
});

/* ------------------------------------------------- a árvore do processo */

const { nivelNaArvore, descobrirNivel } = await import(
  '../src/content/features/editor/nivelAcesso.js'
);

/**
 * Um pedaço da árvore real (ifrArvore de procedimento_visualizar, SEI 5.0.4).
 *
 * Copiado da tela: dois documentos restritos (11970, 29479) e dois públicos
 * (11965, 12038). O restrito tem um `anchorNA`; o público não tem nada — e é
 * dessa AUSÊNCIA que se conclui que é público.
 */
function arvoreReal() {
  const no = (id, extra = []) => [
    elemento('a', { id: `anchor${id}`, class: 'infraArvoreNo' }, [
      elemento('span', { id: `span${id}` }, [`Despacho ${id}`]),
    ]),
    elemento('a', { id: `anchorUG${id}`, class: 'infraArvoreInformacao' }, [
      elemento('span', {}, ['NIT/NITTRANS/DIVEST']),
    ]),
    ...extra,
  ];

  const restrito = (id) =>
    elemento('a', { id: `anchorNA${id}`, class: 'infraArvoreNoAcao' }, [
      elemento('img', {
        id: `iconNA${id}`,
        title: 'Acesso Restrito\nInformação Pessoal (Art. 31 da Lei nº 12.527)',
        src: 'processo_restrito.svg?25',
      }),
    ]);

  const assinado = (id) =>
    elemento('a', { id: `anchorA${id}`, class: 'infraArvoreNoAcao' }, [
      elemento('img', { id: `iconA${id}`, title: 'Assinado por:\nAlan', src: 'assinatura2.svg?25' }),
    ]);

  return elemento('body', { class: 'infraArvore' }, [
    elemento('form', { id: 'frmArvore' }, [
      elemento('div', { id: 'divArvore', class: 'infraArvore' }, [
        ...no('11965', [assinado('11965')]),
        ...no('11970', [restrito('11970')]),
        ...no('12038'),
        ...no('29479', [restrito('29479')]),
      ]),
    ]),
  ]);
}

test('documento com anchorNA na árvore é restrito', () => {
  const doc = instalarDocumento(arvoreReal());

  assert.equal(nivelNaArvore(doc, '11970'), RESTRITO);
  assert.equal(nivelNaArvore(doc, '29479'), RESTRITO);
});

test('documento sem anchorNA na árvore é público', () => {
  // A ausência do marcador é a informação. Só vale porque o documento FOI
  // achado na árvore — ver o teste seguinte.
  const doc = instalarDocumento(arvoreReal());

  assert.equal(nivelNaArvore(doc, '11965'), PUBLICO, 'assinado, mas público');
  assert.equal(nivelNaArvore(doc, '12038'), PUBLICO);
});

test('documento fora da árvore é desconhecido, nunca público', () => {
  // ESTE é o erro grave a evitar: concluir "público" de "não olhei". A árvore
  // pode ser de outro processo, ou ainda não ter carregado.
  const doc = instalarDocumento(arvoreReal());

  assert.equal(nivelNaArvore(doc, '99999'), DESCONHECIDO);
});

test('tela que não é árvore nenhuma é desconhecida', () => {
  const doc = instalarDocumento(
    elemento('body', {}, [elemento('div', { id: 'anchor11965' }, ['qualquer coisa'])]),
  );

  assert.equal(nivelNaArvore(doc, '11965'), DESCONHECIDO);
});

test('sem id de documento não se conclui nada', () => {
  const doc = instalarDocumento(arvoreReal());

  assert.equal(nivelNaArvore(doc, null), DESCONHECIDO);
  assert.equal(nivelNaArvore(doc, ''), DESCONHECIDO);
  assert.equal(nivelNaArvore(null, '11970'), DESCONHECIDO);
});

test('marcador presente mas ilegível continua fechado', () => {
  // Título e ícone que não dizem a palavra. O que importa para a política é
  // que NÃO é público; supor restrito é o palpite conservador.
  const raiz = elemento('body', { class: 'infraArvore' }, [
    elemento('div', { id: 'divArvore' }, [
      elemento('a', { id: 'anchor555' }, ['Doc']),
      elemento('a', { id: 'anchorNA555' }, [elemento('img', { id: 'iconNA555', src: 'x.svg' })]),
    ]),
  ]);

  assert.equal(nivelNaArvore(instalarDocumento(raiz), '555'), RESTRITO);
});

test('o ícone salva quando o título não diz a palavra', () => {
  const raiz = elemento('body', { class: 'infraArvore' }, [
    elemento('div', { id: 'divArvore' }, [
      elemento('a', { id: 'anchor777' }, ['Doc']),
      elemento('a', { id: 'anchorNA777' }, [
        elemento('img', { id: 'iconNA777', title: 'Ver detalhes', src: 'processo_sigiloso.svg?25' }),
      ]),
    ]),
  ]);

  assert.equal(nivelNaArvore(instalarDocumento(raiz), '777'), SIGILOSO);
});

test('descobrirNivel encontra a árvore pela janela que abriu o editor', () => {
  // O editor do SEI abre em JANELA própria: window.top é ele mesmo, e a
  // varredura normal de frames não alcança a árvore. Quem alcança é o opener.
  const docArvore = { body: null, querySelectorAll: null };
  const raiz = arvoreReal();
  Object.assign(docArvore, {
    body: raiz,
    querySelectorAll: (s) => raiz.querySelectorAll(s),
  });

  const janelaEditor = {
    document: { body: null, querySelectorAll: () => [] },
    frames: { length: 0 },
    opener: { document: docArvore, frames: { length: 0 } },
  };

  assert.equal(descobrirNivel('11970', janelaEditor), RESTRITO);
  assert.equal(descobrirNivel('11965', janelaEditor), PUBLICO);
});

test('sem opener acessível, descobrirNivel não inventa', () => {
  const janela = {
    document: { body: null, querySelectorAll: () => [] },
    frames: { length: 0 },
    get opener() {
      throw new Error('outra origem');
    },
  };

  assert.equal(descobrirNivel('11970', janela), DESCONHECIDO);
});
