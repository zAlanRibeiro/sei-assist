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

export const log = {
  debug: (...args) => debugAtivo() && console.debug(PREFIXO, ...args),
  info: (...args) => debugAtivo() && console.info(PREFIXO, ...args),
  warn: (...args) => console.warn(PREFIXO, ...args),
  error: (...args) => console.error(PREFIXO, ...args),
};
