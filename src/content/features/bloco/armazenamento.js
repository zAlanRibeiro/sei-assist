/**
 * armazenamento.js - o que a extensao lembra entre uma consulta e outra.
 *
 * Fica em chrome.storage.local, como o historico: nao sincroniza, nao sai da
 * maquina. Aqui nao ha conteudo de processo - so numero de bloco, estado e
 * unidade, que e o minimo para saber o que mudou.
 */
import { comContexto } from '../../core/runtime.js';

const CHAVE = 'seix:blocos';

/**
 * Estado guardado:
 *   { visto: [bloco...] | null, quando: iso, pendentes: n }
 *
 * `visto: null` significa "nunca olhei" - diferente de "olhei e nao havia
 * nada". A distincao e o que impede a primeira leitura de disparar um alerta
 * para cada bloco parado. Ver primeiraLeitura() em blocos.js.
 */
const VAZIO = { visto: null, quando: null, pendentes: 0 };

export async function lerEstado() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      return { ...VAZIO, ...(bruto?.[CHAVE] || {}) };
    },
    { ...VAZIO },
    'ler estado dos blocos',
  );
}

export async function guardarEstado(estado) {
  return comContexto(
    async () => {
      await chrome.storage.local.set({ [CHAVE]: estado });
      return true;
    },
    false,
    'guardar estado dos blocos',
  );
}

/**
 * Ja passou tempo suficiente desde a ultima consulta?
 *
 * O intervalo e checado contra o RELOGIO, nao contra um timer. O content
 * script morre a cada navegacao, e o SEI navega o tempo todo: um timer puro
 * consultaria de novo a cada clique. Com o carimbo guardado, trocar de tela
 * cinquenta vezes em cinco minutos continua dando uma consulta so.
 */
export function estaNaHora(quando, intervaloMs, agora = Date.now()) {
  if (!quando) return true;
  const ultima = new Date(quando).getTime();
  if (!Number.isFinite(ultima)) return true;
  // Relogio para tras (troca de fuso, ajuste de hora) nao pode travar a
  // consulta para sempre.
  if (ultima > agora) return true;
  return agora - ultima >= intervaloMs;
}

/** Zera o alerta - a pessoa ja viu o que tinha para ver. */
export async function marcarComoVisto() {
  const estado = await lerEstado();
  return guardarEstado({ ...estado, pendentes: 0 });
}
