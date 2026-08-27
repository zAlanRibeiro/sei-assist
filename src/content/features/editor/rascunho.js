/**
 * rascunho.js - recuperacao do que voce estava escrevendo.
 *
 * O que resolve: a sessao do SEI expira em silencio. Voce escreve uma
 * Comunicacao Interna inteira, clica em Salvar, e o SEI devolve a tela de
 * login com o texto perdido. Nao ha desfazer para isso.
 *
 * ATENCAO - esta e a unica parte da extensao que guarda CONTEUDO de documento.
 * O resto do projeto guarda so numero, tipo, unidade e data. Aqui fica o texto
 * que voce esta escrevendo, e por isso:
 *
 *   - `chrome.storage.local`, nunca `sync`: nao sobe para conta nenhuma;
 *   - prazo de validade curto, e limpeza automatica do que passou dele;
 *   - some assim que o documento e salvo com sucesso;
 *   - da para desligar a funcionalidade inteira nas opcoes.
 *
 * As funcoes de decisao ficam puras e exportadas, para poderem ser testadas -
 * e porque errar em "quando descartar" apaga trabalho de alguem.
 */
import { comContexto } from '../../core/runtime.js';
import { log } from '../../core/log.js';

const CHAVE = 'seix:rascunhos';

/** Depois disto o rascunho nao serve mais e vira lixo. */
export const VALIDADE_MS = 3 * 24 * 60 * 60 * 1000; // 3 dias

/** Quantos rascunhos manter. Evita o storage crescer sem limite. */
export const LIMITE = 20;

/**
 * Identidade do rascunho.
 *
 * O id do documento vem da URL e e o unico identificador estavel: o titulo
 * muda enquanto se escreve, e a URL inteira carrega `infra_hash`, que muda a
 * cada sessao. Sem id nao ha rascunho - melhor nao guardar do que guardar sob
 * uma chave que nao vai ser encontrada depois.
 */
export function chaveDoRascunho(idDocumento) {
  const id = String(idDocumento || '').trim();
  return id ? `doc:${id}` : null;
}

/**
 * Vale a pena guardar este texto?
 *
 * Duas recusas importantes. Texto vazio nunca substitui um rascunho que ja
 * existe - o editor comeca vazio antes de carregar o conteudo, e guardar esse
 * instante apagaria o rascunho bom. E texto identico ao ultimo guardado nao
 * merece escrita nova.
 */
export function deveGuardar(texto, anterior) {
  const novo = String(texto || '');
  if (!novo.trim()) return false;
  return novo !== (anterior || '');
}

/** Rascunhos ainda dentro do prazo, do mais novo para o mais velho. */
export function vigentes(rascunhos, agora = Date.now()) {
  return Object.entries(rascunhos || {})
    .filter(([, r]) => {
      const quando = new Date(r?.quando).getTime();
      return Number.isFinite(quando) && agora - quando < VALIDADE_MS;
    })
    .sort((a, b) => new Date(b[1].quando) - new Date(a[1].quando))
    .slice(0, LIMITE);
}

/** Aplica prazo e limite de uma vez. */
export function podar(rascunhos, agora = Date.now()) {
  return Object.fromEntries(vigentes(rascunhos, agora));
}

async function ler() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      return bruto?.[CHAVE] || {};
    },
    {},
    'ler rascunhos',
  );
}

async function escrever(rascunhos) {
  return comContexto(
    async () => {
      await chrome.storage.local.set({ [CHAVE]: rascunhos });
      return true;
    },
    false,
    'gravar rascunho',
  );
}

/** Guarda o texto, se valer a pena. Devolve true quando gravou. */
/**
 * Junta as secoes num texto so, para decidir se vale gravar.
 *
 * A regra de deveGuardar() continua valendo sobre o documento inteiro: se
 * nenhuma secao tem conteudo, nao ha rascunho a guardar.
 */
function tudoJunto(secoes) {
  return Object.values(secoes || {}).join('\n');
}

/** Guarda as secoes do documento, se valer a pena. Devolve true se gravou. */
export async function guardar(idDocumento, secoes, extras = {}) {
  const chave = chaveDoRascunho(idDocumento);
  if (!chave) return false;

  const rascunhos = await ler();
  const anterior = rascunhos[chave];
  if (!deveGuardar(tudoJunto(secoes), anterior ? tudoJunto(anterior.secoes) : undefined)) {
    return false;
  }

  rascunhos[chave] = { secoes, quando: new Date().toISOString(), ...extras };
  return escrever(podar(rascunhos));
}

/** O rascunho deste documento, se houver e estiver no prazo. */
export async function recuperar(idDocumento) {
  const chave = chaveDoRascunho(idDocumento);
  if (!chave) return null;

  const rascunhos = podar(await ler());
  const achado = rascunhos[chave];
  if (!achado) return null;

  // Rascunho gravado pela versao anterior guardava um `texto` unico, que era
  // sempre o corpo. Converte em vez de descartar: quem tem um rascunho
  // pendente nao pode perde-lo por causa de uma atualizacao da extensao.
  if (!achado.secoes && achado.texto) {
    return { ...achado, secoes: { 'Corpo do Texto': achado.texto } };
  }
  return achado;
}

/**
 * Apaga o rascunho deste documento.
 *
 * Chamado quando o documento e salvo: a partir dai o SEI e a fonte da verdade,
 * e manter uma copia local seria guardar conteudo sem motivo.
 */
export async function descartar(idDocumento) {
  const chave = chaveDoRascunho(idDocumento);
  if (!chave) return false;

  const rascunhos = await ler();
  if (!rascunhos[chave]) return false;

  delete rascunhos[chave];
  log.debug(`rascunho de ${chave} descartado`);
  return escrever(rascunhos);
}

/** Apaga tudo. Existe para a tela de opcoes. */
export async function limparTudo() {
  return escrever({});
}
