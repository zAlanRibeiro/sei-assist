/**
 * seletores.js - o HTML da tela "Blocos de Assinatura".
 *
 * CONFIRMADO contra leste.sei.rj.gov.br (SEI 5.0.4). Tudo aqui saiu do HTML
 * real, nao de suposicao.
 */
import { norm, qsa, qsAny, textoDe } from '../../core/dom.js';
import { lerLinhaDeBloco } from './blocos.js';

export const TELA = {
  /**
   * Onde buscar a lista.
   *
   * O href sai do PROPRIO MENU da pagina, nunca montado por nos. Motivo
   * concreto: as URLs do SEI carregam `infra_hash`, e uma URL sem o hash
   * correto derruba a sessao - foi o que aconteceu quando o historico guardou
   * link. O link do menu esta sempre valido para a sessao atual.
   */
  linkNoMenu: [
    '#infraMenu a[href*="bloco_assinatura_listar"]',
    'a[href*="acao=bloco_assinatura_listar"]',
  ],

  tabela: ['#tblBlocos', 'table.infraTable'],

  /**
   * A celula carrega o nome da coluna em `data-label` - a tabela e responsiva.
   * Isso dispensa heuristica de ordem de coluna. Quando faltar, o cabecalho
   * serve de mapa; ver mapaDeColunas().
   */
  rotuloDaCelula: 'data-label',

  /** Unidades para quem o bloco foi disponibilizado. */
  unidadeDisponibilizada: 'div.unidadeDisp a, a.ancoraSigla',

  /** A unidade em que voce esta agora, na barra do topo. */
  unidadeAtual: ['#lnkInfraUnidade', '#spnInfraUnidade'],
};

/** Menu lateral, para pendurar o marcador de novidade. */
export const MENU = {
  /** O item "Assinatura", dentro de "Blocos". */
  assinatura: ['#infraMenu a[href*="bloco_assinatura_listar"]'],
  /** O <ul> do submenu; o pai "Blocos" e o irmao anterior dele. */
  submenu: 'ul',
};

// Mora no nucleo desde que a troca de unidade passou a ler tabela tambem.
// Reexportado aqui porque os testes desta feature o importam daqui.
import { mapaDeColunas } from '../../core/tabela.js';

export { mapaDeColunas };

/** Uma linha da tabela, reduzida ao que blocos.js sabe interpretar. */
function celulasDaLinha(linha, colunas) {
  const tds = qsa('td', linha);
  if (!tds.length) return [];

  // Indice -> rotulo, invertido a partir do cabecalho, para quando faltar
  // data-label na celula.
  const porIndice = {};
  for (const [rotulo, i] of Object.entries(colunas)) porIndice[i] = rotulo;

  return tds.map((td, i) => {
    const rotulo = td.getAttribute(TELA.rotuloDaCelula) || porIndice[i] || '';
    const celula = { rotulo, texto: textoDe(td) };

    // A coluna de disponibilizacao tem varias unidades, cada uma num div.
    // Guardar so o texto corrido perderia a separacao entre elas.
    if (norm(rotulo) === norm('Disponibilização')) {
      celula.unidades = qsa(TELA.unidadeDisponibilizada, td).map((a) => textoDe(a).trim());
    }
    return celula;
  });
}

/**
 * Le a lista de blocos de um documento.
 *
 * Serve tanto para a pagina aberta quanto para o HTML buscado em segundo
 * plano: os dois sao apenas Document.
 */
export function lerBlocos(raiz) {
  const tabela = qsAny(TELA.tabela, raiz);
  if (!tabela) return [];

  const colunas = mapaDeColunas(tabela);
  const blocos = [];

  for (const linha of qsa('tr', tabela)) {
    const bloco = lerLinhaDeBloco(celulasDaLinha(linha, colunas));
    if (bloco) blocos.push(bloco);
  }
  return blocos;
}

/** A URL da lista de blocos, tirada do menu da pagina atual. */
export function urlDaLista(raiz = document) {
  const link = qsAny(TELA.linkNoMenu, raiz);
  return link ? link.getAttribute('href') : null;
}

/** A sigla da unidade em que a pessoa esta. */
export function unidadeAtual(raiz = document) {
  const alvo = qsAny(TELA.unidadeAtual, raiz);
  return alvo ? textoDe(alvo).trim() : '';
}
