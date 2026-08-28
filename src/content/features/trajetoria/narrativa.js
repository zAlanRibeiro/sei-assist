/**
 * narrativa.js - o andamento inteiro dito em linguagem normal.
 *
 * A tela do SEI escreve como sistema escreve: "Processo remetido pela unidade
 * NIT/NITTRANS/DIVCC" numa linha, "Processo recebido na unidade
 * NIT/NITTRANS/DEPOT" na linha seguinte, e cabe a quem le juntar as duas para
 * entender que o processo foi de um lugar para outro. Aqui isso vira uma frase
 * so: "Enviado da DIVCC para a DEPOT".
 *
 * Duas regras guiam tudo:
 *
 * 1. O que a extensao NAO entende, ela repete. Uma linha de tipo desconhecido
 *    sai com a frase do SEI intacta (so com as siglas encurtadas). Melhor a
 *    frase feia do sistema do que uma traducao inventada - ou, pior, um buraco
 *    silencioso no meio do historico.
 * 2. Nada e resumido fora. Todas as linhas com data aparecem. O unico
 *    descarte e o "recebido" que ja foi dito junto com o "remetido" do mesmo
 *    instante - e ele nao some, so deixa de ser repetido.
 *
 * Tudo aqui e funcao pura, para poder ser testado sem navegador.
 */
import { duracaoLegivel, siglaCurta } from './trajetoria.js';

/** Remetido e recebido do mesmo envio caem no mesmo minuto. */
const PAR_MS = 60 * 1000;

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Sigla de unidade dentro de uma frase: NIT/NITTRANS/DIVEST.
 *
 * O tamanho minimo evita estragar abreviacao curta com barra que aparece em
 * texto corrido ("S/N", "E/OU"). Encurtar aquilo nao ajudaria ninguem, e
 * mudaria o sentido.
 */
const SIGLA_NO_TEXTO = /\b[A-Z][A-Z0-9]*(?:\/[A-Z0-9._-]+)+/g;
const MENOR_SIGLA = 7;

/** Troca cada sigla longa pela ponta dela, dentro de um texto qualquer. */
export function encurtarSiglas(texto) {
  return String(texto || '').replace(SIGLA_NO_TEXTO, (achado) =>
    achado.length < MENOR_SIGLA ? achado : siglaCurta(achado),
  );
}

/** Frase termina com ponto; a do SEI as vezes nao termina. */
function pontuar(frase) {
  const t = String(frase || '').trim();
  if (!t) return '';
  return /[.!?]$/.test(t) ? t : `${t}.`;
}

/**
 * Um evento do andamento em uma frase.
 *
 * @param {object} evento  saida de lerLinhaQualquer()
 * @param {string|null} destino  para onde foi, quando se sabe (envio)
 */
export function frasear(evento, destino = null) {
  if (!evento) return '';

  const quem = evento.usuario ? ` por ${evento.usuario}` : '';
  const onde = siglaCurta(evento.unidade);

  if (evento.tipo === 'processoCriado') {
    return onde ? `Processo aberto na ${onde}${quem}.` : `Processo aberto${quem}.`;
  }

  if (evento.tipo === 'documentoCriado') {
    const numero = evento.documento ? ` ${evento.documento}` : '';
    return onde
      ? `Documento${numero} criado na ${onde}${quem}.`
      : `Documento${numero} criado${quem}.`;
  }

  if (evento.tipo === 'remetido') {
    return destino
      ? `Enviado da ${onde} para a ${siglaCurta(destino)}${quem}.`
      : `Enviado pela ${onde}${quem}.`;
  }

  if (evento.tipo === 'recebido') {
    return `Recebido na ${onde}${quem}.`;
  }

  // Tipo desconhecido: a frase do SEI, so com as siglas enxugadas.
  return pontuar(encurtarSiglas(evento.descricao));
}

/** O par remetido/recebido do mesmo instante, se existir. */
function parDe(evento, lista) {
  const oposto = evento.tipo === 'remetido' ? 'recebido' : 'remetido';
  const quando = new Date(evento.quando).getTime();
  return (
    lista.find(
      (outro) =>
        outro.tipo === oposto &&
        Math.abs(new Date(outro.quando).getTime() - quando) <= PAR_MS,
    ) || null
  );
}

/**
 * Quanto tempo passou desde o evento anterior.
 *
 * So aparece a partir de um dia: dizer "2 horas depois" em cada linha de um
 * mesmo expediente e ruido, e o horario ja esta ali do lado.
 */
function intervalo(antes, depois) {
  const ms = new Date(depois).getTime() - new Date(antes).getTime();
  if (!Number.isFinite(ms) || ms < DIA_MS) return '';
  return duracaoLegivel(ms);
}

/** Data e hora do jeito que se le: 02/07/2026 16:59 */
export function dataHoraLegivel(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dois = (n) => String(n).padStart(2, '0');
  return `${dois(d.getDate())}/${dois(d.getMonth() + 1)}/${d.getFullYear()} ${dois(
    d.getHours(),
  )}:${dois(d.getMinutes())}`;
}

/**
 * O andamento inteiro em frases, do mais antigo ao mais novo.
 *
 * @param {Array<object>} eventos  saida de lerAndamentoCompleto()
 * @returns {Array<{quando, tipo, texto, intervalo}>}
 */
export function narrar(eventos) {
  const lista = (eventos || []).filter((e) => e && e.quando);
  const saida = [];
  let anterior = null;

  for (const evento of lista) {
    const par =
      evento.tipo === 'remetido' || evento.tipo === 'recebido' ? parDe(evento, lista) : null;

    // O envio ja foi dito inteiro na linha do "remetido", com destino e tudo.
    if (evento.tipo === 'recebido' && par) continue;

    saida.push({
      quando: evento.quando,
      tipo: evento.tipo,
      texto: frasear(evento, evento.tipo === 'remetido' && par ? par.unidade : null),
      intervalo: anterior ? intervalo(anterior.quando, evento.quando) : '',
    });
    anterior = evento;
  }

  return saida;
}
