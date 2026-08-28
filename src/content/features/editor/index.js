/**
 * Feature: editor - rascunho e inserir data.
 *
 * Duas coisas que o editor do SEI nao tem:
 *
 *  1. recuperacao do que voce estava escrevendo, para quando a sessao expira e
 *     leva o texto junto;
 *  2. um botao que escreve a data por extenso no ponto do cursor.
 *
 * Nao clica em Salvar nem em Assinar, nunca. So observa o Salvar do SEI para
 * saber que pode descartar o rascunho.
 */
import { el, observar, qsAny } from '../../core/dom.js';
import { toast, confirmar } from '../../core/ui.js';
import { log } from '../../core/log.js';
import { formatarData } from './data.js';
import { corpoDoTexto, idDoDocumento, secoes, textoDasSecoes, EDITOR } from './seletores.js';
import { descartar, guardar, podeGuardar, recuperar } from './rascunho.js';
import { descobrirNivel, diagnosticar, ehFechado } from './nivelAcesso.js';

const ID_BOTAO = 'seix-editor-data';
const INTERVALO_MS = 5000;

/**
 * Estilo inline: o content.css entra antes das folhas do CKEditor e perde o
 * empate de especificidade. A aparencia vem da classe copiada de um botao
 * vizinho da propria barra.
 */
const ESTILO = { marginLeft: '2px' };

/** Comprimento da amostra usada para reconhecer o texto inserido. */
const AMOSTRA = 60;

/**
 * Quantas vezes `agulha` aparece em `conteudo`, ignorando espaco.
 *
 * Existe porque a verificacao anterior era frouxa e mentiu: ela perguntava
 * "o texto da area mudou?", e mexer na selecao ja muda (sobra um paragrafo
 * vazio). O log dizia "funcionou" e a tela continuava igual.
 *
 * Duas decisoes que importam:
 *
 *  - espaco e ignorado porque o editor reflui o texto ao inseri-lo, e
 *    comparar caractere a caractere daria falso negativo;
 *  - conta ocorrencias em vez de perguntar se esta presente, porque inserir
 *    a mesma data duas vezes e legitimo: o que prova a insercao e o numero
 *    ter subido.
 */
export function contarOcorrencias(conteudo, agulha) {
  const semEspacos = (t) => String(t || '').replace(/\s+/g, '');
  const amostra = semEspacos(agulha).slice(0, AMOSTRA);
  if (!amostra) return 0;

  const onde = semEspacos(conteudo);
  let total = 0;
  let i = onde.indexOf(amostra);
  while (i !== -1) {
    total++;
    i = onde.indexOf(amostra, i + amostra.length);
  }
  return total;
}

/** Espera o CKEditor terminar de aplicar a mudanca no modelo e redesenhar. */
const respirar = (ms = 60) => new Promise((r) => setTimeout(r, ms));

/**
 * A area editavel que vai receber o texto, com o cursor garantido dentro.
 *
 * `focus()` num contenteditable nem sempre cria uma selecao, e sem selecao
 * nao ha "ponto do cursor" - a insercao falha sem erro nenhum.
 */
function garantirCursor() {
  const ativo = document.activeElement;
  let alvo = ativo && ativo.closest ? ativo.closest('.ck-editor__editable') : null;

  if (!alvo) {
    alvo = corpoDoTexto();
    if (!alvo) return null;
    alvo.focus();
  }

  const selecao = document.getSelection();
  if (!selecao) return alvo;

  const dentro = selecao.rangeCount > 0 && alvo.contains(selecao.anchorNode);
  if (!dentro) {
    // DENTRO do ultimo paragrafo, e nao no fim da area: colapsando no fim da
    // area o texto entra AO LADO do paragrafo vazio, que continua vazio e
    // continua mostrando o placeholder.
    const blocos = alvo.querySelectorAll('p, div, li');
    const ultimo = blocos.length ? blocos[blocos.length - 1] : alvo;

    const faixa = document.createRange();
    faixa.selectNodeContents(ultimo);
    faixa.collapse(false);
    selecao.removeAllRanges();
    selecao.addRange(faixa);
  }
  return alvo;
}

/** Seleciona todo o conteudo de uma secao, para que a escrita o substitua. */
async function selecionarTudo(elemento) {
  const selecao = document.getSelection();
  if (!selecao) return false;

  const faixa = document.createRange();
  faixa.selectNodeContents(elemento);
  selecao.removeAllRanges();
  selecao.addRange(faixa);
  await respirar(50);
  return true;
}

/**
 * Roda uma tentativa de escrita e diz se o texto entrou E ficou.
 *
 * A verificacao e por contagem de ocorrencias, e nao pelo retorno das APIs.
 * Motivo concreto: `dispatchEvent` devolve `false` quando o handler chamou
 * preventDefault - ou seja, `false` significa "o CKEditor tratou". E a
 * segunda olhada existe porque o CKEditor aceita escrita direta no DOM e a
 * reverte logo depois, para voltar ao que o modelo dele diz.
 */
async function tentar(alvo, texto, acao) {
  const antes = contarOcorrencias(alvo.innerText, texto);
  try {
    await acao();
  } catch {
    return false;
  }

  await respirar();
  if (contarOcorrencias(alvo.innerText, texto) <= antes) return false;

  await respirar(150);
  return contarOcorrencias(alvo.innerText, texto) > antes;
}

/** Digitacao simulada: entra no historico de desfazer como se fosse digitada. */
const digitar = (texto) => () => {
  document.execCommand('insertText', false, texto);
};

/**
 * Colagem simulada.
 *
 * E o unico caminho que SUBSTITUI uma selecao de varios blocos: o
 * `insertText` e recusado nesse caso, e era isso que deixava o placeholder
 * "Inserir texto ..." na tela depois de restaurar.
 */
const colar = (alvo, texto) => () => {
  const dados = new DataTransfer();
  dados.setData('text/plain', texto);
  alvo.dispatchEvent(
    new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true }),
  );
};

/** Ultimo recurso: entrega o texto pela area de transferencia. */
async function entregarPelaAreaDeTransferencia(texto) {
  try {
    await navigator.clipboard.writeText(texto);
    toast(
      'Não consegui escrever no editor. O texto está na área de transferência — cole com Ctrl+V.',
      { tipo: 'alerta', duracao: 7000 },
    );
  } catch {
    toast('Não consegui escrever no editor nem copiar o texto.', { tipo: 'erro' });
  }
  return { ok: false, via: 'nenhum' };
}

/** Escreve no ponto do cursor, sem apagar o que ja existe. */
async function escreverNoCursor(texto) {
  const alvo = garantirCursor();
  if (!alvo) {
    toast('Não achei onde escrever. Clique dentro do texto e tente de novo.', {
      tipo: 'alerta',
    });
    return { ok: false, via: 'sem alvo' };
  }

  if (await tentar(alvo, texto, digitar(texto))) return { ok: true, via: 'digitacao' };
  if (await tentar(alvo, texto, colar(alvo, texto))) return { ok: true, via: 'colagem' };
  return entregarPelaAreaDeTransferencia(texto);
}

/**
 * Troca todo o conteudo de uma secao pelo texto.
 *
 * A ordem e o contrario da de escreverNoCursor(), de proposito: aqui a
 * colagem vem primeiro porque e a unica que substitui uma selecao de varios
 * blocos. Acrescentar em vez de substituir era o que deixava os paragrafos
 * vazios - e o placeholder deles - na tela depois de restaurar.
 */
async function substituirSecao(elemento, bruto) {
  // Espaco em branco no fim vira paragrafo vazio, que volta a mostrar o
  // placeholder. Corta antes de escrever.
  const texto = String(bruto || '').replace(/\s+$/, '');
  if (!texto) return { ok: false, via: 'texto vazio' };

  elemento.focus();
  await respirar(150);
  await selecionarTudo(elemento);

  if (await tentar(elemento, texto, colar(elemento, texto))) return { ok: true, via: 'colagem' };

  // A colagem nao passou: recoloca o cursor e tenta digitar, que ao menos
  // devolve o texto - ainda que sem apagar o que estava la.
  elemento.focus();
  await respirar(100);
  if (await tentar(elemento, texto, digitar(texto))) return { ok: true, via: 'digitacao' };

  return entregarPelaAreaDeTransferencia(texto);
}

/** Alguma area editavel do documento esta com o cursor? */
function editavelFocado() {
  const ativo = document.activeElement;
  return Boolean(ativo && ativo.closest && ativo.closest('.ck-editor__editable'));
}

/** Botao "Data" na barra do CKEditor. */
function botaoDeData(ctx) {
  if (document.getElementById(ID_BOTAO)) return null;

  const barra = qsAny(EDITOR.barra);
  if (!barra) {
    log.debug('barra do editor nao encontrada; sem botao de data');
    return null;
  }

  const botao = el('button', {
    id: ID_BOTAO,
    type: 'button',
    style: ESTILO,
    title: 'Inserir a data de hoje por extenso',

    // Clicar num botao comum TIRA O FOCO do editor, e sem cursor nao ha
    // onde inserir - o clique parecia nao fazer nada. Os botoes do proprio
    // CKEditor cancelam o mousedown por isso; este passou a fazer igual.
    onmousedown: (ev) => ev.preventDefault(),

    onclick: async (ev) => {
      ev.preventDefault();
      const texto = formatarData(new Date(), {
        formato: ctx.opcoes.formatoData,
        cidade: ctx.opcoes.cidade,
      });
      if (!texto) return;

      // Se nada estiver focado (a janela acabou de abrir, por exemplo), o
      // corpo do texto e o destino razoavel.
      if (!editavelFocado()) {
        const corpo = corpoDoTexto();
        if (corpo) corpo.focus();
      }
      const r = await escreverNoCursor(texto);
      log.info(`inserir data: ${r.ok ? `funcionou por ${r.via}` : `falhou (${r.via})`}`);
    },
  });

  // Classes canonicas do CKEditor, e nao as copiadas de um vizinho.
  //
  // Copiar parecia mais robusto e nao era: o primeiro botao da barra e o
  // Salvar, que carrega `salvar__pisca` - a classe que o faz piscar. O botao
  // novo herdava a opacidade animada e ficava com cara de desabilitado.
  botao.className = 'ck ck-button ck-off ck-button_with-text';
  botao.appendChild(el('span', { class: 'ck ck-button__label', text: 'Data' }));

  barra.appendChild(botao);
  return botao;
}


/**
 * Oferece o rascunho e, se a pessoa aceitar, devolve o texto ao editor.
 *
 * Restaurar e mais delicado que inserir a data: clicar no botao do dialogo
 * TIRA O FOCO do editor, e o CKEditor restaura a selecao do modelo dele ao
 * reassumir o foco. Dai a pausa depois de cada focus().
 *
 * Secoes com estrutura (Cabecalho e Rodape) ficam de fora: elas trazem o
 * timbre e a tabela de referencia, texto puro nao as reconstroi, e elas nao
 * se perdem - o SEI as gera a partir do modelo do documento.
 */
async function oferecerRecuperacao(rascunho) {
  const quando = new Date(rascunho.quando).toLocaleString('pt-BR');
  const vivas = secoes();

  // O que da para devolver: tem texto guardado, existe na tela agora, e nao
  // e uma secao estruturada.
  const devolver = vivas
    .filter((s) => !s.estruturada)
    .map((s) => ({ ...s, texto: (rascunho.secoes || {})[s.rotulo] }))
    .filter((s) => s.texto && s.texto.trim() && s.texto !== s.elemento.innerText);

  if (!devolver.length) {
    log.debug('rascunho: nada que valha devolver');
    return false;
  }

  const lista = devolver.map((s) => s.rotulo).join(
);
  const aceitou = await confirmar({
    titulo: 'Há um rascunho deste documento',
    texto:
      `Guardado em ${quando}.\n\n` +
      `Seções a recuperar: ${lista}.\n\n` +
      'Isso costuma acontecer quando a sessão do SEI expira enquanto você escreve. ' +
      'O conteúdo atual de cada seção listada é substituído.',
    confirmarTexto: 'Restaurar',
    cancelarTexto: 'Agora não',
  });
  if (!aceitou) return false;

  let feitas = 0;
  for (const secao of devolver) {
    const r = await substituirSecao(secao.elemento, secao.texto);
    log.info(`restaurar "${secao.rotulo}": ${r.ok ? `por ${r.via}` : `falhou (${r.via})`}`);
    if (r.ok) feitas++;
  }

  if (feitas) {
    toast(
      feitas === 1 ? 'Rascunho restaurado.' : `Rascunho restaurado em ${feitas} seções.`,
      { tipo: 'sucesso' },
    );
  }
  return feitas > 0;
}
export default {
  id: 'editor-rascunho',
  nome: 'Rascunho e data no editor',
  descricao:
    'Guarda o que você está escrevendo, para recuperar se a sessão do SEI expirar, e põe um botão que insere a data por extenso. O rascunho fica só neste navegador, por 3 dias.',
  padraoAtiva: true,

  rotulosOpcoes: {
    cidade: 'Cidade no fecho do documento (ex.: Niterói)',
    formatoData: 'Formato da data (extenso ou curta)',
    guardarRascunho: 'Guardar rascunho do texto',
    rascunhoSoPublicos: 'Só guardar rascunho quando o documento for público',
  },

  opcoesPadrao: {
    // Vazio de proposito: a extensao serve a qualquer orgao, e chutar uma
    // cidade escreveria a errada no fecho de um documento oficial. Sem ela
    // o botao insere so a data, que esta sempre certa.
    cidade: '',
    formatoData: 'extenso',
    // Desligavel porque e a unica parte da extensao que guarda conteudo.
    guardarRascunho: true,
    // Documento restrito ou sigiloso nunca vira rascunho - isso nao e opcao.
    // Esta aqui decide o caso em que NAO SE SABE o nivel: por padrao guarda,
    // porque a deteccao ainda nao foi confirmada contra tela real e recusar
    // tudo mataria a funcionalidade. Quem prefere o lado seguro liga.
    rascunhoSoPublicos: false,
  },

  telas: ['editor'],
  frames: ['*'],

  setup(ctx) {
    const idDocumento = idDoDocumento(window.name, location.href);
    let vivo = true;
    let ultimo = null;

    const limpezas = [];

    // O botao pode chegar antes da barra: o CKEditor monta a barra por
    // JavaScript, e rodar so no carregamento pega a tela ainda vazia.
    const montarBotao = () => {
      if (vivo) botaoDeData(ctx);
    };
    montarBotao();
    limpezas.push(observar(document.body, montarBotao, { debounce: 500 }));

    if (!idDocumento) {
      // Sem id nao ha chave estavel: guardar aqui seria guardar onde ninguem
      // vai procurar depois.
      log.warn(`rascunho sem id de documento (janela "${window.name}")`);
      return () => limpezas.forEach((fn) => fn && fn());
    }

    // O nivel de acesso e lido UMA vez, na entrada: ele nao muda enquanto o
    // documento esta aberto no editor, e reler a cada gravacao so gastaria.
    //
    // A resposta vem da ARVORE do processo, na janela que abriu o editor - a
    // janela do editor nao mostra nivel de acesso nenhum.
    const nivel = descobrirNivel(idDocumento);
    const permissao = podeGuardar({
      nivel,
      guardarRascunho: ctx.opcoes.guardarRascunho,
      soPublicos: ctx.opcoes.rascunhoSoPublicos,
    });

    if (!permissao.pode) {
      // Em voz alta, e nao no console: quem esta escrevendo precisa saber que
      // nao ha rede embaixo. Silencio aqui ja foi o pior defeito desta parte.
      if (ehFechado(permissao.motivo)) {
        toast(
          `Documento ${permissao.motivo}: o rascunho nao sera guardado.`,
          { tipo: 'aviso', duracao: 6000 },
        );
      } else if (permissao.motivo === 'nivel-desconhecido') {
        toast(
          'Nao identifiquei o nivel de acesso deste documento; por sua opcao, ' +
            'o rascunho nao sera guardado.',
          { tipo: 'aviso', duracao: 6000 },
        );
        diagnosticar();
      }
      log.debug(`rascunho recusado: ${permissao.motivo}`);
      return () => limpezas.forEach((fn) => fn && fn());
    }

    // Guardando sem saber o nivel: registra o que a tela mostra, para fechar
    // essa lacuna com evidencia em vez de mais um chute.
    if (nivel === 'desconhecido') diagnosticar();
    log.info(`rascunho ativo para doc:${idDocumento}`);

    // Oferta de recuperacao.
    //
    // Nao pode ser uma tentativa unica no carregamento: o CKEditor monta o
    // corpo por JavaScript, e no instante em que o content script entra ele
    // quase sempre ainda nao existe. Uma tentativa so acertava por sorte.
    let ofertaFeita = false;
    const prazoDaOferta = Date.now() + 20000;

    const tentarOferecer = async () => {
      if (ofertaFeita || !vivo || Date.now() > prazoDaOferta) return;

      const corpo = corpoDoTexto();
      if (!corpo) return; // ainda montando

      ofertaFeita = true;
      const guardado = await recuperar(idDocumento);
      if (!guardado) {
        log.debug('rascunho: nada guardado para este documento');
        return;
      }
      if (JSON.stringify(guardado.secoes || {}) === JSON.stringify(textoDasSecoes())) {
        log.debug('rascunho: igual ao que ja esta na tela; nada a oferecer');
        return;
      }
      log.info(`rascunho: oferecendo o de ${guardado.quando}`);
      if (vivo) await oferecerRecuperacao(guardado);
    };

    tentarOferecer().catch((err) => log.error('falha ao recuperar rascunho:', err));
    limpezas.push(
      observar(document.body, () => {
        tentarOferecer().catch((err) => log.error('falha ao recuperar rascunho:', err));
      }, { debounce: 600 }),
    );

    const salvarRascunho = async () => {
      if (!vivo) return;

      const colhidas = textoDasSecoes();
      // Sem secao nenhuma o CKEditor ainda esta montando: guardar agora
      // gravaria um documento vazio por cima do rascunho bom.
      if (!Object.keys(colhidas).length) return;

      const assinatura = JSON.stringify(colhidas);
      if (assinatura === ultimo) return;
      ultimo = assinatura;

      const gravou = await guardar(idDocumento, colhidas, { titulo: document.title });
      // Ficar em silencio aqui foi o que impediu de saber se o rascunho
      // estava sendo guardado ou nao.
      log.debug(
        gravou
          ? `rascunho: ${Object.keys(colhidas).length} seção(ões) guardadas em doc:${idDocumento}`
          : 'rascunho: nada a guardar nesta passagem',
      );
    };

    const relogio = setInterval(salvarRascunho, INTERVALO_MS);
    limpezas.push(() => clearInterval(relogio));

    // Documento salvo: o SEI passa a ser a fonte da verdade e a copia local
    // deixa de ter motivo para existir. Escuta por delegacao porque o
    // CKEditor remonta a barra.
    const aoClicar = (ev) => {
      const alvo = ev.target && ev.target.closest && ev.target.closest(EDITOR.salvar.join(', '));
      if (!alvo) return;
      // Espera o salvamento acontecer antes de jogar fora a copia.
      setTimeout(() => descartar(idDocumento).catch(() => {}), 4000);
    };
    document.addEventListener('click', aoClicar, true);
    limpezas.push(() => document.removeEventListener('click', aoClicar, true));

    return () => {
      vivo = false;
      limpezas.forEach((fn) => {
        try {
          fn && fn();
        } catch {
          /* uma limpeza nao pode derrubar as outras */
        }
      });
      const botao = document.getElementById(ID_BOTAO);
      if (botao) botao.remove();
    };
  },
};
