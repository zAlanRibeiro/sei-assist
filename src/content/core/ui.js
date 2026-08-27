/**
 * ui.js - componentes visuais da extensao.
 *
 * Tudo que injetamos usa o prefixo `seix-` para nunca colidir com o CSS do
 * SEI (que usa `infra*`). Os estilos ficam em src/styles/content.css.
 */
import { el, qs } from './dom.js';
import { NS } from '../../shared/constantes.js';

/** Container onde a extensao pendura overlays, criado sob demanda. */
function raiz() {
  let r = qs(`#${NS}-root`);
  if (!r) {
    r = el('div', { id: `${NS}-root` });
    document.body.appendChild(r);
  }
  return r;
}

/** Mensagem rapida no canto da tela. */
export function toast(texto, { tipo = 'info', duracao = 3500 } = {}) {
  // Toasts sempre no frame do topo, senao ficam presos dentro do iframe.
  if (window.top !== window.self) {
    try {
      window.top.postMessage({ tipo: `${NS}:toast`, texto, tipoToast: tipo, duracao }, '*');
      return;
    } catch {
      /* cross-origin: cai no fluxo local abaixo */
    }
  }

  const node = el('div', { class: `${NS}-toast ${NS}-toast--${tipo}`, text: texto });
  raiz().appendChild(node);
  requestAnimationFrame(() => node.classList.add(`${NS}-toast--visivel`));
  setTimeout(() => {
    node.classList.remove(`${NS}-toast--visivel`);
    setTimeout(() => node.remove(), 300);
  }, duracao);
}

/**
 * Liga a ponte que recebe os toasts enviados pelos iframes.
 * Chamada uma vez pelo main.js - de proposito nao roda no import, para que
 * o popup e a pagina de opcoes possam importar este modulo sem efeito colateral.
 */
export function ativarPonteDeToasts() {
  if (window.top !== window.self) return;
  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.tipo === `${NS}:toast`) {
      toast(ev.data.texto, { tipo: ev.data.tipoToast, duracao: ev.data.duracao });
    }
  });
}

/** Dialogo de confirmacao. Resolve para true/false. */
export function confirmar(opcoes) {
  const {
    titulo,
    texto,
    confirmarTexto = 'Confirmar',
    cancelarTexto = 'Cancelar',
  } = opcoes;

  return new Promise((resolve) => {
    const fechar = (valor) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      resolve(valor);
    };
    const onKey = (ev) => {
      if (ev.key === 'Escape') fechar(false);
    };

    const caixa = el('div', { class: `${NS}-dialogo`, role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { class: `${NS}-dialogo__titulo`, text: titulo }),
      el('p', { class: `${NS}-dialogo__texto`, text: texto }),
      el('div', { class: `${NS}-dialogo__acoes` }, [
        el('button', {
          class: `${NS}-btn ${NS}-btn--secundario`,
          text: cancelarTexto,
          onclick: () => fechar(false),
        }),
        el('button', {
          class: `${NS}-btn ${NS}-btn--primario`,
          text: confirmarTexto,
          onclick: () => fechar(true),
        }),
      ]),
    ]);

    const overlay = el(
      'div',
      { class: `${NS}-overlay`, onclick: (ev) => ev.target === overlay && fechar(false) },
      [caixa],
    );

    raiz().appendChild(overlay);
    document.addEventListener('keydown', onKey);
    caixa.querySelector(`.${NS}-btn--primario`).focus();
  });
}

/**
 * Adiciona um botao na barra de comandos do SEI, imitando o visual nativo.
 * Retorna o elemento criado (ou null se nao achou a barra).
 */
export function botaoNaBarra({ texto, titulo, onClick, id }) {
  const barra = qs(
    '#divComandos, #divInfraBarraComandosSuperior, .infraBarraComandos, #divArvoreAcoes',
  );
  if (!barra) return null;
  if (id) {
    const existente = qs(`#${CSS.escape(id)}`);
    if (existente) return existente;
  }

  const botao = el('button', {
    id,
    type: 'button',
    class: `infraButton ${NS}-botao-barra`,
    title: titulo || texto,
    text: texto,
    onclick: onClick,
  });
  barra.appendChild(botao);
  return botao;
}

/** Painel lateral simples, util para listas/filtros. */
export function painel({ titulo, conteudo, lado = 'direita' }) {
  const corpo = el('div', { class: `${NS}-painel__corpo` });
  if (conteudo) corpo.append(conteudo);

  const node = el('aside', { class: `${NS}-painel ${NS}-painel--${lado}` }, [
    el('header', { class: `${NS}-painel__cabecalho` }, [
      el('span', { text: titulo }),
      el('button', {
        class: `${NS}-painel__fechar`,
        text: 'x',
        title: 'Fechar',
        onclick: () => node.remove(),
      }),
    ]),
    corpo,
  ]);

  raiz().appendChild(node);
  return { node, corpo, destruir: () => node.remove() };
}
