/**
 * hotkeys.js - atalhos de teclado.
 *
 * Cuidados especificos do SEI:
 *  - O SEI usa accesskey (Alt+letra) em varios botoes. Evite Alt sozinho.
 *  - A tela e feita de iframes, entao o listener e registrado em cada frame.
 *  - Por padrao o atalho e ignorado quando o foco esta em campo de texto ou
 *    dentro do editor de documentos (CKEditor).
 */
import { log } from './log.js';

const registrados = new Map(); // combo normalizado -> { handler, opcoes }
let ligado = false;

const MODIFICADORES = ['ctrl', 'alt', 'shift', 'meta'];

/** 'Ctrl+Shift+K' -> 'ctrl+shift+k' (ordem fixa dos modificadores) */
function normalizarCombo(combo) {
  const partes = combo
    .toLowerCase()
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  const mods = MODIFICADORES.filter((m) => partes.includes(m));
  const teclas = partes.filter((p) => !MODIFICADORES.includes(p));
  return [...mods, ...teclas].join('+');
}

function comboDoEvento(ev) {
  const partes = [];
  if (ev.ctrlKey) partes.push('ctrl');
  if (ev.altKey) partes.push('alt');
  if (ev.shiftKey) partes.push('shift');
  if (ev.metaKey) partes.push('meta');
  const tecla = ev.key ? ev.key.toLowerCase() : '';
  if (tecla && !MODIFICADORES.includes(tecla) && tecla !== 'control') partes.push(tecla);
  return partes.join('+');
}

function estaDigitando(alvo) {
  if (!alvo) return false;
  if (alvo.isContentEditable) return true;
  const tag = alvo.tagName ? alvo.tagName.toLowerCase() : '';
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    const tipo = (alvo.type || 'text').toLowerCase();
    return !['button', 'submit', 'checkbox', 'radio', 'file', 'reset'].includes(tipo);
  }
  return false;
}

function aoTeclar(ev) {
  const registro = registrados.get(comboDoEvento(ev));
  if (!registro) return;
  if (estaDigitando(ev.target) && !registro.opcoes.mesmoDigitando) return;

  ev.preventDefault();
  ev.stopPropagation();
  try {
    registro.handler(ev);
  } catch (err) {
    log.error('erro no atalho:', err);
  }
}

/**
 * @param {string} combo ex.: 'Ctrl+Shift+K'
 * @param {(ev: KeyboardEvent) => void} handler
 * @param {{mesmoDigitando?: boolean, descricao?: string}} [opcoes]
 * @returns {() => void} funcao para remover o atalho
 */
export function registrarAtalho(combo, handler, opcoes = {}) {
  const chave = normalizarCombo(combo);
  if (registrados.has(chave)) log.warn(`atalho ${combo} ja registrado - sobrescrevendo`);
  registrados.set(chave, { handler, opcoes });

  if (!ligado) {
    document.addEventListener('keydown', aoTeclar, true);
    ligado = true;
  }
  log.debug(`atalho registrado: ${combo}`, opcoes.descricao || '');
  return () => registrados.delete(chave);
}

/** Lista os atalhos ativos neste frame (usado pela tela de ajuda/opcoes). */
export function atalhosAtivos() {
  return Array.from(registrados.entries()).map(([combo, r]) => ({
    combo,
    descricao: r.opcoes.descricao || '',
  }));
}
