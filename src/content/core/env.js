/**
 * env.js — "onde eu estou?"
 *
 * Detecta se a pagina e o SEI, qual tela esta aberta e em qual frame este
 * content script foi injetado. Tudo baseado em sinais estaveis (parametro
 * `acao` da URL, nome do frame, marcadores do framework Infra), e nao em
 * classes/ids de layout que mudam entre versoes.
 */
import { ACOES, ACOES_IGNORADAS, FRAMES } from '../../shared/constantes.js';

/** Marcadores que aparecem em praticamente toda instancia do SEI. */
const MARCADORES = [
  'link[href*="infra_css"]',
  'script[src*="infra_js"]',
  '#divInfraBarraSistema',
  '#divInfraAreaTelaD',
  'form[action*="controlador.php"]',
  'a[href*="controlador.php?acao="]',
  'table.infraTable',
  '.infraBarraComandos',
];

/** Le um parametro da query string da URL atual. */
export function param(nome, url = location.href) {
  try {
    return new URL(url).searchParams.get(nome);
  } catch {
    return null;
  }
}

/** A acao bruta do controlador.php (ex.: 'procedimento_trabalhar'). */
export function getAcao() {
  return param('acao') || param('acao_origem') || '';
}

/**
 * True se esta pagina parece ser o SEI.
 * Combina URL + presenca de marcadores no DOM, para nao ligar a extensao
 * em qualquer pagina que por acaso tenha /sei/ no caminho.
 */
export function isSeiPage() {
  const acao = getAcao();
  if (ACOES_IGNORADAS.has(acao)) return false;

  const urlParece =
    /\/sei\//i.test(location.pathname) || /controlador\.php/i.test(location.pathname);

  const domParece = MARCADORES.some((sel) => {
    try {
      return document.querySelector(sel) !== null;
    } catch {
      return false;
    }
  });

  // Frames internos do SEI (ex.: ifrArvoreHtml) as vezes tem quase nenhum
  // marcador, mas herdam a URL do controlador.
  return urlParece && (domParece || Boolean(acao) || isFrameConhecido());
}

function isFrameConhecido() {
  return Object.prototype.hasOwnProperty.call(FRAMES, window.name || '');
}

/** Identifica o frame atual. */
export function getFrame() {
  const nome = window.name || '';
  const topo = window.top === window.self;
  return {
    nome,
    role: topo ? 'topo' : FRAMES[nome] || 'desconhecido',
    topo,
    // util para features que so devem rodar uma vez por pagina
    principal: topo,
  };
}

/**
 * Nome estavel da tela atual. Sempre prefira comparar com isto em vez de
 * olhar a URL crua dentro da feature.
 */
export function getScreen() {
  const acao = getAcao();
  return ACOES[acao] || (acao ? `outra:${acao}` : 'desconhecida');
}

/**
 * Versao do SEI.
 *
 * No SEI 5 ela nao aparece como texto: fica no title da imagem do logo -
 * <img title="Sistema Eletronico de Informacoes - Versao 5.0.4">. Por isso
 * olhamos os atributos antes de olhar o texto da pagina.
 */
export function getVersao() {
  const NUMERO = new RegExp(String.raw`(\d+\.\d+(?:\.\d+)*)`);

  const logo = document.querySelector(
    '#spnInfraIdentificacaoSistema img[title], img[title*="Vers"]',
  );
  const doTitulo = logo?.getAttribute('title')?.match(NUMERO);
  if (doTitulo) return doTitulo[1];

  const alvo =
    document.querySelector('#divInfraRodape') ||
    document.querySelector('#divInfraBarraSistema') ||
    document.querySelector('.infraBarraSistema');
  const doTexto = alvo?.textContent?.match(NUMERO);
  return doTexto ? doTexto[1] : null;
}

/** Objeto entregue a toda feature no setup(). */
export function buildContext() {
  return {
    acao: getAcao(),
    screen: getScreen(),
    frame: getFrame(),
    versao: getVersao(),
    orgao: location.host,
    url: location.href,
    param,
    settings: null, // preenchido pelo main.js
  };
}
