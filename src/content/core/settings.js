/**
 * settings.js — leitura/escrita das preferencias do usuario.
 *
 * Formato guardado em chrome.storage.sync:
 *   {
 *     versao: 1,
 *     features: { 'id-da-feature': { ativa: true, opcoes: { ... } } }
 *   }
 *
 * Cada feature declara seus proprios defaults; aqui so mesclamos.
 */
import { STORAGE_KEY, STORAGE_AREA } from '../../shared/constantes.js';
import { comContexto } from './runtime.js';

const VERSAO = 1;
const vazio = () => ({ versao: VERSAO, features: {} });

export async function loadSettings() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage[STORAGE_AREA].get(STORAGE_KEY);
      return { ...vazio(), ...(bruto?.[STORAGE_KEY] || {}) };
    },
    vazio(),
    'nao consegui ler as preferencias',
  );
}

export async function saveSettings(settings) {
  return comContexto(
    () => chrome.storage[STORAGE_AREA].set({ [STORAGE_KEY]: { ...settings, versao: VERSAO } }),
    undefined,
    'nao consegui gravar as preferencias',
  );
}

/** Estado de uma feature, ja com os defaults dela aplicados. */
export function estadoDaFeature(settings, feature) {
  const salvo = settings?.features?.[feature.id] || {};
  return {
    ativa: salvo.ativa ?? feature.padraoAtiva ?? true,
    opcoes: { ...(feature.opcoesPadrao || {}), ...(salvo.opcoes || {}) },
  };
}

export async function setFeatureAtiva(id, ativa) {
  const s = await loadSettings();
  s.features[id] = { ...(s.features[id] || {}), ativa };
  await saveSettings(s);
  return s;
}

export async function setOpcoesFeature(id, opcoes) {
  const s = await loadSettings();
  s.features[id] = {
    ...(s.features[id] || {}),
    opcoes: { ...(s.features[id]?.opcoes || {}), ...opcoes },
  };
  await saveSettings(s);
  return s;
}

/** Avisa quando as preferencias mudarem em qualquer aba/popup. */
export function onSettingsChanged(callback) {
  const handler = (changes, area) => {
    if (area !== STORAGE_AREA || !changes[STORAGE_KEY]) return;
    callback({ ...vazio(), ...(changes[STORAGE_KEY].newValue || {}) });
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
