/**
 * filtro.js — a regra do filtro, sem DOM nenhum.
 *
 * Separado de propósito: é aqui que mora a decisão de quem aparece e quem
 * some, e decisão sem navegador é decisão que dá para testar. O index.js
 * cuida só de pintar botão e esconder linha.
 *
 * Dois modos:
 *
 *   'todos'    — a linha precisa ter TODOS os marcadores escolhidos (E)
 *   'qualquer' — basta ter UM deles (OU)
 *
 * 'todos' é o pedido original e o padrão. 'qualquer' existe porque há
 * instalação do SEI em que cada processo carrega um marcador só por unidade;
 * onde for esse o caso, escolher dois no modo 'todos' devolve lista vazia por
 * construção, e o botão ao lado resolve sem precisar de código novo.
 */

export const MODOS = ['todos', 'qualquer'];
export const MODO_PADRAO = 'todos';

/** Modo válido, ou o padrão. Nunca confie no que veio do storage. */
export function modoSeguro(valor) {
  return MODOS.includes(valor) ? valor : MODO_PADRAO;
}

/**
 * A linha passa no filtro?
 *
 * Sem nada escolhido, tudo passa — um filtro vazio não é um filtro que
 * esconde tudo, é um filtro desligado.
 */
export function combina(chavesDaLinha, escolhidas, modo = MODO_PADRAO) {
  if (!escolhidas || escolhidas.length === 0) return true;

  const tem = new Set(chavesDaLinha || []);
  if (modoSeguro(modo) === 'qualquer') return escolhidas.some((c) => tem.has(c));
  return escolhidas.every((c) => tem.has(c));
}

/**
 * Separa os itens em quem fica e quem some.
 *
 * `itens` são { chaves: string[] , ...o que o chamador quiser levar junto }.
 */
export function aplicar(itens, escolhidas, modo = MODO_PADRAO) {
  const visiveis = [];
  const ocultos = [];
  for (const item of itens || []) {
    if (combina(item.chaves, escolhidas, modo)) visiveis.push(item);
    else ocultos.push(item);
  }
  return { visiveis, ocultos };
}

/**
 * Os marcadores existentes na lista, com quantos processos cada um tem.
 *
 * A contagem é o que torna o filtro utilizável antes de clicar: dá para ver
 * que "Aguardando" tem 12 e "Urgente" tem 2 sem experimentar um por um.
 *
 * Ordem: do mais usado para o menos, e alfabética no empate — assim a barra
 * não muda de ordem a cada carregamento da tela.
 */
export function catalogar(itens) {
  const mapa = new Map();

  for (const item of itens || []) {
    for (const marcador of item.marcadores || []) {
      const atual = mapa.get(marcador.chave);
      if (atual) {
        atual.quantidade += 1;
        if (!atual.cor && marcador.cor) atual.cor = marcador.cor;
      } else {
        mapa.set(marcador.chave, {
          chave: marcador.chave,
          nome: marcador.nome,
          cor: marcador.cor || null,
          quantidade: 1,
        });
      }
    }
  }

  return Array.from(mapa.values()).sort(
    (a, b) => b.quantidade - a.quantidade || a.nome.localeCompare(b.nome, 'pt-BR'),
  );
}

/** Liga/desliga um marcador da seleção, devolvendo uma lista nova. */
export function alternar(escolhidas, chave) {
  const atuais = escolhidas || [];
  return atuais.includes(chave) ? atuais.filter((c) => c !== chave) : [...atuais, chave];
}

/**
 * Só as escolhas que ainda existem na lista da tela.
 *
 * A seleção sobrevive à navegação (ver index.js), e a tela seguinte pode não
 * ter aquele marcador em processo nenhum. Sem esta limpeza o filtro esconderia
 * a lista inteira por causa de uma escolha invisível, sem botão para desfazer
 * — o pior defeito possível numa tela de trabalho.
 */
export function apenasExistentes(escolhidas, catalogo) {
  const existentes = new Set((catalogo || []).map((m) => m.chave));
  return (escolhidas || []).filter((c) => existentes.has(c));
}

/** "8 de 42 processos" / "42 processos". */
export function frase(mostrando, total) {
  const plural = total === 1 ? 'processo' : 'processos';
  if (mostrando === total) return `${total} ${plural}`;
  return `${mostrando} de ${total} ${plural}`;
}
