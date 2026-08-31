/**
 * andamento.js - le a tela "Consultar Andamento".
 *
 * Mora no nucleo porque duas features leem esta tela: o historico, que
 * recolhe envios e criacoes dela, e a trajetoria, que a resume.
 *
 * O andamento e o historico oficial do processo. Para ENVIOS ele e o que o
 * bloco de assinatura e para assinaturas: a fonte retroativa e autoritativa.
 *
 * Cada linha traz data/hora, unidade, usuario e a descricao do que aconteceu:
 *
 *   02/07/2026 16:59 | NIT/NITTRANS/DIVEST | alan.ribeiro |
 *   Processo remetido pela unidade NIT/NITTRANS/DIVEST
 *
 * O parser nao depende da ORDEM das colunas: para cada linha ele procura a
 * celula que parece data/hora e a celula que casa com um padrao conhecido.
 * Assim ele sobrevive a uma tela com colunas a mais, a menos ou trocadas.
 */
import { documentosAcessiveis, qsa, textoProprio } from './dom.js';
import { log } from './log.js';

/**
 * Tela "Consultar Andamento": o historico oficial do processo.
 *
 * E o equivalente, para envios, do que o bloco de assinatura e para
 * assinaturas: a fonte retroativa e autoritativa. Cada linha traz data/hora,
 * unidade, usuario e a descricao do que aconteceu.
 *
 * CONFIRMADO em uso: abrir "Consultar Andamento" num processo trouxe
 * envios e criacoes para o historico. Nunca vi o HTML desta tela, mas o
 * caminho inteiro funcionou - que e a prova que interessa.
 */
export const ANDAMENTO = {
  // Basta um destes aparecer para valer a pena varrer a tela.
  marca: /Processo (remetido|recebido|.{0,12}gerado)|Documento .{0,12}gerado/i,

  /**
   * Cada padrao vira um tipo de evento. Adicionar um novo tipo ao historico e,
   * na maior parte das vezes, so acrescentar uma linha aqui.
   *
   * CONFIRMADO em uso: tanto os textos de tramitacao quanto os de criacao
   * produziram registro a partir do andamento real. Se a aba "Criados"
   * vier vazia em outro orgao, e aqui que se ajusta.
   */
  padroes: {
    remetido: /Processo remetido pela unidade\s+([A-Z0-9][A-Z0-9/._-]{1,60})/i,
    // CONFIRMADO na tela: o recebimento vem SEM sigla nenhuma - a descricao e
    // so "Processo recebido na unidade", e quem diz a unidade e a coluna. Por
    // isso o grupo e opcional; sem isso a linha nao casava, nenhum
    // recebimento entrava, e a trajetoria parava na primeira parada.
    //
    // O envio continua exigindo a sigla de proposito. Nele a coluna traz o
    // DESTINO e a descricao traz a ORIGEM: cair na coluna quando a sigla
    // faltasse trocaria uma pela outra em silencio. Melhor nao reconhecer a
    // linha do que reconhece-la ao contrario.
    recebido: /Processo recebido na unidade\s*([A-Z0-9][A-Z0-9/._-]{1,60})?/i,
    // As duas ordens de palavra: "Processo publico gerado" e "Gerado o
    // processo publico". Nao vi o texto real deste orgao, entao aceito ambas.
    processoCriado: /processo[^.]{0,30}?gerado|gerado[^.]{0,20}?processo/i,
    documentoCriado: /documento[^.]{0,30}?gerado|gerado[^.]{0,20}?documento/i,
  },

  /**
   * O que extrair do trecho que casou. A unidade sai do grupo capturado (e uma
   * sigla, precisa de ancora no texto); o numero do documento e procurado
   * dentro do proprio trecho, para nao depender da ordem das palavras.
   */
  capturas: {
    remetido: 'unidade',
    recebido: 'unidade',
    documentoCriado: 'documento',
  },

  /** Numero de documento dentro da celula de descricao. */
  numeroNoTrecho: /\d{4,}/,

  // Data/hora no formato do SEI dentro de uma celula: 02/07/2026 16:59
  dataHora: /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/,

  linhas: ['table tr', 'tr'],
};

/** '02/07/2026' + '16:59' -> ISO local, rejeitando data impossivel. */
function paraIso(data, hora) {
  const [dia, mes, ano] = data.split('/').map(Number);
  const [h, min] = hora.split(':').map(Number);

  if (![dia, mes, ano, h, min].every(Number.isInteger)) return null;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31 || h > 23 || min > 59) return null;
  if (ano < 1990 || ano > 2200) return null;

  const d = new Date(ano, mes - 1, dia, h, min, 0, 0);
  const coerente = d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
  return coerente ? d.toISOString() : null;
}

const limpar = (texto) => (texto || '').replace(/\s+/g, ' ').trim();

/**
 * A data/hora da linha, venha ela em que celula vier.
 *
 * Fica separada porque a busca nao depende da posicao da coluna: qualquer
 * celula pode ser a da data, e o laco que descobre isso merece nome.
 */
function acharQuando(textos) {
  for (const t of textos) {
    const m = t.match(ANDAMENTO.dataHora);
    if (!m) continue;
    const iso = paraIso(m[1], m[2]);
    if (iso) return iso;
  }
  return null;
}

/** As celulas de uma linha; a linha inteira, se ela nao tiver celulas. */
function celulasDe(linha) {
  const celulas = qsa('td, th', linha).map((c) => c.textContent);
  return celulas.length ? celulas : [linha.textContent];
}

/** A sigla de unidade se distingue pela forma: caixa alta com barra. */
const ehUnidade = (x) => x.includes('/') && x === x.toUpperCase();

/**
 * Interpreta uma linha ja quebrada em celulas.
 * @param {string[]} celulas
 * @returns {{quando: string, tipo: string, unidade: string|null,
 *            usuario: string|null, descricao: string}|null}
 */
export function lerLinha(celulas) {
  const textos = celulas.map(limpar).filter(Boolean);
  if (!textos.length) return null;

  // 1. a celula que contem data e hora
  const quando = acharQuando(textos);
  if (!quando) return null;

  // 2. a celula cuja descricao casa com um padrao conhecido
  for (const [tipo, padrao] of Object.entries(ANDAMENTO.padroes)) {
    for (const t of textos) {
      const m = t.match(padrao);
      if (!m) continue;

      // O grupo capturado significa coisas diferentes conforme o padrao:
      // sigla de unidade numa tramitacao, numero numa criacao de documento.
      const significa = ANDAMENTO.capturas[tipo];
      // Na celula inteira, nao so no trecho que casou: com padrao preguicoso,
      // "Gerado documento publico 00009400" casa so ate "documento".
      const numero = t.match(ANDAMENTO.numeroNoTrecho);
      const capturado = significa === 'documento' ? (numero ? numero[0] : null) : m[1] || null;

      // Sobram a celula da unidade e a do usuario. Distinguimos pela forma:
      // unidade e sigla em caixa alta com barras (NIT/NITTRANS/DIVEST);
      // usuario e login minusculo ou e-mail institucional.
      const restantes = textos.filter((x) => x !== t && !ANDAMENTO.dataHora.test(x));
      const daColuna = restantes.find(ehUnidade) || null;

      return {
        quando,
        tipo,
        // A sigla escrita na descricao ganha da coluna quando existe: e ela
        // que diz de ONDE o processo saiu num envio, enquanto a coluna diz
        // para onde foi. Quando a descricao nao traz sigla - o caso do
        // recebimento - a coluna e a unica fonte.
        unidade: significa === 'unidade' ? capturado || daColuna : daColuna,
        documento: significa === 'documento' ? capturado : null,
        // O que estava na coluna, sempre. Numa linha de envio ele e diferente
        // do campo acima, e quem interpreta decide o que fazer com isso.
        unidadeDaColuna: daColuna,
        usuario: restantes.find((x) => x.length <= 60 && !ehUnidade(x)) || null,
        descricao: t,
      };
    }
  }

  return null;
}

/**
 * Le a tabela de andamento inteira.
 * @param {Document} doc
 * @returns {Array<object>} eventos reconhecidos, do mais antigo ao mais novo
 */
export function lerAndamentos(doc = document) {
  const corpo = (doc.body && doc.body.textContent) || '';
  if (!ANDAMENTO.marca.test(corpo)) return [];

  const vistas = new Set();
  const eventos = [];

  for (const seletor of ANDAMENTO.linhas) {
    for (const linha of qsa(seletor, doc)) {
      if (vistas.has(linha)) continue;
      vistas.add(linha);

      const evento = lerLinha(celulasDe(linha));
      if (evento) eventos.push(evento);
    }
    if (eventos.length) break; // o primeiro seletor que produziu algo basta
  }

  return eventos.sort((a, b) => (a.quando < b.quando ? -1 : 1));
}

/**
 * Eventos de criacao: processo aberto e documento gerado.
 *
 * Sao mais simples que o envio - nao precisam de par, porque a linha ja diz
 * tudo. O tipo aqui ja sai no vocabulario do historico.
 */
export function extrairCriacoes(eventos) {
  const mapa = {
    processoCriado: 'processo-criado',
    documentoCriado: 'documento-criado',
  };

  return eventos
    .filter((e) => mapa[e.tipo])
    .map((e) => ({
      tipoEvento: mapa[e.tipo],
      quando: e.quando,
      unidade: e.unidade,
      documento: e.documento,
      usuario: e.usuario,
      descricao: e.descricao,
    }));
}

/**
 * Fica so com os envios, casando cada "remetido" com o "recebido" de mesmo
 * horario para descobrir a unidade de destino.
 *
 * "Processo remetido pela unidade X" diz de onde saiu, nao para onde foi -
 * o destino vem da entrada "recebido" correspondente.
 */
export function extrairEnvios(eventos) {
  const recebidos = eventos.filter((e) => e.tipo === 'recebido');

  return eventos
    .filter((e) => e.tipo === 'remetido')
    .map((envio) => {
      const par = recebidos.find(
        (r) => Math.abs(new Date(r.quando) - new Date(envio.quando)) <= 60 * 1000,
      );

      // Sem par no mesmo minuto, a coluna da propria linha do envio.
      //
      // CONFIRMADO na tela: nesta instancia a unidade recebe o processo horas
      // ou dias depois do envio - 12 minutos, 11 horas -, entao o par quase
      // nunca existe, e todo envio retroativo ficava com destino desconhecido.
      // A coluna da linha do envio traz o DESTINO enquanto a descricao traz a
      // origem.
      //
      // So vale quando difere da origem: numa instancia onde a coluna trouxer
      // a origem, as duas coincidem e preferimos nao saber a mentir.
      const daColuna =
        envio.unidadeDaColuna && envio.unidadeDaColuna !== envio.unidade
          ? envio.unidadeDaColuna
          : null;

      return {
        quando: envio.quando,
        origem: envio.unidade,
        destino: par ? par.unidade : daColuna,
        usuario: envio.usuario,
        descricao: envio.descricao,
      };
    });
}

/* ------------------------------------------------------------------------ *
 * Onde a tela mora
 *
 * Achar a tabela do andamento e util para quem quer pendurar algo nela - a
 * faixa da trajetoria entra logo antes. Fica aqui, e nao na feature, porque
 * depende do parser: e por ele que a tabela e reconhecida.
 * ------------------------------------------------------------------------ */

/**
 * A tabela do andamento.
 *
 * Achada pelo CONTEUDO - e a tabela com mais linhas que o parser reconheceu -
 * e nao por id ou classe. A tela tem outras tabelas (as de layout do SEI, a do
 * cabecalho), e nunca vi o HTML dela para escolher um seletor com seguranca.
 * Contar linhas reconhecidas nao depende de versao nem de tema.
 */
export function acharTabela(doc = document) {
  const contagem = new Map();

  for (const linha of qsa('tr', doc)) {
    if (!lerLinha(celulasDe(linha))) continue;
    const tabela = linha.closest ? linha.closest('table') : null;
    if (!tabela) continue;
    contagem.set(tabela, (contagem.get(tabela) || 0) + 1);
  }

  let melhor = null;
  let maior = 0;
  for (const [tabela, quantas] of contagem) {
    if (quantas > maior) {
      melhor = tabela;
      maior = quantas;
    }
  }
  return melhor;
}

/* ------------------------------------------------------------------------ *
 * Onde o processo esta ABERTO
 *
 * O andamento nao basta para responder isso, e a diferenca nao e detalhe:
 *
 *   - enviar ja abre o processo no destino, mas o "recebido" so aparece
 *     quando alguem de la abre pela primeira vez;
 *   - enviar com "manter aberto na unidade atual" deixa o processo aberto na
 *     ORIGEM tambem, e o andamento nao registra essa escolha em lugar nenhum.
 *
 * Felizmente o SEI diz na propria tela, numa caixa "Processo aberto nas
 * unidades". Ler dali e melhor que qualquer inferencia nossa.
 *
 * NAO CONFIRMADO no HTML: vi a caixa numa captura de tela, nao no codigo.
 * A busca e pelo TEXTO do rotulo, que e o que se ve, e devolve null quando
 * nao acha - quem chama entao volta a inferir pelo andamento.
 * ------------------------------------------------------------------------ */

export const ABERTAS = {
  // Aceita "nas unidades", "na(s) unidade(s)" e "na unidade": o parêntese do
  // plural opcional aparece em várias telas do SEI, e um "s" solto na
  // expressão não cobre "na(s)".
  rotulo: /processo\s+aberto\s+n\S{0,4}\s+unidade/i,
  /** Sigla de unidade: caixa alta com pelo menos uma barra. */
  sigla: /\b[A-Z][A-Z0-9]*(?:\/[A-Z0-9._-]+)+/g,
  /** Onde procurar. Lista fechada: varrer '*' percorreria a pagina inteira. */
  folhas: 'div, td, p, section, fieldset, span',
  /** Onde cada sigla mora dentro da caixa. */
  itens: 'div, td, p, span, a, li, strong, b, label',
};

/**
 * As siglas dentro de um elemento, lidas UMA A UMA.
 *
 * Nao da para procurar no textContent do conjunto: ele concatena os filhos sem
 * separador nenhum - <div>A</div><div>B</div> vira "AB" - e duas siglas
 * coladas viram uma so, gigante e inexistente. Isso e comportamento do DOM de
 * verdade, nao artefato de teste.
 */
function siglasDentro(no) {
  const pedacos = [textoProprio(no), ...qsa(ABERTAS.itens, no).map(textoProprio)];
  const achadas = [];

  for (const pedaco of pedacos) {
    for (const sigla of String(pedaco || '').match(ABERTAS.sigla) || []) achadas.push(sigla);
  }
  return [...new Set(achadas)];
}

/**
 * A caixa dentro de UM documento.
 *
 * @returns {string[]|null} null quando a caixa nao esta neste documento.
 */
export function lerUnidadesAbertasEm(doc = document) {
  let melhor = null;

  for (const no of qsa(ABERTAS.folhas, doc)) {
    const texto = (no.textContent || '').replace(/\s+/g, ' ');
    if (!ABERTAS.rotulo.test(texto)) continue;

    const siglas = siglasDentro(no);
    if (!siglas.length) continue;

    // O MENOR trecho que traga o rotulo E pelo menos uma sigla.
    //
    // Duas armadilhas de uma vez: o <div> que embrulha a pagina tambem casa
    // com o rotulo, e traria junto todas as siglas da tabela de andamento -
    // inclusive as de unidades que ja devolveram o processo. E o elemento do
    // proprio rotulo, que e o menor de todos, nao tem sigla nenhuma.
    if (!melhor || texto.length < melhor.tamanho) melhor = { tamanho: texto.length, siglas };
  }

  return melhor ? melhor.siglas : null;
}

/**
 * As unidades em que o processo esta aberto AGORA, segundo o proprio SEI.
 *
 * Varre os frames alcancaveis, e nao so o local: a tela do SEI e feita de
 * frames irmaos, e a caixa pode estar em outro que nao o da tabela de
 * andamento. Procurar so no frame local devolvia null - e o selo caia de
 * volta na deducao pelo andamento, que NAO tem como acertar: ela nao sabe do
 * "manter aberto na unidade atual", entao so erra para menos.
 *
 * @returns {string[]|null} null quando a caixa nao esta em lugar nenhum.
 */
export function lerUnidadesAbertas(docs = null) {
  const candidatos = docs || documentosAcessiveis();
  for (const doc of candidatos) {
    try {
      const achadas = lerUnidadesAbertasEm(doc);
      if (achadas) return achadas;
    } catch {
      /* frame de outra origem, ou documento ainda montando */
    }
  }
  return null;
}

/**
 * O que a tela mostra sobre unidades abertas, para quem for confirmar.
 *
 * Mesmo recurso que destravou o alerta de bloco e o nivel de acesso: quando a
 * leitura falha, relatar o que HA na tela vale mais que outro chute.
 */
export function diagnosticarAbertas(docs = null) {
  const candidatos = docs || documentosAcessiveis();
  const relato = candidatos.map((doc, i) => {
    try {
      const corpo = ((doc.body && doc.body.textContent) || '').replace(/s+/g, ' ');
      const trecho = corpo.search(ABERTAS.rotulo);
      return {
        frame: i,
        temRotulo: trecho >= 0,
        aoRedor: trecho >= 0 ? corpo.slice(trecho, trecho + 120) : '',
        achou: lerUnidadesAbertasEm(doc),
      };
    } catch (err) {
      return { frame: i, erro: String(err && err.message) };
    }
  });
  log.debug('unidades abertas: o que ha em cada frame', relato);
  return relato;
}
