/**
 * options.js — tela de configuração.
 *
 * Monta os controles a partir dos metadados de cada feature: o campo de
 * `opcoesPadrao` define o tipo do controle (texto, número, caixa de seleção).
 * Feature nova não precisa de código aqui.
 */
import features from '../content/features/index.js';
import {
  loadSettings,
  saveSettings,
  setFeatureAtiva,
  setOpcoesFeature,
  estadoDaFeature,
} from '../content/core/settings.js';

const raiz = document.getElementById('features');
const aviso = document.getElementById('aviso');

function avisar(texto) {
  aviso.textContent = texto;
  setTimeout(() => (aviso.textContent = ''), 2500);
}

/** Rótulo legível a partir do nome da chave: 'tempoEspera' -> 'Tempo espera'. */
function rotuloDaChave(chave) {
  const texto = chave.replace(/[_-]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
  return texto.charAt(0).toUpperCase() + texto.slice(1).toLowerCase();
}

function controleDeOpcao(feature, chave, valor) {
  const linha = document.createElement('div');
  linha.className = 'opcao';

  const label = document.createElement('label');
  // A feature pode declarar um rotulo legivel; senao, derivamos da chave.
  label.textContent = feature.rotulosOpcoes?.[chave] || rotuloDaChave(chave);
  label.htmlFor = `${feature.id}-${chave}`;

  const input = document.createElement('input');
  input.id = label.htmlFor;

  if (typeof valor === 'boolean') {
    input.type = 'checkbox';
    input.checked = valor;
  } else if (typeof valor === 'number') {
    input.type = 'number';
    input.value = String(valor);
  } else {
    input.type = 'text';
    input.value = String(valor ?? '');
  }

  const salvar = () => {
    let novo;
    if (input.type === 'checkbox') novo = input.checked;
    else if (input.type === 'number') novo = Number(input.value);
    else novo = input.value;
    setOpcoesFeature(feature.id, { [chave]: novo }).then(() => avisar('Salvo.'));
  };

  input.addEventListener(input.type === 'text' ? 'change' : 'input', salvar);

  linha.append(label, input);
  return linha;
}

function blocoDeFeature(feature, settings) {
  const { ativa, opcoes } = estadoDaFeature(settings, feature);

  const bloco = document.createElement('section');
  bloco.className = 'bloco';

  const topo = document.createElement('div');
  topo.className = 'feature__topo';

  const check = document.createElement('input');
  check.type = 'checkbox';
  check.checked = ativa;
  check.id = `ativa-${feature.id}`;
  check.addEventListener('change', () =>
    setFeatureAtiva(feature.id, check.checked).then(() => avisar('Salvo.')),
  );

  const textos = document.createElement('div');
  const nome = document.createElement('label');
  nome.className = 'feature__nome';
  nome.htmlFor = check.id;
  nome.textContent = feature.nome;

  const desc = document.createElement('p');
  desc.style.margin = '4px 0 0';
  desc.textContent = feature.descricao;

  const meta = document.createElement('div');
  meta.className = 'feature__meta';
  const telas = (feature.telas || ['*']).join(', ');
  const frames = (feature.frames || ['*']).join(', ');
  meta.textContent = `id: ${feature.id} · telas: ${telas} · frames: ${frames}`;

  textos.append(nome, desc, meta);
  topo.append(check, textos);
  bloco.append(topo);

  const chaves = Object.keys(feature.opcoesPadrao || {});
  if (chaves.length) {
    const grade = document.createElement('div');
    grade.className = 'opcoes';
    for (const chave of chaves) {
      grade.append(controleDeOpcao(feature, chave, opcoes[chave]));
    }
    bloco.append(grade);
  }

  return bloco;
}

async function render() {
  const settings = await loadSettings();

  if (!features.length) {
    raiz.innerHTML = '<p class="vazio">Nenhuma funcionalidade cadastrada ainda.</p>';
    return;
  }

  raiz.replaceChildren(...features.map((f) => blocoDeFeature(f, settings)));
}

document.getElementById('restaurar').addEventListener('click', async () => {
  await saveSettings({ versao: 1, features: {} });
  await render();
  avisar('Configurações restauradas.');
});

render();
