/**
 * captura.js - de onde os registros vem.
 *
 * COMO O ATO CHEGA AO HISTORICO
 * Confirmar uma assinatura, um envio ou uma criacao navega a pagina no mesmo
 * instante. chrome.storage e assincrono e nao vence essa corrida - o registro
 * se perdia. Por isso o ato e enfileirado de forma SINCRONA (sessionStorage) e
 * so vira registro no carregamento seguinte, sem pressa.
 *
 * REGRA INEGOCIAVEL: este modulo so observa. Nunca clica em "Assinar", nunca
 * submete formulario, nunca le o campo de senha. Se um dia for preciso
 * disparar alguma acao aqui, ela tem que passar por core/guard.js.
 *
 * Guarda dois tipos de evento: ASSINATURA e ENVIO (tramitacao do processo).
 *
 * Para assinatura, tres fontes, da mais rica para a mais pobre:
 *
 *  1. Bloco de assinatura no corpo do documento
 *     "Documento assinado eletronicamente por Fulano, Cargo, em 02/07/2026,
 *      as 16:59" + "codigo verificador 00009400".
 *     Da nome, cargo, data/hora EXATAS e numero - de qualquer documento
 *     antigo. E a unica fonte verdadeiramente retroativa.
 *
 *  2. Arvore de documentos
 *     Documento assinado tem link para acao=assinatura_listar. Prova que esta
 *     assinado e entrega o id_documento, mas nao diz quem nem quando.
 *
 *  3. Tela de assinatura
 *     Pega o ato no momento em que acontece, com o seu nome.
 *
 * As tres se juntam pelo id_documento; quando ele falta, pelo numero visivel.
 *
 * Para envio, duas fontes:
 *
 *  A. Consultar Andamento
 *     O historico oficial do processo. Retroativo e autoritativo: data
 *     carimbada, unidade de origem e de destino.
 *
 *  B. Tela "Enviar Processo"
 *     Pega o ato no momento, com certeza de que foi voce.
 *
 * As duas se juntam pelo processo mais a proximidade no tempo.
 *
 * POR QUE NAO GUARDAMOS A URL DO SEI
 * Todo link do SEI carrega um `infra_hash`, selo que o servidor valida. Sem
 * ele o SEI recusa o acesso ("link nao assinado") e chega a encerrar a sessao.
 * Com ele, o link so funciona enquanto aquela sessao viver - depois quebra do
 * mesmo jeito. Nao existe URL estavel para um documento do SEI, entao
 * guardamos identificadores (numero, id_documento, id_procedimento) e deixamos
 * o usuario copiar o numero.
 */
import {
  marcarAssinadosVistos,
  marcarAssinadosPorNumero,
  descarregarAtos,
  registrar,
  registrarPorProximidade,
  completarNumeros,
  enfileirarAto,
  descartarPendente,
  idPorNumero,
  obter,
  guardarPendencia,
  lerPendencia,
  limparPendencia,
  PENDENCIA_PROCESSO,
  PENDENCIA_DOCUMENTO,
} from './armazenamento.js';
import {
  documentosAssinadosNoBloco,
  processosParaEnviar,
  idsParaAssinar,
  ANDAMENTO,
  ARVORE,
  ASSINATURA,
  CRIACAO_DOCUMENTO,
  CRIACAO_PROCESSO,
  DOCUMENTO,
  ENVIO,
  acharNup,
  paramDaUrl,
  primeiro,
} from './seletores.js';
import { usuarioAtual, unidadeAtual } from './sessao.js';
import { ehMinha } from './identidade.js';
import { lerDocumento } from './blocoAssinatura.js';
import { lerAndamentos, extrairEnvios, extrairCriacoes } from './andamento.js';
import { documentosAcessiveis, norm, qsa, textoCasa, textoDe } from '../../core/dom.js';
import { log } from '../../core/log.js';

/**
 * Este elemento e o botao que confirma a acao desta tela?
 *
 * Decidido no momento do clique, e nao ao armar. Motivo concreto: o SEI repete
 * a barra de comandos no topo E no rodape, com os MESMOS ids. Um
 * querySelector devolve so o primeiro, entao clicar no botao de baixo passava
 * despercebido - foi o que impedia a captura da criacao de processo.
 *
 * Aceita por seletor especifico ou por TEXTO visivel. Nada de seletor
 * generico: aqui ele casaria com qualquer botao de envio da pagina.
 */
export function ehBotaoDeConfirmacao(elemento, config) {
  for (const seletor of config.botaoConfirmar || []) {
    try {
      if (elemento.matches(seletor)) return true;
    } catch {
      /* seletor invalido: tenta o proximo */
    }
  }

  const texto = norm(textoDe(elemento));
  return (config.rotulosConfirmar || []).some((rotulo) => textoCasa(texto, rotulo));
}

/** O formulario da tela, quando um seletor especifico o encontra. */
function formularioDaTela(config) {
  return primeiro(config.formulario || []);
}

/**
 * Liga os ouvintes que detectam a confirmacao de um ato, sem interferir nele.
 *
 * Dois caminhos, de proposito:
 *
 *  - clique DELEGADO no documento, que pega qualquer botao de confirmacao,
 *    esteja ele na barra de cima, na de baixo, ou tenha sido recriado depois;
 *  - submit do formulario, para fluxos que enviam sem passar por botao.
 *
 * O SEI 5 usa <button type="button" onclick="confirmarDados()">, que nao
 * dispara submit por clique; e formulario submetido por script tambem nao
 * dispara o evento. Um dos dois pega. Se os dois pegarem, a deduplicacao por
 * id resolve.
 *
 * Passiva: nunca clica, nunca submete, nunca chama preventDefault.
 *
 * @param {object} config bloco de seletores da tela
 * @param {string} nome usado so nas mensagens de log
 * @param {() => void} anotar o que fazer quando o usuario confirma
 * @returns {() => void} funcao de limpeza
 */
/**
 * Tempo em que um segundo gatilho para o mesmo ato e ignorado.
 *
 * Enter num formulario pode disparar submit E clique, e as duas coisas
 * enfileirariam o mesmo ato. Nao seria grave - registrar() e idempotente por
 * id -, mas suja o log e confunde quem for diagnosticar.
 */
const JANELA_ANTI_REPETICAO_MS = 1500;

function armarCaptura(config, nome, anotar) {
  const limpezas = [];
  let ultimoAto = 0;

  /**
   * Um erro aqui e invisivel de outra forma: acontece dentro do ouvinte, no
   * instante em que a pagina esta indo embora. Sem este try, o ato sumia sem
   * deixar rastro nem no console.
   */
  const anotarComRede = (gatilho) => {
    const agora = Date.now();
    if (agora - ultimoAto < JANELA_ANTI_REPETICAO_MS) return;
    ultimoAto = agora;

    try {
      anotar();
    } catch (err) {
      log.error(`falha ao registrar ${nome} (${gatilho}):`, err);
      return;
    }

    /**
     * Grava agora, sem esperar a proxima tela.
     *
     * A fila em sessionStorage foi feita para atravessar a NAVEGACAO da
     * pagina, e resolve isso bem. Ela nao atravessa a JANELA: o editor do SEI
     * abre em janela propria, e uma janela aberta por window.open recebe uma
     * COPIA do sessionStorage do abridor e segue independente dali em diante.
     *
     * Assinar pelo editor enfileirava o ato na sessionStorage daquela janela,
     * que a aba principal nunca leria - e que morria quando o SEI fechava o
     * editor depois de assinar. O ato se perdia inteiro, e o registro acabava
     * vindo so da varredura, sem saber a origem.
     *
     * chrome.storage.local e compartilhado entre janelas, entao gravar aqui
     * resolve. E assincrono e a pagina pode ir embora no meio - por isso a
     * fila continua existindo, como rede. As duas juntas cobrem os dois casos.
     */
    descarregarAtos().catch((err) =>
      log.debug(`nao consegui gravar ${nome} na hora; fica para a proxima tela:`, err),
    );
  };

  const aoClicar = (ev) => {
    const alvo = ev.target && ev.target.closest
      ? ev.target.closest('button, input, a')
      : null;
    if (!alvo || !ehBotaoDeConfirmacao(alvo, config)) return;

    log.debug(`confirmacao de ${nome} detectada em`, alvo.id || alvo.name || alvo.value || alvo);
    anotarComRede('clique');
  };

  document.addEventListener('click', aoClicar, true);
  limpezas.push(() => document.removeEventListener('click', aoClicar, true));

  const formulario = formularioDaTela(config);
  if (formulario) {
    const onSubmit = () => anotarComRede('submit');
    formulario.addEventListener('submit', onSubmit, true);
    limpezas.push(() => formulario.removeEventListener('submit', onSubmit, true));

    /**
     * Enter dentro do formulario tambem confirma.
     *
     * Faltava este caminho, e ele e o mais natural de todos: na tela de
     * assinatura voce digita a senha e aperta Enter. O botao Assinar e
     * type="button" com onclick proprio, e o SEI liga o Enter ao mesmo
     * codigo por um handler de teclado - sem clique e sem submit. Os dois
     * ouvintes acima ficavam mudos e o ato nunca era enfileirado.
     *
     * Escuta no formulario da tela, e nao no documento: Enter na busca
     * rapida do cabecalho nao pode virar assinatura.
     */
    const aoTeclar = (ev) => {
      if (ev.key !== 'Enter' || ev.shiftKey) return;
      const alvo = ev.target;
      if (alvo && alvo.tagName === 'TEXTAREA') return; // Enter ali e quebra de linha

      // So o id, nunca o elemento. O formulario de assinatura contem o campo
      // de senha, e registrar o no no console daria a quem abrisse o console
      // um caminho ate o valor dele. O id basta para diagnosticar.
      log.debug(`confirmacao de ${nome} por Enter em`, (alvo && alvo.id) || '(sem id)');
      anotarComRede('enter');
    };
    formulario.addEventListener('keydown', aoTeclar, true);
    limpezas.push(() => formulario.removeEventListener('keydown', aoTeclar, true));
  }

  log.info(
    `captura de ${nome} armada`,
    `(formulario: ${formulario ? formulario.id || 'sem id' : 'nenhum'};`,
    'clique: delegado no documento;',
    `enter: ${formulario ? 'no formulario' : 'sem formulario'})`,
  );
  return () => limpezas.forEach((fn) => fn());
}

const chavePorId = (idDocumento) => (idDocumento ? `doc:${idDocumento}` : null);
const chavePorNumero = (numero) => (numero ? `num:${numero}` : null);

/** Ids ja gravados nesta pagina, para nao reescrever o storage a cada remontagem. */
const jaGravados = new Set();

/* ------------------------------------ fonte 1: bloco no corpo do documento */

/**
 * Le o documento aberto e grava uma entrada por assinatura encontrada.
 * Roda no frame que contem o corpo do documento.
 */
export async function varrerDocumentoVisivel(identidades = []) {
  const corpo = (document.body && document.body.textContent) || '';
  if (!DOCUMENTO.marcaDeAssinatura.test(corpo)) return 0;

  const { assinaturas, codigoVerificador } = lerDocumento();
  if (!assinaturas.length) {
    log.debug('marca de assinatura encontrada, mas o parse nao extraiu nada');
    return 0;
  }

  const idDocumento = paramDaUrl(location.href, 'id_documento');
  const id =
    chavePorId(idDocumento) ||
    (await idPorNumero(codigoVerificador)) ||
    chavePorNumero(codigoVerificador);

  if (!id) {
    log.warn('documento assinado sem id nem codigo verificador; ignorado');
    return 0;
  }

  // O corpo do documento raramente traz o NUP - ele fica na arvore, no frame
  // de cima. Sem esta busca, a assinatura entrava no historico sem dizer a
  // qual processo pertence.
  const processo = acharNup(corpo) || processoDaOrigem();
  const idProcedimento = paramDaUrl(location.href, 'id_procedimento');
  const unidade = unidadeAtual();

  // Um documento pode ter varias assinaturas. A primeira fica no registro
  // principal; as demais entram como registros irmaos, para nao se perderem.
  // So o que e seu entra. Assinatura de colega no mesmo documento e ignorada -
  // nao chega nem a ser gravada.
  const minhas = assinaturas.filter((a) => ehMinha(a.assinante, identidades));
  if (!minhas.length) {
    log.debug(
      identidades.length
        ? 'documento assinado por outra pessoa; ignorado'
        : 'dono desconhecido: configure nome e login nas opcoes',
    );
    return 0;
  }

  let gravados = 0;
  for (const [i, assinatura] of minhas.entries()) {
    const idDesta = i === 0 ? id : `${id}#${i}`;

    await registrar({
      id: idDesta,
      tipoEvento: 'assinatura',
      idInterno: idDocumento,
      idProcedimento,
      documento: codigoVerificador,
      tipo: null,
      processo,
      unidade,
      assinante: assinatura.assinante,
      cargo: assinatura.cargo,
      quando: assinatura.quando,
      quandoExato: true, // veio do proprio documento
      confirmado: true, // o bloco so existe se a assinatura foi concluida
      origem: 'documento',
    });
    jaGravados.add(idDesta);
    gravados++;
  }

  log.info(`documento ${codigoVerificador || id}: ${gravados} assinatura(s) registrada(s)`);
  return gravados;
}

/* ------------------------------------------------------ fonte 2: a arvore */

/**
 * Sobe a partir do link de assinaturas ate achar o elemento que contem o
 * texto do no ("Despacho 00009405 NIT/NITTRANS/DIVEST").
 */
function textoDoNo(link) {
  let atual = link;
  for (let i = 0; i < 5 && atual; i++) {
    atual = atual.parentElement;
    if (!atual) break;
    const texto = (atual.textContent || '').replace(/\s+/g, ' ').trim();
    if (texto.length > 3 && texto.length < 300 && /\d{4,}/.test(texto)) return texto;
  }
  return '';
}

/**
 * "Despacho 00009405 NIT/..."   -> { numero: '00009405', tipo: 'Despacho' }
 * "Mensagem 1 1 (00009400) ..." -> { numero: '00009400', tipo: 'Mensagem 1 1' }
 */
export function dadosDoTexto(texto) {
  const entreParenteses = texto.match(/\((\d{4,})\)/);
  const solto = texto.match(/(?:^|\s)(\d{5,})(?:\s|$)/);
  const numero = entreParenteses ? entreParenteses[1] : solto ? solto[1] : null;
  if (!numero) return { numero: null, tipo: texto.slice(0, 60).trim() || null };

  const corte = texto.indexOf(numero);
  const tipo = texto
    .slice(0, corte)
    .replace(/[(\s]+$/, '')
    .trim();

  return { numero, tipo: tipo || null };
}

/**
 * Varre a arvore para CONFIRMAR o que ja esta no historico.
 *
 * Antes ela criava registros, mas a arvore nao diz quem assinou - e um
 * historico pessoal nao pode guardar evento que talvez seja de outra pessoa.
 * Hoje ela so completa e confirma o que voce ja tinha: o numero e o tipo do
 * documento, e a prova de que a assinatura foi aceita.
 */
export async function varrerArvore() {
  /**
   * A arvore e o unico lugar que mostra id interno e numero visivel lado a
   * lado. Aproveitamos a passagem para completar quem ficou sem numero -
   * documento recem-criado entra no historico antes de o SEI numera-lo.
   *
   * Isto roda ANTES de procurar assinaturas, de proposito: um processo sem
   * nenhum documento assinado tambem precisa completar os numeros.
   */
  const mapa = {};
  for (const link of qsa(ARVORE.linkDocumento)) {
    const id = paramDaUrl(link.getAttribute('href') || '', 'id_documento');
    if (!id || mapa[id]) continue;
    const { numero } = dadosDoTexto(textoDoNo(link));
    if (numero) mapa[id] = numero;
  }
  const completados = await completarNumeros(mapa);

  const links = qsa(ARVORE.linkAssinaturas);
  if (!links.length) return completados;

  const processo = acharNup((document.body && document.body.textContent) || '');
  let confirmados = 0;

  // A arvore diz quais documentos ESTAO assinados, inclusive os assinados por
  // outra pessoa - que a extensao nao registra, de proposito. E disso que a
  // lista de "sem assinatura" precisa para se corrigir sozinha.
  const assinadosNaArvore = links
    .map((link) => paramDaUrl(link.getAttribute('href') || '', 'id_documento'))
    .filter(Boolean);
  await marcarAssinadosVistos(assinadosNaArvore);

  for (const link of links) {
    const idDocumento = paramDaUrl(link.getAttribute('href') || '', 'id_documento');
    const { numero, tipo } = dadosDoTexto(textoDoNo(link));
    const id = chavePorId(idDocumento) || chavePorNumero(numero);

    if (!id || jaGravados.has(id)) continue;
    if (!(await obter(id))) continue; // nao e meu: a arvore nao cria registro

    await registrar({
      id,
      idInterno: idDocumento,
      documento: numero,
      tipo,
      processo,
      quando: new Date().toISOString(),
      confirmado: true, // o link de assinaturas so existe em documento assinado
      origem: 'arvore',
    });
    jaGravados.add(id);
    confirmados++;
  }

  if (confirmados) log.info(`arvore: ${confirmados} registro(s) confirmado(s)`);
  return confirmados + completados;
}

/* ------------------------------------------- fonte 3: a tela de assinatura */

/**
 * O numero visivel de um documento, procurado na arvore.
 *
 * A arvore mostra "Despacho 00009400" e o link daquele no carrega o mesmo
 * id_documento - basta cruzar. E assim que a criacao de documento ganha o
 * numero, que ainda nao existia na hora de salvar.
 */
function numeroNaArvore(idDocumento) {
  if (!idDocumento) return null;

  for (const doc of documentosAcessiveis()) {
    try {
      const link = doc.querySelector(`a[href*="id_documento=${idDocumento}"]`);
      if (!link) continue;
      const { numero } = dadosDoTexto(textoDoNo(link));
      if (numero) return numero;
    } catch {
      /* seletor ou acesso invalido: tenta o proximo */
    }
  }
  return null;
}

/** Procura o NUP na janela ou frame que abriu a tela atual. */
function processoDaOrigem() {
  const candidatos = [];
  try {
    if (window.opener && !window.opener.closed) candidatos.push(window.opener.document);
  } catch {
    /* sem acesso */
  }
  try {
    if (window.top !== window.self) candidatos.push(window.top.document);
  } catch {
    /* cross-origin */
  }

  for (const doc of candidatos) {
    try {
      const nup = acharNup((doc.body && doc.body.textContent) || '');
      if (nup) return nup;
    } catch {
      /* ignora e tenta o proximo */
    }
  }
  return null;
}

/**
 * Arma a captura na tela de assinatura. Devolve a funcao de limpeza.
 *
 * Nao precisa checar identidade: se voce esta nesta tela clicando em Assinar,
 * o ato e seu por definicao.
 *
 * O registro nasce como NAO confirmado - so sabemos que voce clicou, nao que
 * o SEI aceitou. A confirmacao vem depois, da arvore ou do corpo do documento.
 */
export function capturarNaAssinatura(ctx) {
  // Os documentos vem do campo oculto da tela, e nao da URL.
  //
  // A versao anterior lia so `id_documento` da URL e desistia quando ele
  // faltava - que e exatamente o caso da assinatura em bloco. Resultado:
  // assinar dez documentos de uma vez nao registrava nenhum.
  const campo = primeiro(ASSINATURA.idsDocumentos);
  const ids = idsParaAssinar(campo && campo.value, ctx.param('id_documento'));

  if (!ids.length) {
    log.warn('tela de assinatura sem documento identificavel; nada a capturar');
    return () => {};
  }

  const campoBloco = primeiro(ASSINATURA.idsBlocos);
  const porBloco = Boolean(campoBloco && String(campoBloco.value || '').match(/\d/));
  log.debug(`assinatura de ${ids.length} documento(s)${porBloco ? ' (por bloco)' : ''}`);

  // Assinatura recusada: o SEI recarrega a tela com a caixa de excecao.
  if (primeiro(ASSINATURA.erro)) {
    for (const idDoc of ids) descartarPendente(chavePorId(idDoc));
    log.debug('erro na tela de assinatura; registros pendentes descartados');
  }

  const anotar = () => {
    const cargoEl = primeiro(ASSINATURA.cargo);
    const opcaoCargo = cargoEl && cargoEl.selectedOptions ? cargoEl.selectedOptions[0] : null;

    // Um bloco reune documentos de processos DIFERENTES. Chutar o processo
    // da tela de origem marcaria nove registros com o processo errado; sem
    // ele, a varredura preenche o certo quando o documento for aberto.
    const processo = ids.length === 1 ? processoDaOrigem() : null;
    const quando = new Date().toISOString();

    for (const idDocumento of ids) {
      enfileirarAto('registrar', {
        id: chavePorId(idDocumento),
        tipoEvento: 'assinatura',
        idInterno: idDocumento,
        idProcedimento: ids.length === 1 ? ctx.param('id_procedimento') : null,
        documento: null, // chega depois, pela arvore ou pelo corpo do documento
        tipo: null,
        processo,
        unidade: unidadeAtual(),
        assinante: usuarioAtual(ctx.opcoes),
        cargo: opcaoCargo ? (opcaoCargo.text || '').trim() || null : null,
        quando,
        quandoExato: true,
        confirmado: false,
        origem: 'assinatura',
        // Por onde a assinatura passou. Serve para filtrar depois "o que eu
        // assinei por bloco" - o campo hdnIdBlocos vem preenchido so nesse
        // caminho.
        via: porBloco ? 'bloco' : 'processo',
      });
    }
  };

  return armarCaptura(ASSINATURA, `assinatura (${ids.length} doc)`, anotar);
}

/* -------------------------------------------- fonte A: consultar andamento */

/**
 * Chave de um evento de processo: tipo + processo + minuto.
 * Ninguem envia nem cria o mesmo processo duas vezes no mesmo minuto.
 */
function chaveDeProcesso(tipoEvento, processo, idProcedimento, quandoIso) {
  const base = processo || idProcedimento;
  return base ? `${tipoEvento}:${base}:${quandoIso.slice(0, 16)}` : null;
}

/**
 * Le a tela "Consultar Andamento" e registra os envios do processo.
 * Esta e a fonte retroativa: processo antigo que voce abrir entra no historico.
 */
export async function varrerAndamento(identidades = []) {
  const corpo = (document.body && document.body.textContent) || '';
  if (!ANDAMENTO.marca.test(corpo)) return 0;

  const eventos = lerAndamentos();
  if (!eventos.length) return 0;

  const processo = acharNup(corpo);
  const idProcedimento = paramDaUrl(location.href, 'id_procedimento');
  let gravados = 0;

  const anotar = async (tipoEvento, quando, campos, usuario) => {
    // Evento de colega no mesmo processo nao entra no historico.
    if (!ehMinha(usuario, identidades)) return;

    const id = chaveDeProcesso(tipoEvento, processo, idProcedimento, quando);
    if (!id || jaGravados.has(id)) return;

    await registrarPorProximidade({
      id,
      tipoEvento,
      idProcedimento,
      processo,
      assinante: usuario,
      quando,
      quandoExato: true, // data carimbada pelo SEI
      confirmado: true, // o andamento so registra o que aconteceu
      origem: 'andamento',
      ...campos,
    });
    jaGravados.add(id);
    gravados++;
  };

  for (const envio of extrairEnvios(eventos)) {
    await anotar('envio', envio.quando, { unidade: envio.origem, destino: envio.destino }, envio.usuario);
  }

  for (const criacao of extrairCriacoes(eventos)) {
    await anotar(
      criacao.tipoEvento,
      criacao.quando,
      { unidade: criacao.unidade, documento: criacao.documento },
      criacao.usuario,
    );
  }

  if (gravados) log.info(`andamento: ${gravados} evento(s) registrado(s)`);
  return gravados;
}

/* ------------------------------------------ fonte B: tela "Enviar Processo" */

/** Unidades ja escolhidas como destino, na tela de envio. */
function unidadesEscolhidas() {
  const nomes = [];
  for (const seletor of ENVIO.unidadesDestino) {
    for (const opcao of qsa(seletor)) {
      // Numa lista de destino do SEI, o que importa e o que ja foi somado.
      if (opcao.selected === false) continue;
      const texto = (opcao.textContent || opcao.value || '').trim();
      if (texto && !nomes.includes(texto)) nomes.push(texto);
    }
    if (nomes.length) break;
  }
  return nomes.length ? nomes.join(', ') : null;
}

/**
 * Arma a captura na tela "Enviar Processo".
 *
 * Igual a de assinatura: passiva. Nunca clica em Enviar, nunca submete, nunca
 * chama preventDefault. Se o envio falhar, o andamento simplesmente nao vai
 * confirmar - e o registro fica marcado como nao confirmado.
 */
export function capturarNoEnvio(ctx) {
  const idProcedimento = ctx.param('id_procedimento');

  const anotar = () => {
    // Os processos vem do campo oculto e da lista da tela, e nao da URL: um
    // envio pode levar varios de uma vez, e a URL so conhece o de origem.
    const campo = primeiro(ENVIO.idsProtocolos);
    const textos = qsa(ENVIO.processos.join(', ')).map((o) => textoDe(o));
    let processos = processosParaEnviar(campo && campo.value, textos);

    // Sem nada identificavel, ainda vale registrar o envio da tela atual.
    if (!processos.length) processos = [{ id: idProcedimento, processo: processoDaOrigem() }];

    const manter = primeiro(ENVIO.manterAberto);
    const destino = unidadesEscolhidas();
    const unidade = unidadeAtual();
    const assinante = usuarioAtual(ctx.opcoes);
    const quando = new Date().toISOString();

    let enfileirados = 0;
    for (const alvo of processos) {
      const id = chaveDeProcesso('envio', alvo.processo, alvo.id, quando);
      if (!id) continue;

      enfileirarAto('proximidade', {
        id,
        tipoEvento: 'envio',
        // Com varios processos, o id_procedimento da URL vale so para o de
        // origem; marcar todos com ele apontaria nove para o processo errado.
        idProcedimento: processos.length === 1 ? idProcedimento : alvo.id,
        processo: alvo.processo,
        unidade,
        destino,
        manteveAberto: manter ? Boolean(manter.checked) : null,
        assinante,
        quando,
        quandoExato: true,
        confirmado: false, // o andamento confirma depois
        origem: 'envio',
      });
      enfileirados++;
    }

    if (!enfileirados) log.warn('tela de envio sem processo identificavel; nada a capturar');
    else log.debug(`envio de ${enfileirados} processo(s) para ${destino || '(destino nao lido)'}`);
  };

  return armarCaptura(ENVIO, 'envio', anotar);
}

/* ------------------------------------ fonte C: tela "Iniciar Processo" */

/**
 * Janela em que uma criacao pendente ainda pode ser casada com um NUP.
 *
 * Curta de proposito: se o usuario criar um processo e sair navegando por
 * outros, uma janela longa faria a criacao grudar no processo errado.
 */
const JANELA_PENDENCIA_MS = 2 * 60 * 1000;

/**
 * O valor visivel de um campo, seja ele qual for.
 *
 * Aceita <select>, <input> e tambem <label>: na tela "Gerar Documento" o tipo
 * ja escolhido aparece so como texto, em <label id="lblSerieTitulo">Despacho</label>.
 */
function valorEscolhido(candidatos) {
  const campo = primeiro(candidatos);
  if (!campo) return null;

  if (campo.tagName === 'SELECT') {
    const opcao = campo.selectedOptions ? campo.selectedOptions[0] : null;
    const texto = opcao ? (opcao.text || '').trim() : '';
    if (texto) return texto;
  }

  const valor = (campo.value || '').trim();
  if (valor) return valor;

  const texto = (campo.textContent || '').replace(/\s+/g, ' ').trim();
  return texto && texto.length <= 120 ? texto : null;
}

/**
 * Arma a captura na tela "Iniciar Processo".
 *
 * O SEI so atribui o NUP depois de salvar, entao aqui guardamos o ato de lado,
 * sem numero. Quem completa e resolverCriacaoPendente(), na tela seguinte.
 *
 * Passiva como as demais: nunca clica em Salvar nem submete o formulario.
 */
export function capturarNaCriacaoDeProcesso(ctx) {
  const anotar = () => {
    guardarPendencia(PENDENCIA_PROCESSO, {
      quando: new Date().toISOString(),
      tipo: valorEscolhido(CRIACAO_PROCESSO.tipo),
      especificacao: valorEscolhido(CRIACAO_PROCESSO.especificacao),
      unidade: unidadeAtual(),
      assinante: usuarioAtual(ctx.opcoes),
    });
  };

  return armarCaptura(CRIACAO_PROCESSO, 'criacao de processo', anotar);
}

/**
 * Fecha a criacao pendente assim que um NUP aparece na tela.
 *
 * Resolve na PRIMEIRA tela com numero apos o salvamento, e limpa a pendencia
 * em seguida - e o que impede a criacao de grudar no processo errado caso o
 * usuario saia navegando.
 */
export async function resolverCriacaoPendente() {
  const pendencia = lerPendencia(PENDENCIA_PROCESSO);
  if (!pendencia) return 0;

  log.debug('criacao pendente na fila; procurando o numero do processo');

  const idade = Date.now() - new Date(pendencia.quando).getTime();
  if (idade > JANELA_PENDENCIA_MS || idade < 0) {
    limparPendencia(PENDENCIA_PROCESSO);
    log.debug('criacao pendente expirou sem achar o numero do processo');
    return 0;
  }

  const processo = acharNup((document.body && document.body.textContent) || '') || processoDaOrigem();
  if (!processo) {
    // Normal logo apos o salvamento: a arvore ainda esta sendo montada.
    // O observador chama de novo assim que o DOM mudar.
    return 0;
  }

  const idProcedimento = paramDaUrl(location.href, 'id_procedimento');
  const id = chaveDeProcesso('processo-criado', processo, idProcedimento, pendencia.quando);
  if (!id) return 0;

  limparPendencia(PENDENCIA_PROCESSO);
  await registrarPorProximidade({
    id,
    tipoEvento: 'processo-criado',
    processo,
    idProcedimento,
    tipo: pendencia.tipo,
    especificacao: pendencia.especificacao,
    unidade: pendencia.unidade,
    assinante: pendencia.assinante,
    quando: pendencia.quando,
    quandoExato: true,
    confirmado: true,
    origem: 'criacao',
  });

  log.info('criacao de processo registrada:', processo);
  return 1;
}

/* ----------------------------------- fonte D: tela "Gerar Documento" */

/** Valor de um campo oculto, quando existe. */
function valorOculto(candidatos) {
  const campo = primeiro(candidatos);
  return campo && campo.value ? campo.value.trim() : null;
}

/**
 * Arma a captura na tela "Gerar Documento".
 *
 * Mesma forma da criacao de processo: o SEI so atribui o numero do documento
 * depois de salvar. O ato fica pendente e e fechado na tela seguinte, que traz
 * id_documento na URL (o editor, ou a visualizacao do documento novo).
 *
 * A tela roda dentro do frame ifrVisualizacao, entao o numero do processo vem
 * do campo oculto ou do frame de cima - nunca da URL desta tela.
 */
export function capturarNaCriacaoDeDocumento(ctx) {
  const anotar = () => {
    guardarPendencia(PENDENCIA_DOCUMENTO, {
      quando: new Date().toISOString(),
      tipo: valorEscolhido(CRIACAO_DOCUMENTO.tipo),
      descricao: valorEscolhido(CRIACAO_DOCUMENTO.descricao),
      idProcedimento:
        valorOculto(CRIACAO_DOCUMENTO.idProcedimento) || ctx.param('id_procedimento'),
      processo: processoDaOrigem(),
      unidade: unidadeAtual(),
      assinante: usuarioAtual(ctx.opcoes),
    });
  };

  return armarCaptura(CRIACAO_DOCUMENTO, 'criacao de documento', anotar);
}

/**
 * Fecha a criacao de documento pendente assim que um id_documento aparece.
 *
 * Depois de salvar, o SEI abre o editor do documento novo, e a URL passa a
 * trazer id_documento. E esse o gancho.
 */
export async function resolverCriacaoDocumentoPendente() {
  const pendencia = lerPendencia(PENDENCIA_DOCUMENTO);
  if (!pendencia) return 0;

  const idade = Date.now() - new Date(pendencia.quando).getTime();
  if (idade > JANELA_PENDENCIA_MS || idade < 0) {
    limparPendencia(PENDENCIA_DOCUMENTO);
    log.debug('criacao de documento pendente expirou sem achar o id');
    return 0;
  }

  const idDocumento = paramDaUrl(location.href, 'id_documento');
  if (!idDocumento) return 0; // ainda nao chegamos na tela do documento novo

  limparPendencia(PENDENCIA_DOCUMENTO);
  await registrarPorProximidade({
    id: `documento-criado:${idDocumento}`,
    tipoEvento: 'documento-criado',
    idInterno: idDocumento,
    // Pode nao estar la ainda: a arvore e remontada logo depois do salvamento.
    // Se faltar agora, a varredura da arvore completa na proxima passagem.
    documento: numeroNaArvore(idDocumento),
    idProcedimento: pendencia.idProcedimento,
    processo: pendencia.processo || processoDaOrigem(),
    tipo: pendencia.tipo,
    descricao: pendencia.descricao,
    unidade: pendencia.unidade,
    assinante: pendencia.assinante,
    quando: pendencia.quando,
    quandoExato: true,
    confirmado: true,
    origem: 'criacao',
  });

  log.info('criacao de documento registrada:', pendencia.tipo || idDocumento);
  return 1;
}

/* -------------------------------------------------------------- orquestra */

/** Evita que duas varreduras se sobreponham e disputem o storage. */
let varrendo = false;

/**
 * Roda as varreduras AMBIENTE que fizerem sentido neste frame - as que leem o
 * que o SEI mostra na tela. Fechar a criacao pendente nao entra aqui: aquilo e
 * um ato seu, e nao pode depender da opcao de coleta.
 *
 * E barato chamar em qualquer lugar: cada varredura sai cedo se nao houver o
 * que fazer.
 *
 * Sem identidades a extensao nao sabe quem e o dono, entao as fontes ambiguas
 * (documento e andamento) nao gravam nada - por seguranca, e melhor um
 * historico vazio do que um historico com evento dos outros.
 */
/**
 * Documentos do bloco: resolve o pendente assinado por outra pessoa.
 *
 * E a tela onde se confere o que foi mandado para assinar, e a unica que
 * responde a pergunta sem abrir o processo. A varredura da arvore nao serve
 * aqui: esta tela nao tem link de assinaturas nenhum - o que ela tem e uma
 * COLUNA "Assinaturas", e o sinal e ela ter conteudo.
 *
 * So marca como visto. Nao cria registro de assinatura alheia, como em
 * nenhum outro lugar do projeto.
 */
export async function varrerBlocoDeAssinatura() {
  const numeros = documentosAssinadosNoBloco();
  if (!numeros.length) return 0;

  const marcados = await marcarAssinadosPorNumero(numeros);
  if (marcados) log.info(`bloco: ${marcados} pendente(s) resolvido(s)`);
  return marcados;
}

export async function varrer(identidades = []) {
  if (varrendo) return 0;
  varrendo = true;
  try {
    const doCorpo = await varrerDocumentoVisivel(identidades);
    const daArvore = await varrerArvore();
    const doAndamento = await varrerAndamento(identidades);
    const doBloco = await varrerBlocoDeAssinatura();
    return doCorpo + daArvore + doAndamento + doBloco;
  } catch (err) {
    log.error('falha na varredura:', err);
    return 0;
  } finally {
    varrendo = false;
  }
}
