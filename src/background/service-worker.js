/**
 * service-worker.js — background da extensão (MV3).
 *
 * Hoje faz pouca coisa de propósito: toda a lógica de tela vive no content
 * script. Este arquivo existe para o que o content script não pode fazer —
 * reagir a instalação/atualização e, no futuro, guardar estado compartilhado
 * entre abas ou pedir permissões opcionais.
 */
import { STORAGE_KEY, STORAGE_AREA } from '../shared/constantes.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const atual = await chrome.storage[STORAGE_AREA].get(STORAGE_KEY);

  if (!atual?.[STORAGE_KEY]) {
    await chrome.storage[STORAGE_AREA].set({
      [STORAGE_KEY]: { versao: 1, features: {} },
    });
  }

  if (reason === 'install') {
    chrome.runtime.openOptionsPage();
  }
});

/**
 * Canal de mensagens genérico. Cada feature que precisar do background
 * registra um tipo aqui em vez de criar outro listener.
 */
const handlers = {
  ping: () => ({ ok: true, versao: chrome.runtime.getManifest().version }),

  // O content script não pode abrir a página de opções sozinho.
  'abrir-opcoes': () => {
    chrome.runtime.openOptionsPage();
    return { ok: true };
  },

  /**
   * Contador de novidades no bloco de assinatura.
   *
   * Só o background pode desenhar sobre o ícone da extensão — daí a
   * mensagem. Zero apaga o selo em vez de escrever "0".
   */
  'bloco-contador': async ({ quantidade }) => {
    const n = Number(quantidade) || 0;
    await chrome.action.setBadgeText({ text: n ? String(n) : '' });
    if (n) {
      // Duplica --seix-cor-novidade do content.css de propósito: a API do
      // Chrome recebe uma cor literal, não entende custom property. Se um
      // dia mudar lá, muda aqui também.
      await chrome.action.setBadgeBackgroundColor({ color: '#c62828' });
      await chrome.action.setTitle({
        title: `SEI Assist — ${n} novidade${n > 1 ? 's' : ''} no bloco de assinatura`,
      });
    } else {
      await chrome.action.setTitle({ title: 'SEI Assist' });
    }
    return { ok: true, quantidade: n };
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = handlers[msg?.tipo];
  if (!handler) return false;

  Promise.resolve(handler(msg))
    .then(sendResponse)
    .catch((err) => sendResponse({ erro: String(err) }));
  return true; // resposta assíncrona
});
