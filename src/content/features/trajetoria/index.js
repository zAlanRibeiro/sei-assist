/**
 * Feature: trajetória do processo.
 *
 * Uma linha no topo do "Consultar Andamento": por onde o processo passou e há
 * quanto tempo está parado onde está.
 *
 *   DIVCC → DEPOT → DIVEST        [aqui há 12 dias]
 *
 * Só isso. A tabela do SEI continua logo abaixo, intacta, e é ela que responde
 * "o que aconteceu" — a faixa responde "por onde andou", que é a pergunta que
 * a tabela obriga a montar na cabeça, lendo dezenas de linhas de trás para
 * frente.
 *
 * Não faz requisição nenhuma: os dados já estão na tela que a pessoa abriu.
 */
import { el } from '../../core/dom.js';
import { log } from '../../core/log.js';
import { acharTabela, lerAndamentos } from '../../core/andamento.js';
import { duracaoLegivel, emUmaLinha, paradoHa, siglaCurta, trajetoria } from './trajetoria.js';

const ID = 'seix-trajetoria';

/**
 * Estilo inline, pelo mesmo motivo do resto: o content.css entra em
 * `document_start`, antes das folhas do SEI, e perde o empate de
 * especificidade dentro do HTML deles. As cores saem de token, então a faixa
 * acompanha o tema do órgão.
 *
 * COR EXPLICITA EM TODO TEXTO, sem exceção. Herdar a cor do container não
 * funciona dentro do HTML do SEI: herança só vale quando NENHUMA regra casa
 * com o elemento, e o tema escuro do SEI tem regra para span. A regra deles
 * ganha da herança, e o texto sai branco sobre o fundo claro da faixa —
 * invisível. Aconteceu de verdade. Há um teste que cobra cor de cada estilo
 * deste arquivo.
 */
const ESTILO = {
  display: 'flex',
  gap: '10px',
  alignItems: 'center',
  flexWrap: 'wrap',
  margin: '0 0 10px',
  padding: '7px 11px',
  borderLeft: '3px solid var(--seix-cor-primaria, #1351b4)',
  borderRadius: 'var(--seix-raio, 6px)',
  background: 'var(--seix-cor-superficie, #f2f4f7)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  fontSize: '14px',
  lineHeight: '1.4',
};

const ESTILO_ROTA = {
  color: 'var(--seix-cor-texto, #1c1c1c)',
  fontWeight: '700',
  letterSpacing: '0.02em',
};

const ESTILO_PARADO = {
  padding: '1px 8px',
  borderRadius: '10px',
  background: 'var(--seix-cor-primaria, #1351b4)',
  color: 'var(--seix-cor-primaria-texto, #ffffff)',
  fontSize: '11px',
  fontWeight: '700',
};

function montarFaixa(paradas, agora) {
  const parado = paradoHa(paradas, agora);
  const atual = paradas[paradas.length - 1];

  return el('div', { id: ID, style: ESTILO }, [
    el('span', {
      style: ESTILO_ROTA,
      // A sigla inteira fica aqui, para quem precisar do prefixo do órgão.
      title: paradas.map((p) => p.unidade).join('  →  '),
      text: emUmaLinha(paradas),
    }),
    parado === null
      ? null
      : el('span', {
          style: ESTILO_PARADO,
          title: `Sem sair da ${siglaCurta(atual.unidade)} desde ${new Date(
            atual.desde,
          ).toLocaleDateString('pt-BR')}`,
          text: `aqui há ${duracaoLegivel(parado)}`,
        }),
  ]);
}

export default {
  id: 'trajetoria-processo',
  nome: 'Trajetória do processo',
  descricao:
    'No Consultar Andamento, mostra em uma linha por onde o processo passou e há quanto tempo está parado. Só lê a tela aberta — não faz consulta nenhuma.',
  padraoAtiva: true,

  telas: ['andamento', '*'],
  frames: ['*'],

  setup() {
    let vivo = true;

    const pintar = () => {
      if (!vivo || document.getElementById(ID)) return;

      const eventos = lerAndamentos();
      // Sem eventos, esta não é a tela do andamento. A feature declara
      // telas: ['*'] porque o nome da ação desta tela nunca foi confirmado —
      // quem decide é o conteúdo.
      if (!eventos.length) return;

      const paradas = trajetoria(eventos);
      if (!paradas.length) {
        log.debug('andamento lido, mas sem tramitação para resumir');
        return;
      }

      const tabela = acharTabela();
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
