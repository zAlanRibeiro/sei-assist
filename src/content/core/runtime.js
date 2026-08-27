/**
 * runtime.js - o vinculo com a extensao, e o que fazer quando ele se rompe.
 *
 * Recarregar a extensao (ou atualiza-la) invalida o contexto de todo content
 * script ja injetado. O script continua vivo na pagina, mas qualquer chamada a
 * chrome.* passa a lancar "Extension context invalidated".
 *
 * Sem tratamento isso vira ruido: o MutationObserver continua disparando, cada
 * varredura tenta ler o storage, e o console enche de erro identico. Pior,
 * consome CPU a toa numa aba que nao vai mais funcionar.
 *
 * A regra aqui: na primeira chamada que revelar o rompimento, desligamos tudo
 * nesta aba, uma vez so, e em silencio. Nao e defeito - e o esperado depois de
 * uma recarga, e a solucao (F5) e do usuario.
 */
import { log } from './log.js';

let invalidado = false;
const aoMorrer = [];

/** chrome.runtime.id some quando o contexto e invalidado. */
export function contextoVivo() {
  if (invalidado) return false;
  try {
    return Boolean(chrome && chrome.runtime && chrome.runtime.id);
  } catch {
    return false;
  }
}

/** O erro veio do contexto rompido, e nao de um defeito nosso? */
export function ehContextoInvalidado(err) {
  const mensagem = String((err && err.message) || err || '');
  return /context invalidated|Extension context|message port closed|Receiving end does not exist/i.test(
    mensagem,
  );
}

/**
 * Registra o que desligar quando o vinculo se romper.
 * @returns {() => void} remove o registro
 */
export function aoInvalidarContexto(callback) {
  aoMorrer.push(callback);
  return () => {
    const i = aoMorrer.indexOf(callback);
    if (i >= 0) aoMorrer.splice(i, 1);
  };
}

/** Desliga a extensao nesta aba. Idempotente. */
export function marcarContextoInvalidado() {
  if (invalidado) return;
  invalidado = true;

  log.debug(
    'contexto da extensao invalidado (ela foi recarregada). ' +
      'Desligando nesta aba - recarregue a pagina para reativar.',
  );

  // splice esvazia a lista: cada desligamento roda uma vez so.
  for (const callback of aoMorrer.splice(0)) {
    try {
      callback();
    } catch {
      /* na hora de desligar, erro de desligamento nao interessa */
    }
  }
}

/**
 * Envolve uma chamada ao chrome.* que pode acontecer depois da recarga.
 *
 * @param {() => Promise<T>} acao
 * @param {T} padrao valor devolvido quando o contexto ja morreu
 * @param {string} descricao usada só na mensagem de erro real
 * @returns {Promise<T>}
 */
export async function comContexto(acao, padrao, descricao) {
  if (!contextoVivo()) return padrao;

  try {
    return await acao();
  } catch (err) {
    if (ehContextoInvalidado(err)) {
      marcarContextoInvalidado();
      return padrao;
    }
    log.error(`${descricao}:`, err);
    return padrao;
  }
}
