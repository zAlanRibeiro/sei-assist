/**
 * popup.js — liga/desliga rápido das funcionalidades.
 *
 * Lê os metadados direto do catálogo de features (por isso os módulos de
 * feature não podem ter efeito colateral no import) e o estado do
 * chrome.storage.
 */
import features from '../content/features/index.js';
import { loadSettings, setFeatureAtiva, estadoDaFeature } from '../content/core/settings.js';
import { ACOES } from '../shared/constantes.js';

const lista = document.getElementById('lista');
const contexto = document.getElementById('contexto');

document.getElementById('versao').textContent = `v${chrome.runtime.getManifest().version}`;
document.getElementById('abrir-opcoes').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

/** Mostra em que tela do SEI a aba atual está — ajuda a entender por que uma
 *  feature pode estar desligada naquele momento. */
async function mostrarContexto() {
  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!aba?.url) {
    contexto.textContent = 'Não consegui ler a aba atual.';
    return null;
  }

  let acao = '';
  try {
    acao = new URL(aba.url).searchParams.get('acao') || '';
  } catch {
    /* url interna do navegador */
  }

  const tela = ACOES[acao] || (acao ? `outra: ${acao}` : null);
  if (!tela) {
    contexto.textContent = 'Esta aba não parece ser uma tela do SEI.';
    return null;
  }

  contexto.textContent = `Tela detectada: ${tela}`;
  return tela;
}

function itemDeFeature(feature, settings, telaAtual) {
  const { ativa } = estadoDaFeature(settings, feature);
  const rodaNestaTela =
    !feature.telas || feature.telas.includes('*') || feature.telas.includes(telaAtual);

  const li = document.createElement('li');
  li.className = `item${rodaNestaTela ? '' : ' item--inativa'}`;

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = ativa;
  check.id = `f-${feature.id}`;
  check.addEventListener('change', () => setFeatureAtiva(feature.id, check.checked));

  const rotulo = document.createElement('label');
  rotulo.htmlFor = check.id;

  const nome = document.createElement('strong');
  nome.textContent = feature.nome;

  const desc = document.createElement('span');
  desc.textContent = rodaNestaTela
    ? feature.descricao
    : `${feature.descricao} (não se aplica a esta tela)`;

  rotulo.append(nome, desc);
  li.append(check, rotulo);
  return li;
}

async function render() {
  const [settings, telaAtual] = await Promise.all([loadSettings(), mostrarContexto()]);
  lista.replaceChildren(...features.map((f) => itemDeFeature(f, settings, telaAtual)));
}

render();
