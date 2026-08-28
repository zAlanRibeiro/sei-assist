/**
 * tabela.js - ler tabela do SEI sem depender da ordem das colunas.
 *
 * O SEI marca cada celula com `data-label` quando a tabela e responsiva, e
 * seria comodo confiar nisso. Nao da: o atributo e posto pelo JAVASCRIPT do
 * SEI, e o HTML que vem do servidor nao o tem. Uma feature que busque a
 * pagina em segundo plano ve a tabela sem `data-label` nenhum - foi
 * exatamente assim que a lista de blocos com dois registros foi lida como
 * zero, em silencio.
 *
 * Por isso o cabecalho e a fonte primaria aqui, e nao a rede.
 */
import { qsa, norm, textoDe } from './dom.js';

/**
 * Rotulo -> indice, lido do cabecalho da tabela.
 *
 * Rede para instalacoes sem `data-label`. As celulas de cabecalho do SEI
 * trazem divs de ordenacao junto, mas as ancoras la dentro so tem <img>, entao
 * o texto que sobra e o rotulo.
 */
export function mapaDeColunas(tabela) {
  // Primeiro os <th>. Se a tabela nao usar <th> - e ha versao do SEI que
  // monta o cabecalho com <td>, deixando o JavaScript promover depois -,
  // a primeira linha serve de cabecalho do mesmo jeito.
  //
  // Sem esta segunda tentativa o mapa sai vazio, toda celula fica sem
  // rotulo e NENHUMA linha vira bloco: a lista com dois registros e lida
  // como zero, em silencio.
  let cabecalhos = qsa('th', tabela);
  if (!cabecalhos.length) {
    const primeira = qsa('tr', tabela)[0];
    cabecalhos = primeira ? qsa('th, td', primeira) : [];
  }

  const mapa = {};
  cabecalhos.forEach((celula, i) => {
    const rotulo = norm(textoDe(celula));
    if (rotulo && mapa[rotulo] === undefined) mapa[rotulo] = i;
  });
  return mapa;
}
