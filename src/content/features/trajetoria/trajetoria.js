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
 * ENVIO SIMULTANEO: no SEI um processo pode ser enviado para varias unidades
 * de uma vez, e fica aberto em todas. A trajetoria nao e uma fila, entao: as
 * paradas que se SOBREPOEM no tempo aparecem lado a lado, e nao uma depois da
 * outra. Escrever "DEPGM -> PRES" quando as duas receberam junto seria dizer
 * que uma veio depois da outra.
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
      // fechada e e pulada.
      //
      // A parada aberta NAO e necessariamente a ultima: com envio simultaneo
      // ha varias abertas ao mesmo tempo, e a unidade que devolve o processo
      // pode ser a primeira delas. Por isso a busca percorre a lista em vez de
      // olhar so o fim.
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

/** Quando a parada terminou; agora, se ainda esta aberta. */
function fim(parada, agora) {
  return parada.ate ? new Date(parada.ate).getTime() : agora;
}

/** Duas paradas conviveram no tempo? */
function sobrepoe(a, b, agora) {
  return new Date(a.desde).getTime() < fim(b, agora) && new Date(b.desde).getTime() < fim(a, agora);
}

/**
 * As paradas em grupos: cada grupo e um momento da trajetoria.
 *
 * Um grupo com mais de uma parada significa que o processo esteve nas duas ao
 * mesmo tempo. Note que a comparacao e contra o grupo INTEIRO, e nao so contra
 * a parada anterior: tres unidades em paralelo formam um grupo so, mesmo que a
 * primeira ja tenha devolvido o processo quando a terceira o recebeu.
 */
export function agrupar(paradas, agora = Date.now()) {
  const grupos = [];

  for (const parada of paradas || []) {
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.some((outra) => sobrepoe(outra, parada, agora))) ultimo.push(parada);
    else grupos.push([parada]);
  }

  return grupos;
}

/**
 * A trajetória em uma linha: DIVCC → DEPOT → DIVEST
 *
 * Unidades que receberam o processo ao mesmo tempo saem juntas, separadas por
 * "+": DIVCC → DEPGM + PRES.
 */
export function emUmaLinha(paradas, agora = Date.now()) {
  return agrupar(paradas, agora)
    .map((grupo) => grupo.map((p) => siglaCurta(p.unidade)).join(' + '))
    .join(' → ');
}

/**
 * As paradas ainda abertas — onde o processo está agora.
 *
 * É mais de uma quando ele foi enviado para várias unidades de uma vez: no SEI
 * ele fica aberto em todas, e nenhuma delas é "a" atual. Antes daqui existia
 * uma função que devolvia só a primeira, enquanto a faixa nomeava a última —
 * o selo media uma unidade e o rótulo nomeava outra.
 *
 * Lista vazia quando ele não está em lugar nenhum: remetido e ainda não
 * recebido.
 */
export function abertas(paradas) {
  return (paradas || []).filter((p) => p.atual);
}

/** Data no formato de quem lê: 27/08/2026 */
function dataCurta(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * O selo de tempo parado: o que ele diz e o que fica no title.
 *
 * Mora aqui, e não na feature, porque é decisão e não desenho — e decisão que
 * já saiu errada uma vez, quando o selo media uma unidade e nomeava outra.
 *
 * Com envio simultâneo não existe "aqui": o processo está aberto em várias
 * unidades ao mesmo tempo, cada uma com o seu relógio. Nesse caso o selo conta
 * quantas são, e o detalhe lista uma por linha.
 *
 * @returns {{texto: string, detalhe: string}|null} null quando ele não está em
 *   lugar nenhum.
 */
export function selo(paradas) {
  const emAberto = abertas(paradas);
  if (!emAberto.length) return null;

  if (emAberto.length === 1) {
    const [parada] = emAberto;
    return {
      texto: `aqui há ${duracaoLegivel(parada.duracaoMs)}`,
      detalhe: `Sem sair da ${siglaCurta(parada.unidade)} desde ${dataCurta(parada.desde)}`,
    };
  }

  return {
    texto: `em ${emAberto.length} unidades`,
    detalhe: emAberto
      .map((p) => `${siglaCurta(p.unidade)} há ${duracaoLegivel(p.duracaoMs)}`)
      .join('\n'),
  };
}
