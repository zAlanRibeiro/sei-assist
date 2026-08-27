/**
 * Feature: copiar o numero do processo.
 *
 * Poe um "C" ao lado de cada numero de processo que aparecer na tela. Clicou,
 * copiou - sem selecionar com o mouse, sem pegar espaco a mais, sem perder o
 * numero na quebra de linha.
 *
 * Nao depende de tela: o alvo e achado pelo FORMATO do numero, nao por
 * seletor. Isso faz o botao aparecer na arvore do processo, na lista do
 * Controle de Processos, no cabecalho e em qualquer lugar novo que o SEI
 * invente, sem uma linha a mais aqui.
 *
 * So le e copia. Nao clica em nada do SEI, nao navega, nao altera processo.
 */
import { el, observar, qsa, textoProprio } from '../../core/dom.js';
import { ehNupExato } from '../../core/nup.js';
import { toast } from '../../core/ui.js';
import { log } from '../../core/log.js';

const CLASSE = 'seix-copiar-nup';

/**
 * Tags que podem conter um numero de processo.
 *
 * Lista fechada de proposito: varrer '*' percorreria a pagina inteira a cada
 * mudanca do DOM, e o SEI mexe no DOM o tempo todo.
 */
const TAGS = 'a, span, td, div, b, strong, h1, h2, p, li';

/**
 * Estilo inline, pelo mesmo motivo do resto: o content.css entra em
 * `document_start`, antes das folhas do SEI, e perde qualquer empate de
 * especificidade dentro do HTML deles.
 */
const ESTILO = {
  display: 'inline-block',
  marginLeft: '5px',
  padding: '0 4px',
  border: '1px solid var(--seix-cor-borda, #d0d5dd)',
  borderRadius: '3px',
  background: 'var(--seix-cor-superficie, #f2f4f7)',
  color: 'var(--seix-cor-texto-suave, #475467)',
  font: 'inherit',
  fontSize: '10px',
  fontWeight: '700',
  lineHeight: '14px',
  cursor: 'pointer',
  verticalAlign: 'middle',
};

async function copiar(nup, botao) {
  try {
    await navigator.clipboard.writeText(nup);
  } catch {
    // Aba sem foco ou permissao negada. Sem alarme: o numero continua na tela.
    toast('Não consegui copiar. Selecione o número na mão.', { tipo: 'alerta' });
    return;
  }

  toast(`Copiado: ${nup}`, { tipo: 'sucesso', duracao: 1800 });

  // Confirmacao no proprio botao, para quem esta dentro de um iframe e pode
  // nao ver a tarja do topo.
  botao.textContent = '✓';
  setTimeout(() => {
    if (botao.isConnected) botao.textContent = 'C';
  }, 1200);
}

function botaoDeCopia(nup) {
  return el('button', {
    class: CLASSE,
    type: 'button',
    style: ESTILO,
    text: 'C',
    title: `Copiar ${nup}`,
    'aria-label': `Copiar o número do processo ${nup}`,
    onclick: (ev) => {
      // O numero costuma ser um link para o processo. Sem isto, copiar
      // navegaria junto.
      ev.preventDefault();
      ev.stopPropagation();
      copiar(nup, ev.currentTarget);
    },
  });
}

/**
 * Elementos cujo texto proprio E um numero de processo, e nada mais.
 *
 * "E", nao "contem": o botao ao lado de uma frase que menciona o processo
 * ficaria solto no meio do texto. Exportada para teste.
 */
export function alvos(raiz = document) {
  const achados = [];
  for (const no of qsa(TAGS, raiz)) {
    const nup = ehNupExato(textoProprio(no));
    if (nup) achados.push({ no, nup });
  }
  return achados;
}

/**
 * Ja existe um botao logo depois deste elemento?
 *
 * Precisa ser verificado antes de inserir, e nao so no fim: esta funcao roda a
 * cada mudanca do DOM, e um MutationObserver que escreve sem checar entra em
 * laco - a escrita dispara o observer, que escreve de novo.
 */
export function jaTemBotao(no) {
  const proximo = no && no.nextElementSibling;
  return Boolean(proximo && proximo.classList && proximo.classList.contains(CLASSE));
}

export default {
  id: 'copiar-numero-processo',
  nome: 'Copiar número do processo',
  descricao:
    'Põe um "C" ao lado de cada número de processo na tela. Clicou, copiou. Funciona na árvore, na lista e onde mais o número aparecer.',
  padraoAtiva: true,

  telas: ['*'],
  // Em todos os frames: o numero aparece tanto na arvore quanto na lista, e
  // cada um e um documento diferente.
  frames: ['*'],

  setup() {
    let vivo = true;

    const passar = () => {
      if (!vivo) return 0;
      let postos = 0;
      for (const { no, nup } of alvos()) {
        if (jaTemBotao(no)) continue;
        try {
          no.insertAdjacentElement('afterend', botaoDeCopia(nup));
          postos++;
        } catch {
          // Elemento sem pai, ou que o SEI trocou no meio do caminho.
        }
      }
      return postos;
    };

    const postos = passar();
    if (postos) log.debug(`copiar numero: ${postos} botao(oes)`);

    // O SEI monta a arvore e a lista por JavaScript: rodar so no carregamento
    // pegaria a tela ainda vazia.
    const parar = observar(document.body, passar, { debounce: 400 });

    return () => {
      vivo = false;
      parar && parar();
      for (const botao of qsa(`.${CLASSE}`)) botao.remove();
    };
  },
};
