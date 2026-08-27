/**
 * Feature: Inspetor de tela.
 *
 * Ferramenta de desenvolvimento. Copia para a area de transferencia um
 * "esqueleto" da tela atual do SEI (estrutura + rotulos, sem conteudo de
 * processo), para servir de base na hora de escrever seletores de novas
 * features.
 *
 * Nao altera nada no SEI: so le o DOM.
 */
import { registrarAtalho } from '../../core/hotkeys.js';
import { toast, painel } from '../../core/ui.js';
import { el } from '../../core/dom.js';
import { log } from '../../core/log.js';
import { esqueleto, cabecalho } from './esqueleto.js';

async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    // Fallback para quando a aba nao esta focada ou a permissao falha.
    const area = el('textarea', {
      style: { position: 'fixed', top: '-1000px', opacity: '0' },
    });
    area.value = texto;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  }
}

async function capturar(raiz, ctx, rotulo) {
  const texto = cabecalho(ctx) + esqueleto(raiz);
  const ok = await copiar(texto);
  log.info(`esqueleto de "${rotulo}":\n${texto}`);
  toast(
    ok
      ? `Estrutura de ${rotulo} copiada (${texto.length} caracteres). Também está no console.`
      : `Não consegui copiar. A estrutura de ${rotulo} está no console (F12).`,
    { tipo: ok ? 'sucesso' : 'alerta', duracao: 5000 },
  );
}

/** Modo "clique para escolher": destaca o elemento sob o cursor. */
function modoSelecao(ctx, aoTerminar) {
  let atual = null;
  const CLASSE = 'seix-inspetor-alvo';

  const sair = () => {
    atual && atual.classList.remove(CLASSE);
    document.removeEventListener('mouseover', aoMover, true);
    document.removeEventListener('click', aoClicar, true);
    document.removeEventListener('keydown', aoTeclar, true);
    document.documentElement.classList.remove('seix-inspetor-ativo');
    aoTerminar && aoTerminar();
  };

  const aoMover = (ev) => {
    atual && atual.classList.remove(CLASSE);
    atual = ev.target;
    atual.classList.add(CLASSE);
  };

  const aoClicar = (ev) => {
    // Impede que o clique acione qualquer coisa do SEI.
    ev.preventDefault();
    ev.stopPropagation();
    const alvo = ev.target;
    alvo.classList.remove(CLASSE);
    sair();
    capturar(alvo, ctx, `<${alvo.tagName.toLowerCase()}>`);
  };

  const aoTeclar = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      sair();
      toast('Seleção cancelada.', { tipo: 'info', duracao: 2000 });
    }
  };

  document.documentElement.classList.add('seix-inspetor-ativo');
  document.addEventListener('mouseover', aoMover, true);
  document.addEventListener('click', aoClicar, true);
  document.addEventListener('keydown', aoTeclar, true);
  toast('Clique no elemento que quer capturar (Esc cancela).', { tipo: 'info', duracao: 4000 });
}

export default {
  id: 'inspetor',
  nome: 'Inspetor de tela',
  descricao:
    'Ctrl+Shift+E copia a estrutura da tela do SEI (sem conteúdo de processo) para usar ao criar novas funcionalidades.',
  // Desligado por padrao: e ferramenta de desenvolvimento, para quem for
  // escrever seletor novo. Quem so usa a extensao nao precisa dela ligada.
  padraoAtiva: false,
  rotulosOpcoes: { atalho: 'Atalho de captura' },
  opcoesPadrao: { atalho: 'Ctrl+Shift+E' },
  telas: ['*'],
  frames: ['*'],

  setup(ctx) {
    const limpezas = [];

    limpezas.push(
      registrarAtalho(
        ctx.opcoes.atalho,
        () => abrirPainel(ctx),
        { descricao: 'Inspetor de tela', mesmoDigitando: true },
      ),
    );

    return () => limpezas.forEach((fn) => fn());
  },
};

function abrirPainel(ctx) {
  const conteudo = el('div', { class: 'seix-inspetor' }, [
    el('p', {
      class: 'seix-inspetor__info',
      text: `Tela: ${ctx.screen} | ação: ${ctx.acao || '-'} | frame: ${ctx.frame.role}`,
    }),
    el('button', {
      class: 'seix-btn seix-btn--primario',
      text: 'Copiar esta tela inteira',
      onclick: () => {
        p.destruir();
        capturar(document.body, ctx, 'tela inteira');
      },
    }),
    el('button', {
      class: 'seix-btn seix-btn--secundario',
      text: 'Escolher um elemento…',
      onclick: () => {
        p.destruir();
        modoSelecao(ctx);
      },
    }),
    el('p', {
      class: 'seix-inspetor__aviso',
      text: 'O texto do processo é trocado por marcadores antes de copiar.',
    }),
  ]);

  const p = painel({ titulo: 'Inspetor de tela', conteudo });
}
