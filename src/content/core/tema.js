/**
 * tema.js - faz o painel vestir as cores do SEI do usuario.
 *
 * Cada orgao instala o SEI com um tema proprio, e o usuario ainda troca de
 * tema no menu dele (inclusive para o escuro). Fixar cores nossas fazia o
 * painel parecer colado por cima do sistema em vez de fazer parte dele.
 *
 * A leitura e por `getComputedStyle` de elementos que o SEI ja pinta, e nao
 * por nome de tema ou arquivo CSS. E de proposito: funciona em tema que eu
 * nunca vi, inclusive nos que o orgao inventar depois - e coopera com o Dark
 * Reader, que tambem reescreve o estilo computado.
 *
 * O que NAO muda com o tema: as cores que carregam significado. Verde continua
 * ASSINADO, azul continua ENVIADO, roxo processo, laranja documento, e o
 * aviso continua ambar. Elas so deslizam na luminosidade quando o fundo pede,
 * o que preserva a identidade sem perder a legibilidade.
 */
import { documentosAcessiveis } from './dom.js';
import { log } from './log.js';
import {
  BRANCO,
  PRETO,
  ajustarContraste,
  contraste,
  deHsl,
  ehEscura,
  lerCor,
  melhorTextoSobre,
  misturar,
  paraHex,
  paraHsl,
  sobrepor,
} from './cor.js';

/**
 * Onde procurar cada cor na tela do SEI.
 *
 * CONFIRMADO no HTML: <div id="divInfraBarraSistema"> existe no SEI 5.0.4.
 * Os demais candidatos sao de outras versoes e servem de rede. Se nenhum
 * casar, o padrao gov.br assume - degrada em silencio, nunca quebra.
 */
const FONTES = {
  /**
   * A barra superior e onde o tema aparece mais forte: e ela que muda de cor
   * quando se troca o tema no menu do usuario.
   */
  primaria: [
    '#divInfraBarraSistema',
    '.infraBarraSistema',
    '#divInfraBarraSuperior',
    '#divInfraCabecalho',
    'div[id*="BarraSistema" i]',
  ],
  /** Fundo e texto: o corpo da pagina, que todo tema pinta. */
  superficie: ['body', 'html'],
};

/** Padrao gov.br - o que valia antes deste modulo existir. */
const PADRAO = { fundo: '#ffffff', texto: '#1c1c1c', primaria: '#1351b4' };

const SEMANTICAS = { sucesso: '#168821', alerta: '#b8860b', erro: '#c62828' };

/** As quatro cores que identificam um tipo de evento no historico. */
const EVENTOS = {
  assinatura: '#168821',
  envio: '#1351b4',
  'processo-criado': '#6d28d9',
  'documento-criado': '#b45309',
};

/** Primeira cor visivel entre os candidatos, ou null. */
function corComputada(doc, seletores, propriedade) {
  const janela = doc.defaultView;
  if (!janela) return null;

  for (const seletor of seletores) {
    let alvo;
    try {
      alvo = doc.querySelector(seletor);
    } catch {
      continue; // seletor invalido em algum navegador: segue para o proximo
    }
    if (!alvo) continue;

    const cor = lerCor(janela.getComputedStyle(alvo)[propriedade]);
    // Fundo transparente nao diz nada sobre o tema; continua procurando.
    if (cor && cor.a > 0.1) return cor;
  }
  return null;
}

/**
 * Entre as leituras, a do primeiro documento que tem fundo PROPRIO.
 *
 * Fundo e texto saem sempre do MESMO documento. Misturar o fundo de um com o
 * texto de outro monta um par que pode nao contrastar - fundo escuro do topo
 * com texto escuro do frame, por exemplo.
 *
 * Ninguem com fundo proprio significa pagina inteira transparente: o padrao
 * assume, que e o que valia antes.
 */
export function escolherSuperficie(leituras) {
  for (const leitura of leituras || []) {
    if (leitura && leitura.fundo) return leitura;
  }
  return { fundo: null, texto: null };
}

/**
 * Colhe as cores de origem na pagina.
 *
 * Fundo e texto vem, de preferencia, do frame local - e sobre ele que o painel
 * flutua. Mas frame do SEI costuma ser TRANSPARENTE: quem pinta o escuro e o
 * documento de fora. Sem olhar para os vizinhos, um SEI escuro produzia painel
 * claro dentro do frame do conteudo - branco no meio do preto.
 *
 * A cor de destaque vem de onde estiver a barra do SEI, normalmente o topo.
 */
export function lerFontesDoSei(doc = document) {
  const ordem = [doc, ...documentosAcessiveis().filter((outro) => outro !== doc)];
  const { fundo, texto } = escolherSuperficie(
    ordem.map((outro) => ({
      fundo: corComputada(outro, FONTES.superficie, 'backgroundColor'),
      texto: corComputada(outro, FONTES.superficie, 'color'),
    })),
  );

  let primaria = null;
  for (const outro of documentosAcessiveis()) {
    primaria = corComputada(outro, FONTES.primaria, 'backgroundColor');
    if (primaria) break;
  }

  return { fundo, texto, primaria };
}

/**
 * Transforma as cores colhidas na paleta completa do painel.
 *
 * Funcao pura: entra o que se leu da tela, sai o mapa de custom properties.
 * Fica separada da leitura justamente para poder ser testada sem navegador.
 */
export function derivarPaleta(entrada = {}) {
  // Achata contra branco: fundo semitransparente e comum e, sem isso, a
  // luminancia sairia a de preto puro e o tema decidiria escuro por engano.
  const fundo = sobrepor(lerCor(entrada.fundo) || lerCor(PADRAO.fundo), BRANCO);
  const escuro = ehEscura(fundo);
  const extremo = escuro ? BRANCO : PRETO;

  let texto = lerCor(entrada.texto);
  if (texto) texto = sobrepor(texto, fundo);
  // Texto que nao le sobre o proprio fundo e leitura errada, nao escolha de
  // tema: descarta e usa o que contrasta.
  if (!texto || contraste(texto, fundo) < 4.5) texto = melhorTextoSobre(fundo);

  let primaria = lerCor(entrada.primaria);
  if (primaria) primaria = sobrepor(primaria, fundo);
  // Barra que nao se distingue do fundo nao serve como cor de destaque.
  if (!primaria || contraste(primaria, fundo) < 1.15) primaria = lerCor(PADRAO.primaria);

  const cores = {
    'cor-fundo': fundo,
    'cor-superficie': misturar(fundo, extremo, 0.07),
    'cor-superficie-alta': misturar(fundo, extremo, 0.14),

    'cor-texto': texto,
    'cor-texto-suave': misturar(texto, fundo, 0.32),
    'cor-texto-fraco': misturar(texto, fundo, 0.52),
    'cor-borda': misturar(texto, fundo, 0.72),
    'cor-borda-suave': misturar(texto, fundo, 0.86),

    'cor-primaria': primaria,
    // Preenchimento de barra aceita contraste menor que texto. Onde a cor de
    // destaque vira titulo ou link, e esta variante que entra.
    'cor-primaria-realce': ajustarContraste(primaria, fundo, 4.5),
    'cor-primaria-texto': melhorTextoSobre(primaria),
  };

  for (const [nome, hex] of Object.entries(SEMANTICAS)) {
    cores[`cor-${nome}`] = ajustarContraste(lerCor(hex), fundo, 4.5);
  }

  // Aviso: mantem a matiz ambar, so acompanha a claridade do tema.
  //
  // Misturar a cor de alerta com o fundo parece o caminho obvio e nao e: no
  // tema claro o ambar ja vem escurecido para contrastar, e diluir esse marrom
  // em branco da um tan acinzentado, nao o creme que se espera de um aviso.
  // Fixando matiz e saturacao e movendo so a luminosidade, a cor continua
  // reconhecivel como aviso nos dois temas.
  const matizAlerta = paraHsl(lerCor(SEMANTICAS.alerta)).h;
  const claridadeFundo = paraHsl(fundo).l;
  const avisoFundo = deHsl({
    h: matizAlerta,
    s: escuro ? 0.45 : 0.75,
    l: escuro ? claridadeFundo + 0.09 : claridadeFundo - 0.07,
  });
  cores['cor-aviso-fundo'] = avisoFundo;
  cores['cor-aviso-texto'] = ajustarContraste(lerCor(SEMANTICAS.alerta), avisoFundo, 4.5);

  for (const [nome, hex] of Object.entries(EVENTOS)) {
    const base = lerCor(hex);
    // Preenchimento da etiqueta: intocado. Cor cheia com texto branco ja
    // atravessa qualquer tema, e e o que garante que ASSINADO seja sempre o
    // mesmo verde, em qualquer orgao.
    cores[`ev-${nome}`] = base;
    // Faixa lateral e texto: vivem sobre o fundo do painel, entao deslizam na
    // luminosidade o minimo necessario para aparecer. A matiz nao muda.
    cores[`ev-${nome}-realce`] = ajustarContraste(base, fundo, 3);
  }

  const paleta = {};
  for (const [nome, cor] of Object.entries(cores)) paleta[`--seix-${nome}`] = paraHex(cor);

  // Diz ao navegador com que tema pintar input, select e barra de rolagem
  // dentro do painel. Antes isto era fixo em `light`, o que deixava os
  // controles claros dentro de um SEI escuro.
  paleta['--seix-esquema'] = escuro ? 'dark' : 'light';
  // Em tema escuro, escurecer no hover nao aparece: o realce tem que clarear.
  paleta['--seix-brilho-hover'] = escuro ? '1.35' : '0.96';
  paleta['--seix-sombra'] = escuro
    ? '0 6px 22px rgba(0, 0, 0, 0.6)'
    : '0 4px 16px rgba(0, 0, 0, 0.18)';

  return paleta;
}

/**
 * Le a pagina e escreve a paleta na raiz do documento.
 *
 * Escreve em `document.documentElement` porque e onde o content.css declara os
 * padroes: assim tudo que a extensao injeta herda, esteja pendurado onde
 * estiver. Nao ha risco de vazar para o SEI - todo token e prefixado `--seix-`.
 */
export function aplicarTema(doc = document) {
  try {
    const paleta = derivarPaleta(lerFontesDoSei(doc));
    const raiz = doc.documentElement;
    for (const [nome, valor] of Object.entries(paleta)) raiz.style.setProperty(nome, valor);
    log.debug('tema derivado do SEI', {
      fundo: paleta['--seix-cor-fundo'],
      primaria: paleta['--seix-cor-primaria'],
      esquema: paleta['--seix-esquema'],
    });
    return paleta;
  } catch (err) {
    // Tema e enfeite: se falhar, o content.css ja traz o padrao gov.br.
    log.warn('nao foi possivel derivar o tema do SEI; usando o padrao:', err);
    return null;
  }
}
