/**
 * abertas.js - lembrar em que unidades o processo está aberto.
 *
 * POR QUE PRECISA LEMBRAR: a caixa "Processo aberto nas unidades" fica na tela
 * do PROCESSO, no frame de visualização. Quando se clica em "Consultar
 * Andamento", o SEI troca o conteúdo desse mesmo frame — e a caixa deixa de
 * existir. O console confirmou: na tela do andamento só há dois frames, a
 * árvore e a visualização, e a visualização já é o próprio andamento.
 *
 * Então não adianta procurar melhor: naquele instante a informação não está
 * mais na página. O que dá para fazer é guardá-la enquanto ela está visível —
 * e ela está visível justamente na tela de onde se clica para ver o andamento,
 * segundos antes.
 *
 * E por que não deduzir do andamento? Porque a dedução NÃO CONSEGUE acertar:
 * ela não sabe do "manter aberto na unidade atual", que deixa o processo
 * aberto na origem sem registrar nada. Ela só erra para menos.
 */
import { documentosAcessiveis } from '../../core/dom.js';
import { comContexto } from '../../core/runtime.js';
import { log } from '../../core/log.js';
import { lerUnidadesAbertas } from '../../core/andamento.js';

const CHAVE = 'seix:abertas';

/**
 * Quanto tempo a lembrança vale.
 *
 * Generosa de propósito: o caminho normal é abrir o andamento a partir da
 * tela do processo, segundos depois de a caixa ter sido lida. Meia hora cobre
 * com folga quem deu uma volta pelo sistema antes de voltar.
 */
export const VALIDADE_MS = 30 * 60 * 1000;

/** O processo desta aba, pelo id que o SEI põe na URL de todos os frames. */
export function idDoProcesso(docs = null) {
  for (const doc of docs || documentosAcessiveis()) {
    try {
      const id = new URL(doc.location.href).searchParams.get('id_procedimento');
      if (id) return id;
    } catch {
      /* frame de outra origem, ou sem location legível */
    }
  }
  return null;
}

/** A chave inclui a origem: quem usa dois SEI tem processos de mesmo id. */
export function chaveDe(origem, idProcesso) {
  const id = String(idProcesso || '').trim();
  return id ? `${origem}#${id}` : null;
}

/** A lembrança ainda vale? */
export function noPrazo(registro, agora = Date.now()) {
  if (!registro || !Array.isArray(registro.unidades) || !registro.unidades.length) return false;
  const quando = Number(registro.quando);
  return Number.isFinite(quando) && agora - quando < VALIDADE_MS;
}

async function ler() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      return bruto?.[CHAVE] || {};
    },
    {},
    'ler unidades abertas',
  );
}

/**
 * Guarda o que a caixa disser, se ela estiver na tela.
 *
 * Roda em qualquer tela: é de propósito. A caixa aparece na tela do processo,
 * que não é a tela onde a faixa é desenhada.
 */
export async function lembrar(idProcesso, unidades) {
  const chave = chaveDe(location.origin, idProcesso);
  if (!chave || !unidades || !unidades.length) return false;

  return comContexto(
    async () => {
      const todas = await ler();
      todas[chave] = { unidades, quando: Date.now() };

      // Poda o que venceu: sem isto o armazenamento cresceria um registro por
      // processo aberto, para sempre.
      const agora = Date.now();
      for (const [k, v] of Object.entries(todas)) {
        if (!noPrazo(v, agora)) delete todas[k];
      }

      await chrome.storage.local.set({ [CHAVE]: todas });
      return true;
    },
    false,
    'guardar unidades abertas',
  );
}

/** O que foi lembrado deste processo, se ainda vale. */
export async function lembrado(idProcesso) {
  const chave = chaveDe(location.origin, idProcesso);
  if (!chave) return null;

  const todas = await ler();
  const registro = todas[chave];
  return noPrazo(registro) ? registro.unidades : null;
}

/**
 * A lista de agora, ou a última lembrada.
 *
 * A da tela ganha sempre: ela é o presente, a outra é memória.
 */
export async function unidadesAbertas() {
  const naTela = lerUnidadesAbertas();
  const id = idDoProcesso();

  if (naTela) {
    lembrar(id, naTela).catch(() => {});
    log.debug(`unidades abertas: ${naTela.length} lidas da tela`);
    return naTela;
  }

  const guardadas = await lembrado(id);
  log.debug(
    guardadas
      ? `unidades abertas: ${guardadas.length} lembradas do processo ${id}`
      : `unidades abertas: a caixa não está nesta tela e nada foi lembrado (processo ${id})`,
  );
  return guardadas;
}
