/**
 * andamento.js - le a tela "Consultar Andamento".
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
import { ANDAMENTO } from './seletores.js';
import { qsa } from '../../core/dom.js';

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
