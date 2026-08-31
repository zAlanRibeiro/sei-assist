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

/**
 * Os unicos tipos de toast que existem.
 *
 * A lista e fechada porque o tipo vira NOME DE CLASSE, e o tipo chega pela
 * ponte de postMessage - onde o remetente nao e necessariamente nosso. Sem a
 * lista, qualquer frame podia aplicar a classe que quisesse ao nosso
 * elemento.
 */
export const TIPOS_DE_TOAST = ['info', 'sucesso', 'alerta', 'erro'];

/** Tipo desconhecido vira `info`, que e o visual neutro. */
export function tipoSeguro(tipo) {
  return TIPOS_DE_TOAST.includes(tipo) ? tipo : 'info';
}

/**
 * Esta mensagem veio de onde deveria?
 *
 * A ponte de toasts recebia `message` de QUALQUER origem. Um frame de
 * terceiro dentro da pagina do SEI podia fazer aparecer, com a cara da
 * extensao, o texto que quisesse - "sua sessao expirou, informe a senha" com
 * a credibilidade emprestada de quem o usuario ja instalou.
 *
 * Pura para poder ser testada: e uma decisao de seguranca, e decisao de
 * seguranca sem teste e so um comentario.
 */
export function aceitaMensagem(ev, origemLocal) {
  if (!ev || !ev.data || ev.data.tipo !== `${NS}:toast`) return false;
  return ev.origin === origemLocal;
}

/** Mensagem rapida no canto da tela. */
export function toast(texto, { tipo = 'info', duracao = 3500 } = {}) {
  // Toasts sempre no frame do topo, senao ficam presos dentro do iframe.
  if (window.top !== window.self) {
    try {
      // Ler a origem do topo lanca quando ele e de outra origem - e e por isso
      // que a leitura vem ANTES do envio: com targetOrigin '*', o texto do
      // toast (que carrega numero de processo) era entregue a quem quer que
      // estivesse embutindo o SEI. Nao dando para entregar ao SEI, o toast
      // fica aqui dentro mesmo; preso no iframe e melhor que vazado.
      const destino = window.top.location.origin;
      if (destino === location.origin) {
        window.top.postMessage(
          { tipo: `${NS}:toast`, texto, tipoToast: tipoSeguro(tipo), duracao },
          destino,
        );
        return;
      }
    } catch {
      /* topo de outra origem: cai no fluxo local abaixo */
    }
  }

  const node = el('div', {
    class: `${NS}-toast ${NS}-toast--${tipoSeguro(tipo)}`,
    text: texto,
  });
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
    if (!aceitaMensagem(ev, location.origin)) return;
    toast(String(ev.data.texto ?? ''), {
      tipo: tipoSeguro(ev.data.tipoToast),
      duracao: Number(ev.data.duracao) || undefined,
    });
  });
}

/**
 * Dialogo de confirmacao. Resolve para true/false.
 *
 * `lembrar` acrescenta uma caixa "nao perguntar de novo". Quando ela existe,
 * `aoLembrar(marcada)` e chamado NA CONFIRMACAO, nunca no cancelamento:
 * marcar a caixa e desistir nao pode desligar um aviso que a pessoa acabou de
 * decidir nao seguir.
 *
 * O retorno continua sendo booleano de proposito - havia chamadores antes
 * desta opcao, e trocar a forma do retorno os quebraria em silencio.
 */
export function confirmar(opcoes) {
  const {
    titulo,
    texto,
    confirmarTexto = 'Confirmar',
    cancelarTexto = 'Cancelar',
    lembrar = null,
    aoLembrar = null,
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

    const marcador = lembrar
      ? el('input', { type: 'checkbox', id: `${NS}-dialogo-lembrar`, class: `${NS}-dialogo__caixa` })
      : null;

    const caixa = el('div', { class: `${NS}-dialogo`, role: 'dialog', 'aria-modal': 'true' }, [
      el('h2', { class: `${NS}-dialogo__titulo`, text: titulo }),
      el('p', { class: `${NS}-dialogo__texto`, text: texto }),
      marcador
        ? el('label', { class: `${NS}-dialogo__lembrar`, for: `${NS}-dialogo-lembrar` }, [
            marcador,
            el('span', { text: lembrar }),
          ])
        : null,
      el('div', { class: `${NS}-dialogo__acoes` }, [
        el('button', {
          class: `${NS}-btn ${NS}-btn--secundario`,
          text: cancelarTexto,
          onclick: () => fechar(false),
        }),
        el('button', {
          class: `${NS}-btn ${NS}-btn--primario`,
          text: confirmarTexto,
          onclick: () => {
            if (marcador && aoLembrar) aoLembrar(Boolean(marcador.checked));
            fechar(true);
          },
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
