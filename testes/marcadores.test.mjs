/**
 * Testes do filtro por marcadores.
 *
 * Duas metades, e as duas já erraram em features anteriores deste projeto:
 *
 *   1. o RECONHECIMENTO do marcador no HTML do SEI — seletor que não casa,
 *      ícone vizinho contado como marcador, o mesmo marcador contado duas
 *      vezes porque vem dentro de um link com o mesmo title;
 *   2. a REGRA do filtro — que é onde mora o pedido: dois marcadores
 *      escolhidos, só quem tem os dois aparece.
 *
 * A terceira metade (sim) são as travas de segurança sobre o código: um
 * <button> sem type dentro do <form> do Controle de Processos SUBMETE o
 * formulário do SEI. Um filtro visual não pode fazer isso, e o teste está aqui
 * para o dia em que alguém adicionar um botão e esquecer.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

globalThis.chrome = { runtime: { id: 'teste' } };

import { elemento, instalarDocumento } from './domFalso.mjs';

const {
  nomeDoMarcador,
  corDoMarcador,
  marcadoresDaLinha,
  linhasDeProcesso,
  tabelasDeProcesso,
  diagnosticar,
} = await import('../src/content/features/marcadores/seletores.js');

const {
  combina,
  aplicar,
  catalogar,
  alternar,
  apenasExistentes,
  frase,
  modoSeguro,
} = await import('../src/content/features/marcadores/filtro.js');

const feature = (await import('../src/content/features/marcadores/index.js')).default;
const catalogoDeFeatures = (await import('../src/content/features/index.js')).default;

/* ------------------------------------------------------------------ nomes */

test('o rótulo "Marcador:" sai do nome', () => {
  assert.equal(nomeDoMarcador('Marcador: Amarelo').nome, 'Amarelo');
  assert.equal(nomeDoMarcador('Marcador - Azul').nome, 'Azul');
  assert.equal(nomeDoMarcador('Amarelo').nome, 'Amarelo');
});

test('o texto livre do processo não entra no nome', () => {
  // Se entrasse, cada processo viraria um marcador diferente e não haveria o
  // que agrupar — o defeito que mataria a funcionalidade inteira.
  const a = nomeDoMarcador('Amarelo - Aguardando resposta da DIVIT');
  const b = nomeDoMarcador('Amarelo - Cobrar na segunda');

  assert.equal(a.nome, 'Amarelo');
  assert.equal(b.nome, 'Amarelo');
  assert.equal(a.detalhe, 'Aguardando resposta da DIVIT');
});

test('o texto livre também vem em outra linha', () => {
  const { nome, detalhe } = nomeDoMarcador('Marcador: Urgente\nver e-mail de 12/03');
  assert.equal(nome, 'Urgente');
  assert.equal(detalhe, 'ver e-mail de 12/03');
});

test('title vazio não vira marcador de nome vazio', () => {
  assert.equal(nomeDoMarcador('').nome, '');
  assert.equal(nomeDoMarcador(null).nome, '');
});

test('a cor sai do nome e, na falta dele, do arquivo do ícone', () => {
  const icone = elemento('img', { src: '/infra_css/svg/marcador_amarelo.svg' });
  assert.equal(corDoMarcador(icone, 'Amarelo'), corDoMarcador(icone, 'Aguardando'));
  assert.equal(corDoMarcador(elemento('img', { src: '/x/marcador.svg' }), 'Urgente'), null);
});

/* ---------------------------------------------------- leitura de uma linha */

function celulaComIcone(atributos) {
  return elemento('td', {}, [elemento('img', atributos)]);
}

function linha(...celulas) {
  return elemento('tr', {}, [...celulas, elemento('td', {}, ['0004049-11.2025.8.19.0000'])]);
}

test('lê o marcador do title do ícone', () => {
  const tr = linha(celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Amarelo' }));
  const achados = marcadoresDaLinha(tr);

  assert.equal(achados.length, 1);
  assert.equal(achados[0].nome, 'Amarelo');
});

test('ícone de marcador sem title ainda vale, pelo nome do arquivo', () => {
  const tr = linha(celulaComIcone({ src: '/infra_css/svg/marcador_verde.svg' }));
  assert.deepEqual(
    marcadoresDaLinha(tr).map((m) => m.nome),
    ['verde'],
  );
});

test('ícone vizinho não vira marcador', () => {
  // A linha do Controle de Processos é cheia de ícones: anotação, acompanhamento
  // especial, processo sigiloso. Contar qualquer um deles encheria a barra de
  // botões que não filtram nada.
  const tr = linha(
    celulaComIcone({ src: '/imagens/anotacao.gif', title: 'Anotação: cobrar prazo' }),
    celulaComIcone({ src: '/imagens/acompanhamento.gif', title: 'Acompanhamento especial' }),
  );
  assert.deepEqual(marcadoresDaLinha(tr), []);
});

test('o mesmo marcador dentro do link e da imagem conta uma vez', () => {
  const link = elemento('a', { href: '#', title: 'Marcador: Azul' }, [
    elemento('img', { src: '/svg/marcador.svg', title: 'Marcador: Azul' }),
  ]);
  const tr = linha(elemento('td', {}, [link]));

  assert.equal(marcadoresDaLinha(tr).length, 1);
});

test('dois marcadores diferentes na mesma linha são dois', () => {
  const tr = linha(
    celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Azul' }),
    celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Urgente' }),
  );
  assert.deepEqual(
    marcadoresDaLinha(tr).map((m) => m.nome),
    ['Azul', 'Urgente'],
  );
});

/* --------------------------------------------------------------- tabelas */

function tabela(id, linhas) {
  const cabecalho = elemento('tr', {}, [elemento('th', {}, ['Nº do Processo'])]);
  return elemento('table', { id }, [cabecalho, ...linhas]);
}

test('o cabeçalho não entra como processo', () => {
  const t = tabela('tblProcessosRecebidos', [linha(celulaComIcone({ title: 'Marcador: Azul' }))]);
  assert.equal(linhasDeProcesso(t).length, 1);
});

test('acha as duas listas do Controle de Processos', () => {
  const raiz = elemento('div', {}, [
    tabela('tblProcessosRecebidos', []),
    tabela('tblProcessosGerados', []),
  ]);
  assert.equal(tabelasDeProcesso(raiz).length, 2);
});

test('sem id conhecido, vale a tabela que tem link de processo', () => {
  const comLink = elemento('table', {}, [
    elemento('tr', {}, [
      elemento('td', {}, [elemento('a', { href: '/sei/controlador.php?acao=procedimento_trabalhar&id=1' })]),
    ]),
  ]);
  const outra = elemento('table', {}, [elemento('tr', {}, [elemento('td', {}, ['nada'])])]);
  const raiz = elemento('div', {}, [outra, comLink]);

  const achadas = tabelasDeProcesso(raiz);
  assert.equal(achadas.length, 1, 'tabela sem processo não pode entrar: um filtro a esconderia inteira');
  assert.equal(achadas[0], comLink);
});

test('o diagnóstico conta o que viu, para o dia em que não vir nada', () => {
  const raiz = elemento('div', {}, [
    tabela('tblProcessosRecebidos', [
      linha(celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Azul' })),
      linha(celulaComIcone({ src: '/imagens/anotacao.gif', title: 'Anotação' })),
    ]),
  ]);

  const [retrato] = diagnosticar(raiz);
  assert.equal(retrato.linhas, 2);
  assert.equal(retrato.linhasComMarcador, 1);
  assert.ok(retrato.titulosDaPrimeiraLinha.includes('Marcador: Azul'));
});

/* ------------------------------------------------------------ a regra */

const item = (...chaves) => ({ chaves, marcadores: chaves.map((c) => ({ chave: c, nome: c })) });

test('dois marcadores escolhidos: só quem tem os dois', () => {
  assert.equal(combina(['azul', 'urgente'], ['azul', 'urgente'], 'todos'), true);
  assert.equal(combina(['azul', 'urgente', 'verde'], ['azul', 'urgente'], 'todos'), true);
  assert.equal(combina(['azul'], ['azul', 'urgente'], 'todos'), false);
  assert.equal(combina([], ['azul', 'urgente'], 'todos'), false);
});

test('no modo "qualquer um" basta ter um deles', () => {
  assert.equal(combina(['azul'], ['azul', 'urgente'], 'qualquer'), true);
  assert.equal(combina(['verde'], ['azul', 'urgente'], 'qualquer'), false);
});

test('sem escolha nenhuma, a lista inteira aparece', () => {
  assert.equal(combina([], [], 'todos'), true);
  assert.equal(combina([], null, 'todos'), true);
});

test('modo desconhecido cai no padrão, que é exigir todos', () => {
  assert.equal(modoSeguro('seja-la-o-que'), 'todos');
  assert.equal(combina(['azul'], ['azul', 'urgente'], 'seja-la-o-que'), false);
});

test('aplicar separa quem fica de quem some', () => {
  const itens = [item('azul', 'urgente'), item('azul'), item('verde')];
  const { visiveis, ocultos } = aplicar(itens, ['azul', 'urgente'], 'todos');

  assert.equal(visiveis.length, 1);
  assert.equal(ocultos.length, 2);
});

test('o catálogo conta processos por marcador, do mais usado ao menos', () => {
  const itens = [item('azul', 'urgente'), item('azul'), item('azul'), item('verde')];
  assert.deepEqual(
    catalogar(itens).map((m) => [m.chave, m.quantidade]),
    [
      ['azul', 3],
      ['urgente', 1],
      ['verde', 1],
    ],
  );
});

test('alternar liga e desliga sem mexer na lista antiga', () => {
  const antes = ['azul'];
  const depois = alternar(antes, 'urgente');

  assert.deepEqual(antes, ['azul']);
  assert.deepEqual(depois, ['azul', 'urgente']);
  assert.deepEqual(alternar(depois, 'azul'), ['urgente']);
});

test('escolha que não existe mais na tela é descartada', () => {
  // Sem isto, chegar numa lista sem aquele marcador esconderia TUDO, e sem
  // botão aceso para desfazer: a tela ficaria vazia sem explicação.
  const catalogo = catalogar([item('azul')]);
  assert.deepEqual(apenasExistentes(['azul', 'urgente'], catalogo), ['azul']);
});

test('a contagem diz quantos sobraram', () => {
  assert.equal(frase(8, 42), '8 de 42 processos');
  assert.equal(frase(42, 42), '42 processos');
  assert.equal(frase(1, 1), '1 processo');
});

/* --------------------------------------------------- da tela até o clique */

/**
 * Daqui para baixo o teste é de LIGAÇÃO, não de regra.
 *
 * Seis defeitos deste projeto foram exatamente isto: a função estava certa,
 * testada, e ninguém a chamava. Então aqui a feature é montada de verdade
 * sobre uma tela falsa, o botão é clicado, e o que se confere é a linha da
 * tabela sumindo.
 */
function prepararTela() {
  const linhas = [
    linha(
      celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Azul' }),
      celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Urgente' }),
    ),
    linha(celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Azul' })),
    linha(celulaComIcone({ src: '/svg/marcador.svg', title: 'Marcador: Verde' })),
  ];
  const raiz = elemento('div', {}, [tabela('tblProcessosRecebidos', linhas)]);

  instalarDocumento(raiz);
  globalThis.MutationObserver = class {
    observe() {}
    disconnect() {}
  };
  const guardado = new Map();
  globalThis.sessionStorage = {
    getItem: (k) => (guardado.has(k) ? guardado.get(k) : null),
    setItem: (k, v) => guardado.set(k, String(v)),
  };

  return { raiz, linhas, guardado };
}

const botao = (raiz, texto) =>
  raiz.querySelectorAll('button').find((b) => b.textContent.includes(texto));

const escondida = (l) => l.style.display === 'none';
const contagem = (raiz) =>
  raiz.querySelectorAll('span').map((s) => s.textContent).find((t) => /processos?$/.test(t));

test('clicar em dois marcadores esconde quem não tem os dois', () => {
  const { raiz, linhas } = prepararTela();
  const desfazer = feature.setup({ opcoes: { ...feature.opcoesPadrao } });

  botao(raiz, 'Azul').disparar('click');
  botao(raiz, 'Urgente').disparar('click');

  assert.equal(escondida(linhas[0]), false, 'tem os dois: fica');
  assert.equal(escondida(linhas[1]), true, 'só tem Azul: some');
  assert.equal(escondida(linhas[2]), true, 'não tem nenhum dos dois: some');
  assert.equal(contagem(raiz), '1 de 3 processos');

  desfazer();
});

test('o botão de combinação troca a pergunta para "qualquer um"', () => {
  const { raiz, linhas } = prepararTela();
  const desfazer = feature.setup({ opcoes: { ...feature.opcoesPadrao } });

  botao(raiz, 'Azul').disparar('click');
  botao(raiz, 'Urgente').disparar('click');
  botao(raiz, 'com todos').disparar('click');

  assert.equal(escondida(linhas[0]), false);
  assert.equal(escondida(linhas[1]), false, 'só Azul já basta agora');
  assert.equal(escondida(linhas[2]), true);

  desfazer();
});

test('"limpar" devolve a lista inteira', () => {
  const { raiz, linhas } = prepararTela();
  const desfazer = feature.setup({ opcoes: { ...feature.opcoesPadrao } });

  botao(raiz, 'Azul').disparar('click');
  assert.equal(escondida(linhas[2]), true);

  botao(raiz, 'limpar').disparar('click');
  assert.ok(linhas.every((l) => !escondida(l)));
  assert.equal(contagem(raiz), '3 processos');

  desfazer();
});

test('desligar a feature devolve a tela como estava', () => {
  const { raiz, linhas } = prepararTela();
  const desfazer = feature.setup({ opcoes: { ...feature.opcoesPadrao } });

  botao(raiz, 'Azul').disparar('click');
  desfazer();

  assert.ok(linhas.every((l) => !escondida(l)), 'nenhuma linha pode ficar escondida');
  assert.equal(raiz.querySelectorAll('.seix-marcadores').length, 0, 'a barra sai junto');
});

test('lista sem marcador nenhum não ganha barra', () => {
  const raiz = elemento('div', {}, [
    tabela('tblProcessosRecebidos', [linha(celulaComIcone({ title: 'Anotação: cobrar' }))]),
  ]);
  instalarDocumento(raiz);

  assert.equal(feature.setup({ opcoes: { ...feature.opcoesPadrao } }), undefined);
  assert.equal(raiz.querySelectorAll('.seix-marcadores').length, 0);
});

/* ------------------------------------------------------------- segurança */

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pasta = path.join(raiz, 'src/content/features/marcadores');
/**
 * Comentário fora antes de procurar proibição no código.
 *
 * Estes arquivos EXPLICAM por que não usam chrome.storage e por que não
 * clicam em nada. Sem tirar o comentário, a explicação seria lida como a
 * infração — foi exatamente o que aconteceu na primeira execução deste teste.
 */
function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const fontes = fs
  .readdirSync(pasta)
  .filter((f) => f.endsWith('.js'))
  .map((f) => ({
    nome: f,
    codigo: semComentarios(fs.readFileSync(path.join(pasta, f), 'utf8')),
  }));

test('todo botão declara type="button"', () => {
  // Dentro do <form> do Controle de Processos, um <button> sem type submete o
  // formulário do SEI ao ser clicado. Um filtro visual jamais pode disparar
  // envio de formulário.
  const codigo = fontes.map((f) => f.codigo).join('\n');
  const criados = (codigo.match(/el\(\s*'button'/g) || []).length;
  const tipados = (codigo.match(/type:\s*'button'/g) || []).length;

  assert.ok(criados > 0, 'a feature desenha botões');
  assert.equal(tipados, criados, 'todo botão criado precisa declarar type="button"');
});

test('o filtro não clica, não submete e não navega no SEI', () => {
  for (const { nome, codigo } of fontes) {
    for (const proibido of ['.click(', '.submit(', 'fetch(', 'controlador.php', 'location.href =']) {
      assert.equal(
        codigo.includes(proibido),
        false,
        `${nome} não pode conter "${proibido}": o filtro só esconde e mostra linha`,
      );
    }
  }
});

test('o filtro não sobrevive ao fechamento da aba', () => {
  // Um filtro é estado de momento. Guardado em chrome.storage, o SEI abriria
  // amanhã com metade da lista escondida sem ninguém lembrar por quê.
  const codigo = fontes.map((f) => f.codigo).join('\n');
  assert.ok(codigo.includes('sessionStorage'), 'a memória do filtro é de sessão');
  assert.equal(codigo.includes('chrome.storage'), false, 'e não pode virar preferência salva');
});

/* --------------------------------------------------------------- catálogo */

test('a feature está no catálogo e só roda no Controle de Processos', () => {
  assert.ok(catalogoDeFeatures.includes(feature), 'precisa estar registrada em features/index.js');
  assert.deepEqual(feature.telas, ['controle-processos']);
  assert.equal(feature.opcoesPadrao.modoPadrao, 'todos', 'o padrão é exigir todos os escolhidos');
});
