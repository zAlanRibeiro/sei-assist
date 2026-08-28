/**
 * nivelAcesso.js - descobrir se o documento e publico, restrito ou sigiloso.
 *
 * POR QUE ISTO EXISTE: o rascunho e a unica parte da extensao que guarda
 * CONTEUDO de documento, e `chrome.storage.local` nao e criptografado. Quem
 * tiver acesso ao perfil do navegador le o que esta la. Guardar o texto de um
 * documento restrito do mesmo jeito que o de um publico e uma escolha que
 * ninguem fez conscientemente - foi so o que aconteceu.
 *
 * ATENCAO - A DETECCAO AINDA NAO FOI CONFIRMADA.
 *
 * Nunca vi o HTML da janela do editor com um documento restrito aberto. Os
 * candidatos abaixo sao suposicoes fundamentadas, e neste projeto TODA
 * suposicao sobre HTML que eu nao vi tinha pelo menos um erro. Por isso:
 *
 *   - o resultado tem TRES estados, e nao dois: publico, restrito e
 *     DESCONHECIDO. Fingir que "nao achei" e "e publico" seria transformar
 *     falha de leitura em permissao;
 *   - a politica do desconhecido e do usuario, nao minha (ver `podeGuardar`);
 *   - `diagnosticar()` existe para fechar essa lacuna com evidencia em vez de
 *     mais um chute. Foi o que destravou o alerta de bloco.
 */
import { qsa } from '../../core/dom.js';
import { log } from '../../core/log.js';

export const PUBLICO = 'publico';
export const RESTRITO = 'restrito';
export const SIGILOSO = 'sigiloso';
export const DESCONHECIDO = 'desconhecido';

/**
 * Onde o nivel de acesso pode estar.
 *
 * CONFIRMAR: se `diagnosticar()` mostrar que a janela do editor nao traz nada
 * disso, o caminho seguinte e o `window.opener` - a arvore do processo marca o
 * documento restrito com um icone proprio. E um salto a mais, e so vale a pena
 * com o HTML na mao.
 */
export const NIVEL = {
  // Campos que o SEI usa nas telas de cadastro de documento.
  campos: [
    '#optRestrito',
    '#optSigiloso',
    '#optPublico',
    'input[name*="Acesso" i]:checked',
    'input[name*="Restrito" i]',
    '[id*="NivelAcesso" i]',
    '[name*="NivelAcesso" i]',
  ],

  // Texto visivel: "Nivel de Acesso: Restrito".
  //
  // \p{L} e nao uma lista de letras acentuadas: a primeira versao usava
  // [a-zçãí] e engolia o "u" de "Publico", capturando so o "P". Enumerar
  // acento a mao erra sempre - e errou aqui.
  rotulo: /n[ií]vel\s+de\s+acesso\s*:?\s*(\p{L}+)/iu,

  // A palavra solta, para quando ela aparece sem rotulo (titulo, selo, alt).
  palavra: /\b(p[uú]blico|restrito|sigiloso)\b/i,
};

/** A palavra do nivel, venha de onde vier, virando um dos tres estados. */
export function classificar(texto) {
  const t = String(texto || '');
  if (!t.trim()) return DESCONHECIDO;

  // A ordem importa: o mais fechado ganha. Uma tela que diga "restrito" e
  // "publico" ao mesmo tempo tem de ser tratada como restrita.
  if (/sigiloso/i.test(t)) return SIGILOSO;
  if (/restrito/i.test(t)) return RESTRITO;
  if (/p[uú]blico/i.test(t)) return PUBLICO;
  return DESCONHECIDO;
}

/** O nivel esconde o conteudo de quem nao e da unidade? */
export function ehFechado(nivel) {
  return nivel === RESTRITO || nivel === SIGILOSO;
}

/**
 * Le o nivel de acesso da tela.
 *
 * Devolve DESCONHECIDO com folga: e o estado honesto quando a leitura falha, e
 * quem decide o que fazer com ele e a politica, nao esta funcao.
 */
export function lerNivel(doc = document) {
  for (const seletor of NIVEL.campos) {
    let achados;
    try {
      achados = qsa(seletor, doc);
    } catch {
      continue; // seletor que algum navegador nao aceita: segue
    }
    for (const campo of achados) {
      // Radio ou caixa NAO marcada nao diz nada: a tela de cadastro traz as
      // tres opcoes lado a lado, sempre. Sem esta linha, achar #optRestrito no
      // HTML - que esta la em todo documento - marcaria todo documento como
      // restrito, e o rascunho morreria para todo mundo.
      const tipo = String((campo.getAttribute && campo.getAttribute('type')) || '').toLowerCase();
      if ((tipo === 'radio' || tipo === 'checkbox') && !campo.checked) continue;

      // O rotulo do proprio campo diz mais que o valor: value costuma ser
      // codigo numerico ("0", "1", "2"), que nao se interpreta sem tabela.
      const perto = `${campo.getAttribute('id') || ''} ${campo.getAttribute('name') || ''} ${
        campo.getAttribute('title') || ''
      } ${campo.parentElement ? campo.parentElement.textContent || '' : ''}`;
      const nivel = classificar(perto);
      if (nivel !== DESCONHECIDO) return nivel;
    }
  }

  const corpo = (doc.body && doc.body.textContent) || '';
  const rotulado = corpo.match(NIVEL.rotulo);
  if (rotulado) {
    const nivel = classificar(rotulado[1]);
    if (nivel !== DESCONHECIDO) return nivel;
  }

  return DESCONHECIDO;
}

/**
 * O que a tela mostra sobre nivel de acesso, para quem for confirmar.
 *
 * Nao decide nada: so relata. Existe porque adivinhar seletor contra HTML que
 * eu nunca vi foi, todas as vezes, mais lento que pedir a tela.
 */
export function diagnosticar(doc = document) {
  const corpo = (doc.body && doc.body.textContent) || '';
  const relato = {
    nivel: lerNivel(doc),
    temRotulo: NIVEL.rotulo.test(corpo),
    palavrasNaTela: [...new Set((corpo.match(new RegExp(NIVEL.palavra, 'gi')) || []).map((p) => p.toLowerCase()))],
    camposAchados: NIVEL.campos.filter((s) => {
      try {
        return qsa(s, doc).length > 0;
      } catch {
        return false;
      }
    }),
  };
  log.debug('nivel de acesso: o que esta na tela', relato);
  return relato;
}
