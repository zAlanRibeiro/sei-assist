/**
 * painel.js - o historico na tela do Controle de Processos.
 *
 * Painel lateral com busca, filtro de periodo, agrupamento por dia e
 * exportacao para CSV. So le o armazenamento; nao toca no SEI.
 */
import { el } from '../../core/dom.js';
import { setOpcoesFeature } from '../../core/settings.js';
import { painel as abrirPainel, toast, confirmar as confirmarDialogo } from '../../core/ui.js';
import {
  listar,
  contar,
  limpar,
  remover,
  removerVarios,
  favoritar,
  paraCsv,
  onMudanca,
} from './armazenamento.js';
import { identidadesDoDono } from './sessao.js';

const DIA_MS = 24 * 60 * 60 * 1000;

/**
 * Cada tipo de evento em um lugar so: como aparece na aba, na etiqueta e no
 * titulo da linha. Adicionar um tipo novo ao historico e acrescentar uma
 * entrada aqui - nao ha condicional espalhada pelo arquivo.
 */
const EVENTOS = {
  assinatura: {
    aba: 'Assinados',
    etiqueta: 'ASSINADO',
    titulo: (r) => [r.tipo, r.documento].filter(Boolean).join(' ') || 'Documento assinado',
  },
  envio: {
    aba: 'Enviados',
    etiqueta: 'ENVIADO',
    titulo: (r) => (r.destino ? `Enviado para ${r.destino}` : 'Processo enviado'),
  },
  'processo-criado': {
    aba: 'Proc. criados',
    etiqueta: 'PROC. CRIADO',
    titulo: () => 'Processo criado',
  },
  'documento-criado': {
    aba: 'Doc. criados',
    etiqueta: 'DOC. CRIADO',
    // A captura no ato sabe o tipo mas ainda nao o numero; o andamento sabe o
    // numero mas nem sempre o tipo. O titulo usa o que houver.
    titulo: (r) => {
      const nome = r.tipo || 'Documento';
      return r.documento ? `${nome} ${r.documento} criado` : `${nome} criado`;
    },
  },
};

/** Registro antigo, gravado antes de existir tipoEvento, e assinatura. */
function tipoDe(registro) {
  return EVENTOS[registro.tipoEvento] ? registro.tipoEvento : 'assinatura';
}

const TIPOS = [
  { id: 'tudo', rotulo: 'Tudo' },
  ...Object.entries(EVENTOS).map(([id, e]) => ({ id, rotulo: e.aba })),
];

/**
 * Por onde a assinatura passou.
 *
 * So a assinatura tem essa distincao, entao o filtro aparece somente na aba
 * "Assinados" - poluir as outras com um controle que nao muda nada seria pior
 * que nao ter o filtro.
 */
const ORIGENS = [
  { id: 'tudo', rotulo: 'Todas' },
  { id: 'bloco', rotulo: 'Bloco' },
  { id: 'processo', rotulo: 'Processo' },
];

/** Rotulo curto para a etiqueta na linha do registro. */
const ROTULO_ORIGEM = {
  bloco: { texto: 'bloco', titulo: 'Assinado pelo bloco de assinatura' },
  processo: { texto: 'processo', titulo: 'Assinado pela árvore do processo' },
};

const PERIODOS = [
  { id: '7', rotulo: '7 dias', dias: 7 },
  { id: '30', rotulo: '30 dias', dias: 30 },
  { id: 'tudo', rotulo: 'Tudo', dias: null },
];

function inicioDoDia(data) {
  const d = new Date(data);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 'HOJE', 'ONTEM' ou '24/08/2026'. */
function rotuloDoDia(iso) {
  const dia = inicioDoDia(iso).getTime();
  const hoje = inicioDoDia(new Date()).getTime();
  if (dia === hoje) return 'HOJE';
  if (dia === hoje - DIA_MS) return 'ONTEM';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function hora(iso) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function baixarCsv(registros) {
  const blob = new Blob([paraCsv(registros)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = el('a', {
    href: url,
    download: `historico-assinaturas-${new Date().toISOString().slice(0, 10)}.csv`,
  });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copia um texto curto (numero de documento ou de processo).
 *
 * Substitui o antigo link para o SEI. Nao da para linkar: todo link do SEI
 * carrega um `infra_hash` de sessao - sem ele o SEI recusa o acesso e desloga
 * o usuario, e com ele o link morre junto com a sessao.
 */
async function copiar(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(`Copiado: ${texto}`, { tipo: 'sucesso', duracao: 2000 });
  } catch {
    toast('Nao consegui copiar. Selecione o texto na mao.', { tipo: 'alerta' });
  }
}

/** Pedaco clicavel que copia um identificador. */
function copiavel(texto, { classe, titulo }) {
  return el('button', {
    class: `seix-hist__copiavel ${classe}`,
    title: `${titulo} - clique para copiar`,
    text: texto,
    onclick: (ev) => {
      ev.stopPropagation();
      copiar(texto);
    },
  });
}

/**
 * Perguntar antes de remover? E com a saida de "nao perguntar de novo"?
 *
 * Duas regras, e a diferenca entre elas e o ponto:
 *
 *   - FAVORITO pergunta SEMPRE, e sem oferecer a caixa. A estrela existe
 *     para dizer "este nao pode sumir", e o "x" fica a um pixel dela; deixar
 *     um clique errado levar o registro calado desfaz a promessa por engano.
 *     E desligar esse aviso por uma caixinha marcada de passagem seria
 *     desproteger o que a pessoa protegeu a mao.
 *   - O RESTO pergunta uma vez e aceita ser calado. Quem limpa registro
 *     comum o dia todo nao quer um dialogo por clique.
 *
 * Pura de proposito: e politica, nao desenho, e politica sobre apagar dado
 * merece teste.
 */
export function comoRemover(registro, opcoes = {}) {
  if (registro && registro.favorito) {
    return { perguntar: true, comCaixa: false };
  }
  return { perguntar: opcoes.confirmarRemocao !== false, comCaixa: true };
}

function linhaDeRegistro(registro, aoRemover, aoFavoritar) {
  const tipo = tipoDe(registro);
  const evento = EVENTOS[tipo];
  const titulo = evento.titulo(registro);

  const cabecalho = el('div', { class: 'seix-hist__linha' }, [
    el('span', { class: 'seix-hist__hora', text: hora(registro.quando) }),
    el('span', {
      class: `seix-hist__tag seix-hist__tag--${tipo}`,
      text: evento.etiqueta,
    }),
    el('span', { class: 'seix-hist__titulo', text: titulo }),
  ]);

  const detalhes = [];

  // Numero do documento: so faz sentido na assinatura, e so quando o titulo
  // ainda nao o mostrou (documento com nome proprio).
  if (registro.documento && !titulo.includes(registro.documento)) {
    detalhes.push(copiavel(registro.documento, {
      classe: 'seix-hist__doc',
      titulo: 'Numero do documento',
    }));
  }

  // O processo aparece sempre - e a pergunta "dentro de qual processo?".
  if (registro.processo) {
    detalhes.push(copiavel(registro.processo, {
      classe: 'seix-hist__proc',
      titulo: 'Numero do processo',
    }));
  } else {
    detalhes.push(
      el('span', {
        class: 'seix-hist__marca',
        title: 'A extensao nao conseguiu descobrir o processo deste documento. Abrir o processo de novo costuma resolver.',
        text: 'processo desconhecido',
      }),
    );
  }

  if (registro.assinante) {
    detalhes.push(
      el('span', {
        class: 'seix-hist__assinante',
        title: registro.cargo || '',
        text: registro.assinante,
      }),
    );
  }
  // Por onde a assinatura passou. Registro recolhido do corpo do documento
  // nao sabe - a assinatura ja tinha acontecido quando a extensao o viu.
  if (tipo === 'assinatura') {
    const origem = ROTULO_ORIGEM[registro.via];
    detalhes.push(
      origem
        ? el('span', {
            class: 'seix-hist__marca',
            title: origem.titulo,
            text: origem.texto,
          })
        : el('span', {
            class: 'seix-hist__marca',
            title: 'Recolhido depois, do corpo do documento: não dá para saber por onde a assinatura foi feita.',
            text: 'origem desconhecida',
          }),
    );
  }

  if (!registro.quandoExato) {
    detalhes.push(
      el('span', {
        class: 'seix-hist__marca',
        title: 'Data em que a extensao viu o registro, nao a data do ato.',
        text: 'data aproximada',
      }),
    );
  }
  if (!registro.confirmado) {
    detalhes.push(
      el('span', {
        class: 'seix-hist__marca seix-hist__marca--pendente',
        title: 'Registrado, mas ainda nao confirmado pelo SEI.',
        text: 'nao confirmado',
      }),
    );
  }

  return el(
    'li',
    { class: `seix-hist__item seix-hist__item--${tipo}` },
    [
      cabecalho,
      el('div', { class: 'seix-hist__detalhes' }, detalhes),
      el('button', {
        class: registro.favorito
          ? 'seix-hist__favorito seix-hist__favorito--ativo'
          : 'seix-hist__favorito',
        title: registro.favorito
          ? 'Favorito: fica mesmo quando você limpar o histórico. Clique para desmarcar.'
          : 'Favoritar: fica mesmo quando você limpar o histórico.',
        'aria-pressed': registro.favorito ? 'true' : 'false',
        text: registro.favorito ? '★' : '☆',
        onclick: () => aoFavoritar(registro.id, !registro.favorito),
      }),
      el('button', {
        class: 'seix-hist__remover',
        title: 'Remover do histórico',
        text: 'x',
        onclick: () => aoRemover(),
      }),
    ],
  );
}

/** Monta e abre o painel. Devolve { node, corpo, destruir }. */
export function montarPainel(ctx) {
  const estado = {
    busca: '',
    periodo: ctx.opcoes.periodoPadrao || '30',
    tipoEvento: 'tudo',
    via: 'tudo',
    soFavoritos: false,
  };

  // O historico e so do dono: nao existe controle para ver o de outra pessoa.
  // A assinatura identifica por nome completo; o andamento, por login.
  const identidades = identidadesDoDono(ctx.opcoes);

  const abas = el(
    'div',
    { class: 'seix-hist__abas' },
    TIPOS.map((t) =>
      el('button', {
        class: 'seix-hist__aba',
        'data-tipo': t.id,
        text: t.rotulo,
        onclick: () => {
          estado.tipoEvento = t.id;
          render();
        },
      }),
    ),
  );

  const busca = el('input', {
    type: 'search',
    class: 'seix-hist__busca',
    placeholder: 'Buscar por documento, tipo ou processo...',
    oninput: (ev) => {
      estado.busca = ev.target.value;
      render();
    },
  });

  const filtros = el(
    'div',
    { class: 'seix-hist__filtros' },
    PERIODOS.map((p) =>
      el('button', {
        class: 'seix-hist__periodo',
        'data-periodo': p.id,
        text: p.rotulo,
        onclick: () => {
          estado.periodo = p.id;
          render();
        },
      }),
    ),
  );

  // Favoritos: um interruptor, não um período. Fica ao lado dos períodos
  // porque é onde a pessoa já está olhando quando quer estreitar a lista.
  const soFavoritos = el('button', {
    class: 'seix-hist__periodo seix-hist__so-favoritos',
    title: 'Mostrar só os favoritos',
    text: '★ Favoritos',
    onclick: () => {
      estado.soFavoritos = !estado.soFavoritos;
      render();
    },
  });
  filtros.append(soFavoritos);

  // Filtro de origem: so faz sentido para assinatura, entao ele aparece e
  // some conforme a aba. Fica montado o tempo todo e escondido por display
  // para nao perder a escolha ao trocar de aba e voltar.
  const origens = el(
    'div',
    { class: 'seix-hist__filtros seix-hist__origens' },
    ORIGENS.map((o) =>
      el('button', {
        class: 'seix-hist__periodo',
        'data-via': o.id,
        text: o.rotulo,
        title: `Assinados: ${o.rotulo.toLowerCase()}`,
        onclick: () => {
          estado.via = o.id;
          render();
        },
      }),
    ),
  );

  // Sem identidade a extensao nao consegue separar o que e seu, e por isso nao
  // grava nada vindo de fonte ambigua. O usuario precisa saber disso.
  const aviso = identidades.length
    ? null
    : el('p', { class: 'seix-hist__aviso' }, [
        'Ainda não sei quem é você, então só registro o que você assinar ou ' +
          'enviar com a extensão aberta. Preencha seu nome e seu login nas ',
        el('button', {
          class: 'seix-hist__link',
          text: 'opções da extensão',
          onclick: () => {
            try {
              chrome.runtime.sendMessage({ tipo: 'abrir-opcoes' });
            } catch {
              toast('Abra as opções pelo ícone da extensão.', { tipo: 'alerta' });
            }
          },
        }),
        '.',
      ]);

  const lista = el('ul', { class: 'seix-hist__lista' });
  const rodape = el('div', { class: 'seix-hist__rodape' });
  const conteudo = el('div', { class: 'seix-hist' }, [
    abas,
    aviso,
    busca,
    filtros,
    origens,
    lista,
    rodape,
  ]);

  const p = abrirPainel({ titulo: 'Histórico de assinaturas e envios', conteudo });

  async function render() {
    for (const aba of abas.querySelectorAll('.seix-hist__aba')) {
      aba.classList.toggle(
        'seix-hist__aba--ativa',
        aba.getAttribute('data-tipo') === estado.tipoEvento,
      );
    }
    for (const botao of filtros.querySelectorAll('.seix-hist__periodo')) {
      botao.classList.toggle(
        'seix-hist__periodo--ativo',
        botao.getAttribute('data-periodo') === estado.periodo,
      );
    }

    const soAssinaturas = estado.tipoEvento === 'assinatura';
    origens.style.display = soAssinaturas ? '' : 'none';
    for (const botao of origens.querySelectorAll('.seix-hist__periodo')) {
      botao.classList.toggle(
        'seix-hist__periodo--ativo',
        botao.getAttribute('data-via') === estado.via,
      );
    }

    soFavoritos.classList.toggle('seix-hist__periodo--ativo', estado.soFavoritos);
    soFavoritos.setAttribute('aria-pressed', estado.soFavoritos ? 'true' : 'false');

    const periodo = PERIODOS.find((x) => x.id === estado.periodo);
    const registros = await listar({
      busca: estado.busca,
      desde: periodo && periodo.dias ? new Date(Date.now() - periodo.dias * DIA_MS) : null,
      tipoEvento: estado.tipoEvento,
      // O filtro de origem so vale onde ele aparece.
      via: soAssinaturas ? estado.via : 'tudo',
      somenteFavoritos: estado.soFavoritos,
      identidades,
    });
    const total = await contar();

    lista.replaceChildren();

    if (!registros.length) {
      lista.append(
        el('li', {
          class: 'seix-hist__vazio',
          text:
            total === 0
              ? 'Nada registrado ainda. Assine ou envie algo, ou abra um processo antigo para a extensão recolher o que já aconteceu.'
              : estado.soFavoritos
                ? 'Nenhum favorito ainda. Marque com a estrela o que não pode sumir na limpeza.'
                : 'Nenhum registro para este filtro.',
        }),
      );
    } else {
      let diaAtual = null;
      for (const registro of registros) {
        const dia = rotuloDoDia(registro.quando);
        if (dia !== diaAtual) {
          diaAtual = dia;
          lista.append(el('li', { class: 'seix-hist__dia', text: dia }));
        }
        lista.append(
          linhaDeRegistro(
            registro,
            () => removerComCuidado(registro),
            async (id, valor) => {
              await favoritar(id, valor);
              render();
            },
          ),
        );
      }
    }

    rodape.replaceChildren(
      el('span', { class: 'seix-hist__contagem', text: `${registros.length} de ${total}` }),
      el('div', { class: 'seix-hist__acoes' }, [
        el('button', {
          class: 'seix-btn seix-btn--secundario',
          text: 'Exportar CSV',
          onclick: () => {
            if (!registros.length) {
              toast('Nada para exportar neste filtro.', { tipo: 'alerta' });
              return;
            }
            baixarCsv(registros);
          },
        }),
        el('button', {
          class: 'seix-btn seix-btn--secundario',
          text: 'Limpar',
          title: 'Apaga o que está nesta lista, respeitando aba, período e busca',
          onclick: () => limparComCuidado(registros),
        }),
      ]),
    );
  }

  /**
   * Remover um registro, perguntando quando vale a pena.
   *
   * FAVORITO PERGUNTA SEMPRE. A estrela existe justamente para dizer "este
   * nao pode sumir"; deixar que um clique errado no "x" o leve calado seria
   * desfazer a promessa por engano - e o "x" fica a um pixel da estrela.
   *
   * O resto pergunta uma vez e aceita ser calado: quem apaga registro comum
   * o dia todo nao quer um dialogo por clique. A caixa que desliga fica no
   * proprio dialogo, e a opcao continua nas Opcoes para voltar atras.
   */
  async function removerComCuidado(registro) {
    const ehFavorito = Boolean(registro.favorito);
    const { perguntar, comCaixa } = comoRemover(registro, ctx.opcoes);

    if (!perguntar) {
      await remover(registro.id);
      render();
      return;
    }

    const ok = await confirmarDialogo({
      titulo: ehFavorito ? 'Remover um favorito?' : 'Remover do histórico',
      texto: ehFavorito
        ? 'Este registro está marcado como favorito — foi você que pediu para ele não sumir. ' +
          'Removê-lo agora é definitivo, e não afeta nada no SEI.'
        : 'Isso remove o registro deste navegador. Não afeta nada no SEI, e não dá para desfazer.',
      confirmarTexto: 'Remover',
      // Favorito não oferece a saída: uma marca que a pessoa pôs à mão não
      // pode ser desprotegida por uma caixinha marcada de passagem.
      lembrar: comCaixa ? 'Não perguntar de novo ao remover' : null,
      aoLembrar: async (marcada) => {
        if (!marcada) return;
        ctx.opcoes.confirmarRemocao = false;
        await setOpcoesFeature('historico-assinaturas', { confirmarRemocao: false });
        toast('Não vou mais perguntar. Dá para religar nas Opções.', { tipo: 'info' });
      },
    });
    if (!ok) return;

    await remover(registro.id);
    render();
  }

  /**
   * O que a lista mostra agora, dito em palavras.
   *
   * Entra na confirmacao para que "Limpar" nunca seja uma caixa-preta: quem
   * esta na aba "Processos criados" com filtro de 30 dias precisa ler que e
   * isso que vai embora, e nao o historico inteiro.
   */
  function recorteAtual() {
    const partes = [];
    const aba = TIPOS.find((t) => t.id === estado.tipoEvento);
    if (aba && aba.id !== 'tudo') partes.push(`da aba "${aba.rotulo}"`);

    const periodo = PERIODOS.find((x) => x.id === estado.periodo);
    if (periodo && periodo.dias) partes.push(`dos últimos ${periodo.dias} dias`);

    if (estado.soFavoritos) partes.push('marcados como favoritos');
    if (estado.busca.trim()) partes.push(`que casam com "${estado.busca.trim()}"`);

    return partes.length ? ` ${partes.join(', ')}` : '';
  }

  /**
   * Limpar o que ESTA NA LISTA, em dois passos, e nunca por acidente.
   *
   * "Limpar tudo" apagava o historico inteiro, estivesse a pessoa vendo o que
   * fosse. Agora o botao leva exatamente o que a tela mostra: na aba
   * "Processos criados", so processos criados; sem filtro nenhum, tudo.
   *
   * Os favoritos continuam de fora - e para isso que a estrela existe. Quando
   * so restam favoritos na lista, o mesmo botao pergunta se e para levar eles
   * tambem: dois "sim", em telas diferentes.
   */
  async function limparComCuidado(visiveis) {
    const lista = visiveis || [];
    if (!lista.length) {
      toast('Não há nada nesta lista para limpar.', { tipo: 'info' });
      return;
    }

    const favoritos = lista.filter((r) => r.favorito);
    const comuns = lista.filter((r) => !r.favorito);
    const recorte = recorteAtual();

    if (comuns.length) {
      const ok = await confirmarDialogo({
        titulo: 'Limpar o histórico',
        texto:
          `Isso apaga ${comuns.length} registro(s)${recorte} deste navegador.` +
          (favoritos.length ? ` Os ${favoritos.length} favorito(s) ficam.` : '') +
          ' Não afeta nada no SEI, e não dá para desfazer.',
        confirmarTexto: `Apagar ${comuns.length}`,
      });
      if (!ok) return;

      const { apagados, poupados } = await removerVarios(comuns.map((r) => r.id));
      toast(
        poupados
          ? `${apagados} apagado(s). ${poupados} favorito(s) mantido(s).`
          : `${apagados} registro(s) apagado(s).`,
        { tipo: 'sucesso' },
      );
      render();
      return;
    }

    const ok = await confirmarDialogo({
      titulo: 'Apagar também os favoritos?',
      texto:
        `Nesta lista só restam ${favoritos.length} favorito(s). Eles foram marcados ` +
        'para não sumir na limpeza — apagar agora é definitivo.',
      confirmarTexto: 'Apagar os favoritos',
    });
    if (!ok) return;

    const { apagados } = await removerVarios(favoritos.map((r) => r.id), {
      inclusiveFavoritos: true,
    });
    toast(`${apagados} favorito(s) apagado(s).`, { tipo: 'sucesso' });
    render();
  }

  // Mantem o painel em dia se outra aba/frame gravar algo.
  const pararDeOuvir = onMudanca(render);
  const destruirOriginal = p.destruir;
  p.destruir = () => {
    pararDeOuvir();
    destruirOriginal();
  };

  render();
  return p;
}
