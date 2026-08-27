/**
 * seletores.js - TODO o conhecimento fragil sobre o HTML do SEI mora aqui.
 *
 * Se a extensao parar de funcionar depois de uma atualizacao do SEI, ou se for
 * instalada em outro orgao, este e o unico arquivo que precisa mudar.
 *
 * Validado contra: leste.sei.rj.gov.br (Niteroi/RJ), SEI 5.0.4.
 * Marcadores CONFIRMAR: ainda nao vistos no HTML real.
 *
 * Nenhuma lista de botao traz seletor generico como button[type="submit"].
 * A captura escuta o documento inteiro e decide no clique (ver armarCaptura),
 * entao um seletor amplo casaria com qualquer botao de envio da pagina. O que
 * identifica o botao certo e o id especifico ou o TEXTO em rotulosConfirmar.
 *
 * Nenhuma lista de formulario termina em 'form'. Esse curinga parece inofensivo
 * e nao e: toda tela do SEI carrega <form id="frmProtocoloPesquisaRapida"> no
 * cabecalho, entao o curinga faria a extensao escutar a busca rapida em vez do
 * formulario da tela. Quando o seletor especifico falha, quem acha o
 * formulario certo e o botao - ver formularioAlvo() em captura.js.
 */
import { qsa, textoCasa, textoDe } from '../../core/dom.js';
import { PADROES_NUP } from '../../core/nup.js';

/* ------------------------------------------------------------- assinatura */

/** Tela/modal de assinatura (acao=documento_assinar). */
export const ASSINATURA = {
  // CONFIRMADO no SEI 5.0.4: o formulario e #frmAssinaturas. O nome que eu
  // supunha (frmDocumentoAssinar) nao existe - a tela so casava pelo curinga
  // 'form', que a regra no topo deste arquivo proibe justamente por casar
  // com a busca rapida do cabecalho.
  formulario: [
    '#frmAssinaturas',
    'form[name="frmAssinaturas"]',
    'form[action*="documento_assinar"]',
  ],

  botaoConfirmar: ['#btnAssinar', 'button[name="btnAssinar"]', '#sbmAssinar'],

  /**
   * Os documentos que serao assinados nesta tela.
   *
   * CONFIRMADO: e um campo oculto, e o nome esta no PLURAL. Assinar pelo
   * bloco manda varios documentos de uma vez, e a URL nao traz nenhum
   * id_documento - so a arvore traz. Enquanto a captura dependia da URL,
   * assinatura por bloco nao entrava no historico.
   */
  idsDocumentos: ['#hdnIdDocumentos', 'input[name="hdnIdDocumentos"]'],

  /** Preenchido quando a assinatura veio de um bloco. So para o log. */
  idsBlocos: ['#hdnIdBlocos', 'input[name="hdnIdBlocos"]'],

  /** Texto visivel do botao, usado quando nenhum seletor acima casa. */
  rotulosConfirmar: ['assinar'],

  /**
   * Campo "Assinante" - vem preenchido com o nome de quem esta logado.
   * E a forma mais confiavel de saber o usuario atual: a barra superior deste
   * orgao mostra so a unidade (NIT/NITTRANS/DIVEST), nao o nome da pessoa.
   */
  assinante: [
    // CONFIRMADO: o rotulo diz "Assinante" mas o campo se chama txtUsuario.
    // Nenhum dos seletores por nome pegava.
    '#txtUsuario',
    'input[name="txtUsuario"]',
    'input[name*="Assinante" i]',
    '#txtAssinante',
    'input[id*="Assinante" i]',
  ],

  // "Cargo / Funcao" e "Orgao do Assinante" sao <select>.
  cargo: ['select[name*="Cargo" i]', '#selCargoFuncao', 'select[id*="Cargo" i]'],
  orgao: ['select[name*="Orgao" i]', '#selOrgao', 'select[id*="Orgao" i]'],

  /**
   * Campo de senha. Listado APENAS para deixar explicito o que a extensao
   * ignora. Nada daqui e lido, gravado ou transmitido - nunca.
   */
  senha: ['input[type="password"]'],

  // Caixa de erro do SEI: assinatura recusada (senha errada etc.).
  erro: ['.infraExcecao', '#divInfraExcecao', '[class*="Excecao"]'],
};

/* ----------------------------------------------------------------- arvore */

export const ARVORE = {
  raiz: ['#divArvore', '#divInfraAreaTelaD', 'body'],

  /**
   * O sinal de "documento assinado".
   *
   * Documento assinado ganha, na arvore, um link para a tela de assinaturas:
   *   controlador.php?acao=assinatura_listar&...&id_documento=11965&arvore=1
   *
   * Isso e funcao, nao estilo: sobrevive a troca de tema e de versao, ao
   * contrario de nome de arquivo de icone. E o href ainda entrega de graca o
   * id_documento, que e a chave usada para juntar as fontes.
   */
  linkAssinaturas: 'a[href*="acao=assinatura_listar"]',

  // Link do proprio documento, usado para achar o texto do no.
  linkDocumento: 'a[href*="acao=documento_visualizar"], a[href*="id_documento="]',
};

/* -------------------------------------------------------------- documento */

/**
 * O corpo do documento traz o bloco "Documento assinado eletronicamente
 * por ... em ... as ...". Ver blocoAssinatura.js.
 */
export const DOCUMENTO = {
  // Barato o suficiente para rodar antes de tentar o parse completo.
  marcaDeAssinatura: /assinado eletronicamente por/i,
};

/* ---------------------------------------------------------------- processo */

/**
 * Numero do processo (NUP). O formato varia por orgao - o do SEI federal nao
 * e o unico. Testamos em ordem e ficamos com o primeiro que casar.
 */
// Os padroes mudaram de casa: agora vivem em core/nup.js, porque a copia
// rapida de numero tambem precisa deles. O objeto continua aqui para nao
// mudar quem ja o usa.
export const PROCESSO = { padroesNup: PADROES_NUP };

/** Primeiro NUP encontrado no texto, em qualquer um dos formatos conhecidos. */
export function acharNup(texto) {
  if (!texto) return null;
  for (const padrao of PROCESSO.padroesNup) {
    const m = texto.match(padrao);
    if (m) return m[0];
  }
  return null;
}

/* ------------------------------------------------------------------ sessao */

export const SESSAO = {
  /**
   * Confirmado no SEI 5.0.4:
   *   <a id="lnkUsuarioSistema" title="Nome Completo (login/ORGAO)">
   * O title traz nome e login juntos - ver separarNomeELogin() em sessao.js.
   */
  usuario: [
    '#lnkUsuarioSistema[title]',
    '#lnkInfraUsuario[title]',
    '#divInfraBarraSistema a[href*="usuario"][title]',
  ],

  // Confirmado: <a id="lnkInfraUnidade" ...>NIT/NITTRANS/DIVEST</a>
  unidade: ['#lnkInfraUnidade', '#selInfraUnidades option:checked'],
};

/* ------------------------------------------------- controle de processos */

export const CONTROLE = {
  /**
   * Onde encaixar o botao do historico.
   * `#divInfraBarraComandosSuperior` confirmado no SEI 5.0.4, mas dentro do
   * <form> da tela - em telas sem formulario pode nao existir.
   */
  barra: [
    '#divInfraBarraComandosSuperior',
    '#divComandos',
    '.infraBarraComandos',
    '#divInfraAreaTelaD > div:first-child',
  ],
  tabela: ['#tblProcessosDetalhado', '#tblProcessos', 'table.infraTable'],

  /**
   * Rotulos dos links que o SEI desenha acima da lista de processos.
   *
   * A linha e procurada por ESTES TEXTOS, nao por id do container. Parece o
   * contrario do esperado, e e de proposito: os rotulos sao strings da
   * interface do SEI, iguais em toda instancia, enquanto o id do <div> que
   * os envolve muda entre versoes - foi exatamente por isso que os quatro
   * candidatos de CONTROLE.barra falharam nesta tela.
   *
   * "Visualizacao resumida" e "detalhada" sao o mesmo link alternando de
   * estado; a lista traz os dois para nao depender do modo em que a tela
   * abriu. A comparacao e exata e passa por norm(), entao acento e caixa
   * nao importam.
   */
  rotulosDaLinha: [
    'visualizacao resumida',
    'visualizacao detalhada',
    'configurar detalhe',
    'ver atribuidos a mim',
    'ver por marcadores',
    'ver por tipo',
    'ver por prioridade',
    'ver todos',
  ],
};

/**
 * Quais documentos esta tela de assinatura vai assinar.
 *
 * O campo oculto manda, porque e o unico que cobre a assinatura em lote. A
 * URL serve de rede para o caso de uma versao do SEI nao trazer o campo.
 *
 * Devolve sempre uma lista sem repeticao - assinar dez documentos de um
 * bloco tem de virar dez registros, nao um.
 */
export function idsParaAssinar(valorDoCampo, idDaUrl) {
  const doCampo = String(valorDoCampo || '').match(/\d+/g) || [];
  const ids = doCampo.length ? doCampo : [idDaUrl].filter(Boolean).map(String);
  return [...new Set(ids)];
}

/* ----------------------------------------------------------------- helpers */

/**
 * Acha a linha de links da tela e um link vizinho para servir de modelo.
 *
 * Devolve { linha, modelo } ou null. O `modelo` existe para o chamador poder
 * copiar a classe de um link ja existente: e o que faz um botao nosso
 * parecer do SEI em qualquer tema e qualquer versao, sem CSS proprio.
 */
export function acharLinhaDeLinks(raiz = document) {
  const candidatos = [];
  for (const link of qsa('a', raiz)) {
    const texto = textoDe(link);
    if (!texto) continue;
    // Exato de proposito. A comparacao frouxa pergunta se o texto do link
    // CONTEM o rotulo, entao ela erraria para o outro lado: um link
    // "Ver por tipo de acesso" em qualquer canto da tela contem "ver por
    // tipo" e disputaria a linha com a verdadeira.
    if (CONTROLE.rotulosDaLinha.some((r) => textoCasa(texto, r, { exato: true }))) {
      candidatos.push(link);
    }
  }
  if (!candidatos.length) return null;

  // Agrupa por pai e fica com quem abriga mais desses links. Dois irmaos ja
  // dao certeza de qual e o container; com um so, o pai dele ainda e o
  // melhor palpite disponivel.
  const porPai = new Map();
  for (const link of candidatos) {
    const pai = link.parentElement;
    if (!pai) continue;
    if (!porPai.has(pai)) porPai.set(pai, []);
    porPai.get(pai).push(link);
  }

  let linha = null;
  let irmaos = [];
  for (const [pai, lista] of porPai) {
    if (lista.length > irmaos.length) {
      linha = pai;
      irmaos = lista;
    }
  }
  return linha ? { linha, modelo: irmaos[0] } : null;
}

/** Primeiro candidato da lista que encontrar algo. */
export function primeiro(candidatos, root = document) {
  for (const sel of candidatos) {
    try {
      const el = root.querySelector(sel);
      if (el) return el;
    } catch {
      /* seletor invalido: tenta o proximo */
    }
  }
  return null;
}

/** Valor de um parametro na query string de uma URL relativa ou absoluta. */
export function paramDaUrl(url, nome) {
  try {
    return new URL(url, location.href).searchParams.get(nome);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------ envio de processo */

/** Tela "Enviar Processo" (acao=procedimento_enviar). */
export const ENVIO = {
  // CONFIRMAR: nenhum destes foi visto no HTML real do orgao.
  formulario: [
    'form[name*="frmProcedimentoEnviar" i]',
    'form[action*="procedimento_enviar"]',
  ],

  botaoConfirmar: ['#btnEnviar', 'button[name="btnEnviar"]', '#sbmEnviar'],

  rotulosConfirmar: ['enviar'],

  /**
   * Unidades de destino. No SEI voce vai somando unidades a uma lista, entao
   * o que interessa sao as opcoes JA escolhidas, nao o campo de busca.
   */
  unidadesDestino: [
    'select[name*="Unidades" i] option',
    '#selUnidades option',
    'select[id*="Unidade" i] option',
  ],

  // "Manter processo aberto na unidade atual"
  manterAberto: [
    'input[type="checkbox"][name*="ManterAberto" i]',
    '#chkSinManterAberto',
    'input[type="checkbox"][id*="Manter" i]',
  ],
};

/* ---------------------------------------------------------- andamento */

/**
 * Tela "Consultar Andamento": o historico oficial do processo.
 *
 * E o equivalente, para envios, do que o bloco de assinatura e para
 * assinaturas: a fonte retroativa e autoritativa. Cada linha traz data/hora,
 * unidade, usuario e a descricao do que aconteceu.
 *
 * CONFIRMAR: os textos abaixo sao os padroes do SEI, mas ainda nao foram
 * conferidos contra a tela deste orgao.
 */
export const ANDAMENTO = {
  // Basta um destes aparecer para valer a pena varrer a tela.
  marca: /Processo (remetido|recebido|.{0,12}gerado)|Documento .{0,12}gerado/i,

  /**
   * Cada padrao vira um tipo de evento. Adicionar um novo tipo ao historico e,
   * na maior parte das vezes, so acrescentar uma linha aqui.
   *
   * CONFIRMAR: os textos de criacao ("gerado") ainda nao foram vistos no HTML
   * deste orgao - so os de tramitacao. Se a aba "Criados" vier vazia, e aqui
   * que se ajusta.
   */
  padroes: {
    remetido: /Processo remetido pela unidade\s+([A-Z0-9][A-Z0-9/._-]{1,60})/i,
    recebido: /Processo recebido na unidade\s+([A-Z0-9][A-Z0-9/._-]{1,60})/i,
    // As duas ordens de palavra: "Processo publico gerado" e "Gerado o
    // processo publico". Nao vi o texto real deste orgao, entao aceito ambas.
    processoCriado: /processo[^.]{0,30}?gerado|gerado[^.]{0,20}?processo/i,
    documentoCriado: /documento[^.]{0,30}?gerado|gerado[^.]{0,20}?documento/i,
  },

  /**
   * O que extrair do trecho que casou. A unidade sai do grupo capturado (e uma
   * sigla, precisa de ancora no texto); o numero do documento e procurado
   * dentro do proprio trecho, para nao depender da ordem das palavras.
   */
  capturas: {
    remetido: 'unidade',
    recebido: 'unidade',
    documentoCriado: 'documento',
  },

  /** Numero de documento dentro da celula de descricao. */
  numeroNoTrecho: /\d{4,}/,

  // Data/hora no formato do SEI dentro de uma celula: 02/07/2026 16:59
  dataHora: /(\d{1,2}\/\d{1,2}\/\d{4})\s+(\d{1,2}:\d{2})/,

  linhas: ['table tr', 'tr'],
};

/* --------------------------------------------------- criacao de processo */

/** Tela "Iniciar Processo" (acao=procedimento_gerar). */
export const CRIACAO_PROCESSO = {
  // CONFIRMAR: nao vistos no HTML real deste orgao.
  // Visto no SEI 5.0.4: <form id="frmProcedimentoCadastro"> - o id, nao o name.
  formulario: [
    '#frmProcedimentoCadastro',
    'form[name*="frmProcedimentoCadastro" i]',
    'form[action*="procedimento_gerar"]',
  ],

  /**
   * Visto no SEI 5.0.4:
   *   <button id="btnSalvar" name="btnSalvar" type="button" accesskey="S"
   *           onclick="confirmarDados(...)">
   *
   * Repare no type="button": nao e submit, entao o evento de submit do
   * formulario nunca dispara por clique. E por isso que a captura escuta o
   * clique tambem.
   */
  botaoConfirmar: ['#btnSalvar', 'button[name="btnSalvar"]', '#sbmSalvar'],

  rotulosConfirmar: ['salvar', 'confirmar dados', 'confirmar'],

  // "Tipo do Processo" e "Especificacao": so para dar nome ao registro.
  tipo: ['select[name*="TipoProcedimento" i]', '#selTipoProcedimento', 'select[id*="Tipo" i]'],
  especificacao: [
    'input[name*="Especificacao" i]',
    '#txtDescricao',
    'input[id*="Especificacao" i]',
  ],
};

/* -------------------------------------------------- criacao de documento */

/**
 * Tela "Gerar Documento" (acao=documento_gerar).
 *
 * Confirmada no SEI 5.0.4. Roda dentro do frame ifrVisualizacao, e repete a
 * barra de comandos no topo e no rodape - os dois <button id="btnSalvar">.
 * E por isso que a captura escuta o clique delegado no documento.
 */
export const CRIACAO_DOCUMENTO = {
  formulario: ['#frmDocumentoCadastro', 'form[action*="documento_gerar"]'],

  // Mesmo botao da criacao de processo: id btnSalvar, type="button".
  botaoConfirmar: ['#btnSalvar', 'button[name="btnSalvar"]'],
  rotulosConfirmar: ['salvar', 'confirmar dados'],

  /**
   * O tipo do documento aparece de duas formas: no titulo da tela, ja
   * escolhido (<label id="lblSerieTitulo">Despacho</label>), e no select
   * quando a tela permite trocar.
   */
  tipo: ['#lblSerieTitulo', '#selSerie'],

  descricao: ['#txtDescricao'],
  numero: ['#txtNumero'],
  nomeNaArvore: ['#txtNomeArvore'],

  // Campo oculto com o id interno do processo - mais confiavel que a URL,
  // porque a tela roda dentro de um frame.
  idProcedimento: ['#hdnIdProcedimento', 'input[name="hdnIdProcedimento"]'],
};
