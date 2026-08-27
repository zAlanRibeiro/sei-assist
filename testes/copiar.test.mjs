/**
 * Testes do botão de copiar o número do processo.
 *
 * A regra que importa é onde o botão NÃO deve aparecer. Um "C" solto no meio
 * de uma frase é pior que não ter botão nenhum, e o alvo é achado pelo formato
 * do número — não por seletor de tela —, então a disciplina toda está em
 * exigir que o texto SEJA o número, e nada mais.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { elemento, instalarDocumento } from './domFalso.mjs';

globalThis.chrome = { runtime: { id: 'teste' } };

const { ehNupExato, acharNup } = await import('../src/content/core/nup.js');

const NUP = 'NIT-050131/003172/2026';

/* ------------------------------------------------------- o que é um NUP */

test('reconhece o formato de Niterói', () => {
  assert.equal(ehNupExato(NUP), NUP);
  assert.equal(ehNupExato(`  ${NUP}  `), NUP, 'espaço em volta não conta');
});

test('reconhece o formato federal', () => {
  assert.equal(ehNupExato('00000.000000/0000-00'), '00000.000000/0000-00');
});

test('frase que contém o número não ganha botão', () => {
  // acharNup encontra; ehNupExato recusa. É essa diferença que evita um "C"
  // solto no meio do texto.
  const frase = `Processo ${NUP} aberto na unidade`;
  assert.equal(acharNup(frase), NUP, 'o número está lá');
  assert.equal(ehNupExato(frase), null, 'mas o texto não é só ele');
});

test('número de documento não é confundido com processo', () => {
  assert.equal(ehNupExato('00009400'), null);
  assert.equal(ehNupExato('2146'), null);
});

test('sigla de unidade não vira NUP', () => {
  assert.equal(ehNupExato('NIT/NITTRANS/DIVEST'), null);
});

test('texto vazio não quebra', () => {
  for (const vazio of ['', '   ', null, undefined]) {
    assert.equal(ehNupExato(vazio), null);
  }
});

/* --------------------------------------------------- varredura na página */

const { alvos, jaTemBotao } = await import('../src/content/features/copiar/index.js');

/** A linha da lista: o NUP num link, como no Controle de Processos. */
function pagina(...filhos) {
  const raiz = elemento('body', {}, filhos);
  instalarDocumento(raiz);
  return raiz;
}

test('acha o número no link da lista', () => {
  const raiz = pagina(
    elemento('td', {}, [elemento('a', { href: '#' }, [NUP])]),
  );
  const achados = alvos(raiz);

  assert.equal(achados.length, 1);
  assert.equal(achados[0].nup, NUP);
  assert.equal(achados[0].no.tagName, 'A', 'o alvo é o link, não a célula');
});

test('a célula que só embrulha o link não vira alvo', () => {
  // Sem texto próprio, a <td> não escreve o número — quem escreve é o <a>.
  // Sem essa distinção apareceriam dois botões para o mesmo processo.
  const raiz = pagina(elemento('td', {}, [elemento('a', {}, [NUP])]));
  assert.deepEqual(alvos(raiz).map((a) => a.no.tagName), ['A']);
});

test('a frase da árvore não vira alvo', () => {
  // "Processo aberto somente na unidade NIT/NITTRANS/DIVEST (atribuído para
  // ...)" — nenhum número de processo, e nada a copiar.
  const raiz = pagina(
    elemento('div', { id: 'divArvoreInformacao' }, [
      'Processo aberto somente na unidade ',
      elemento('a', { class: 'ancoraSigla' }, ['NIT/NITTRANS/DIVEST']),
      ' (atribuído para ',
      elemento('a', { class: 'ancoraSigla' }, ['alan.ribeiro@x.gov.br']),
      ').',
    ]),
  );
  assert.deepEqual(alvos(raiz), []);
});

test('vários processos na lista viram vários alvos', () => {
  const outro = 'NIT-050131/001116/2026';
  const raiz = pagina(
    elemento('a', {}, [NUP]),
    elemento('a', {}, [outro]),
    elemento('a', {}, ['Ver por tipo']),
  );
  assert.deepEqual(alvos(raiz).map((a) => a.nup), [NUP, outro]);
});

test('jaTemBotao evita o laço do observer', () => {
  // A varredura roda a cada mudança do DOM. Sem esta checagem, inserir o botão
  // dispararia o observer, que inseriria outro, e a aba travava.
  const link = elemento('a', {}, [NUP]);
  const botao = elemento('button', { class: 'seix-copiar-nup' }, ['C']);
  pagina(link, botao);

  assert.equal(jaTemBotao(link), true);
  assert.equal(jaTemBotao(elemento('a', {}, [NUP])), false, 'sem vizinho, não tem botão');
});
