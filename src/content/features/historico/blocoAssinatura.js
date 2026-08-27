/**
 * blocoAssinatura.js - le o bloco de assinatura impresso no corpo do documento.
 *
 * Todo documento assinado no SEI carrega, no proprio HTML, um texto no rodape:
 *
 *   "Documento assinado eletronicamente por Fulano de Tal, Estagiario,
 *    em 02/07/2026, as 16:59, conforme art. 1o, III, 'b', da Lei 11.419/2006."
 *
 * e, junto do QR Code:
 *
 *   "...informando o codigo verificador 00009400 e o codigo CRC 00E15CA6."
 *
 * Essa e a melhor fonte que existe: e texto, nao icone nem classe, entao
 * sobrevive a troca de tema e de versao; da o nome de quem assinou, o cargo e
 * a data/hora EXATAS; e funciona retroativamente, em qualquer documento antigo
 * que o usuario abrir.
 *
 * Um documento pode ter varias assinaturas - devolvemos todas.
 */

/**
 * Captura ate ", em <data>, as <hora>". O trecho antes disso e
 * "Nome da Pessoa, Cargo", separado pela ULTIMA virgula.
 *
 * A virgula antes de "em" e opcional: quem ancora o match e a data, entao um
 * cargo como "Analista em Sistemas" nao confunde o parser.
 */
const RE_ASSINATURA =
  /assinado eletronicamente por\s+([\s\S]{3,160}?),?\s*em\s+(\d{1,2}\/\d{1,2}\/\d{4}),?\s*[àa]s\s+(\d{1,2}:\d{2})/gi;

const RE_CODIGO = /c[oó]digo verificador\s+(\d{4,})/i;

/**
 * '02/07/2026' + '16:59' -> ISO no fuso local do usuario.
 *
 * Cuidado: o construtor Date NAO rejeita valores fora de faixa, ele os
 * transborda - new Date(2026, 98, 99) vira 2034. Por isso conferimos, depois
 * de montar, se a data resultante e mesmo a que foi lida.
 */
function paraIso(data, hora) {
  const [dia, mes, ano] = data.split('/').map(Number);
  const [h, min] = hora.split(':').map(Number);

  if (![dia, mes, ano, h, min].every(Number.isInteger)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  if (h > 23 || min > 59) return null;
  if (ano < 1990 || ano > 2200) return null;

  const d = new Date(ano, mes - 1, dia, h, min, 0, 0);
  const coerente =
    d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;

  return coerente ? d.toISOString() : null;
}

/** 'Fulano de Tal, Estagiario' -> { nome, cargo } */
function separarNomeECargo(trecho) {
  const limpo = trecho.replace(/\s+/g, ' ').trim();
  const corte = limpo.lastIndexOf(',');

  // Sem virgula: so temos o nome.
  if (corte === -1) return { nome: limpo, cargo: null };

  const nome = limpo.slice(0, corte).trim();
  const cargo = limpo.slice(corte + 1).trim();

  // Se o "cargo" parecer parte do nome (muito curto), desiste da separacao.
  if (!cargo || cargo.length < 2) return { nome: limpo, cargo: null };
  return { nome, cargo };
}

/**
 * @param {string} texto  textContent do documento
 * @returns {Array<{assinante: string, cargo: string|null, quando: string}>}
 */
export function lerAssinaturas(texto) {
  if (!texto) return [];

  const achados = [];
  const vistos = new Set();

  for (const m of texto.matchAll(RE_ASSINATURA)) {
    const quando = paraIso(m[2], m[3]);
    if (!quando) continue;

    const { nome, cargo } = separarNomeECargo(m[1]);
    if (!nome) continue;

    // O mesmo bloco costuma aparecer duas vezes (visivel + versao para impressao).
    const chave = `${nome}|${quando}`;
    if (vistos.has(chave)) continue;
    vistos.add(chave);

    achados.push({ assinante: nome, cargo, quando });
  }

  return achados;
}

/** Numero do documento ("codigo verificador") impresso junto do QR Code. */
export function lerCodigoVerificador(texto) {
  const m = (texto || '').match(RE_CODIGO);
  return m ? m[1] : null;
}

/**
 * Le tudo que da para saber sobre o documento aberto.
 * @param {Document} doc
 */
export function lerDocumento(doc = document) {
  const texto = (doc.body && doc.body.textContent) || '';
  return {
    assinaturas: lerAssinaturas(texto),
    codigoVerificador: lerCodigoVerificador(texto),
  };
}
