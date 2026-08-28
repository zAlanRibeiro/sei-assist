/**
 * Feature: trajetória do processo.
 *
 * Põe, no topo da tela "Consultar Andamento", uma faixa que responde em uma
 * linha o que a tabela abaixo responde em dezenas: por onde o processo passou
 * e há quanto tempo ele está parado onde está.
 *
 * Não faz requisição nenhuma: os dados já estão na tela que a pessoa abriu.
 * Só lê e resume.
 */
import { el, qsa } from '../../core/dom.js';
import { log } from '../../core/log.js';
import { lerAndamentos } from '../../core/andamento.js';
import {
  duracaoLegivel,
  emUmaLinha,
  paradoHa,
  resumir,
  siglaCurta,
  trajetoria,
} from './trajetoria.js';

const ID = 'seix-trajetoria';

/**
 * Estilo inline, pelo mesmo motivo do resto: o content.css entra em
 * `document_start`, antes das folhas do SEI, e perde o empate de
 * especificidade dentro do HTML deles. As cores saem de token, então a faixa
 * acompanha o tema do órgão.
 */
const ESTILO = {
  margin: '0 0 12px',
  padding: '10px 12px',
  borderLeft: '4px solid var(--seix-cor-primaria, #1351b4)',
  borderRadius: 'var(--seix-raio, 6px)',
  background: 'var(--seix-cor-superficie, #f2f4f7)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  fontSize: '13px',
  lineHeight: '1.5',
};

const ESTILO_LINHA = {
  display: 'block',
  marginBottom: '3px',
  fontWeight: '700',
  fontSize: '14px',
  letterSpacing: '0.02em',
};

const ESTILO_RESUMO = {
  display: 'block',
  color: 'var(--seix-cor-texto-suave, #475467)',
};

const ESTILO_PARADO = {
  display: 'inline-block',
  marginLeft: '8px',
  padding: '1px 7px',
  borderRadius: '10px',
  background: 'var(--seix-cor-primaria, #1351b4)',
  color: 'var(--seix-cor-primaria-texto, #ffffff)',
  fontSize: '11px',
  fontWeight: '700',
};

/**
 * A tabela do andamento, para pendurar a faixa logo antes dela.
 *
 * Achada pelas linhas que o parser reconheceu, e não por um seletor novo:
 * nunca vi o HTML desta tela, e derivar do que já funciona é mais seguro que
 * inventar um id.
 */
function tabelaDoAndamento() {
  for (const linha of qsa('tr')) {
    const tabela = linha.closest ? linha.closest('table') : null;
    if (tabela) return tabela;
  }
  return null;
}

function montarFaixa(paradas, agora) {
  const parado = paradoHa(paradas, agora);
  const atual = paradas[paradas.length - 1];

  const linha = el('span', {
    style: ESTILO_LINHA,
    title: paradas.map((p) => p.unidade).join('  →  '),
    text: emUmaLinha(paradas),
  });

  if (parado !== null) {
    linha.appendChild(
      el('span', {
        style: ESTILO_PARADO,
        title: `Sem sair da ${siglaCurta(atual.unidade)} desde ${new Date(
          atual.desde,
        ).toLocaleDateString('pt-BR')}`,
        text: `aqui há ${duracaoLegivel(parado)}`,
      }),
    );
  }

  return el('div', { id: ID, style: ESTILO }, [
    linha,
    el('span', { style: ESTILO_RESUMO, text: resumir(paradas, agora) }),
  ]);
}

export default {
  id: 'trajetoria-processo',
  nome: 'Trajetória do processo',
  descricao:
    'No Consultar Andamento, resume em uma linha por onde o processo passou e há quanto tempo está parado. Só lê a tela aberta — não faz consulta nenhuma.',
  padraoAtiva: true,

  telas: ['andamento', '*'],
  frames: ['*'],

  setup() {
    let vivo = true;

    const pintar = () => {
      if (!vivo || document.getElementById(ID)) return;

      const eventos = lerAndamentos();
      // Sem eventos reconhecidos, esta não é a tela do andamento. A feature
      // declara telas: ['*'] porque o nome da ação desta tela nunca foi
      // confirmado — quem decide é o conteúdo.
      if (!eventos.length) return;

      const paradas = trajetoria(eventos);
      if (!paradas.length) {
        log.debug('andamento lido, mas sem tramitação para resumir');
        return;
      }

      const tabela = tabelaDoAndamento();
      if (!tabela || !tabela.parentElement) return;

      tabela.parentElement.insertBefore(montarFaixa(paradas, Date.now()), tabela);
      log.debug(`trajetoria: ${paradas.length} parada(s)`);
    };

    pintar();

    // A tabela do andamento é montada pelo SEI depois do carregamento em
    // algumas telas; uma passada só pegaria a página ainda vazia.
    const observador = new MutationObserver(() => pintar());
    observador.observe(document.body, { childList: true, subtree: true });

    return () => {
      vivo = false;
      observador.disconnect();
      const faixa = document.getElementById(ID);
      if (faixa) faixa.remove();
    };
  },
};
