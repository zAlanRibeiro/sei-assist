/**
 * nup.js - o Numero Unico de Protocolo do SEI.
 *
 * Mora no nucleo porque duas features dependem dele: o historico, para saber
 * a que processo um registro pertence, e a copia rapida, para achar o numero
 * na tela.
 *
 * O formato NAO e o mesmo em todo lugar. O primeiro padrao abaixo e o de
 * Niteroi/RJ e nao segue o do SEI federal - foi exatamente esse o primeiro
 * defeito real do projeto, com a extensao nao reconhecendo nenhum processo.
 */

export const PADROES_NUP = [
  // Niteroi/RJ: NIT-050131/000463/2026
  /\b[A-Z]{2,5}-\d{5,6}\/\d{5,6}\/\d{4}\b/,
  // Padrao CONARQ: 00000.000000/0000-00
  /\b\d{5}\.\d{6}\/\d{4}-\d{2}\b/,
  // Variacoes sem pontuacao
  /\b\d{5}\s?\d{6}\/\d{4}-?\d{2}\b/,
];

/** O primeiro NUP encontrado no texto, ou null. */
export function acharNup(texto) {
  if (!texto) return null;
  for (const padrao of PADROES_NUP) {
    const m = texto.match(padrao);
    if (m) return m[0];
  }
  return null;
}

/**
 * O texto e um NUP e nada mais?
 *
 * Diferente de acharNup(): aqui o texto inteiro tem de ser o numero. E o que
 * separa "o link do processo" de "uma frase que menciona o processo" - so o
 * primeiro merece um botao de copiar do lado.
 */
export function ehNupExato(texto) {
  const limpo = String(texto || '').trim();
  if (!limpo) return null;
  const nup = acharNup(limpo);
  return nup === limpo ? nup : null;
}
