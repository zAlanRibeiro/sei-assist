/**
 * main.js — bootstrap do content script.
 *
 * Responsabilidades (e so isso):
 *  1. Verificar se a pagina realmente e o SEI.
 *  2. Montar o "contexto" (tela, frame, elementos-chave).
 *  3. Carregar as configuracoes do usuario.
 *  4. Entregar tudo para o registry, que liga/desliga as features.
 *
 * Nenhuma regra de negocio mora aqui. Feature nova = arquivo novo em
 * src/content/features/ + uma linha em src/content/features/index.js.
 */
import { log } from './core/log.js';
import { buildContext, isSeiPage } from './core/env.js';
import { loadSettings, onSettingsChanged } from './core/settings.js';
import { bootFeatures, reconcileFeatures, desativarTodas } from './core/registry.js';
import { ativarPonteDeToasts } from './core/ui.js';
import { aplicarTema } from './core/tema.js';
import { aoInvalidarContexto } from './core/runtime.js';
import features from './features/index.js';

async function main() {
  if (!isSeiPage()) {
    log.debug('pagina nao identificada como SEI — nada a fazer', location.href);
    return;
  }

  const ctx = buildContext();
  ctx.settings = await loadSettings();

  log.info('ativo', {
    tela: ctx.screen,
    acao: ctx.acao,
    frame: ctx.frame.role,
    url: location.href,
  });

  document.documentElement.setAttribute('data-seix', '1');
  document.documentElement.setAttribute('data-seix-tela', ctx.screen);
  document.documentElement.setAttribute('data-seix-frame', ctx.frame.role);

  // Antes de qualquer feature desenhar: o painel, os toasts e os dialogos
  // vestem as cores lidas da tela do SEI. Falha aqui nao impede nada - o
  // content.css ja traz o padrao gov.br.
  aplicarTema();

  ativarPonteDeToasts();

  // Se a extensao for recarregada, esta aba fica orfa: desliga tudo em vez de
  // seguir observando o DOM contra uma extensao que nao existe mais.
  aoInvalidarContexto(() => {
    desativarTodas();
    document.documentElement.removeAttribute('data-seix');
  });

  await bootFeatures(features, ctx);

  // Se o usuario mudar algo no popup/opcoes, liga e desliga em tempo real,
  // sem precisar recarregar a pagina.
  onSettingsChanged(async (settings) => {
    ctx.settings = settings;
    await reconcileFeatures(ctx);
  });
}

main().catch((err) => log.error('erro no bootstrap:', err));
