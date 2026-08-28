/**
 * Feature: trajetória do processo.
 *
 * Põe, no topo da tela "Consultar Andamento", duas coisas que a tabela abaixo
 * tem mas não entrega:
 *
 *   1. a rota em uma linha, e há quanto tempo o processo está parado onde está;
 *   2. o andamento INTEIRO reescrito em linguagem normal, do mais antigo ao
 *      mais recente.
 *
 * A tabela do SEI continua ali, intacta. Isto é leitura, não substituição — e
 * é de propósito: quando a extensão não entender uma linha, ela repete a frase
 * do sistema, e quem quiser conferir tem o original logo abaixo.
 *
 * Não faz requisição nenhuma: os dados já estão na tela que a pessoa abriu.
 */
import { el } from '../../core/dom.js';
import { log } from '../../core/log.js';
import { acharTabela, lerAndamentoCompleto } from '../../core/andamento.js';
import { dataHoraLegivel, narrar } from './narrativa.js';
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

const ESTILO_ABRIR = {
  marginTop: '8px',
  cursor: 'pointer',
  fontWeight: '600',
  color: 'var(--seix-cor-primaria-realce, #1351b4)',
  listStyle: 'none',
};

/**
 * O histórico rola dentro da própria faixa. Sem isto, um processo de anos
 * empurraria a tabela do SEI para fora da tela — e a tabela é o original.
 */
const ESTILO_LISTA = {
  margin: '8px 0 0',
  padding: '0',
  listStyle: 'none',
  maxHeight: '320px',
  overflowY: 'auto',
  borderTop: '1px solid var(--seix-cor-borda-suave, #d0d5dd)',
};

const ESTILO_ITEM = {
  display: 'flex',
  gap: '10px',
  alignItems: 'baseline',
  padding: '4px 2px',
  borderBottom: '1px solid var(--seix-cor-borda-suave, #e4e7ec)',
};

const ESTILO_QUANDO = {
  flex: '0 0 auto',
  minWidth: '108px',
  fontVariantNumeric: 'tabular-nums',
  color: 'var(--seix-cor-texto-fraco, #667085)',
  fontSize: '12px',
};

const ESTILO_INTERVALO = {
  flex: '0 0 auto',
  marginLeft: 'auto',
  paddingLeft: '10px',
  color: 'var(--seix-cor-texto-fraco, #667085)',
  fontSize: '11px',
  whiteSpace: 'nowrap',
};

/** Cabeçalho: a rota, o selo de tempo parado e a frase de resumo. */
function montarResumo(paradas, agora) {
  const parado = paradoHa(paradas, agora);
  const atual = paradas[paradas.length - 1];

  const linha = el('span', {
    style: ESTILO_LINHA,
    // A sigla inteira fica aqui, para quem precisar do prefixo do órgão.
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

  return [linha, el('span', { style: ESTILO_RESUMO, text: resumir(paradas, agora) })];
}

/** O andamento inteiro, uma linha por registro. */
function montarHistorico(registros) {
  const itens = registros.map((r) =>
    el('li', { style: ESTILO_ITEM }, [
      el('span', { style: ESTILO_QUANDO, text: dataHoraLegivel(r.quando) }),
      el('span', { style: { flex: '1 1 auto' }, text: r.texto }),
      r.intervalo ? el('span', { style: ESTILO_INTERVALO, text: `${r.intervalo} depois` }) : null,
    ]),
  );

  return el('details', { open: 'open' }, [
    el('summary', {
      style: ESTILO_ABRIR,
      // A ordem é o contrário da tabela do SEI, e dizer isso evita a leitura
      // errada de quem só bate o olho.
      text: `Histórico completo — ${registros.length} registro${
        registros.length === 1 ? '' : 's'
      }, do mais antigo ao mais recente`,
    }),
    el('ul', { style: ESTILO_LISTA }, itens),
  ]);
}

export default {
  id: 'trajetoria-processo',
  nome: 'Trajetória do processo',
  descricao:
    'No Consultar Andamento, resume a rota em uma linha e reescreve o andamento inteiro em linguagem normal. Só lê a tela aberta — não faz consulta nenhuma.',
  padraoAtiva: true,

  telas: ['andamento', '*'],
  frames: ['*'],

  setup() {
    let vivo = true;

    const pintar = () => {
      if (!vivo || document.getElementById(ID)) return;

      const eventos = lerAndamentoCompleto();
      // Sem eventos, esta não é a tela do andamento. A feature declara
      // telas: ['*'] porque o nome da ação desta tela nunca foi confirmado —
      // quem decide é o conteúdo.
      if (!eventos.length) return;

      const tabela = acharTabela();
      if (!tabela || !tabela.parentElement) return;

      const agora = Date.now();
      const paradas = trajetoria(eventos, agora);
      const registros = narrar(eventos);

      const partes = paradas.length ? montarResumo(paradas, agora) : [];
      partes.push(montarHistorico(registros));

      tabela.parentElement.insertBefore(el('div', { id: ID, style: ESTILO }, partes), tabela);
      log.debug(`trajetoria: ${paradas.length} parada(s), ${registros.length} registro(s)`);
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
