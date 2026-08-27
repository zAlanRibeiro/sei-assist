/**
 * Feature: marca de extensao ativa.
 *
 * Escreve "Assist" ao lado do logo do SEI, para dar num relance a resposta de
 * "a extensao esta ligada nesta aba?". Sem isso a unica forma de saber e abrir
 * o popup ou reparar que algo deixou de aparecer.
 *
 * So escreve na barra do topo. Nao le processo, nao guarda nada, nao clica em
 * nada.
 */
import { el } from '../../core/dom.js';
import { log } from '../../core/log.js';
import { acharAncoraDaMarca } from './seletores.js';

const ID = 'seix-marca';

/**
 * Estilo inline, pelo mesmo motivo do link do historico: o content.css entra
 * em `document_start`, ou seja ANTES das folhas do SEI, e perde qualquer
 * empate de especificidade com elas.
 *
 * A cor e a unica excecao: branco fixo, vindo de --seix-marca-cor. A marca
 * diz "a extensao esta ligada" e nao faz parte do sistema, entao nao
 * acompanha o tema do orgao - o mesmo criterio das cores de evento do
 * historico. O resto (fonte, tamanho) continua herdado da barra.
 */
const ESTILO = {
  marginLeft: '10px',
  fontWeight: '600',
  color: 'var(--seix-marca-cor, #ffffff)',
  cursor: 'default',
};

export default {
  id: 'marca-ativa',
  nome: 'Marca de extensão ativa',
  descricao:
    'Escreve "Assist" ao lado do logo do SEI, para você saber num relance que a extensão está ligada nesta aba. Não lê nem guarda nada.',
  padraoAtiva: true,

  rotulosOpcoes: {
    texto: 'Texto da marca',
  },

  opcoesPadrao: {
    texto: 'Assist',
  },

  telas: ['*'],
  // Todos os frames de proposito. Restringir a 'topo' parecia obvio - a barra
  // do sistema mora la - mas ha versoes do SEI em que ela vive num frame
  // proprio, e ai a feature nunca rodava onde precisava. Rodar em todos e
  // barato: sem barra, acharAncoraDaMarca() devolve null e nada acontece.
  frames: ['*'],

  setup(ctx) {
    // Recarregar a extensao com a aba aberta deixaria duas marcas.
    const antiga = document.getElementById(ID);
    if (antiga) antiga.remove();

    const alvo = acharAncoraDaMarca();
    if (!alvo) {
      log.debug('barra do topo nao reconhecida; a marca nao foi escrita');
      return undefined;
    }

    const marca = el('span', {
      id: ID,
      style: ESTILO,
      text: ctx.opcoes.texto || 'Assist',
      title: 'SEI Assist está ativo nesta aba',
    });

    // Fonte, tamanho e cor saem da classe do vizinho; o estilo inline acima
    // cobre so o que ele nao daria (espacamento e peso), e vence a classe
    // nesses pontos por ser inline.
    if (alvo.modelo && alvo.modelo.className) marca.className = alvo.modelo.className;

    if (alvo.modo === 'dentro') alvo.ancora.appendChild(marca);
    else alvo.ancora.insertAdjacentElement('afterend', marca);

    log.debug(`marca escrita na barra do topo (${alvo.modo})`);
    return () => marca.remove();
  },
};
