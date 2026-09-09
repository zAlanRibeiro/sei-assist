/**
 * seletores.js — onde os marcadores aparecem na lista de processos.
 *
 * Mesma disciplina do resto do projeto: o conhecimento frágil sobre o HTML do
 * SEI mora num arquivo só, para quem instalar em outro órgão ter um único
 * lugar para ajustar.
 *
 * A decisão que importa aqui é POR ONDE reconhecer um marcador. Ids de
 * imagem e nomes de arquivo mudam entre versões do SEI; o TEXTO que o sistema
 * escreve para o usuário, não. É o mesmo critério que já salvou a linha de
 * links do Controle de Processos (ver CONTROLE.rotulosDaLinha em
 * historico/seletores.js): procurar pelo rótulo visível, não pelo id.
 *
 * Então a regra é: um ícone é marcador quando o `title`/`alt`/`aria-label`
 * dele fala em marcador, OU quando algum atributo (src, href, class, id)
 * denuncia o arquivo do marcador e há um texto para dar nome a ele.
 *
 * A CONFIRMAR na instalação: o formato exato do title. As duas formas que o
 * SEI usa nas versões conhecidas estão cobertas por nomeDoMarcador().
 */
import { qsa, norm } from '../../core/dom.js';

export const LISTA = {
  /**
   * As tabelas de processo do Controle de Processos.
   *
   * O SEI divide a tela em "Recebidos" e "Gerados", cada um com sua tabela —
   * por isso a busca devolve uma LISTA, e não a primeira que aparecer.
   */
  porId: 'table[id^="tblProcessos"]',

  /**
   * Rede para instalações cujos ids não começam com tblProcessos: vale a
   * tabela que contenha link para abrir processo. Deliberadamente restrito:
   * pegar `table.infraTable` solta acertaria qualquer tabela da tela, e uma
   * tabela sem marcador nenhum sumiria inteira assim que um filtro ligasse.
   */
  linkDeProcesso: 'a[href*="procedimento_trabalhar"]',

  /**
   * Onde procurar o ícone dentro da linha. Lista fechada de propósito: varrer
   * '*' percorreria a tabela inteira a cada clique por ganho nenhum.
   */
  alvos: 'img, a, span, div, i',

  /** Onde o SEI escreve o nome do marcador para o usuário. */
  atributosDeTexto: ['title', 'alt', 'aria-label'],

  /** Onde o arquivo do marcador se denuncia, quando não há texto. */
  atributosDePista: ['src', 'href', 'class', 'id'],
};

/** "marcador", "marcadores", com ou sem acento — norm() tira o acento. */
const PISTA = /marcador/;

/** O rótulo que o SEI põe antes do nome: "Marcador: Amarelo". */
const ROTULO = /^marcador(?:es)?\s*[:–-]?\s*/i;

/**
 * Pontuação que sobra depois de tirar o rótulo.
 *
 * CONFIRMADO em leste.sei.rj.gov.br: o title vem "Marcador / Organização
 * Interna". Tirado o rótulo, sobrava a barra, e o botão do filtro se chamava
 * "/ Organização Interna".
 */
const SOBRA = /^[\s/|·•:,–-]+/;

/**
 * Cores dos marcadores do SEI, para pintar o botão do filtro.
 *
 * Puramente cosmético: marcador sem cor conhecida vira botão neutro, e o
 * filtro funciona igual. Nunca use isto para decidir o que é marcador — a cor
 * é o nome na maioria das unidades, mas nada impede alguém de criar um
 * marcador chamado "Urgente".
 */
const CORES = {
  amarelo: '#f0c419',
  azul: '#2a6ebb',
  verde: '#1e9e4a',
  vermelho: '#d13438',
  laranja: '#e07b16',
  roxo: '#7a3fb5',
  rosa: '#d6489a',
  marrom: '#8a5a2b',
  cinza: '#8f98a3',
  preto: '#2b2f36',
  branco: '#e6e9ee',
};

/* ------------------------------------------------------------------ nomes */

/**
 * Separa o nome do marcador do texto livre que a unidade escreve nele.
 *
 * O SEI conhece duas formas de montar esse title:
 *
 *   "Marcador: Amarelo"
 *   "Amarelo - Aguardando resposta da DIVIT"
 *
 * O texto livre é POR PROCESSO. Se ele entrasse no nome, cada processo viraria
 * um marcador diferente e o filtro não agruparia nada — que é justamente o
 * ponto da funcionalidade. Por isso o corte no primeiro " - " (e na primeira
 * quebra de linha, que é como algumas versões separam).
 *
 * O preço: um marcador cujo NOME contenha " - " perde a segunda metade. É
 * raro, e o filtro continua correto — só o rótulo do botão fica curto.
 */
export function nomeDoMarcador(bruto) {
  const inteiro = String(bruto || '');
  const [primeiraLinha, ...resto] = inteiro.split(/[\r\n]+/);

  const semRotulo = primeiraLinha.replace(ROTULO, '').replace(SOBRA, '').trim();
  const corte = semRotulo.split(/\s[-–]\s/);

  const nome = corte[0].replace(/\s+/g, ' ').trim();
  const detalhe = [corte.slice(1).join(' - '), ...resto]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  return { nome, detalhe };
}

/** Primeiro atributo de texto preenchido. */
function textoDoAlvo(no) {
  for (const attr of LISTA.atributosDeTexto) {
    const valor = no.getAttribute?.(attr);
    if (valor && String(valor).trim()) return String(valor);
  }
  return '';
}

/** Algum atributo do elemento denuncia o arquivo do marcador? */
function temPista(no) {
  return LISTA.atributosDePista.some((attr) => {
    const valor = no.getAttribute?.(attr);
    return Boolean(valor) && PISTA.test(norm(String(valor)));
  });
}

/**
 * Cor do botão: primeiro pelo nome do marcador, depois pelo nome do arquivo.
 *
 * O arquivo entra como rede para o caso de a unidade renomear o marcador
 * ("Amarelo" virar "Aguardando") mas o ícone continuar sendo o amarelo.
 */
export function corDoMarcador(no, nome) {
  const doNome = CORES[norm(nome)];
  if (doNome) return doNome;

  const pistas = LISTA.atributosDePista
    .map((attr) => no?.getAttribute?.(attr) || '')
    .join(' ');
  const texto = norm(pistas);

  for (const [cor, hex] of Object.entries(CORES)) {
    if (texto.includes(cor)) return hex;
  }
  return null;
}

/* ----------------------------------------------------------------- linhas */

/** Um dos elementos é ancestral do outro? */
function encaixa(a, b) {
  if (a === b) return true;
  for (const [pai, filho] of [
    [a, b],
    [b, a],
  ]) {
    let atual = filho?.parentElement;
    while (atual) {
      if (atual === pai) return true;
      atual = atual.parentElement;
    }
  }
  return false;
}

/**
 * Duas leituras do mesmo marcador viram uma só.
 *
 * O nome do texto manda sobre o nome do arquivo, e a cor entra de onde
 * houver: é assim que "Organização Interna" fica com a bolinha azul que só o
 * <img> sabia dar.
 */
function fundir(alvo, extra) {
  if (!alvo.batizado && extra.batizado) {
    alvo.nome = extra.nome;
    alvo.chave = extra.chave;
    alvo.batizado = true;
  }
  if (!alvo.detalhe && extra.detalhe) alvo.detalhe = extra.detalhe;
  if (!alvo.cor && extra.cor) alvo.cor = extra.cor;
}

/**
 * Os marcadores de uma linha da lista.
 *
 * O SEI desenha CADA marcador com dois elementos: o link, que traz o nome no
 * title, e a imagem dentro dele, que traz o arquivo da cor. Lidos soltos, um
 * marcador vira dois botões — foi o que apareceu na tela como
 * "Organização Interna" ao lado de "azul marinho.svg?25".
 *
 * Duas regras desfazem isso, nesta ordem:
 *
 *   1. elemento contido em outro já aceito é o MESMO marcador (o caso do
 *      <a><img></a>, que é exato: não depende de adivinhar nada);
 *   2. sobrando leitura sem nome depois disso, ela é descartada se a linha
 *      já nomeou algum marcador. O nome de arquivo é último recurso: onde o
 *      SEI escreveu os nomes, um ícone anônimo é outra pintura de um deles,
 *      não um marcador a mais.
 *
 * A regra 2 tem preço: uma linha que misture marcador nomeado com marcador
 * sem title nenhum perderia o segundo. Nunca vi o SEI nomear metade — e o
 * mal menor é esse, não encher a barra de botões que não filtram nada.
 */
export function marcadoresDaLinha(linha) {
  const aceitos = [];

  for (const no of qsa(LISTA.alvos, linha)) {
    const texto = textoDoAlvo(no);
    const falaEmMarcador = Boolean(texto) && PISTA.test(norm(texto));
    if (!falaEmMarcador && !temPista(no)) continue;

    const doTexto = texto ? nomeDoMarcador(texto) : { nome: '', detalhe: '' };
    const nome = doTexto.nome || nomeDoArquivo(no);
    if (!nome) continue;

    const achado = {
      no,
      nome,
      chave: norm(nome),
      detalhe: doTexto.detalhe,
      cor: corDoMarcador(no, nome),
      batizado: Boolean(doTexto.nome),
    };

    const irmao = aceitos.find((a) => encaixa(a.no, no) || a.chave === achado.chave);
    if (irmao) fundir(irmao, achado);
    else aceitos.push(achado);
  }

  const nomeados = aceitos.filter((m) => m.batizado);
  const lista = nomeados.length ? nomeados : aceitos;

  return lista.map(({ nome, chave, detalhe, cor }) => ({ nome, chave, detalhe, cor }));
}

/** "…/svg/marcador_amarelo.svg?25" -> "amarelo". */
function nomeDoArquivo(no) {
  const src = no?.getAttribute?.('src') || no?.getAttribute?.('href') || '';

  // O "?25" no fim é anti-cache do SEI, e vinha junto no nome do botão.
  // Cortar a consulta ANTES da extensão: com ela no caminho, o ".svg?25" não
  // casava como extensão e sobrava inteiro.
  const semConsulta = String(src).split(/[?#]/)[0];
  const arquivo = semConsulta.split('/').pop() || '';
  const semExtensao = arquivo.replace(/\.[a-z0-9]+$/i, '');

  return legivel(semExtensao)
    .replace(/^marcador[_-]?/i, '')
    .replace(/[_-]+/g, ' ')
    .trim();
}

/** "azul%20marinho" -> "azul marinho", sem explodir em URL malformada. */
function legivel(valor) {
  try {
    return decodeURIComponent(valor);
  } catch {
    return valor;
  }
}

/**
 * As linhas de processo de uma tabela — sem o cabeçalho.
 *
 * O cabeçalho é reconhecido por conter <th>, e não pela posição: há versão do
 * SEI que monta o cabeçalho com <td> e deixa o JavaScript promover depois
 * (ver mapaDeColunas em core/tabela.js), e ali a primeira linha também precisa
 * cair fora — por isso as duas checagens.
 */
export function linhasDeProcesso(tabela) {
  const todas = qsa('tr', tabela);
  return todas.filter((linha, i) => {
    if (qsa('th', linha).length) return false;
    if (i === 0 && !qsa('td', linha).length) return false;
    return qsa('td', linha).length > 0;
  });
}

/** Todas as tabelas de processo da tela, na ordem em que aparecem. */
export function tabelasDeProcesso(raiz = document) {
  const porId = qsa(LISTA.porId, raiz);
  if (porId.length) return porId;

  return qsa('table', raiz).filter((t) => qsa(LISTA.linkDeProcesso, t).length > 0);
}

/**
 * Retrato do que a extensão enxergou, para quando ela não enxergar nada.
 *
 * Todo diagnóstico deste projeto nasceu do mesmo jeito: uma feature falhou em
 * silêncio contra HTML que ninguém tinha visto. Com isto no log, um Ctrl+Shift+E
 * resolve o caso em uma rodada em vez de três.
 */
export function diagnosticar(raiz = document) {
  const tabelas = tabelasDeProcesso(raiz);
  return tabelas.map((tabela) => {
    const linhas = linhasDeProcesso(tabela);
    const comMarcador = linhas.filter((l) => marcadoresDaLinha(l).length);
    return {
      tabela: tabela.getAttribute?.('id') || '(sem id)',
      linhas: linhas.length,
      linhasComMarcador: comMarcador.length,
      // Amostra dos títulos da primeira linha: é o que falta quando o
      // reconhecimento erra.
      titulosDaPrimeiraLinha: linhas.length
        ? qsa(LISTA.alvos, linhas[0])
            .map((no) => textoDoAlvo(no))
            .filter(Boolean)
            .slice(0, 8)
        : [],
    };
  });
}
