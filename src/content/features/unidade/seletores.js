/**
 * seletores.js - a barra do topo e a tela de troca de unidade.
 *
 * Todo o conhecimento fragil sobre o HTML do SEI mora aqui, como no resto do
 * projeto. Validado contra: leste.sei.rj.gov.br (Niteroi/RJ), SEI 5.0.4.
 */
import { escolherVisivel, norm, qsa, qsAny, textoDe } from '../../core/dom.js';
import { mapaDeColunas } from '../../core/tabela.js';

/**
 * O elemento da unidade na barra do topo.
 *
 * CONFIRMADO no HTML:
 *
 *   <a id="lnkInfraUnidade" class="form-control infraAcaoBarraConjugada"
 *      title="Divisao de Estatisticas" href="#">NIT/NITTRANS/DIVEST</a>
 *
 * ARMADILHA CONFIRMADA: a barra traz DUAS copias, com o MESMO id - uma dentro
 * de #divInfraBarraSistemaMovel (classe d-md-none) e outra dentro de
 * #divInfraBarraSistemaPadraoD (classe d-none d-md-flex). Em tela larga a
 * primeira do documento e a ESCONDIDA.
 *
 * Por isso a busca e por querySelectorAll, que devolve as duas, e nao por
 * getElementById, que devolve so a primeira. Foi o mesmo erro que fez a marca
 * "Assist" nao aparecer.
 */
export const BARRA = {
  unidade: ['a#lnkInfraUnidade', '[id="lnkInfraUnidade"]', 'a.infraAcaoBarraConjugada'],
};

/**
 * A tela "Trocar Unidade".
 *
 * CONFIRMADO no HTML (acao=infra_trocar_unidade):
 *
 *   <form id="frmInfraSelecaoUnidade">
 *     <table class="infraTableResponsiva infraTable">
 *       <caption>Lista de Unidades com Permissao (1 registro):</caption>
 *       <tr><th></th><th>Sigla</th><th>Descricao</th><th>Orgao</th></tr>
 *       <tr>
 *         <td><input name="chkInfraItem" type="radio" title="NIT/NITTRANS/DIVEST"
 *                    checked value="..."></td>
 *         <td data-label="Sigla">NIT/NITTRANS/DIVEST</td>
 *         <td data-label="Descricao">Divisao de Estatisticas</td>
 *         <td data-label="Orgao">NITEROI</td>
 */
export const TROCA = {
  acao: 'infra_trocar_unidade',
  formulario: ['#frmInfraSelecaoUnidade', 'form[id*="SelecaoUnidade" i]'],
  tabela: ['#frmInfraSelecaoUnidade table', 'table.infraTable', 'table'],
  /** O radio de cada linha. E ele que o SEI escuta para trocar. */
  item: 'input[name="chkInfraItem"]',
  /** O rotulo clicavel do radio, quando o clique direto nao pega. */
  rotuloDoItem: (id) => `label[for="${id}"]`,
  colunas: { sigla: 'sigla', descricao: 'descricao', orgao: 'orgao' },
};

/** O <a> da unidade que esta realmente visivel nesta largura de tela. */
export function acharUnidadeNaBarra(raiz = document) {
  for (const seletor of BARRA.unidade) {
    const achados = qsa(seletor, raiz).filter((no) => textoDe(no).trim());
    const visivel = escolherVisivel(achados);
    if (visivel) return visivel;
  }
  return null;
}

/** Texto de uma celula pelo rotulo da coluna, com o cabecalho como rede. */
function celulaPorRotulo(tds, colunas, rotulo) {
  const alvo = norm(rotulo);

  // `data-label` primeiro: quando existe, dispensa contar coluna. Mas ele e
  // posto pelo JavaScript do SEI e NAO vem no HTML do servidor - por isso o
  // cabecalho e a rede, e nao o contrario.
  for (const td of tds) {
    if (norm(td.getAttribute('data-label') || '') === alvo) return textoDe(td).trim();
  }

  const i = colunas[alvo];
  return i === undefined || !tds[i] ? '' : textoDe(tds[i]).trim();
}

/**
 * As unidades em que a pessoa tem permissao.
 *
 * Serve tanto para a pagina aberta quanto para o HTML buscado em segundo
 * plano: os dois sao apenas Document.
 *
 * @returns {Array<{sigla, descricao, orgao, atual, idDoCampo}>}
 */
export function lerUnidades(raiz) {
  const tabela = qsAny(TROCA.tabela, raiz);
  if (!tabela) return [];

  const colunas = mapaDeColunas(tabela);
  const unidades = [];

  for (const campo of qsa(TROCA.item, tabela)) {
    const linha = campo.closest ? campo.closest('tr') : null;
    if (!linha) continue;

    const tds = qsa('td', linha);
    // O title do proprio radio repete a sigla. Vale como rede quando a coluna
    // nao for encontrada, e como desempate quando for.
    const sigla =
      celulaPorRotulo(tds, colunas, TROCA.colunas.sigla) ||
      (campo.getAttribute('title') || '').trim();
    if (!sigla) continue;

    unidades.push({
      sigla,
      descricao: celulaPorRotulo(tds, colunas, TROCA.colunas.descricao),
      orgao: celulaPorRotulo(tds, colunas, TROCA.colunas.orgao),
      // As duas formas, porque as duas ocorrem: no HTML buscado do servidor a
      // marca vem como atributo (checked="checked"); na tela viva, um clique
      // muda a PROPRIEDADE sem tocar no atributo.
      atual: campo.checked === true || campo.getAttribute('checked') !== null,
      idDoCampo: campo.getAttribute('id') || '',
    });
  }

  return unidades;
}
