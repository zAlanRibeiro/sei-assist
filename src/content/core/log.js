/**
 * Log com prefixo, silencioso por padrao.
 * Ligue no console da pagina com: localStorage.setItem('seix:debug', '1')
 */
import { NOME } from '../../shared/constantes.js';

const PREFIXO = `[${NOME}]`;

function debugAtivo() {
  try {
    return localStorage.getItem('seix:debug') === '1';
  } catch {
    return false; // paginas com storage bloqueado
  }
}

/**
 * Objeto simples vira JSON; o resto passa intacto.
 *
 * MOTIVO CONCRETO: a pagina de erros da extensao nao mostra objeto - ela
 * converte cada argumento em texto, e um diagnostico inteiro virava
 * "[object Object]". Justo onde o usuario le. O DevTools perde a arvore
 * expansivel, mas texto legivel em todo lugar vale mais que arvore legivel
 * em um lugar so.
 *
 * Error passa inteiro - e a pilha que interessa nele, e serializar apagaria
 * justamente isso. Nao ha teste separado para Error porque nao ha ramo
 * separado: Error nao e objeto SIMPLES, entao a condicao abaixo ja o deixa
 * passar. Um `instanceof Error` aqui seria linha morta.
 */
export function formatar(valor) {
  if (valor === null || typeof valor !== 'object') return valor;

  const ehSimples = Array.isArray(valor) || Object.getPrototypeOf(valor) === Object.prototype;
  if (!ehSimples) return valor;

  try {
    return JSON.stringify(valor);
  } catch {
    return valor; // ciclo, getter que explode: melhor o objeto que nada
  }
}

const legivel = (args) => args.map(formatar);

export const log = {
  debug: (...args) => debugAtivo() && console.debug(PREFIXO, ...legivel(args)),
  info: (...args) => debugAtivo() && console.info(PREFIXO, ...legivel(args)),
  warn: (...args) => console.warn(PREFIXO, ...legivel(args)),
  error: (...args) => console.error(PREFIXO, ...legivel(args)),
};
