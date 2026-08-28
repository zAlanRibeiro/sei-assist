/**
 * Feature: trocar de unidade pela barra.
 *
 * Clicar na unidade abre a lista das suas unidades ali mesmo, sem passar pela
 * tela de troca. Ao lado fica um "↗" que leva à tela de sempre.
 *
 * REGRA DESTA FEATURE, escrita com sangue: NUNCA montar URL do SEI.
 *
 * A primeira versão montava a URL da tela de troca copiando os parâmetros
 * `infra_*` da página atual. Não funciona: o `infra_hash` é calculado POR
 * AÇÃO, é um token contra falsificação de requisição. Copiá-lo de uma ação
 * para outra dá "hash inválido" na navegação e, numa busca em segundo plano,
 * faz o SEI DERRUBAR A SESSÃO do usuário.
 *
 * Então aqui não há URL montada nem busca nenhuma. Só duas coisas:
 *
 *   1. quando a pessoa passa pela tela de troca, guardamos a lista de
 *      unidades que já está ali na frente dela;
 *   2. a partir daí, o clique na barra abre essa lista, e escolher uma
 *      aciona o PRÓPRIO link do SEI, que sabe a URL certa.
 *
 * Antes da primeira visita à tela de troca, o clique se comporta exatamente
 * como sempre se comportou — a extensão não atrapalha o que não conhece.
 */
import { el, qsa } from '../../core/dom.js';
import { comContexto } from '../../core/runtime.js';
import { toast } from '../../core/ui.js';
import { log } from '../../core/log.js';
import { acharUnidadeNaBarra, lerUnidades, TROCA } from './seletores.js';

const ID_PAINEL = 'seix-unidades';
const ID_ATALHO = 'seix-unidades-tela';
const CHAVE = 'seix:unidades';
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

/* --------------------------------------------------- a lista guardada */

/**
 * A lista vem da tela de troca quando a pessoa passa por ela.
 *
 * Guardada por ORIGEM, porque quem usa mais de um SEI (produção e
 * homologação, por exemplo) tem listas diferentes em cada um, e misturá-las
 * ofereceria unidade que não existe do outro lado.
 */
async function lerGuardadas() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      const todas = bruto?.[CHAVE] || {};
      return todas[location.origin] || null;
    },
    null,
    'ler unidades guardadas',
  );
}

async function guardarUnidades(unidades) {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      const todas = bruto?.[CHAVE] || {};
      todas[location.origin] = unidades;
      await chrome.storage.local.set({ [CHAVE]: todas });
      return true;
    },
    false,
    'guardar unidades',
  );
}

/* ------------------------------------------------------------ o painel */

function fecharPainel() {
  const antigo = document.getElementById(ID_PAINEL);
  if (antigo) antigo.remove();
}

function abrirPainel(ancora, unidades, atual, aoEscolher) {
  fecharPainel();

  const painel = el('div', { id: ID_PAINEL, style: ESTILO_PAINEL });

  for (const unidade of unidades) {
    // "Atual" é a unidade da barra AGORA, não a que estava marcada quando a
    // lista foi guardada — senão a extensão desabilitaria a linha errada
    // depois da primeira troca.
    const ehAtual = unidade.sigla === atual;
    painel.appendChild(
      el(
        'button',
        {
          type: 'button',
          style: ehAtual ? ESTILO_ITEM_ATUAL : ESTILO_ITEM,
          title: ehAtual ? 'Você já está nesta unidade' : `Trocar para ${unidade.sigla}`,
          disabled: ehAtual ? 'disabled' : null,
          onclick: ehAtual ? null : () => aoEscolher(unidade),
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
  } catch {
    /* sem sessionStorage, a troca simplesmente não é pré-selecionada */
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
    'Depois que você passa uma vez pela tela de troca de unidade, clicar na unidade na barra do SEI abre a lista ali mesmo. O "↗" ao lado leva à tela de sempre. Não faz consulta nenhuma: usa a lista que já apareceu na sua tela.',
  padraoAtiva: true,

  telas: ['*'],
  frames: ['topo'],

  setup() {
    let vivo = true;
    const limpezas = [];

    // Metade 1: estamos NA tela de troca.
    const naTela = lerUnidades(document);
    if (naTela.length) {
      guardarUnidades(naTela).catch(() => {});

      const pendente = lerEscolha();
      if (pendente) {
        let tentativas = 0;
        const tentar = () => {
          if (!vivo || aplicarNaTela(pendente) || (tentativas += 1) > 10) return;
          setTimeout(tentar, 300);
        };
        tentar();
      }
    }

    // Metade 2: a barra do topo.
    const ancora = acharUnidadeNaBarra();
    if (!ancora) return () => limpezas.forEach((fn) => fn && fn());

    /**
     * Aciona o link do SEI, que é quem sabe a URL certa.
     *
     * A bandeira desliga o nosso interceptador durante o clique; sem ela ele
     * pegaria o próprio clique que acabamos de disparar.
     */
    let deixarPassar = false;
    const irParaTela = () => {
      deixarPassar = true;
      ancora.click();
      setTimeout(() => {
        deixarPassar = false;
      }, 0);
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

    // A lista é lida uma vez, no início. Se ainda não houver nenhuma, o
    // interceptador nem entra em ação e o SEI segue como sempre.
    let guardadas = null;
    lerGuardadas()
      .then((lista) => {
        guardadas = lista;
        if (lista) log.debug(`unidades guardadas: ${lista.length}`);
      })
      .catch(() => {});

    const aoClicar = (ev) => {
      if (deixarPassar || !vivo) return;
      const alvo = ev.target && ev.target.closest && ev.target.closest('a#lnkInfraUnidade');
      if (!alvo) return;

      // Sem lista guardada, ou com uma unidade só, não há o que oferecer:
      // deixa o SEI fazer o que sempre fez.
      if (!guardadas || guardadas.length < 2) return;

      ev.preventDefault();
      ev.stopImmediatePropagation();

      if (document.getElementById(ID_PAINEL)) {
        fecharPainel();
        return;
      }

      abrirPainel(alvo, guardadas, alvo.textContent.trim(), (unidade) => {
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
