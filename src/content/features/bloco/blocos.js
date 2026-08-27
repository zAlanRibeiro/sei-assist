/**
 * blocos.js - interpretacao da lista de blocos de assinatura.
 *
 * Funcoes puras: entram celulas ja reduzidas a { rotulo, texto }, sai o bloco.
 * Nenhum acesso ao DOM aqui - e o que permite testar contra a estrutura real
 * do SEI sem navegador. A parte que toca o DOM mora em seletores.js.
 *
 * Validado contra: leste.sei.rj.gov.br (Niteroi/RJ), SEI 5.0.4.
 */
import { norm } from '../../core/dom.js';

/**
 * Estados em que o bloco ainda espera alguma acao sua.
 *
 * "Concluido" fica de fora de proposito: bloco concluido nao gera alerta, e a
 * propria tela do SEI ja vem com o filtro dele desmarcado.
 */
export const ESTADOS_ABERTOS = new Set(['gerado', 'disponibilizado', 'recebido', 'retornado']);

/** O texto de uma celula, pelo rotulo da coluna. */
function campo(celulas, rotulo) {
  const alvo = norm(rotulo);
  const achado = celulas.find((c) => norm(c.rotulo || '') === alvo);
  return achado ? String(achado.texto || '').trim() : '';
}

/**
 * Monta um bloco a partir das celulas de uma linha.
 *
 * Devolve null para linha sem numero: cabecalho, linha de "nenhum registro" e
 * qualquer coisa que nao seja um bloco de verdade caem aqui.
 */
export function lerLinhaDeBloco(celulas) {
  if (!Array.isArray(celulas) || !celulas.length) return null;

  // O numero e a identidade do bloco. Sem ele nao ha o que acompanhar.
  const numero = campo(celulas, 'Número').match(/\d+/)?.[0] || '';
  if (!numero) return null;

  return {
    numero,
    estado: campo(celulas, 'Estado'),
    geradora: campo(celulas, 'Geradora'),
    grupo: campo(celulas, 'Grupo'),
    descricao: campo(celulas, 'Descrição'),
    atribuicao: campo(celulas, 'Atribuição'),
    // Cada unidade que recebeu o bloco. E o que diz se ele e problema seu ou
    // de outra unidade - ver ehDaUnidade().
    unidades: (celulas.find((c) => norm(c.rotulo || '') === norm('Disponibilização'))?.unidades || [])
      .map((u) => String(u).trim())
      .filter(Boolean),
  };
}

/** O bloco ainda espera acao? */
export function estaAberto(bloco) {
  return ESTADOS_ABERTOS.has(norm(bloco?.estado || ''));
}

/**
 * O bloco foi disponibilizado para esta unidade?
 *
 * Sem este corte o alerta dispararia por bloco de qualquer unidade do orgao,
 * que e ruido puro. Quando a lista de unidades vem vazia (o SEI nem sempre
 * preenche), assume que sim: e melhor um alerta a mais que perder o seu.
 */
export function ehDaUnidade(bloco, unidade) {
  if (!unidade) return true;
  if (!bloco?.unidades?.length) return true;
  const alvo = norm(unidade);
  return bloco.unidades.some((u) => norm(u) === alvo);
}

/** Chave de comparacao: o que faz um bloco "mudar" aos olhos do alerta. */
function assinatura(bloco) {
  return `${norm(bloco.estado)}|${bloco.unidades.length}`;
}

/**
 * Compara o que se via antes com o que se ve agora.
 *
 * Devolve { novos, mudados }. Distinguir os dois importa: bloco novo e
 * "chegou trabalho"; bloco que mudou de estado costuma ser "voltou para
 * voce". O texto do alerta e diferente.
 *
 * `antes` vazio e tratado como primeira execucao pelo chamador - ver
 * primeiraLeitura(). Aqui, sem estado anterior, tudo seria novo.
 */
export function comparar(antes, agora) {
  const anteriores = new Map((antes || []).map((b) => [b.numero, b]));
  const novos = [];
  const mudados = [];

  for (const bloco of agora || []) {
    const antigo = anteriores.get(bloco.numero);
    if (!antigo) {
      novos.push(bloco);
    } else if (assinatura(antigo) !== assinatura(bloco)) {
      mudados.push({ ...bloco, estadoAnterior: antigo.estado });
    }
  }
  return { novos, mudados };
}

/**
 * Filtra o que merece alerta: aberto e desta unidade.
 *
 * Feito antes da comparacao, nao depois. Se fosse depois, um bloco concluido
 * de outra unidade entraria no estado guardado e sumiria da proxima leitura,
 * gerando um "mudou" que nao interessa a ninguem.
 */
export function relevantes(blocos, unidade) {
  return (blocos || []).filter((b) => estaAberto(b) && ehDaUnidade(b, unidade));
}

/**
 * A primeira leitura nunca alerta.
 *
 * Instalar a extensao com quinze blocos parados na unidade nao pode disparar
 * quinze avisos de "chegou agora". A primeira passagem so registra o ponto de
 * partida.
 */
export function primeiraLeitura(antes) {
  return antes === null || antes === undefined;
}

/** Quantos itens o alerta deve anunciar. */
export function contar({ novos, mudados }) {
  return (novos?.length || 0) + (mudados?.length || 0);
}
