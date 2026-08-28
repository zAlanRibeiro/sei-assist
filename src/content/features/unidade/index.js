/**
 * Feature: trocar de unidade sem sair da tela.
 *
 * Clicar na unidade, na barra do SEI, leva a uma tela inteira só para escolher
 * outra. Quem alterna entre duas unidades no mesmo expediente faz esse caminho
 * o dia todo. Aqui o clique abre a lista ali mesmo, e ao lado fica um "↗" que
 * continua levando para a tela de sempre.
 *
 * O QUE ESTA FEATURE NÃO FAZ: montar requisição. A troca acontece clicando no
 * mesmo controle que a pessoa clicaria — navegamos para a tela do SEI e
 * marcamos a opção escolhida. É automação de navegação e preenchimento, que é
 * o que esta extensão se permite; nada é enviado nem assinado por conta
 * própria.
 *
 * E se qualquer parte falhar, o desfecho é o comportamento antigo: a tela de
 * troca do SEI, aberta como sempre foi.
 */
import { el, qsa } from '../../core/dom.js';
import { buscarHtml, lerHtml } from '../../core/rede.js';
import { toast } from '../../core/ui.js';
import { log } from '../../core/log.js';
import { acharUnidadeNaBarra, lerUnidades, urlDaTroca, TROCA } from './seletores.js';

const ID_PAINEL = 'seix-unidades';
const ID_ATALHO = 'seix-unidades-tela';
const PENDENTE = 'seix:trocar-unidade';

/** Escolha pendente vale por pouco: é uma navegação, não um agendamento. */
const VALIDADE_MS = 30 * 1000;

/**
 * Cor explícita em todo texto, como no resto da extensão: herança não vale
 * dentro do HTML do SEI, porque o tema deles tem regra para span e a regra
 * ganha da herança.
 */
const ESTILO_PAINEL = {
  position: 'absolute',
  zIndex: '2147483000',
  minWidth: '260px',
  maxHeight: '320px',
  overflowY: 'auto',
  padding: '4px',
  borderRadius: 'var(--seix-raio, 6px)',
  border: '1px solid var(--seix-cor-borda, #d0d5dd)',
  background: 'var(--seix-cor-fundo, #ffffff)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  boxShadow: 'var(--seix-sombra, 0 4px 16px rgba(0,0,0,0.18))',
  fontSize: '13px',
};

const ESTILO_ITEM = {
  display: 'block',
  width: '100%',
  padding: '6px 8px',
  border: '0',
  borderRadius: '4px',
  background: 'transparent',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  textAlign: 'left',
  cursor: 'pointer',
  font: 'inherit',
};

const ESTILO_ITEM_ATUAL = {
  ...ESTILO_ITEM,
  fontWeight: '700',
  background: 'var(--seix-cor-superficie, #f2f4f7)',
  cursor: 'default',
};

const ESTILO_DESCRICAO = {
  display: 'block',
  color: 'var(--seix-cor-texto-fraco, #667085)',
  fontSize: '11px',
};

const ESTILO_ATALHO = {
  marginLeft: '4px',
  padding: '0 6px',
  border: '0',
  borderRadius: '4px',
  background: 'transparent',
  color: 'inherit',
  cursor: 'pointer',
  font: 'inherit',
};

/* ------------------------------------------------------------- a lista */

let cache = null;

/**
 * As unidades, buscadas só quando alguém abre a lista.
 *
 * Sem consulta periódica e sem consulta no carregamento: enquanto ninguém
 * clicar, esta feature não gera tráfego nenhum.
 */
async function carregarUnidades() {
  if (cache) return cache;

  const url = urlDaTroca();
  if (!url) return null;

  const html = await buscarHtml(url);
  const doc = lerHtml(html);
  if (!doc) return null;

  cache = lerUnidades(doc);
  log.debug(`unidades com permissão: ${cache.length}`);
  return cache;
}

/* ------------------------------------------------------------ o painel */

function fecharPainel() {
  const antigo = document.getElementById(ID_PAINEL);
  if (antigo) antigo.remove();
}

function abrirPainel(ancora, unidades, aoEscolher) {
  fecharPainel();

  const painel = el('div', { id: ID_PAINEL, style: ESTILO_PAINEL });

  for (const unidade of unidades) {
    const atual = unidade.atual;
    painel.appendChild(
      el(
        'button',
        {
          type: 'button',
          style: atual ? ESTILO_ITEM_ATUAL : ESTILO_ITEM,
          title: atual ? 'Você já está nesta unidade' : `Trocar para ${unidade.sigla}`,
          disabled: atual ? 'disabled' : null,
          onclick: atual ? null : () => aoEscolher(unidade),
        },
        [
          unidade.sigla,
          unidade.descricao
            ? el('span', { style: ESTILO_DESCRICAO, text: unidade.descricao })
            : null,
        ],
      ),
    );
  }

  const caixa = ancora.getBoundingClientRect();
  painel.style.top = `${caixa.bottom + window.scrollY + 4}px`;
  painel.style.left = `${Math.max(4, caixa.right + window.scrollX - 260)}px`;
  document.body.appendChild(painel);
  return painel;
}

/* ------------------------------------------------------ aplicar a troca */

function guardarEscolha(sigla) {
  try {
    sessionStorage.setItem(PENDENTE, JSON.stringify({ sigla, quando: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

function lerEscolha() {
  try {
    const bruto = sessionStorage.getItem(PENDENTE);
    if (!bruto) return null;
    // Consome na leitura: uma escolha só vale para a navegação que a seguiu.
    sessionStorage.removeItem(PENDENTE);
    const escolha = JSON.parse(bruto);
    if (!escolha || Date.now() - escolha.quando > VALIDADE_MS) return null;
    return escolha.sigla || null;
  } catch {
    return null;
  }
}

/**
 * Marca a unidade escolhida na tela de troca.
 *
 * Clica no MESMO controle que a pessoa clicaria. Não submete formulário nem
 * monta requisição: quem decide o que fazer com o clique é o SEI.
 */
function aplicarNaTela(sigla) {
  const alvo = lerUnidades(document).find((u) => u.sigla === sigla);
  if (!alvo || !alvo.idDoCampo) return false;

  const clicavel =
    document.getElementById(alvo.idDoCampo) || qsa(TROCA.rotuloDoItem(alvo.idDoCampo))[0];
  if (!clicavel) return false;

  clicavel.click();

  // Se o SEI não reagir, a pessoa precisa saber que a escolha está na tela
  // esperando por ela — em vez de achar que a extensão travou.
  setTimeout(() => {
    if (document.getElementById(alvo.idDoCampo)) {
      toast(`${sigla} está selecionada. Confirme na tela para trocar.`, {
        tipo: 'info',
        duracao: 6000,
      });
    }
  }, 2500);

  return true;
}

/* -------------------------------------------------------------- feature */

export default {
  id: 'trocar-unidade',
  nome: 'Trocar de unidade pela barra',
  descricao:
    'Clicar na unidade, na barra do SEI, abre a lista das suas unidades ali mesmo. O "↗" ao lado continua levando para a tela de troca de sempre. A lista só é buscada quando você abre.',
  padraoAtiva: true,

  telas: ['*'],
  frames: ['topo'],

  setup() {
    let vivo = true;
    const limpezas = [];

    // Metade 1: a tela de troca, quando chegamos nela com uma escolha feita.
    const pendente = lerEscolha();
    if (pendente) {
      // A tabela pode ainda não estar montada no instante do boot.
      let tentativas = 0;
      const tentar = () => {
        if (!vivo || aplicarNaTela(pendente) || (tentativas += 1) > 10) return;
        setTimeout(tentar, 300);
      };
      tentar();
    }

    // Metade 2: a barra do topo.
    const ancora = acharUnidadeNaBarra();
    if (!ancora) {
      log.debug('unidade não encontrada na barra');
      return () => limpezas.forEach((fn) => fn && fn());
    }

    const irParaTela = () => {
      const url = urlDaTroca();
      if (url) location.href = url;
    };

    const atalho = el('button', {
      id: ID_ATALHO,
      type: 'button',
      style: ESTILO_ATALHO,
      title: 'Abrir a tela de troca de unidade do SEI',
      text: '↗',
      onclick: (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        irParaTela();
      },
    });
    ancora.insertAdjacentElement('afterend', atalho);
    limpezas.push(() => atalho.remove());

    let carregando = false;

    const aoClicar = async (ev) => {
      const alvo = ev.target && ev.target.closest && ev.target.closest('a#lnkInfraUnidade');
      if (!alvo || !vivo) return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      if (document.getElementById(ID_PAINEL)) {
        fecharPainel();
        return;
      }
      if (carregando) return;

      carregando = true;
      let unidades = null;
      try {
        unidades = await carregarUnidades();
      } catch (err) {
        log.debug('não consegui listar as unidades:', err);
      } finally {
        carregando = false;
      }

      // Sem lista, ou com uma unidade só, não há o que oferecer: o desfecho
      // volta a ser o de sempre, a tela do SEI.
      if (!unidades || unidades.length < 2) {
        irParaTela();
        return;
      }

      abrirPainel(alvo, unidades, (unidade) => {
        fecharPainel();
        guardarEscolha(unidade.sigla);
        irParaTela();
      });
    };

    // Na captura e no documento: o <a> do SEI tem onclick embutido, e só um
    // ouvinte que chega ANTES dele consegue impedir a navegação.
    document.addEventListener('click', aoClicar, true);
    limpezas.push(() => document.removeEventListener('click', aoClicar, true));

    const aoClicarFora = (ev) => {
      const painel = document.getElementById(ID_PAINEL);
      if (!painel || painel.contains(ev.target)) return;
      if (ev.target.closest && ev.target.closest('a#lnkInfraUnidade')) return;
      fecharPainel();
    };
    document.addEventListener('click', aoClicarFora);
    limpezas.push(() => document.removeEventListener('click', aoClicarFora));

    return () => {
      vivo = false;
      fecharPainel();
      limpezas.forEach((fn) => fn && fn());
    };
  },
};
