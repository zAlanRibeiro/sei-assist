/**
 * identidade.js - "este evento e meu?"
 *
 * O SEI identifica a mesma pessoa de duas formas: a assinatura traz o nome
 * completo ("Alan Doyle Costa Ribeiro") e o andamento traz o login, que neste
 * orgao e o e-mail institucional ("alan.ribeiro@nittrans.niteroi.rj.gov.br").
 *
 * Esta regra fica isolada aqui porque e usada em dois momentos diferentes -
 * na hora de gravar (para nao guardar evento de colega) e na hora de listar.
 * Se as duas divergissem, apareceria no painel algo que nao deveria estar la.
 */

/**
 * Piso para comparar por substring. Sem ele, um autor de uma ou duas letras
 * casaria com qualquer e-mail e deixaria passar evento de outra pessoa.
 */
export const MIN_IDENTIDADE = 4;

const normalizar = (x) => String(x || '').toLowerCase().trim();

/** Limpa e descarta identidades curtas demais para serem confiaveis. */
export function prepararIdentidades(lista) {
  const limpas = (lista || []).map(normalizar).filter((x) => x.length >= MIN_IDENTIDADE);
  return [...new Set(limpas)];
}

/**
 * O autor de um evento e uma das identidades conhecidas?
 *
 * A comparacao vai nos dois sentidos de proposito: se o SEI mostrar so a parte
 * antes do @, o e-mail configurado ainda contem aquele pedaco.
 *
 * @param {string|null} autor  nome ou login que veio do SEI
 * @param {string[]} identidades  ja passadas por prepararIdentidades()
 */
export function ehMinha(autor, identidades) {
  const quem = normalizar(autor);
  if (quem.length < MIN_IDENTIDADE) return false;
  if (!identidades || !identidades.length) return false;

  return identidades.some((eu) => quem.includes(eu) || eu.includes(quem));
}

/**
 * Fontes em que o ato e, por definicao, do usuario: ele estava na tela
 * clicando - assinou, enviou ou criou. Registro vindo dai nunca e descartado por nao casar com a
 * identidade configurada - se fosse, um erro de digitacao nas opcoes apagaria
 * justamente o que a pessoa fez.
 */
export const FONTES_DO_PROPRIO_USUARIO = new Set(['assinatura', 'envio', 'criacao']);

export function ehDoProprioAto(registro) {
  return FONTES_DO_PROPRIO_USUARIO.has(registro?.origem);
}
