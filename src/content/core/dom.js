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

/**
 * Acha elementos pelo texto visivel.
 * @param {string} seletor  ex.: 'a, button, input[type=button]'
 * @param {string|RegExp} texto
 */
export function acharPorTexto(seletor, texto, { root = document, exato = false } = {}) {
  return qsa(seletor, root).filter((el) => {
    const t = norm(textoDe(el));
    if (texto instanceof RegExp) return texto.test(t) || texto.test(semEspacos(t));
    return textoCasa(t, texto, { exato });
  });
}

/**
 * Botao da barra de comandos do SEI (topo e rodape da tela).
 * O SEI usa <a>, <button>, <input type=button> e <img title=...> de forma
 * inconsistente entre versoes — por isso varremos todos.
 */
export function acharBotaoComando(texto, root = document) {
  const barras = qsa(
    '#divComandos, #divInfraBarraComandosSuperior, #divInfraBarraComandosInferior, ' +
      '#divArvoreAcoes, .infraBarraComandos, .infraAreaTelaD',
    root,
  );
  const escopos = barras.length ? barras : [root];
  for (const escopo of escopos) {
    const [achado] = acharPorTexto(
      'a, button, input[type=button], input[type=submit], img[title]',
      texto,
      { root: escopo },
    );
    if (achado) return achado;
  }
  // ultimo recurso: pagina inteira
  return acharPorTexto('a, button, input[type=button], input[type=submit], img[title]', texto, {
    root,
  })[0] || null;
}

/**
 * Acha um campo de formulario pelo texto do rotulo.
 * Cobre <label for>, label envolvendo o campo, e o padrao do SEI de rotulo
 * em uma <td>/<div> imediatamente antes do campo.
 */
export function acharCampoPorRotulo(rotulo, root = document) {
  const alvo = norm(rotulo);

  for (const label of qsa('label', root)) {
    if (!norm(label.textContent).includes(alvo)) continue;
    const forId = label.getAttribute('for');
    if (forId) {
      const campo = root.getElementById?.(forId) || qs(`#${CSS.escape(forId)}`, root);
      if (campo) return campo;
    }
    const dentro = qs('input, select, textarea', label);
    if (dentro) return dentro;
    const irmao = label.parentElement?.querySelector('input, select, textarea');
    if (irmao) return irmao;
  }

  // padrao SEI: <td>Rotulo</td><td><input ...></td>
  for (const celula of qsa('td, th, div, span', root)) {
    if (celula.children.length > 2) continue;
    if (!norm(celula.textContent).startsWith(alvo)) continue;
    const campo =
      celula.nextElementSibling?.querySelector?.('input, select, textarea') ||
      celula.parentElement?.querySelector?.('input, select, textarea');
    if (campo) return campo;
  }
  return null;
}

/** Espera um elemento aparecer (o SEI monta muita coisa depois do load). */
export function esperarElemento(seletor, { root = document, timeout = 10000 } = {}) {
  const achar = () => (typeof seletor === 'function' ? seletor(root) : qs(seletor, root));
  const ja = achar();
  if (ja) return Promise.resolve(ja);

  return new Promise((resolve, reject) => {
    const obs = new MutationObserver(() => {
      const el = achar();
      if (el) {
        obs.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });
    const timer = setTimeout(() => {
      obs.disconnect();
      reject(new Error(`timeout esperando: ${seletor}`));
    }, timeout);
    obs.observe(root.documentElement || root, { childList: true, subtree: true });
  });
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
 * Dispara os eventos que o SEI escuta ao preencher um campo por script.
 * Sem isso, validacoes e autocompletes do sistema nao percebem a mudanca.
 */
export function preencher(campo, valor) {
  if (!campo) return false;
  campo.focus?.();
  campo.value = valor;
  for (const tipo of ['input', 'change', 'keyup', 'blur']) {
    campo.dispatchEvent(new Event(tipo, { bubbles: true }));
  }
  return true;
}

/** Acessa outro frame do SEI a partir do frame do topo (mesma origem). */
export function frameDoc(nome) {
  try {
    const frame = window.top.document.querySelector(
      `iframe[name="${nome}"], frame[name="${nome}"]`,
    );
    return frame?.contentDocument || null;
  } catch {
    return null; // cross-origin
  }
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
