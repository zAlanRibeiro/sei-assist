/**
 * nivelAcesso.js - descobrir se o documento e publico, restrito ou sigiloso.
 *
 * POR QUE ISTO EXISTE: o rascunho e a unica parte da extensao que guarda
 * CONTEUDO de documento, e `chrome.storage.local` nao e criptografado. Quem
 * tiver acesso ao perfil do navegador le o que esta la. Guardar o texto de um
 * documento restrito do mesmo jeito que o de um publico e uma escolha que
 * ninguem fez conscientemente - foi so o que aconteceu.
 *
 * DE ONDE VEM A RESPOSTA: da ARVORE do processo, nao da janela do editor.
 * O editor abre numa janela propria e nao mostra nivel de acesso nenhum; quem
 * mostra e a arvore, no frame ifrArvore da janela que abriu o editor. Por isso
 * a leitura atravessa `window.opener`.
 *
 * O resto deste arquivo (campos e rotulo em texto) e um plano B para telas em
 * que a arvore nao esta ao alcance, e continua NAO CONFIRMADO. Em todo caso:
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
 * O marcador de acesso na arvore do processo.
 *
 * CONFIRMADO no HTML (ifrArvore de procedimento_visualizar, SEI 5.0.4):
 *
 *   <a id="anchorNA11970" class="infraArvoreNoAcao">
 *     <img id="iconNA11970" title="Acesso Restrito
 *          Informacao Pessoal (Art. 31 da Lei ...)" src="processo_restrito.svg">
 *   </a>
 *
 * NA e "Nivel de Acesso". O no so existe quando o documento tem acesso
 * fechado: os publicos da mesma arvore (11965, 12038, 12577...) nao tem
 * nenhum `anchorNA`. E dai que vem a inferencia mais util daqui - AUSENCIA do
 * marcador significa publico -, e e por isso que ela so vale depois de achar o
 * documento na arvore. Nao achar a arvore nao e "publico": e desconhecido.
 */
export const ARVORE = {
  /** O no do documento. Confirma que estamos na arvore certa. */
  no: (id) => `#anchor${id}, #span${id}`,
  /** O marcador de acesso fechado daquele documento. */
  marcador: (id) => `#anchorNA${id}, #iconNA${id}`,
  /** A arvore inteira, para saber se este documento tem uma. */
  raiz: ['#divArvore', 'form#frmArvore', 'body.infraArvore'],
};

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
 * O nivel de um documento, lido na arvore do processo.
 *
 * Pura de proposito: recebe o documento da arvore e devolve o nivel, sem saber
 * de janela nenhuma. E a parte que da para testar.
 */
export function nivelNaArvore(docArvore, idDocumento) {
  const id = String(idDocumento || '').trim();
  if (!docArvore || !id) return DESCONHECIDO;

  // Sem arvore, ou com o documento fora dela, nao ha o que inferir. Devolver
  // PUBLICO aqui seria o erro grave: transformaria "nao olhei" em "pode
  // guardar".
  if (!qsa(ARVORE.raiz.join(', '), docArvore).length) return DESCONHECIDO;
  if (!qsa(ARVORE.no(id), docArvore).length) return DESCONHECIDO;

  const [marcador] = qsa(ARVORE.marcador(id), docArvore);
  if (!marcador) return PUBLICO;

  // O title diz a palavra ("Acesso Restrito"); o nome do icone confirma.
  const titulo = marcador.getAttribute('title') || '';
  const daImagem = qsa('img', marcador)[0];
  const fonte = `${titulo} ${daImagem ? daImagem.getAttribute('title') || '' : ''} ${
    daImagem ? daImagem.getAttribute('src') || '' : ''
  } ${marcador.getAttribute('src') || ''}`;

  // O nome do arquivo do icone entra em `fonte` de proposito: quando o title
  // nao diz a palavra, "processo_sigiloso.svg" diz. Nao ha ramo separado para
  // isso porque classificar() ja acha a palavra dentro do nome do arquivo.
  const pelaPalavra = classificar(fonte);
  if (pelaPalavra !== DESCONHECIDO) return pelaPalavra;

  // Marcador presente e ilegivel: fechado, sem saber qual. Restrito e o
  // palpite conservador, e o que importa para a politica e que nao e publico.
  return RESTRITO;
}

/**
 * Os documentos onde a arvore pode estar, a partir daqui.
 *
 * O editor do SEI abre em JANELA propria, entao `window.top` e ele mesmo e a
 * varredura normal de frames nao alcanca a arvore. Quem alcanca e
 * `window.opener`: a janela do SEI que abriu o editor, e os frames dela.
 */
export function documentosComArvore(janela = window) {
  const vistos = [];
  const juntar = (doc) => {
    if (doc && !vistos.includes(doc)) vistos.push(doc);
  };

  const varrer = (alvo) => {
    if (!alvo) return;
    try {
      juntar(alvo.document);
      for (let i = 0; i < alvo.frames.length; i++) {
        try {
          juntar(alvo.frames[i].document);
        } catch {
          /* frame de outra origem */
        }
      }
    } catch {
      /* janela inacessivel */
    }
  };

  varrer(janela);
  try {
    varrer(janela.opener);
  } catch {
    /* sem opener, ou de outra origem */
  }
  return vistos;
}

/**
 * O nivel do documento aberto, procurando a arvore onde ela estiver.
 *
 * Esta e a porta de entrada da feature. Tenta a arvore primeiro, porque e o
 * unico caminho confirmado; so entao cai para a leitura da tela local.
 */
export function descobrirNivel(idDocumento, janela = window) {
  for (const doc of documentosComArvore(janela)) {
    const nivel = nivelNaArvore(doc, idDocumento);
    if (nivel !== DESCONHECIDO) return nivel;
  }

  try {
    return lerNivel(janela.document);
  } catch {
    return DESCONHECIDO;
  }
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
