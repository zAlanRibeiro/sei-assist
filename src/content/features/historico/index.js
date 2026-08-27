/**
 * Feature: Historico de assinaturas.
 *
 * Monta, no Controle de Processos, um painel com os documentos assinados -
 * inclusive de processos que ja sairam da sua lista (concluidos ou tramitados),
 * desde que a extensao os tenha visto em algum momento.
 *
 * Esta feature roda em TRES contextos diferentes, por isso declara
 * telas: ['*'] e faz o despacho internamente, em vez de virar tres features
 * separadas na tela de opcoes:
 *
 *   controle-processos / topo    -> botao + atalho que abrem o painel
 *   assinar-documento / qualquer -> captura a assinatura no momento em que ocorre
 *   processo / arvore            -> varre a arvore e recolhe o que ja esta assinado
 *
 * Nada aqui assina, envia ou conclui coisa alguma: a feature so observa.
 */
import { registrarAtalho } from '../../core/hotkeys.js';
import { botaoNaBarra } from '../../core/ui.js';
import { el, observar } from '../../core/dom.js';
import { log } from '../../core/log.js';
import {
  capturarNaAssinatura,
  capturarNaCriacaoDeDocumento,
  capturarNaCriacaoDeProcesso,
  capturarNoEnvio,
  resolverCriacaoDocumentoPendente,
  resolverCriacaoPendente,
  varrer,
} from './captura.js';
import { acharLinhaDeLinks } from './seletores.js';
import { identidadesDoDono } from './sessao.js';
import { descarregarAtos, purgarDeOutros } from './armazenamento.js';
import { montarPainel } from './painel.js';

const ID_BOTAO = 'seix-botao-historico';

/** Abre o painel, ou fecha se ja estiver aberto. */
function alternarPainel(ctx, estado) {
  if (estado.painel) {
    estado.painel.destruir();
    estado.painel = null;
    return;
  }
  estado.painel = montarPainel(ctx);
}

/** Botao na barra de comandos; se nao houver barra, um botao flutuante. */
/**
 * Estilo do link, aplicado inline de propósito.
 *
 * Só espaçamento: a aparência sai inteira da classe copiada de um link
 * vizinho, para o Histórico ser indistinguível dos outros itens da linha.
 * Nenhuma cor é escrita aqui - quem pinta é o SEI, então ele acompanha o
 * tema do órgão sozinho.
 *
 * Inline, e não no content.css, porque aquele arquivo entra em
 * `document_start` - ANTES das folhas do SEI. Em empate de especificidade
 * vence quem vem depois, e foi isso que comeu a margem na primeira
 * tentativa, deixando o botão colado em "Visualização resumida".
 */
const ESTILO_LINK = {
  marginLeft: '20px',
  // O href é "#" só para o link ter comportamento de link; sem isto o
  // navegador sublinha e ele destoa dos vizinhos.
  textDecoration: 'none',
  cursor: 'pointer',
};

/**
 * Encaixa o Histórico na linha de links da própria tela.
 *
 * É o lugar onde ele passa despercebido: vira mais um link ao lado de "Ver
 * por tipo". Em vez de trazer estilo nosso, copia a classe de um link
 * vizinho - assim acompanha o tema do órgão sem uma linha de CSS.
 */
function linkNaLinhaDeLinks(ctx, aoClicar) {
  const existente = document.getElementById(ID_BOTAO);
  if (existente) return existente;

  const alvo = acharLinhaDeLinks();
  if (!alvo) return null;

  const link = el(
    'a',
    {
      id: ID_BOTAO,
      href: '#',
      class: 'seix-hist__link-tela',
      style: ESTILO_LINK,
      title: `Histórico de assinaturas e envios (${ctx.opcoes.atalho})`,
      text: 'Histórico',
      onclick: (ev) => {
        ev.preventDefault();
        aoClicar();
      },
    },
  );

  // A classe do vizinho vem primeiro; a nossa fica por último, só para o
  // espaçamento. Se o link modelo não tiver classe, o CSS do painel cobre.
  if (alvo.modelo.className) {
    link.className = `${alvo.modelo.className} seix-hist__link-tela`;
  }

  alvo.linha.appendChild(link);
  return link;
}

function criarGatilho(ctx, estado) {
  const aoClicar = () => alternarPainel(ctx, estado);

  // 1. Linha de links da tela - onde o botão fica realmente integrado.
  const naLinha = linkNaLinhaDeLinks(ctx, aoClicar);
  if (naLinha) {
    log.debug('histórico encaixado na linha de links da tela');
    return () => naLinha.remove();
  }

  // 2. Barra de comandos, nas telas que têm uma.
  const naBarra = botaoNaBarra({
    id: ID_BOTAO,
    texto: 'Histórico',
    titulo: `Histórico de assinaturas e envios (${ctx.opcoes.atalho})`,
    onClick: aoClicar,
  });
  if (naBarra) return () => naBarra.remove();

  // 3. Último recurso: flutuante. Fica no canto e briga com a barra de
  //    rolagem, então só entra quando as duas âncoras acima falham.
  log.debug('linha de links e barra de comandos ausentes; usando botão flutuante');
  const flutuante = el('button', {
    id: ID_BOTAO,
    class: 'seix-btn seix-btn--primario seix-hist__flutuante',
    text: 'Histórico',
    title: `Histórico de assinaturas e envios (${ctx.opcoes.atalho})`,
    onclick: aoClicar,
  });
  document.body.appendChild(flutuante);
  return () => flutuante.remove();
}

export default {
  // O id e a chave no storage: mudar aqui faria o usuario perder as
  // preferencias ja salvas. Por isso ele fica como nasceu, mesmo agora que a
  // feature cobre tambem os envios.
  id: 'historico-assinaturas',
  nome: 'Histórico de assinaturas e envios',
  descricao:
    'Guarda o que você assinou e os processos que você enviou, num painel no Controle de Processos, com busca, filtro por período e exportação para CSV. Os dados ficam só neste navegador.',
  padraoAtiva: true,

  /** Rotulos amigaveis para a tela de opcoes (a chave crua e feia). */
  rotulosOpcoes: {
    atalho: 'Atalho do painel',
    nomeUsuario: 'Seu nome no SEI (só se a detecção falhar)',
    periodoPadrao: 'Período inicial do filtro (7, 30 ou tudo)',
    varrerAoAbrirProcesso: 'Coletar ao abrir um processo',
    loginUsuario: 'Seu login no SEI (só se a detecção falhar)',
  },

  opcoesPadrao: {
    atalho: 'Ctrl+Shift+H',
    // Nome e login sao lidos da barra do topo do SEI. Estas opcoes existem
    // so como saida de emergencia, se a deteccao falhar.
    nomeUsuario: '',
    loginUsuario: '',
    periodoPadrao: '30',
    varrerAoAbrirProcesso: true,
  },

  telas: ['*'],
  frames: ['*'],

  setup(ctx) {
    const estado = { painel: null };
    const limpezas = [];

    // --- captura no momento do ato ------------------------------------------
    if (ctx.screen === 'assinar-documento') {
      limpezas.push(capturarNaAssinatura(ctx));
    }
    if (ctx.screen === 'enviar-processo') {
      limpezas.push(capturarNoEnvio(ctx));
    }
    if (ctx.screen === 'novo-processo') {
      limpezas.push(capturarNaCriacaoDeProcesso(ctx));
    }
    if (ctx.screen === 'gerar-documento') {
      limpezas.push(capturarNaCriacaoDeDocumento(ctx));
    }

    // --- coleta de assinaturas ----------------------------------------------
    // varrer() decide sozinha o que fazer neste frame: le o bloco de
    // assinatura do corpo do documento, a arvore, ou nada. Sai cedo e barato
    // quando nao ha o que colher, entao pode rodar em qualquer frame.
    const identidades = identidadesDoDono(ctx.opcoes);

    // Atos capturados no clique ficam numa fila sincrona ate a pagina seguinte
    // - ver enfileirarAto(). Aqui eles viram registro. Roda mesmo com a coleta
    // ambiente desligada: sao atos SEUS, nao leitura do que o SEI mostra.
    //
    // Roda em QUALQUER frame, e nao so no de cima.
    //
    // A restricao ao frame principal parecia prudente e custava atos: a
    // janela de assinatura e um iframe (name="modal-frame"), e depois de
    // assinar o SEI atualiza os frames internos SEM recarregar o documento de
    // cima. O ato ficava esperando na fila enquanto a varredura do corpo do
    // documento - que nao sabe por onde a assinatura passou - criava o
    // registro primeiro. Dai o "origem desconhecida" logo apos assinar.
    //
    // Dois frames descarregando ao mesmo tempo nao duplicam: descarregarAtos()
    // esvazia a fila ANTES de gravar, entao o segundo encontra fila vazia. E
    // registrar() e idempotente por id de todo jeito.
    descarregarAtos().catch((err) => log.error('falha ao gravar atos pendentes:', err));
    /**
     * Uma passada: fecha a criacao pendente e, se a coleta ambiente estiver
     * ligada, varre a tela.
     *
     * Precisa repetir a cada mudanca do DOM, nao so no carregamento. A arvore
     * do SEI e montada por JavaScript: no instante em que o content script
     * entra, o numero do processo recem-criado ainda pode nao estar na tela.
     * Rodando so uma vez, a criacao se perdia exatamente nesse intervalo.
     */
    const passar = () => {
      resolverCriacaoPendente().catch((err) => log.error('falha ao fechar a criacao:', err));
      resolverCriacaoDocumentoPendente().catch((err) =>
        log.error('falha ao fechar a criacao de documento:', err),
      );
      if (ctx.opcoes.varrerAoAbrirProcesso) varrer(identidades);
    };

    passar();

    // O observador vale mesmo com a coleta desligada, porque fechar a criacao
    // e um ato seu - nao e leitura do que o SEI mostra.
    limpezas.push(observar(document.body, passar, { debounce: 500 }));

    // Limpa o que foi coletado antes de a extensao passar a filtrar na
    // captura. Roda uma vez por pagina, so no frame de cima.
    if (ctx.frame.principal && identidades.length) {
      purgarDeOutros(identidades).catch((err) => log.error('falha ao purgar:', err));
    }

    // --- painel no Controle de Processos ------------------------------------
    if (ctx.screen === 'controle-processos' && ctx.frame.principal) {
      limpezas.push(criarGatilho(ctx, estado));
      limpezas.push(
        registrarAtalho(ctx.opcoes.atalho, () => alternarPainel(ctx, estado), {
          descricao: 'Abrir o histórico de assinaturas e envios',
        }),
      );
    }

    return () => {
      if (estado.painel) estado.painel.destruir();
      limpezas.forEach((fn) => {
        try {
          fn();
        } catch (err) {
          log.error('erro ao limpar historico-assinaturas:', err);
        }
      });
    };
  },
};
