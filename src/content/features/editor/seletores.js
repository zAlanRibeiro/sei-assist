/**
 * seletores.js - o editor do SEI 5.0.4.
 *
 * CONFIRMADO contra leste.sei.rj.gov.br. Tudo aqui saiu do HTML real.
 *
 * Fatos que mudaram o desenho da feature, e que so a captura revelou:
 *
 *  1. E CKEditor 5, nao 4. O 5 tem modelo proprio e NAO tolera escrita direta
 *     no DOM da area editavel - a alteracao e revertida ou desincroniza o
 *     modelo. Inserir texto tem de passar por evento que ele escute.
 *
 *  2. O documento nao e um editor, sao CINCO, cada um com seu id e seu
 *     aria-label: Cabecalho, Titulo, Corpo do Texto, Desfecho e Rodape. O
 *     texto que a pessoa escreve fica no Corpo; os outros vem do modelo.
 *
 *  3. Copiar a classe de um botao vizinho, truque que funcionou na linha de
 *     links do Controle de Processos, NAO serve aqui: o primeiro botao da
 *     barra e o Salvar, que carrega `salvar__pisca`. O botao novo herdava a
 *     opacidade animada e nascia com cara de desabilitado.
 *
 *  4. O editor abre em janela propria, sem menu lateral e sem barra do SEI. O
 *     nome da janela carrega os ids - e de la que sai a identidade do
 *     rascunho, ja que a URL do editor nao os traz de forma estavel.
 */
import { qsa, qsAny } from '../../core/dom.js';

export const EDITOR = {
  /** Onde encaixar botao novo. Os itens da barra sao irmaos aqui dentro. */
  barra: ['.ck-toolbar__items'],

  /** Todas as areas editaveis do documento. */
  editaveis: '.ck-editor__editable[role="textbox"]',

  /**
   * O corpo do texto - a unica secao que interessa ao rascunho.
   *
   * Cabecalho e rodape sao gerados pelo modelo do documento e nao se perdem;
   * guardar os cinco seria guardar conteudo a toa.
   */
  corpo: ['.infra-editor__secao-principal', '[aria-label="Corpo do Texto"]'],

  /**
   * O botao Salvar do proprio SEI.
   *
   * Serve so para SABER que o documento foi salvo e descartar o rascunho.
   * Nunca e clicado por nos - ver guard.js.
   */
  salvar: ['button[data-cke-tooltip-text^="Salvar"]', '.salvar__buttonview'],
};

/**
 * Identidade do documento em edicao.
 *
 * O nome da janela e "janelaEditor_<id_procedimento>_<id_documento>". Foi a
 * captura que revelou isso, e e a fonte mais estavel aqui: a URL do editor nao
 * traz os ids de forma confiavel, e o titulo muda enquanto se escreve.
 */
export function idDoDocumento(nomeDaJanela = '', url = '') {
  const doNome = String(nomeDaJanela).match(/janelaEditor_(\d+)_(\d+)/);
  if (doNome) return doNome[2];

  try {
    const daUrl = new URL(url, 'https://x/').searchParams.get('id_documento');
    if (daUrl) return daUrl;
  } catch {
    /* url invalida: segue sem id */
  }
  return null;
}

/**
 * A secao tem estrutura que texto puro nao reconstroi?
 *
 * O Cabecalho traz o timbre e o Rodape traz uma tabela com a referencia do
 * processo. Devolver texto puro para dentro deles achataria a tabela e
 * perderia a imagem - e sem ganho nenhum, porque essas duas secoes sao
 * geradas pelo modelo do documento e nunca se perdem.
 */
export function temEstrutura(secao) {
  return Boolean(secao && secao.querySelector('table, figure, img, hr'));
}

/**
 * As secoes do documento, com o rotulo que o SEI da a cada uma.
 *
 * A chave e o `aria-label` ("Corpo do Texto", "Desfecho"...), e nao o id:
 * o id muda a cada documento (txaEditor_840), o rotulo nao.
 */
export function secoes(raiz = document) {
  return qsa(EDITOR.editaveis, raiz)
    .map((elemento) => ({
      rotulo: (elemento.getAttribute('aria-label') || '').trim(),
      elemento,
      estruturada: temEstrutura(elemento),
    }))
    .filter((s) => s.rotulo);
}

/** O texto de cada secao, pronto para guardar: { rotulo: texto }. */
export function textoDasSecoes(raiz = document) {
  const mapa = {};
  for (const { rotulo, elemento } of secoes(raiz)) mapa[rotulo] = elemento.innerText;
  return mapa;
}

/** A area de texto principal, onde a pessoa escreve. */
export function corpoDoTexto(raiz = document) {
  return qsAny(EDITOR.corpo, raiz);
}

/** Todas as areas editaveis, para diagnostico. */
export function editaveis(raiz = document) {
  return qsa(EDITOR.editaveis, raiz);
}
