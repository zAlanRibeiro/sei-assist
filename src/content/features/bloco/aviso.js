/**
 * aviso.js - os avisos visuais de bloco novo.
 *
 * Tres formas, decididas com o usuario:
 *   1. contador no icone da extensao (quem desenha e o service worker);
 *   2. tarja dentro da pagina do SEI;
 *   3. marcador no menu "Blocos" e, ao expandir, em "Assinatura".
 *
 * O marcador de menu e o mais util no dia a dia: fica onde a pessoa ja olha
 * para chegar no bloco.
 */
import { el, qsa, qsAny } from '../../core/dom.js';
import { toast } from '../../core/ui.js';
import { log } from '../../core/log.js';
import { comContexto } from '../../core/runtime.js';
import { MENU } from './seletores.js';

const CLASSE = 'seix-bloco-selo';

/**
 * Estilo inline pelo mesmo motivo de sempre: o content.css entra em
 * `document_start`, antes das folhas do SEI, e perde o empate de
 * especificidade dentro do HTML deles.
 *
 * Cor cheia com texto branco, fixa: um contador precisa ser legivel em
 * qualquer tema, entao ele nao acompanha o do orgao - mesmo criterio das
 * etiquetas de evento do historico.
 */
const ESTILO = {
  display: 'inline-block',
  minWidth: '18px',
  marginLeft: '8px',
  padding: '0 5px',
  borderRadius: '9px',
  background: 'var(--seix-cor-novidade, #c62828)',
  color: 'var(--seix-cor-novidade-texto, #ffffff)',
  fontSize: '11px',
  fontWeight: '700',
  lineHeight: '18px',
  textAlign: 'center',
  verticalAlign: 'middle',
};

/** Tira todos os selos ja pendurados, em qualquer lugar da pagina. */
export function limparSelos(raiz = document) {
  for (const selo of qsa(`.${CLASSE}`, raiz)) selo.remove();
}

function selo(quantidade, titulo) {
  return el('span', {
    class: CLASSE,
    style: ESTILO,
    text: String(quantidade),
    title: titulo,
  });
}

/**
 * O que ja esta na tela precisa ser redesenhado?
 *
 * Separada para poder ser testada, e porque a resposta importa muito: quem
 * chama marcarMenu() e um MutationObserver sobre o document.body. Um
 * observer que reescreve o que observa entra em laco infinito - a escrita
 * dispara o observer, que escreve de novo, e a aba trava.
 *
 * Por isso a funcao so mexe no DOM quando o desenho realmente mudou.
 */
export function precisaRedesenhar(textosAtuais, quantidade) {
  const alvo = String(quantidade || 0);
  if (!quantidade) return textosAtuais.length > 0; // so para apagar
  if (!textosAtuais.length) return true;
  return !textosAtuais.every((t) => t === alvo);
}

/**
 * Pendura o contador no menu lateral.
 *
 * Ancora no link "Assinatura", que e achado pelo `acao=` do href - o texto do
 * item muda de idioma, a acao nao. De la sobe ate o <ul> do submenu; o irmao
 * anterior dele e o "Blocos" que fica visivel com o menu recolhido.
 *
 * E por isso que o marcador aparece nos dois lugares que o usuario pediu:
 * quando o submenu esta fechado ve-se o de "Blocos"; ao expandir, o de
 * "Assinatura" aparece junto.
 */
export function marcarMenu(quantidade, raiz = document) {
  const existentes = qsa(`.${CLASSE}`, raiz);
  if (!precisaRedesenhar(existentes.map((s) => s.textContent), quantidade)) {
    return existentes.length;
  }

  limparSelos(raiz);
  if (!quantidade) return 0;

  const titulo =
    quantidade === 1
      ? '1 novidade no bloco de assinatura'
      : `${quantidade} novidades no bloco de assinatura`;

  const assinatura = qsAny(MENU.assinatura, raiz);
  if (!assinatura) {
    log.debug('item "Assinatura" nao encontrado no menu; sem marcador');
    return 0;
  }

  let pendurados = 0;
  assinatura.appendChild(selo(quantidade, titulo));
  pendurados++;

  // O pai "Blocos": o <ul> que contem "Assinatura", e o link logo antes dele.
  const submenu = assinatura.closest(MENU.submenu);
  const pai = submenu && submenu.previousElementSibling;
  if (pai && pai.tagName === 'A') {
    pai.appendChild(selo(quantidade, titulo));
    pendurados++;
  }
  return pendurados;
}

/** Manda o service worker desenhar (ou apagar) o contador no icone. */
export async function contadorNoIcone(quantidade) {
  return comContexto(
    () => chrome.runtime.sendMessage({ tipo: 'bloco-contador', quantidade }),
    null,
    'atualizar o contador do icone',
  );
}

/** A tarja dentro da pagina. So aparece quando ha novidade de verdade. */
export function tarja({ novos, mudados }) {
  const partes = [];
  if (novos.length) {
    partes.push(
      novos.length === 1
        ? `1 bloco novo (${novos[0].numero})`
        : `${novos.length} blocos novos`,
    );
  }
  if (mudados.length) {
    partes.push(
      mudados.length === 1
        ? `bloco ${mudados[0].numero} agora está "${mudados[0].estado}"`
        : `${mudados.length} blocos mudaram de estado`,
    );
  }
  if (!partes.length) return null;

  const texto = `Assinatura: ${partes.join(' e ')}.`;
  toast(texto, { tipo: 'alerta', duracao: 8000 });
  return texto;
}
