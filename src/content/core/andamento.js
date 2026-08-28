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
import { qsa } from './dom.js';

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
    recebido: /Processo recebido na unidade\s+([A-Z0-9][A-Z0-9/._-]{1,60})/i,
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
 * Interpreta uma linha ja quebrada em celulas.
 * @param {string[]} celulas
 * @returns {{quando: string, tipo: string, unidade: string|null,
 *            usuario: string|null, descricao: string}|null}
 */
export function lerLinha(celulas) {
  const textos = celulas.map(limpar).filter(Boolean);
  if (!textos.length) return null;

  // 1. a celula que contem data e hora
  let quando = null;
  for (const t of textos) {
    const m = t.match(ANDAMENTO.dataHora);
    if (!m) continue;
    quando = paraIso(m[1], m[2]);
    if (quando) break;
  }
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
      const ehUnidade = (x) => x.includes('/') && x === x.toUpperCase();
      const restantes = textos.filter((x) => x !== t && !ANDAMENTO.dataHora.test(x));

      return {
        quando,
        tipo,
        unidade:
          significa === 'unidade' ? capturado : restantes.find(ehUnidade) || null,
        documento: significa === 'documento' ? capturado : null,
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

      const celulas = qsa('td, th', linha).map((c) => c.textContent);
      const evento = lerLinha(celulas.length ? celulas : [linha.textContent]);
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
      return {
        quando: envio.quando,
        origem: envio.unidade,
        destino: par ? par.unidade : null,
        usuario: envio.usuario,
        descricao: envio.descricao,
      };
    });
}
