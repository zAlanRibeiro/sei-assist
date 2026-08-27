/**
 * domFalso.mjs - um DOM minimo, só para os testes.
 *
 * Existe porque a camada que lê a tabela do SEI (`seletores.js`) toca o DOM de
 * verdade, e o Node não tem nenhum. Sem isto ela ficaria sem cobertura — que é
 * exatamente onde os erros deste projeto apareceram: seletor que não casa,
 * coluna lida na posição errada, selo pendurado no elemento errado.
 *
 * NÃO é um navegador. Entende só o subconjunto de CSS que o código usa:
 *
 *   tag            div
 *   id             #tblBlocos
 *   classe         .unidadeDisp        tag.classe   table.infraTable
 *   atributo       [href*="x"]  [data-label="y"]
 *   descendente    div.unidadeDisp a
 *   lista          a, span
 *
 * Se um teste falhar de forma esquisita, desconfie primeiro daqui.
 */

const TEXTO = 3;
const ELEMENTO = 1;

/** Divide "a.b, c d" em [["a.b"], ["c", "d"]]. */
function compilar(seletor) {
  return String(seletor)
    .split(',')
    .map((parte) => parte.trim().split(/\s+/).filter(Boolean))
    .filter((partes) => partes.length);
}

/** "tag#id.c1.c2[a*=v]" -> { tag, id, classes, atributos } */
function analisar(parte) {
  const atributos = [];
  const semAtributos = parte.replace(/\[([^\]]+)\]/g, (_, corpo) => {
    const m = corpo.match(/^([\w-]+)(?:([*^$]?=)"?([^"]*)"?)?$/);
    if (m) atributos.push({ nome: m[1], op: m[2], valor: m[3] });
    return '';
  });

  const idMatch = semAtributos.match(/#([\w-]+)/);
  const classes = [...semAtributos.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
  const tag = semAtributos.match(/^([a-z0-9]+)/i);

  return {
    tag: tag ? tag[1].toLowerCase() : null,
    id: idMatch ? idMatch[1] : null,
    classes,
    atributos,
  };
}

function casaAtributo(no, { nome, op, valor }) {
  const atual = no.getAttribute(nome);
  if (atual === null || atual === undefined) return false;
  if (!op) return true;
  if (op === '*=') return String(atual).includes(valor);
  if (op === '^=') return String(atual).startsWith(valor);
  if (op === '$=') return String(atual).endsWith(valor);
  return String(atual) === valor;
}

function casaParte(no, parte) {
  if (no.nodeType !== ELEMENTO) return false;
  const { tag, id, classes, atributos } = analisar(parte);
  if (tag && no.tagName.toLowerCase() !== tag) return false;
  if (id && no.getAttribute('id') !== id) return false;
  if (classes.some((c) => !no.classList.contains(c))) return false;
  return atributos.every((a) => casaAtributo(no, a));
}

/** O nó casa com a cadeia de descendentes, olhando os ancestrais? */
function casaCadeia(no, partes) {
  if (!casaParte(no, partes[partes.length - 1])) return false;
  let restantes = partes.slice(0, -1);
  let pai = no.parentElement;
  while (restantes.length && pai) {
    if (casaParte(pai, restantes[restantes.length - 1])) restantes = restantes.slice(0, -1);
    pai = pai.parentElement;
  }
  return restantes.length === 0;
}

class No {
  constructor(tagName) {
    this.nodeType = ELEMENTO;
    this.tagName = String(tagName).toUpperCase();
    this.childNodes = [];
    this.parentElement = null;
    this.atributos = new Map();
    this.style = {};
    this._className = '';
  }

  get children() {
    return this.childNodes.filter((f) => f.nodeType === ELEMENTO);
  }

  get className() {
    return this._className;
  }

  set className(v) {
    this._className = String(v || '');
  }

  get classList() {
    const lista = this._className.split(/\s+/).filter(Boolean);
    return {
      contains: (c) => lista.includes(c),
      add: (c) => {
        if (!lista.includes(c)) this._className = [...lista, c].join(' ');
      },
      remove: (c) => {
        this._className = lista.filter((x) => x !== c).join(' ');
      },
    };
  }

  get textContent() {
    return this.childNodes
      .map((f) => (f.nodeType === TEXTO ? f.nodeValue : f.textContent))
      .join('');
  }

  // el() do dom.js escreve aqui; no DOM real isto troca todo o conteudo.
  set textContent(valor) {
    this.childNodes = [];
    this.appendChild(texto(valor));
  }

  getAttribute(nome) {
    if (nome === 'class') return this._className || null;
    return this.atributos.has(nome) ? this.atributos.get(nome) : null;
  }

  setAttribute(nome, valor) {
    if (nome === 'class') this._className = String(valor);
    else this.atributos.set(nome, String(valor));
  }

  appendChild(filho) {
    filho.parentElement = this;
    this.childNodes.push(filho);
    return filho;
  }

  append(...filhos) {
    for (const f of filhos) this.appendChild(f);
  }

  remove() {
    const pai = this.parentElement;
    if (!pai) return;
    pai.childNodes = pai.childNodes.filter((f) => f !== this);
    this.parentElement = null;
  }

  addEventListener() {
    /* os testes não disparam eventos */
  }

  get previousElementSibling() {
    const irmaos = this.parentElement ? this.parentElement.children : [];
    const i = irmaos.indexOf(this);
    return i > 0 ? irmaos[i - 1] : null;
  }

  get nextElementSibling() {
    const irmaos = this.parentElement ? this.parentElement.children : [];
    const i = irmaos.indexOf(this);
    return i >= 0 && i < irmaos.length - 1 ? irmaos[i + 1] : null;
  }

  get isConnected() {
    return Boolean(this.parentElement);
  }

  matches(seletor) {
    return compilar(seletor).some((partes) => casaParte(this, partes[partes.length - 1]));
  }

  closest(seletor) {
    let atual = this;
    while (atual) {
      if (atual.matches && atual.matches(seletor)) return atual;
      atual = atual.parentElement;
    }
    return null;
  }

  /** Todos os descendentes, em ordem de documento. */
  descendentes(saida = []) {
    for (const filho of this.children) {
      saida.push(filho);
      filho.descendentes(saida);
    }
    return saida;
  }

  querySelectorAll(seletor) {
    const cadeias = compilar(seletor);
    return this.descendentes().filter((no) => cadeias.some((partes) => casaCadeia(no, partes)));
  }

  querySelector(seletor) {
    return this.querySelectorAll(seletor)[0] || null;
  }

  insertAdjacentElement(posicao, novo) {
    if (posicao !== 'afterend') throw new Error(`posicao nao suportada: ${posicao}`);
    const pai = this.parentElement;
    if (!pai) return null;
    const i = pai.childNodes.indexOf(this);
    novo.parentElement = pai;
    pai.childNodes.splice(i + 1, 0, novo);
    return novo;
  }
}

/** Cria um elemento. `filhos` aceita nós e strings (viram texto). */
export function elemento(tag, atributos = {}, filhos = []) {
  const no = new No(tag);
  for (const [k, v] of Object.entries(atributos)) no.setAttribute(k, v);
  for (const f of [].concat(filhos)) {
    if (f === null || f === undefined) continue;
    no.appendChild(typeof f === 'string' ? texto(f) : f);
  }
  return no;
}

export function texto(valor) {
  return { nodeType: TEXTO, nodeValue: String(valor), parentElement: null };
}

/**
 * Instala um `document` global apontando para `raiz`.
 *
 * Necessário porque o código de produção chama `document.createElement` e
 * `document.querySelectorAll` sem receber a raiz por parâmetro.
 */
export function instalarDocumento(raiz) {
  const doc = {
    documentElement: raiz,
    body: raiz,
    createElement: (tag) => new No(tag),
    querySelector: (s) => raiz.querySelector(s),
    querySelectorAll: (s) => raiz.querySelectorAll(s),
    getElementById: (id) => raiz.querySelector(`#${id}`),
  };
  globalThis.document = doc;
  return doc;
}
