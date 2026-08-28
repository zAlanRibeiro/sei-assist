/**
 * trajetoria.js - o andamento do processo dito em uma linha.
 *
 * A tela "Consultar Andamento" responde bem a "o que aconteceu", e mal a duas
 * perguntas que se faz o tempo todo: por onde este processo passou, e ha
 * quanto tempo ele esta parado aqui. Para saber isso hoje e preciso ler uma
 * tabela de dezenas de linhas de tras para frente.
 *
 * Aqui tudo e funcao pura: entram os eventos que o parser do andamento
 * produziu, sai a sequencia de paradas e o texto. Sem DOM, para poder ser
 * testado - e porque contar dias errado num processo com prazo nao e detalhe.
 *
 * LIMITE CONHECIDO: a trajetoria e linear. Um processo pode estar aberto em
 * mais de uma unidade ao mesmo tempo, e nesse caso o que sai aqui e uma
 * simplificacao - a ultima parada aberta e tratada como "onde ele esta".
 */

const DIA_MS = 24 * 60 * 60 * 1000;
const HORA_MS = 60 * 60 * 1000;

/**
 * As paradas do processo, na ordem em que aconteceram.
 *
 * Uma parada comeca quando o processo chega numa unidade (foi criado la, ou
 * foi recebido) e termina quando ele e remetido dali. A que nao terminou e
 * onde ele esta agora.
 */
export function trajetoria(eventos, agora = Date.now()) {
  const paradas = [];

  for (const evento of eventos || []) {
    if (!evento || !evento.unidade) continue;

    if (evento.tipo === 'processoCriado' || evento.tipo === 'recebido') {
      // Recebimento repetido na mesma unidade em que ele ja esta nao abre
      // parada nova - acontece quando varias pessoas da unidade abrem o
      // processo.
      const ultima = paradas[paradas.length - 1];
      if (ultima && !ultima.ate && ultima.unidade === evento.unidade) continue;

      paradas.push({ unidade: evento.unidade, desde: evento.quando, ate: null });
      continue;
    }

    if (evento.tipo === 'remetido') {
      // Fecha a parada ABERTA daquela unidade. Quem faz o trabalho e a
      // condicao !ate: uma passagem anterior pela mesma unidade ja esta
      // fechada e e pulada. A busca de tras para frente e so por clareza -
      // a aberta, quando existe, e sempre a ultima.
      for (let i = paradas.length - 1; i >= 0; i--) {
        if (paradas[i].unidade === evento.unidade && !paradas[i].ate) {
          paradas[i].ate = evento.quando;
          break;
        }
      }
    }
  }

  return paradas.map((p) => ({
    ...p,
    atual: !p.ate,
    duracaoMs: Math.max(0, new Date(p.ate || agora).getTime() - new Date(p.desde).getTime()),
  }));
}

/**
 * Duracao em linguagem de gente.
 *
 * "3 dias" e nao "3.2 dias"; "hoje" e nao "0 dias". Ninguem diz que um
 * processo esta parado ha 0,4 dia.
 */
export function duracaoLegivel(ms) {
  if (!Number.isFinite(ms) || ms < 0) return '';

  const dias = Math.floor(ms / DIA_MS);
  if (dias >= 365) {
    const anos = Math.floor(dias / 365);
    return anos === 1 ? '1 ano' : `${anos} anos`;
  }
  if (dias >= 30) {
    const meses = Math.floor(dias / 30);
    return meses === 1 ? '1 mês' : `${meses} meses`;
  }
  if (dias >= 1) return dias === 1 ? '1 dia' : `${dias} dias`;

  const horas = Math.floor(ms / HORA_MS);
  if (horas >= 1) return horas === 1 ? '1 hora' : `${horas} horas`;
  return 'menos de 1 hora';
}

/**
 * Só a ponta da sigla: NIT/NITTRANS/DIVEST vira DIVEST.
 *
 * A sigla inteira e repetitiva - o prefixo e o mesmo para todas as unidades do
 * orgao - e ocupa a linha toda. A completa fica no title, para quem precisar.
 */
export function siglaCurta(unidade) {
  const inteira = String(unidade || '').trim();
  if (!inteira) return '';
  const partes = inteira.split('/').filter(Boolean);
  return partes[partes.length - 1] || inteira;
}

/** A trajetória em uma linha: DIVCC → DEPOT → DIVEST */
export function emUmaLinha(paradas) {
  return (paradas || []).map((p) => siglaCurta(p.unidade)).join(' → ');
}

/** Data no formato de quem lê: 27/08/2026 */
function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * O andamento resumido numa frase.
 *
 * É a parte "linguagem mais legível" do pedido: em vez de uma tabela, a
 * resposta às perguntas que se faz de fato.
 */
export function resumir(paradas, agora = Date.now()) {
  const lista = paradas || [];
  if (!lista.length) return '';

  const primeira = lista[0];
  const ultima = lista[lista.length - 1];

  const partes = [];
  partes.push(`Começou na ${siglaCurta(primeira.unidade)} em ${dataCurta(primeira.desde)}`);

  if (lista.length > 1) {
    const unidades = new Set(lista.map((p) => p.unidade));
    partes.push(
      unidades.size === 1
        ? 'voltou para a mesma unidade'
        : `passou por ${unidades.size} unidades`,
    );
  }

  const tempo = duracaoLegivel(
    ultima.atual ? agora - new Date(ultima.desde).getTime() : ultima.duracaoMs,
  );

  partes.push(
    ultima.atual
      ? `está na ${siglaCurta(ultima.unidade)} há ${tempo}`
      : `saiu da ${siglaCurta(ultima.unidade)} em ${dataCurta(ultima.ate)}`,
  );

  return `${partes.join(', ')}.`;
}

/**
 * Quanto tempo o processo está parado onde está.
 *
 * Devolve null quando ele não está em lugar nenhum (todas as paradas
 * fechadas), o que acontece com processo remetido e ainda não recebido.
 */
export function paradoHa(paradas, agora = Date.now()) {
  const atual = (paradas || []).find((p) => p.atual);
  if (!atual) return null;
  return agora - new Date(atual.desde).getTime();
}
