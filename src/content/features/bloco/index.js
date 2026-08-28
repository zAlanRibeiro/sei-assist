/**
 * Feature: alerta de bloco de assinatura.
 *
 * Avisa quando entra bloco novo no bloco de assinatura da sua unidade, ou
 * quando um bloco que ja estava la muda de estado - sem voce precisar abrir a
 * tela.
 *
 * Como funciona: enquanto houver uma aba do SEI aberta, a extensao pede a
 * pagina "Blocos de Assinatura" de tempos em tempos e compara com o que viu na
 * ultima vez. A requisicao passa por core/rede.js, a unica porta de rede do
 * projeto: so GET, so a mesma origem, sem corpo.
 *
 * O que ela NAO faz: assinar, devolver, atribuir ou alterar bloco nenhum. E
 * leitura, e so.
 */
import { observar } from '../../core/dom.js';
import { registrarAtalho } from '../../core/hotkeys.js';
import { toast } from '../../core/ui.js';
import { log } from '../../core/log.js';
import { buscarHtml, lerHtml, ErroDeRede } from '../../core/rede.js';
import { comparar, contar, primeiraLeitura, relevantes } from './blocos.js';
import { lerBlocos, unidadeAtual, urlDaLista } from './seletores.js';
import { estaNaHora, guardarEstado, lerEstado, marcarComoVisto } from './armazenamento.js';
import { contadorNoIcone, limparSelos, marcarMenu, tarja } from './aviso.js';

const MINUTO = 60 * 1000;

/**
 * Consulta a lista e conta o que mudou.
 *
 * Devolve sempre um objeto com `ok`, e nao um valor solto, porque quem chama
 * precisa distinguir tres desfechos que parecem iguais de fora: "consultei e
 * nao ha novidade", "ainda nao era hora" e "nao consegui olhar". Confundir os
 * dois ultimos com o primeiro foi o que deixou a feature muda sem ninguem
 * perceber.
 */
async function consultar(intervaloMs, { forcar = false } = {}) {
  const url = urlDaLista();
  if (!url) return { ok: false, motivo: 'o menu do SEI nao esta nesta tela' };

  const estado = await lerEstado();
  if (!forcar && !estaNaHora(estado.quando, intervaloMs)) {
    return { ok: true, pulou: true, pendentes: estado.pendentes };
  }

  let html;
  try {
    html = await buscarHtml(url);
  } catch (err) {
    if (err instanceof ErroDeRede) {
      // Sem alarme e sem mexer no estado guardado: a proxima passagem tenta de
      // novo. Alterar o estado aqui inventaria novidade na volta.
      return { ok: false, motivo: err.motivo, detalhe: err.message };
    }
    throw err;
  }

  const doc = lerHtml(html);
  if (!doc) return { ok: false, motivo: 'nao consegui interpretar a resposta' };

  const unidade = unidadeAtual();
  const lidos = lerBlocos(doc);
  const agora = relevantes(lidos, unidade);
  const quando = new Date().toISOString();

  // Ler zero tem duas causas opostas - a resposta nao trouxe a lista, ou
  // trouxe e o filtro descartou tudo - e de fora elas sao identicas. Sem
  // separar as duas, diagnosticar vira adivinhacao.
  const diagnostico = {
    lidos: lidos.length,
    relevantes: agora.length,
    unidade,
    titulo: doc.querySelector('h1')?.textContent?.trim() || '(sem h1)',
    temTabela: Boolean(doc.querySelector('#tblBlocos')),
    legenda: doc.querySelector('caption')?.textContent?.trim() || '(sem caption)',
  };
  // Nenhum bloco para a sua unidade e o estado NORMAL - a maior parte do
  // tempo nao ha nada mesmo. Isto era um `warn`, e virava um aviso a cada
  // consulta, para sempre, na pagina de erros da extensao. Diagnostico util,
  // nivel errado.
  //
  // A resposta sem TABELA nenhuma e outra coisa: ou a pagina mudou, ou o
  // parser quebrou. Essa continua merecendo aviso, porque so aparece quando
  // ha algo a consertar.
  if (!agora.length) {
    if (diagnostico.temTabela) log.debug('bloco de assinatura: nada relevante', diagnostico);
    else log.warn('bloco de assinatura: a resposta nao tinha tabela', diagnostico);
  }

  // Primeira vez: so registra o ponto de partida. Instalar a extensao com
  // quinze blocos parados nao pode virar quinze avisos de "chegou agora".
  if (primeiraLeitura(estado.visto)) {
    await guardarEstado({ visto: agora, quando, pendentes: 0 });
    log.info(`bloco de assinatura: ${agora.length} bloco(s) no ponto de partida`);
    return { ok: true, inicial: true, total: agora.length, pendentes: 0, diagnostico };
  }

  const mudanca = comparar(estado.visto, agora);
  const quantos = contar(mudanca);
  // Acumula: o que voce ainda nao viu continua contando na proxima consulta.
  const pendentes = estado.pendentes + quantos;

  await guardarEstado({ visto: agora, quando, pendentes });
  if (quantos) log.info(`bloco de assinatura: ${quantos} novidade(s)`);

  return { ok: true, total: agora.length, pendentes, mudanca: quantos ? mudanca : null, diagnostico };
}

/** Texto do retorno da verificacao manual. */
function resumo(r) {
  if (!r.ok) return { texto: `Não consegui verificar o bloco: ${r.motivo}.`, tipo: 'erro' };
  if (r.inicial) {
    return {
      texto: `Ponto de partida registrado: ${r.total} bloco(s) na sua unidade. A partir de agora eu aviso o que chegar.`,
      tipo: 'sucesso',
    };
  }
  if (r.mudanca) return { texto: null, tipo: 'alerta' }; // a tarja ja diz

  // Zero merece explicacao, nao um "tudo certo". A tela do usuario mostrava
  // dois blocos quando isto apareceu pela primeira vez, e o aviso de
  // "nenhuma novidade" escondia que a leitura nao tinha funcionado.
  if (!r.total && r.diagnostico) {
    const d = r.diagnostico;
    if (!d.temTabela) {
      return {
        texto: `A resposta do SEI não trouxe a lista (página: "${d.titulo}"). O link do menu pode não valer para consulta em segundo plano.`,
        tipo: 'erro',
      };
    }
    if (d.lidos && !d.relevantes) {
      return {
        texto: `Li ${d.lidos} bloco(s), mas nenhum é da unidade "${d.unidade}". ${d.legenda}`,
        tipo: 'alerta',
      };
    }
    return {
      texto: `A tabela veio vazia. ${d.legenda} (unidade: "${d.unidade}")`,
      tipo: 'alerta',
    };
  }

  return { texto: `Bloco de assinatura: ${r.total} bloco(s), nenhuma novidade.`, tipo: 'info' };
}

export default {
  id: 'alerta-bloco-assinatura',
  nome: 'Alerta de bloco de assinatura',
  descricao:
    'Avisa quando entra bloco novo na assinatura da sua unidade, ou quando um bloco muda de estado. Consulta a página do bloco de tempos em tempos, só leitura — nunca assina nem devolve nada.',
  padraoAtiva: true,

  rotulosOpcoes: {
    intervaloMinutos: 'Consultar a cada (minutos)',
    atalho: 'Atalho para verificar agora',
    avisarNaPagina: 'Mostrar tarja na página do SEI',
    marcarNoMenu: 'Marcar o menu Blocos / Assinatura',
  },

  opcoesPadrao: {
    intervaloMinutos: '10',
    atalho: 'Ctrl+Shift+B',
    avisarNaPagina: true,
    marcarNoMenu: true,
  },

  telas: ['*'],
  // So onde ha menu lateral: e de la que sai a URL com o infra_hash valido.
  frames: ['topo'],

  setup(ctx) {
    const intervaloMs = Math.max(2, Number(ctx.opcoes.intervaloMinutos) || 10) * MINUTO;
    const limpezas = [];
    let vivo = true;

    /** Redesenha os avisos a partir do que esta guardado. */
    const pintar = async () => {
      const { pendentes } = await lerEstado();
      if (!vivo) return;
      if (ctx.opcoes.marcarNoMenu) marcarMenu(pendentes);
      await contadorNoIcone(pendentes);
    };

    const verificar = async ({ forcar = false, avisarSempre = false } = {}) => {
      if (!vivo) return null;
      let r;
      try {
        r = await consultar(intervaloMs, { forcar });
      } catch (err) {
        log.error('falha ao verificar o bloco de assinatura:', err);
        return null;
      }

      if (!r.ok) log.warn(`bloco de assinatura: ${r.motivo}`, r.detalhe || '');
      if (r.mudanca && ctx.opcoes.avisarNaPagina) tarja(r.mudanca);

      // Verificacao manual sempre responde alguma coisa: ficar em silencio e
      // o que impede de saber se a coisa esta funcionando.
      if (avisarSempre && !r.pulou) {
        const { texto, tipo } = resumo(r);
        if (texto) toast(texto, { tipo, duracao: 6000 });
      }

      await pintar();
      return r;
    };

    // Na propria tela do bloco: consulta forcada e zera o alerta.
    //
    // Forcar aqui e importante por dois motivos. O ponto de partida fica
    // registrado assim que voce abre a tela uma vez, em vez de esperar o
    // primeiro intervalo. E o estado guardado passa a bater com o que voce
    // acabou de ver - sem isso, zerar o contador deixava o registro velho, e a
    // consulta seguinte anunciava como novo um bloco que voce ja tinha visto.
    if (ctx.screen === 'bloco-assinatura') {
      limparSelos();
      verificar({ forcar: true })
        .then(() => marcarComoVisto())
        .then(() => contadorNoIcone(0))
        .then(() => limparSelos())
        .catch((err) => log.error('falha ao sincronizar com a tela do bloco:', err));
    } else {
      verificar();
    }

    // Verificacao sob demanda. Existe para nao depender do intervalo quando se
    // quer saber agora - e e o jeito mais rapido de descobrir se a consulta
    // esta passando ou sendo barrada.
    limpezas.push(
      registrarAtalho(ctx.opcoes.atalho, () => verificar({ forcar: true, avisarSempre: true }), {
        descricao: 'Verificar o bloco de assinatura agora',
      }),
    );

    // O timer cobre quem fica parado na mesma tela; quem navega e coberto pela
    // verificacao do carregamento, que estaNaHora() segura pelo relogio.
    const timer = setInterval(() => verificar(), intervaloMs);

    // O menu do SEI e remontado ao expandir/recolher, o que apaga o selo.
    const pararObservador = observar(
      document.body,
      () => {
        if (vivo && ctx.opcoes.marcarNoMenu) pintar();
      },
      { debounce: 800 },
    );

    return () => {
      vivo = false;
      clearInterval(timer);
      pararObservador && pararObservador();
      limpezas.forEach((fn) => {
        try {
          fn();
        } catch {
          /* limpeza nao pode derrubar as outras */
        }
      });
      limparSelos();
      contadorNoIcone(0);
    };
  },
};
