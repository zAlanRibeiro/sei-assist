/**
 * registry.js - liga e desliga as features.
 *
 * Contrato de uma feature (ver docs/como-adicionar-uma-feature.md):
 *
 *   export default {
 *     id: 'meu-recurso',              // unico, kebab-case, usado no storage
 *     nome: 'Meu recurso',            // aparece no popup/opcoes
 *     descricao: 'O que ele faz.',
 *     padraoAtiva: true,
 *     opcoesPadrao: { chave: 'valor' },
 *     telas: ['controle-processos'],  // nomes de src/shared/constantes.js
 *     frames: ['topo'],               // 'topo' | 'arvore' | 'visualizacao' | '*'
 *     setup(ctx) { ...; return () => limpar(); },
 *   }
 *
 * `setup` roda uma vez por frame elegivel e pode devolver uma funcao de
 * limpeza, chamada quando o usuario desativa a feature.
 */
import { log } from './log.js';
import { estadoDaFeature } from './settings.js';

/** id -> { feature, ativa, limpar } */
const estado = new Map();

function combina(lista, valor) {
  if (!lista || lista.length === 0) return true;
  return lista.includes('*') || lista.includes(valor);
}

/** A feature deve rodar nesta tela/frame? */
export function elegivel(feature, ctx) {
  if (!combina(feature.telas, ctx.screen)) return false;
  if (!combina(feature.frames, ctx.frame.role)) return false;
  if (typeof feature.aplicaSe === 'function' && !feature.aplicaSe(ctx)) return false;
  return true;
}

function validar(feature) {
  const erros = [];
  if (!feature || typeof feature !== 'object') erros.push('feature nao e um objeto');
  if (!feature.id) erros.push('falta `id`');
  if (typeof feature.setup !== 'function') erros.push('falta `setup(ctx)`');
  return erros;
}

async function ativar(feature, ctx) {
  const registro = estado.get(feature.id);
  if (registro && registro.ativa) return;

  const opcoes = estadoDaFeature(ctx.settings, feature).opcoes;
  try {
    const limpar = await feature.setup({ ...ctx, opcoes });
    estado.set(feature.id, {
      feature,
      ativa: true,
      limpar: typeof limpar === 'function' ? limpar : null,
    });
    log.info(`feature ativada: ${feature.id}`);
  } catch (err) {
    log.error(`falha ao ativar "${feature.id}":`, err);
    estado.set(feature.id, { feature, ativa: false, limpar: null });
  }
}

function desativar(id) {
  const registro = estado.get(id);
  if (!registro || !registro.ativa) return;
  try {
    registro.limpar && registro.limpar();
  } catch (err) {
    log.error(`falha ao limpar "${id}":`, err);
  }
  estado.set(id, { ...registro, ativa: false, limpar: null });
  log.info(`feature desativada: ${id}`);
}

/** Carrega a lista de features respeitando tela, frame e preferencias. */
export async function bootFeatures(features, ctx) {
  for (const feature of features) {
    const erros = validar(feature);
    if (erros.length) {
      log.error('feature invalida ignorada:', erros.join('; '), feature);
      continue;
    }
    if (!estado.has(feature.id)) {
      estado.set(feature.id, { feature, ativa: false, limpar: null });
    }
  }
  await reconcileFeatures(ctx);
}

/**
 * Reavalia todas as features contra o contexto e as preferencias atuais.
 * Chamado no boot e sempre que o usuario mexe no popup/opcoes.
 */
export async function reconcileFeatures(ctx) {
  for (const { feature } of estado.values()) {
    const deveRodar =
      elegivel(feature, ctx) && estadoDaFeature(ctx.settings, feature).ativa;
    if (deveRodar) await ativar(feature, ctx);
    else desativar(feature.id);
  }
}

/**
 * Desliga todas as features desta aba.
 *
 * Usado quando a extensao e recarregada: o content script antigo continua vivo
 * na pagina, e sem isto seus MutationObservers seguiriam disparando para
 * sempre, contra uma extensao que nao existe mais.
 */
export function desativarTodas() {
  for (const id of Array.from(estado.keys())) desativar(id);
}

/** Snapshot do estado atual (usado para depuracao). */
export function statusFeatures() {
  return Array.from(estado.values()).map(({ feature, ativa }) => ({
    id: feature.id,
    nome: feature.nome,
    ativa,
  }));
}
