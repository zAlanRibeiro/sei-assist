/**
 * rede.js - a UNICA porta de rede da extensao.
 *
 * Ate aqui a extensao nao falava com servidor nenhum, e isso era garantido por
 * teste. O alerta de bloco de assinatura mudou a exigencia: para avisar que
 * entrou documento novo SEM o usuario abrir a tela, alguem precisa perguntar
 * ao SEI.
 *
 * A regra nao foi removida - foi estreitada, e continua valendo por teste
 * (ver testes/privacidade.test.mjs):
 *
 *   - so ESTE arquivo pode chamar fetch(); em qualquer outro a suite reprova;
 *   - so GET. Nunca POST, PUT, PATCH ou DELETE - nada aqui altera processo,
 *     assina, envia ou conclui coisa alguma;
 *   - so a MESMA ORIGEM da pagina em que a extensao ja esta rodando. Outro
 *     dominio e recusado antes de sair da maquina;
 *   - nada de corpo na requisicao: nao ha o que vazar. O trafego e uma
 *     leitura identica a abrir a tela no navegador;
 *   - as demais saidas de rede (WebSocket, sendBeacon, EventSource,
 *     XMLHttpRequest) continuam proibidas ate aqui dentro.
 *
 * Nao ha host_permissions no manifest, de proposito: a requisicao sai do
 * content script na origem do proprio SEI, como um link da propria pagina.
 */
import { log } from './log.js';

/** Falha esperada de rede. Erro proprio para o chamador poder distinguir. */
export class ErroDeRede extends Error {
  constructor(motivo, detalhe) {
    super(detalhe ? `${motivo}: ${detalhe}` : motivo);
    this.name = 'ErroDeRede';
    this.motivo = motivo;
  }
}

/**
 * A URL e da mesma origem da base?
 *
 * Exportada para poder ser testada sem navegador - e a trava mais importante
 * do arquivo, entao nao pode viver so dentro da funcao que busca.
 */
export function mesmaOrigem(url, base) {
  // Vazio, nulo ou nao-string resolveria para a PROPRIA pagina e passaria na
  // checagem sem querer - new URL('', base) devolve a base. Isso e sempre
  // engano de quem chama, entao recusa em vez de buscar a si mesmo.
  if (typeof url !== 'string' || !url.trim()) return false;

  try {
    return new URL(url, base).origin === new URL(base).origin;
  } catch {
    // URL invalida nao e mesma origem. Recusar e o lado seguro.
    return false;
  }
}

/**
 * A resposta e a tela de login do SEI?
 *
 * Sessao expirada nao devolve erro HTTP: devolve a pagina de login com status
 * 200. Sem esta checagem o parser leria "nenhum documento no bloco" e o alerta
 * diria que tudo foi assinado - exatamente o aviso errado.
 */
export function ehTelaDeLogin(html) {
  if (!html) return true;
  const trecho = html.slice(0, 4000).toLowerCase();
  return (
    trecho.includes('acao=login') ||
    trecho.includes('name="pwdsenha"') ||
    trecho.includes('type="password"')
  );
}

/**
 * Qual codificacao usar para ler os bytes da resposta.
 *
 * Existe porque `Response.text()` decodifica como UTF-8 SEMPRE, por
 * especificacao - ele ignora o charset declarado. O SEI serve as paginas em
 * ISO-8859-1, entao ler com text() transforma "Numero" (com acento) em
 * "N\uFFFDmero".
 *
 * Isso nao quebra de forma barulhenta: a tabela e encontrada, as linhas sao
 * encontradas, e so a busca pela coluna acentuada falha. O resultado e uma
 * lista de dois registros lida como zero, em silencio. Foi exatamente o que
 * aconteceu com o alerta de bloco.
 *
 * Ordem: o cabecalho Content-Type manda; se ele nao disser, vale o <meta>
 * do proprio HTML; sem nenhum dos dois, UTF-8.
 */
export function detectarCharset(contentType, inicioDoHtml = '') {
  const doCabecalho = String(contentType || '').match(/charset\s*=\s*["\']?([\w-]+)/i);
  if (doCabecalho) return doCabecalho[1].toLowerCase();

  const doMeta = String(inicioDoHtml).match(/charset\s*=\s*["\']?([\w-]+)/i);
  if (doMeta) return doMeta[1].toLowerCase();

  return 'utf-8';
}

/**
 * Decodifica os bytes da resposta com a codificacao certa.
 *
 * O <meta> e procurado lendo o comeco como latin1 - qualquer byte e valido
 * em latin1, entao essa leitura nunca falha, e o nome do charset e ASCII de
 * todo jeito.
 */
function decodificar(bytes, contentType) {
  const inicio = new TextDecoder('iso-8859-1').decode(bytes.slice(0, 2048));
  const charset = detectarCharset(contentType, inicio);
  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // Charset que o navegador nao conhece: melhor UTF-8 que nada.
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Busca uma pagina do proprio SEI e devolve o HTML.
 *
 * Lanca ErroDeRede em qualquer tropeco - incluindo sessao expirada -, porque
 * quem chama precisa saber a diferenca entre "o bloco esta vazio" e "nao
 * consegui olhar". Confundir os dois produz alerta errado.
 */
export async function buscarHtml(url, { timeout = 15000, base = location.href } = {}) {
  if (!mesmaOrigem(url, base)) {
    throw new ErroDeRede('origem diferente', String(url));
  }

  const controle = new AbortController();
  const relogio = setTimeout(() => controle.abort(), timeout);

  try {
    const resposta = await fetch(new URL(url, base).href, {
      method: 'GET',
      credentials: 'same-origin',
      redirect: 'follow',
      cache: 'no-store',
      signal: controle.signal,
    });

    if (!resposta.ok) throw new ErroDeRede('resposta nao ok', `HTTP ${resposta.status}`);

    // arrayBuffer e nao text(): ver detectarCharset() acima.
    const bytes = new Uint8Array(await resposta.arrayBuffer());
    const html = decodificar(bytes, resposta.headers.get('content-type'));
    if (ehTelaDeLogin(html)) throw new ErroDeRede('sessao expirada');
    return html;
  } catch (err) {
    if (err instanceof ErroDeRede) throw err;
    if (err && err.name === 'AbortError') throw new ErroDeRede('tempo esgotado');
    // CORS bloqueado pelo Chrome cai aqui como TypeError generico. Vale
    // registrar o texto cru: e a pista de que seria preciso host_permissions.
    throw new ErroDeRede('falha na requisicao', err && err.message);
  } finally {
    clearTimeout(relogio);
  }
}

/**
 * Transforma HTML em documento inerte, para ler com os mesmos seletores.
 *
 * DOMParser nao executa script nem carrega imagem do documento resultante -
 * por isso ele, e nao um iframe escondido.
 */
export function lerHtml(html) {
  try {
    return new DOMParser().parseFromString(html, 'text/html');
  } catch (err) {
    log.error('nao consegui interpretar o HTML recebido:', err);
    return null;
  }
}
