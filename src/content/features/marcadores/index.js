/**
 * Feature: filtrar a lista de processos por marcadores.
 *
 * No Controle de Processos, os marcadores que existem na lista viram botões
 * acima dela. Clicando em dois ou mais, a lista passa a mostrar só os
 * processos que têm TODOS os escolhidos. Ao lado dá para trocar para "qualquer
 * um", que é a mesma pergunta com OU no lugar do E.
 *
 * O que esta feature faz no SEI: esconde e mostra linha (`display`). Nada
 * além disso. Não clica, não submete formulário, não pede página nenhuma, não
 * grava processo em lugar algum. A lista continua a mesma; muda só o que está
 * na frente dos olhos — recarregar a tela devolve tudo.
 *
 * Uma armadilha do SEI que este arquivo respeita em todo botão: a tela inteira
 * do Controle de Processos vive dentro de um <form>. Um <button> sem
 * `type="button"` ali dentro SUBMETE esse formulário ao ser clicado. Um filtro
 * visual jamais pode disparar um envio de formulário do SEI — por isso todo
 * botão daqui declara o tipo, e há teste que não deixa isso se perder.
 */
import { el, qsa, observar } from '../../core/dom.js';
import { log } from '../../core/log.js';
import {
  marcadoresDaLinha,
  linhasDeProcesso,
  tabelasDeProcesso,
  diagnosticar,
} from './seletores.js';
import {
  aplicar,
  catalogar,
  alternar,
  apenasExistentes,
  frase,
  modoSeguro,
} from './filtro.js';

const ID = 'seix-marcadores';
const MEMORIA = 'seix:marcadores';

/**
 * Estilo inline, como no resto do que a extensão desenha DENTRO do HTML do
 * SEI: o content.css é escopado em #seix-root e entra em `document_start`,
 * antes das folhas do SEI — ou seja, perderia qualquer empate com elas.
 *
 * E toda peça de texto declara a própria cor. Herança não vale aqui: o tema
 * do órgão tem regra para span, e regra ganha de herança. Já custou três
 * correções neste projeto (a faixa, o texto do diálogo, o rótulo da caixa).
 */
const ESTILO_BARRA = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '6px',
  margin: '6px 0',
  padding: '6px 8px',
  borderRadius: '6px',
  border: '1px solid var(--seix-cor-borda, #d0d5dd)',
  background: 'var(--seix-cor-superficie, #f2f4f7)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  fontSize: '12px',
  lineHeight: '1.4',
};

const ESTILO_ROTULO = {
  color: 'var(--seix-cor-texto-suave, #475467)',
  fontWeight: '600',
};

const ESTILO_CHIP = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '5px',
  padding: '2px 9px',
  border: '1px solid var(--seix-cor-borda, #d0d5dd)',
  borderRadius: '999px',
  background: 'var(--seix-cor-fundo, #ffffff)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
};

const ESTILO_CHIP_ATIVO = {
  ...ESTILO_CHIP,
  fontWeight: '700',
  borderColor: 'var(--seix-cor-primaria, #1351b4)',
  background: 'var(--seix-cor-primaria, #1351b4)',
  color: 'var(--seix-cor-primaria-texto, #ffffff)',
};

const ESTILO_PONTO = {
  width: '9px',
  height: '9px',
  borderRadius: '50%',
  border: '1px solid rgba(0,0,0,0.25)',
  flex: '0 0 auto',
};

const ESTILO_CONTAGEM = {
  color: 'inherit',
  opacity: '0.75',
  fontWeight: '400',
};

const ESTILO_BOTAO = {
  padding: '2px 8px',
  border: '1px solid var(--seix-cor-borda, #d0d5dd)',
  borderRadius: '4px',
  background: 'var(--seix-cor-fundo, #ffffff)',
  color: 'var(--seix-cor-texto, #1c1c1c)',
  cursor: 'pointer',
  font: 'inherit',
  fontSize: '12px',
};

const ESTILO_TOTAL = {
  marginLeft: 'auto',
  color: 'var(--seix-cor-texto-suave, #475467)',
};

/* ---------------------------------------------------------------- memória */

/**
 * A escolha sobrevive à navegação — mas só enquanto a aba estiver aberta.
 *
 * sessionStorage e não chrome.storage de propósito: um filtro é estado de
 * momento, não preferência. Guardá-lo para sempre significaria abrir o SEI
 * amanhã com metade da lista escondida sem lembrar por quê. Fechou a aba,
 * acabou o filtro. E, por ser sessionStorage, nada disso sai da máquina nem
 * sincroniza.
 */
function lerMemoria(chave) {
  try {
    return JSON.parse(sessionStorage.getItem(chave)) || {};
  } catch {
    return {};
  }
}

function gravarMemoria(chave, valor) {
  try {
    sessionStorage.setItem(chave, JSON.stringify(valor));
  } catch {
    // Aba anônima com armazenamento bloqueado, cota cheia: o filtro continua
    // funcionando, só não atravessa a próxima tela.
  }
}

/* -------------------------------------------------------------- a tabela */

function itensDaTabela(tabela) {
  return linhasDeProcesso(tabela).map((linha) => {
    const marcadores = marcadoresDaLinha(linha);
    return { linha, marcadores, chaves: marcadores.map((m) => m.chave) };
  });
}

function esconder(linha) {
  if (!linha.getAttribute('data-seix-oculto')) {
    linha.setAttribute('data-seix-display', linha.style.display || '');
    linha.setAttribute('data-seix-oculto', '1');
  }
  linha.style.display = 'none';
}

function mostrar(linha) {
  if (!linha.getAttribute('data-seix-oculto')) return;
  linha.style.display = linha.getAttribute('data-seix-display') || '';
  linha.removeAttribute('data-seix-oculto');
  linha.removeAttribute('data-seix-display');
}

/* ----------------------------------------------------------------- barra */

/**
 * Monta a barra de uma tabela e devolve como desfazer.
 *
 * Uma barra POR tabela: o Controle de Processos separa "Recebidos" de
 * "Gerados", e uma barra só, no alto, ficaria longe da segunda lista e
 * filtraria as duas ao mesmo tempo — que não é o que se quer quando se olha
 * uma delas.
 */
function instalarEm(tabela, opcoes, indice) {
  const pai = tabela.parentElement;
  if (!pai) return null;

  let itens = itensDaTabela(tabela);
  let catalogo = catalogar(itens);
  if (!catalogo.length) return null;

  const chaveMemoria = `${MEMORIA}:${tabela.getAttribute('id') || indice}`;
  const guardado = opcoes.lembrarNaAba ? lerMemoria(chaveMemoria) : {};

  let escolhidas = apenasExistentes(guardado.escolhidas, catalogo);
  let modo = modoSeguro(guardado.modo || opcoes.modoPadrao);

  const chips = el('span', { style: { display: 'contents' } });
  const total = el('span', { style: ESTILO_TOTAL, text: '' });

  const botaoModo = el('button', {
    type: 'button',
    style: ESTILO_BOTAO,
    onclick: () => {
      modo = modo === 'todos' ? 'qualquer' : 'todos';
      pintar();
    },
  });

  const botaoLimpar = el('button', {
    type: 'button',
    style: ESTILO_BOTAO,
    text: 'limpar',
    title: 'Mostrar a lista inteira de novo',
    onclick: () => {
      escolhidas = [];
      pintar();
    },
  });

  const barra = el(
    'div',
    {
      id: `${ID}-${indice}`,
      class: 'seix-marcadores',
      style: ESTILO_BARRA,
      role: 'group',
      'aria-label': 'Filtrar a lista por marcadores',
    },
    [el('span', { style: ESTILO_ROTULO, text: 'Marcadores:' }), chips, botaoModo, botaoLimpar, total],
  );

  function chip(marcador) {
    const ativo = escolhidas.includes(marcador.chave);
    const botao = el(
      'button',
      {
        type: 'button',
        style: ativo ? ESTILO_CHIP_ATIVO : ESTILO_CHIP,
        'aria-pressed': ativo ? 'true' : 'false',
        title: `${marcador.nome} — ${marcador.quantidade} processo(s)`,
        onclick: () => {
          escolhidas = alternar(escolhidas, marcador.chave);
          pintar();
        },
      },
      [
        marcador.cor
          ? el('span', { style: { ...ESTILO_PONTO, background: marcador.cor } })
          : null,
        marcador.nome,
        el('span', { style: ESTILO_CONTAGEM, text: String(marcador.quantidade) }),
      ],
    );
    return botao;
  }

  function pintar() {
    chips.textContent = '';
    for (const marcador of catalogo) chips.append(chip(marcador));

    // O modo só muda alguma coisa com dois marcadores escolhidos; antes disso
    // seria um botão que não faz nada na frente de quem está trabalhando.
    botaoModo.hidden = escolhidas.length < 2;
    botaoModo.textContent = modo === 'todos' ? 'com todos' : 'com qualquer um';
    botaoModo.title =
      modo === 'todos'
        ? 'Mostrando quem tem TODOS os marcadores escolhidos. Clique para bastar um deles.'
        : 'Mostrando quem tem QUALQUER UM dos escolhidos. Clique para exigir todos.';

    botaoLimpar.hidden = escolhidas.length === 0;

    const { visiveis, ocultos } = aplicar(itens, escolhidas, modo);
    for (const item of visiveis) mostrar(item.linha);
    for (const item of ocultos) esconder(item.linha);
    total.textContent = frase(visiveis.length, itens.length);

    if (opcoes.lembrarNaAba) gravarMemoria(chaveMemoria, { escolhidas, modo });
  }

  pai.insertBefore(barra, tabela);
  pintar();

  // A lista do SEI é montada pelo servidor, mas "Ver por marcadores" e a
  // ordenação por coluna trocam as linhas sem recarregar a página. Sem isto o
  // filtro continuaria valendo para linhas que já não existem.
  const parar = observar(tabela, () => {
    itens = itensDaTabela(tabela);
    catalogo = catalogar(itens);
    escolhidas = apenasExistentes(escolhidas, catalogo);
    pintar();
  });

  return () => {
    parar();
    for (const item of itens) mostrar(item.linha);
    barra.remove();
  };
}

export default {
  id: 'filtro-marcadores',
  nome: 'Filtrar a lista por marcadores',
  descricao:
    'No Controle de Processos, transforma os marcadores da lista em botões. ' +
    'Escolhendo dois ou mais, ficam à vista só os processos que têm todos eles. ' +
    'Só esconde e mostra linha: não clica em nada e não guarda processo nenhum.',
  padraoAtiva: true,

  rotulosOpcoes: {
    modoPadrao: 'Como combinar dois ou mais marcadores: todos / qualquer',
    lembrarNaAba: 'Manter o filtro ao navegar (até fechar a aba)',
  },

  opcoesPadrao: {
    modoPadrao: 'todos',
    lembrarNaAba: true,
  },

  telas: ['controle-processos'],
  // Todos os frames: a lista mora na janela de cima nesta instalação, mas há
  // versão do SEI que a coloca num frame de conteúdo. Rodar em todos é barato
  // — sem tabela de processo, tabelasDeProcesso() devolve vazio e nada
  // acontece.
  frames: ['*'],

  setup(ctx) {
    // Recarregar a extensão com a aba aberta deixaria duas barras.
    for (const antiga of qsa('.seix-marcadores')) antiga.remove();

    const tabelas = tabelasDeProcesso();
    if (!tabelas.length) {
      log.debug('nenhuma tabela de processo nesta tela; filtro de marcadores parado');
      return undefined;
    }

    const desfazer = tabelas
      .map((tabela, i) => instalarEm(tabela, ctx.opcoes, i))
      .filter(Boolean);

    if (!desfazer.length) {
      // Lista sem marcador nenhum é o caso normal em unidade que não os usa.
      // O diagnóstico entra em debug para o dia em que ELES existem na tela e
      // a extensão não os enxerga — que é o erro difícil.
      log.debug('nenhum marcador reconhecido na lista', diagnosticar());
      return undefined;
    }

    return () => desfazer.forEach((f) => f());
  },
};
