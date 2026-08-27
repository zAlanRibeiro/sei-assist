/**
 * esqueleto.js - serializa um pedaco do DOM em HTML "esqueleto".
 *
 * Objetivo: gerar um recorte da estrutura da tela que possa ser colado em
 * qualquer lugar (chat, issue, documentacao) SEM vazar dado de processo.
 * Conteudo textual e substituido por marcadores; so sobrevive texto curto de
 * rotulo, botao, cabecalho de tabela e afins - que e justamente o que serve
 * para escrever seletores robustos.
 */

const IGNORAR = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SVG', 'CANVAS']);

/** Tags cujo texto e estrutural (rotulo), nao conteudo do processo. */
const TEXTO_ESTRUTURAL = new Set([
  'LABEL', 'BUTTON', 'A', 'OPTION', 'LEGEND', 'CAPTION', 'TH', 'SUMMARY',
  'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'STRONG', 'B', 'SPAN', 'DIV', 'TD', 'LI', 'P',
]);

const ATRIBUTOS_UTEIS = [
  'id', 'name', 'class', 'type', 'role', 'title', 'alt', 'placeholder',
  'accesskey', 'colspan', 'rowspan', 'for', 'target', 'disabled', 'checked', 'selected',
];

const MAX_TEXTO = 80;
const MAX_NOS = 4000;

/** Esconde numeros longos (processo, CPF, protocolo) e e-mails. */
function redigir(texto) {
  return texto
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]')
    .replace(/\d[\d.\-/]{4,}\d/g, '[numero]');
}

function atributos(elemento) {
  const partes = [];

  for (const nome of ATRIBUTOS_UTEIS) {
    if (!elemento.hasAttribute(nome)) continue;
    let valor = elemento.getAttribute(nome);
    if (nome === 'class') valor = valor.split(/\s+/).slice(0, 6).join(' ');
    partes.push(`${nome}="${redigir(valor).slice(0, 120)}"`);
  }

  // data-* e aria-* costumam ser os seletores mais estaveis: mantemos todos.
  for (const attr of elemento.attributes) {
    if (attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
      partes.push(`${attr.name}="${redigir(attr.value).slice(0, 120)}"`);
    }
  }

  // href/src: guardamos so a acao do controlador ou o nome do arquivo.
  for (const nome of ['href', 'src']) {
    if (!elemento.hasAttribute(nome)) continue;
    const bruto = elemento.getAttribute(nome);
    const acao = bruto.match(/acao=([a-z_]+)/i);
    partes.push(`${nome}="${acao ? `...acao=${acao[1]}...` : bruto.split('/').pop().slice(0, 60)}"`);
  }

  // value: so faz sentido preservar em botao (e o rotulo visivel dele).
  if (elemento.tagName === 'INPUT') {
    const tipo = (elemento.getAttribute('type') || 'text').toLowerCase();
    const valor = elemento.getAttribute('value');
    if (valor && ['button', 'submit', 'reset'].includes(tipo)) {
      partes.push(`value="${redigir(valor).slice(0, 80)}"`);
    } else if (valor) {
      partes.push('value="[preenchido]"');
    }
  }

  // onclick: so o nome da funcao, que ajuda a entender o fluxo do SEI.
  const onclick = elemento.getAttribute('onclick');
  if (onclick) {
    const fn = onclick.match(/([A-Za-z_$][\w$]*)\s*\(/);
    partes.push(`onclick="${fn ? `${fn[1]}(...)` : '...'}"`);
  }

  return partes.length ? ` ${partes.join(' ')}` : '';
}

function textoDoNo(no, tagPai) {
  const bruto = (no.nodeValue || '').replace(/\s+/g, ' ').trim();
  if (!bruto) return '';
  if (!TEXTO_ESTRUTURAL.has(tagPai)) return '[conteudo]';
  if (bruto.length > MAX_TEXTO) return '[conteudo longo]';
  return redigir(bruto);
}

/**
 * @param {Element} raiz
 * @param {{profundidadeMax?: number}} [opcoes]
 * @returns {string} HTML esqueleto, indentado
 */
export function esqueleto(raiz, { profundidadeMax = 25 } = {}) {
  const linhas = [];
  let nos = 0;
  let truncou = false;

  const visitar = (elemento, nivel) => {
    if (nos >= MAX_NOS) {
      truncou = true;
      return;
    }
    if (IGNORAR.has(elemento.tagName)) return;
    nos += 1;

    const ident = '  '.repeat(nivel);
    const tag = elemento.tagName.toLowerCase();
    const abre = `<${tag}${atributos(elemento)}>`;

    if (nivel >= profundidadeMax) {
      linhas.push(`${ident}${abre}...</${tag}>`);
      return;
    }

    const filhos = [];
    for (const filho of elemento.childNodes) {
      if (filho.nodeType === Node.TEXT_NODE) {
        const t = textoDoNo(filho, elemento.tagName);
        if (t) filhos.push({ tipo: 'texto', valor: t });
      } else if (filho.nodeType === Node.ELEMENT_NODE) {
        filhos.push({ tipo: 'elemento', valor: filho });
      }
    }

    if (filhos.length === 0) {
      linhas.push(`${ident}${abre}</${tag}>`);
      return;
    }
    if (filhos.length === 1 && filhos[0].tipo === 'texto') {
      linhas.push(`${ident}${abre}${filhos[0].valor}</${tag}>`);
      return;
    }

    linhas.push(`${ident}${abre}`);
    for (const filho of filhos) {
      if (filho.tipo === 'texto') linhas.push(`${ident}  ${filho.valor}`);
      else visitar(filho.valor, nivel + 1);
    }
    linhas.push(`${ident}</${tag}>`);
  };

  visitar(raiz, 0);
  if (truncou) linhas.push(`<!-- truncado em ${MAX_NOS} elementos -->`);
  return linhas.join('\n');
}

/** Cabecalho com o contexto da captura. */
export function cabecalho(ctx) {
  return [
    '<!--',
    `  Tela .......: ${ctx.screen}`,
    `  acao .......: ${ctx.acao || '(sem acao na URL)'}`,
    `  Frame ......: ${ctx.frame.role}${ctx.frame.nome ? ` (name="${ctx.frame.nome}")` : ''}`,
    `  Versao SEI .: ${ctx.versao || 'nao identificada'}`,
    `  Capturado em: ${new Date().toISOString()}`,
    '  Conteudo textual foi substituido por marcadores.',
    '-->',
    '',
  ].join('\n');
}
