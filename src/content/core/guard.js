/**
 * guard.js — trava de seguranca.
 *
 * Regra do projeto: NENHUMA feature pode disparar por conta propria uma acao
 * que assina, envia, tramita, conclui, publica ou exclui algo no SEI. Esses
 * atos tem efeito juridico e sao irreversiveis.
 *
 * Toda feature que precise clicar em algo deve usar `cliqueSeguro()`. Se o
 * alvo bater na lista abaixo, o clique so acontece depois de uma confirmacao
 * explicita do usuario — e mesmo assim so se a feature pedir por isso.
 */
import { norm, textoDe } from './dom.js';
import { confirmar } from './ui.js';
import { log } from './log.js';

/** Rotulos/acoes considerados irreversiveis. */
const PADROES_CRITICOS = [
  /\bassinar\b/,
  /\bassinatura\b/,
  /\benviar processo\b/,
  /\benviar documento\b/,
  /\btramitar\b/,
  /\bconcluir\b/,
  /\bfinalizar\b/,
  /\bexcluir\b/,
  /\bcancelar documento\b/,
  /\bpublicar\b/,
  /\bpeticionar\b/,
  /\bdisponibilizar\b/,
  /\bencerrar\b/,
  /\breabrir\b/,
  /\banexar processo\b/,
];

/** Acoes do controlador.php que nunca devem ser navegadas por script. */
const ACOES_CRITICAS = [
  'documento_assinar',
  'procedimento_enviar',
  'procedimento_concluir',
  'documento_excluir',
  'procedimento_excluir',
  'documento_publicar',
  'procedimento_anexar',
];

export function ehCritico(alvo) {
  const texto = norm(typeof alvo === 'string' ? alvo : textoDe(alvo));
  if (PADROES_CRITICOS.some((re) => re.test(texto))) return true;

  if (typeof alvo !== 'string') {
    const href = alvo?.getAttribute?.('href') || alvo?.getAttribute?.('onclick') || '';
    if (ACOES_CRITICAS.some((acao) => href.includes(acao))) return true;
  }
  return false;
}

/**
 * Clica em um elemento respeitando a trava.
 * @param {Element} elemento
 * @param {{motivo?: string, permitirCritico?: boolean}} opcoes
 * @returns {Promise<boolean>} true se o clique aconteceu
 */
export async function cliqueSeguro(elemento, { motivo = '', permitirCritico = false } = {}) {
  if (!elemento) return false;

  if (ehCritico(elemento)) {
    if (!permitirCritico) {
      log.warn('clique bloqueado (acao critica):', textoDe(elemento).trim());
      return false;
    }
    const rotulo = textoDe(elemento).trim() || 'esta acao';
    const ok = await confirmar({
      titulo: 'Confirmar ação irreversível',
      texto: `A extensão vai acionar "${rotulo}".${motivo ? `\n\nMotivo: ${motivo}` : ''}\n\nEsta ação pode ter efeito jurídico e não pode ser desfeita. Deseja continuar?`,
      confirmarTexto: 'Sim, continuar',
    });
    if (!ok) return false;
  }

  elemento.click();
  return true;
}

/** Igual a cliqueSeguro, mas para navegacao por URL. */
export function navegacaoPermitida(url) {
  return !ACOES_CRITICAS.some((acao) => String(url).includes(`acao=${acao}`));
}
