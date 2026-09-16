/**
 * dom.js — utilitarios de DOM pensados para o SEI.
 *
 * Regra da casa: prefira localizar elementos por TEXTO VISIVEL, atributo
 * `name`, `data-*` ou estrutura relativa. Ids como #txtDescricao existem em
 * quase toda instancia, mas classes de layout mudam entre versoes/temas —
 * por isso as funcoes abaixo aceitam varios seletores e usam o primeiro que
 * encontrar.
 */

export const qs = (sel, root = document) => root.querySelector(sel);
export const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Primeiro seletor da lista que casar com algo. */
export function qsAny(seletores, root = document) {
  for (const sel of seletores) {
    const el = root.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/** Normaliza texto: minusculo, sem acento, sem espaco duplicado. */
export function norm(texto = '') {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Texto "visivel" de um elemento, incluindo value de inputs e title/alt. */
export function textoDe(el) {
  if (!el) return '';
  if (el.matches?.('input, button')) {
    return el.value || el.getAttribute('title') || el.getAttribute('alt') || el.textContent || '';
  }
  return el.textContent || el.getAttribute?.('title') || el.getAttribute?.('alt') || '';
}

/** Mesmo texto, sem espaco nenhum. Ver textoCasa(). */
const semEspacos = (x) => x.replace(/\s+/g, '');

/**
 * O texto de um elemento corresponde ao alvo?
 *
 * Compara tambem sem espaco algum, por causa de como o SEI marca as teclas de
 * atalho: a primeira letra vai para dentro de um <span>.
 *
 *   <button accesskey="S"><span class="infraTeclaAtalho">S</span>alvar</button>
 *
 * O textContent disso e "S alvar", que nao contem "salvar". Sem esta
 * comparacao extra, procurar botao por texto no SEI simplesmente nao funciona.
 */
export function textoCasa(texto, alvo, { exato = false } = {}) {
  const a = norm(texto);
  const b = norm(String(alvo));

  if (exato) return a === b || semEspacos(a) === semEspacos(b);
  return a.includes(b) || semEspacos(a).includes(semEspacos(b));
}

/** Observa mudancas no DOM com debounce. Retorna funcao para parar. */
export function observar(root, callback, { debounce = 100 } = {}) {
  let timer = null;
  const obs = new MutationObserver((mutacoes) => {
    clearTimeout(timer);
    timer = setTimeout(() => callback(mutacoes), debounce);
  });
  obs.observe(root, { childList: true, subtree: true });
  return () => {
    clearTimeout(timer);
    obs.disconnect();
  };
}

/**
 * O elemento ocupa espaco na tela?
 *
 * `getClientRects()` vazio cobre display:none, o ancestral escondido e o
 * elemento ainda nao renderizado - tudo de uma vez, sem ler estilo computado.
 * Fora do navegador (nos testes) nao ha layout, entao assume visivel.
 */
export function visivel(no) {
  if (!no) return false;
  if (typeof no.getClientRects !== 'function') return true;
  return no.getClientRects().length > 0;
}

/**
 * Entre os rotulos encontrados, o que esta visivel nesta largura de tela.
 *
 * Se nenhum estiver (janela minimizada, aba em segundo plano no momento do
 * boot), fica com o primeiro: melhor escrever num que talvez apareca do que
 * desistir.
 */
export function escolherVisivel(nos) {
  return nos.find(visivel) || nos[0] || null;
}

/** Cria elemento. el('div', { class: 'x', onclick: fn }, ['texto', outroEl]) */
export function el(tag, props = {}, filhos = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === null || v === undefined) continue;
    if (k === 'class') node.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  }
  for (const filho of [].concat(filhos)) {
    if (filho === null || filho === undefined) continue;
    node.append(filho instanceof Node ? filho : document.createTextNode(String(filho)));
  }
  return node;
}

/**
 * Todos os documentos que conseguimos ler a partir daqui.
 *
 * A tela do SEI e feita de frames irmaos: quem esta no editor precisa olhar a
 * arvore, que e outro frame. Como sao todos da mesma origem, da para percorrer
 * a partir do topo. Profundidade limitada porque o SEI aninha pouco e um laco
 * infinito aqui travaria a pagina.
 */
export function documentosAcessiveis(profundidade = 3) {
  const vistos = [document];

  const visitar = (janela, nivel) => {
    if (nivel > profundidade) return;
    try {
      const doc = janela.document;
      if (doc && !vistos.includes(doc)) vistos.push(doc);
      for (let i = 0; i < janela.frames.length; i++) visitar(janela.frames[i], nivel + 1);
    } catch {
      /* frame de outra origem: ignora */
    }
  };

  try {
    visitar(window.top, 0);
  } catch {
    /* sem acesso ao topo */
  }
  return vistos;
}

/**
 * Texto que pertence ao proprio no, sem contar o dos descendentes.
 *
 * Distincao que parece preciosismo e nao e. Com `textContent`, todo
 * ancestral de um trecho tambem "contem" aquele trecho, e uma varredura
 * ancora no primeiro que encontrar - que costuma ser um container gigante.
 * Com o texto proprio, so quem realmente escreve a palavra e considerado.
 */
export function textoProprio(no) {
  if (!no || !no.childNodes) return '';
  let texto = '';
  for (const filho of no.childNodes) {
    if (filho.nodeType === 3) texto += filho.nodeValue || '';
  }
  return texto;
}
