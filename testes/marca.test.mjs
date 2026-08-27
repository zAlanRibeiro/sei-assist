/**
 * Testes da ancora da marca "Assist" na barra do topo.
 *
 * A regra que importa e a escolha do vizinho: escrever no lugar errado da
 * barra e pior que nao escrever nada. Por isso acharRotuloDeAmbiente() recebe
 * a lista de nos pronta em vez de ir ao DOM - da para exercitar a decisao sem
 * navegador, que e onde os erros de verdade aparecem.
 *
 * O caso decisivo e "rotulo solto ao lado do logo": foi ele que a primeira
 * versao nao cobriu, e por isso a marca nao aparecia.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { acharRotuloDeAmbiente, escolherVisivel, textoProprio, visivel, MARCA } = await import(
  '../src/content/features/marca/seletores.js'
);

const texto = (valor) => ({ nodeType: 3, nodeValue: valor });
const elemento = () => ({ nodeType: 1 });

/** <span>Producao</span> - elemento dedicado ao rotulo. */
function rotulo(valor) {
  return { childNodes: [texto(valor)], children: { length: 0 } };
}

/** <div><img logo>Producao</div> - rotulo solto dentro da barra. */
function barraComRotulo(valor) {
  return { childNodes: [elemento(), texto(valor)], children: { length: 1 } };
}

/** <div><span>Producao</span></div> - container que apenas envolve o rotulo. */
function envolucro() {
  return { childNodes: [elemento()], children: { length: 1 } };
}

/* ------------------------------------------------------------ texto proprio */

test('textoProprio ignora o texto dos descendentes', () => {
  assert.equal(textoProprio(barraComRotulo('Producao')), 'Producao');
  assert.equal(textoProprio(envolucro()), '', 'o envolucro nao escreve nada');
});

test('textoProprio aguenta no sem filhos', () => {
  assert.equal(textoProprio({}), '');
  assert.equal(textoProprio(null), '');
});

/* ------------------------------------------------------------------ ancora */

test('rotulo em elemento proprio: a marca entra depois dele', () => {
  const no = rotulo('Producao');
  const achado = acharRotuloDeAmbiente([no]);

  assert.equal(achado.ancora, no);
  assert.equal(achado.modo, 'depois');
  assert.equal(achado.modelo, no, 'da para copiar a classe do rotulo');
});

test('rotulo solto ao lado do logo: a marca entra DENTRO da barra', () => {
  // Este era o caso que faltava. A versao anterior exigia um no sem filhos, e
  // o <img> do logo bastava para descartar a barra inteira - resultado: a
  // marca nao aparecia. E "depois" tambem estaria errado aqui: jogaria o
  // "Assist" para fora da barra.
  const barra = barraComRotulo('Producao');
  const achado = acharRotuloDeAmbiente([barra]);

  assert.equal(achado.ancora, barra);
  assert.equal(achado.modo, 'dentro');
  assert.equal(achado.modelo, null, 'a classe de um container traria layout junto');
});

test('o envolucro do rotulo nao vira ancora', () => {
  // Com textContent, todo ancestral do rotulo "contem" o rotulo e o primeiro
  // da varredura venceria - normalmente um container gigante.
  const fora = envolucro();
  const dentro = rotulo('Producao');
  assert.equal(acharRotuloDeAmbiente([fora, dentro]).ancora, dentro);
});

test('acento e caixa nao importam', () => {
  for (const valor of ['Produção', 'PRODUÇÃO', 'Homologação', 'Treinamento']) {
    assert.ok(acharRotuloDeAmbiente([rotulo(valor)]), `deveria casar com ${valor}`);
  }
});

test('nao casa com texto que apenas contem o rotulo', () => {
  assert.equal(acharRotuloDeAmbiente([rotulo('Ambiente de producao restrito')]), null);
  assert.equal(acharRotuloDeAmbiente([rotulo('Producao e homologacao')]), null);
});

test('barra sem rotulo de ambiente devolve null', () => {
  // Sem rotulo, acharAncoraDaMarca() cai para o logo e depois para a barra
  // inteira - nunca chuta.
  assert.equal(acharRotuloDeAmbiente([rotulo('Pesquisar no Menu'), rotulo('Contatos')]), null);
});

test('lista vazia e no vazio nao quebram', () => {
  assert.equal(acharRotuloDeAmbiente([]), null);
  assert.equal(acharRotuloDeAmbiente([rotulo(''), rotulo('   ')]), null);
});

/* ------------------------------------------------------------- configuracao */

test('os ambientes cobrem os nomes que o SEI usa', () => {
  // Se um orgao usar outro nome, e aqui que se acrescenta - o teste existe
  // para deixar isso explicito para quem vier depois.
  assert.deepEqual(MARCA.ambientes, [
    'producao',
    'homologacao',
    'treinamento',
    'desenvolvimento',
  ]);
});

test('a varredura nao usa o curinga de tag', () => {
  assert.ok(!MARCA.folhas.includes('*'), 'a lista de tags precisa ser fechada');
  assert.ok(MARCA.folhas.includes('div'), 'a barra costuma ser um div');
});

/* --------------------------------- variantes responsivas do mesmo rotulo */

/** <span class="infraTituloLogoSistema">, com ou sem caixa na tela. */
const span = (temCaixa) => ({ getClientRects: () => (temCaixa ? [{}] : []) });

test('visivel distingue o span renderizado do escondido', () => {
  assert.equal(visivel(span(true)), true);
  assert.equal(visivel(span(false)), false);
  assert.equal(visivel(null), false);
});

test('fora do navegador assume visivel', () => {
  // Nos testes nao ha layout; exigir caixa reprovaria tudo.
  assert.equal(visivel({}), true);
});

test('entre os dois spans, escolhe o que esta na tela', () => {
  // O SEI 5.0.4 traz DOIS infraTituloLogoSistema, variantes responsivas.
  // Escrever no escondido da exatamente o sintoma de "nao apareceu".
  const escondido = span(false);
  const naTela = span(true);
  assert.equal(escolherVisivel([escondido, naTela]), naTela);
});

test('nenhum visivel: fica com o primeiro em vez de desistir', () => {
  // Aba em segundo plano no boot: melhor escrever num que talvez apareca.
  const primeiro = span(false);
  assert.equal(escolherVisivel([primeiro, span(false)]), primeiro);
  assert.equal(escolherVisivel([]), null);
});

test('a classe confirmada vem antes da busca por texto', () => {
  // Ordem importa: a classe foi vista no HTML real, o texto e so rede para
  // outros orgaos.
  assert.ok(MARCA.rotulo[0].includes('infraTituloLogoSistema'));
});
