/**
 * seletores.js - TODO o conhecimento fragil sobre o HTML do SEI mora aqui.
 *
 * Se a extensao parar de funcionar depois de uma atualizacao do SEI, ou se for
 * instalada em outro orgao, este e o unico arquivo que precisa mudar.
 *
 * Validado contra: leste.sei.rj.gov.br (Niteroi/RJ), SEI 5.0.4.
 *
 * Ha duas formas de confirmacao, e a diferenca importa:
 *
 *   CONFIRMADO no HTML   alguem capturou a tela e os seletores foram
 *                        conferidos contra ela;
 *   CONFIRMADO em uso    a captura funcionou de verdade e o registro
 *                        apareceu no historico. Vale tanto quanto, e as
 *                        vezes mais - prova o caminho inteiro, nao so o
 *                        seletor.
 *
 * CONFIRMAR marca o que ainda nao teve nenhuma das duas.
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
import { qsa, qsAny, textoCasa, textoDe } from '../../core/dom.js';
import { mapaDeColunas } from '../../core/tabela.js';
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
   * CONFIRMADO no HTML: e um campo oculto, e o nome esta no PLURAL. Assinar
   * pelo bloco manda varios documentos de uma vez, e a URL nao traz nenhum
   * id_documento - so a arvore traz. Enquanto a captura dependia da URL,
   * assinatura por bloco nao entrava no historico.
   *
   * CONFIRMAR: so vi este campo com UM documento. Se numa assinatura em
   * lote ele trouxer id de protocolo em vez de id de documento, cada
   * assinatura viraria dois registros - um da captura e outro da varredura,
   * com chaves diferentes. O sintoma seria duplicata no painel.
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

  /**
   * O no de cada documento, pelo ID DO ELEMENTO.
   *
   * CONFIRMADO no HTML: <a id="anchor11965"> e <span id="span11965"> - o id
   * interno do documento esta no proprio atributo, sem depender de href.
   *
   * Isto existe porque depender do href era fragil: as acoes da arvore usam
   * ids com letra no meio (anchorA, anchorUG, anchorNA, anchorImg), e o no do
   * documento e o unico que e "anchor" seguido so de digitos.
   */
  no: 'a[id^="anchor"], span[id^="span"]',
  idNoAtributo: /^(?:anchor|span)(\d+)$/,
};

/**
 * Os documentos que ESTAO nesta arvore: id interno e numero visivel.
 *
 * Devolve as duas chaves porque os registros podem ter so uma delas - o
 * documento recem-criado entra no historico antes de o SEI o numerar.
 *
 * O no RAIZ da arvore e o processo, nao um documento, e o id dele e o
 * id_procedimento. Ele entra na lista mesmo assim: quem consome cruza com
 * registros de documento, e id de processo nao casa com chave de documento.
 */
export function chavesDaArvore(raiz = document) {
  const chaves = new Set();

  for (const no of qsa(ARVORE.no, raiz)) {
    const casou = String(no.getAttribute('id') || '').match(ARVORE.idNoAtributo);
    if (casou) chaves.add(casou[1]);

    const numero = textoDe(no).match(/\b(\d{5,})\b/);
    if (numero) chaves.add(numero[1]);
  }
  return [...chaves];
}

/* ------------------------------------------- documentos de um bloco */

/**
 * Tela "Documentos do Bloco de Assinatura N" (acao=rel_bloco_protocolo_listar).
 *
 * CONFIRMADO no HTML:
 *
 *   <table id="tblProtocolosBlocos">
 *     <tr><th>Seq.</th><th>Processo</th><th>Documento</th>
 *         <th>Tipo</th><th>Assinaturas</th>...</tr>
 *     <tr>
 *       <td data-label="Documento"><a ...>00102458</a></td>
 *       <td data-label="Assinaturas"></td>   <- VAZIA: ainda nao assinado
 *
 * O que esta confirmado e o caso VAZIO, capturado num bloco disponibilizado e
 * ainda nao assinado. O caso preenchido nao foi visto - por isso a regra e
 * "tem conteudo = tem assinatura", que nao depende de saber COMO ele e
 * preenchido. O cabecalho da coluna nao deixa duvida sobre o significado.
 *
 * Esta tela NAO traz o id interno em lugar nenhum: o link do documento e
 * href="#" com onclick. So o numero visivel, que e a outra chave dos
 * registros.
 */
export const BLOCO_PROTOCOLOS = {
  tabela: ['#tblProtocolosBlocos', 'table.infraTable'],
  colunas: { documento: 'documento', assinaturas: 'assinaturas' },
};

/**
 * Numeros dos documentos que a tela mostra COM assinatura.
 *
 * Devolve lista vazia quando a tela nao e essa - e o que faz a varredura
 * poder rodar em qualquer lugar sem inventar nada.
 */
export function documentosAssinadosNoBloco(raiz = document) {
  const tabela = qsAny(BLOCO_PROTOCOLOS.tabela, raiz);
  if (!tabela) return [];

  const colunas = mapaDeColunas(tabela);
  // Coluna nao encontrada deixa o indice indefinido, e a checagem de celula
  // logo abaixo ja descarta a linha. Uma guarda aqui seria linha morta -
  // sabotei tirando e nenhum teste caiu.
  const iDoc = colunas[BLOCO_PROTOCOLOS.colunas.documento];
  const iAss = colunas[BLOCO_PROTOCOLOS.colunas.assinaturas];

  const assinados = [];
  for (const linha of qsa('tr', tabela)) {
    const tds = qsa('td', linha);
    if (!tds.length) continue;

    const celulaDoc = tds[iDoc];
    const celulaAss = tds[iAss];
    if (!celulaDoc || !celulaAss) continue;
    if (!textoDe(celulaAss).trim()) continue; // sem assinatura: nada a resolver

    const numero = textoDe(celulaDoc).trim();
    if (numero) assinados.push(numero);
  }
  return assinados;
}

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

/**
 * Tela "Enviar Processo" (acao=procedimento_enviar).
 *
 * CONFIRMADO no SEI 5.0.4. Duas coisas que eu tinha errado e que so o HTML
 * real mostrou:
 *
 *  1. o formulario e `frmAtividadeListar`, e nao `frmProcedimentoEnviar`.
 *     Como a lista de formularios nao usa curinga, formularioDaTela()
 *     devolvia null e os ouvintes de submit e de Enter nunca eram ligados.
 *     So o clique funcionava - por acaso, porque o botao e type="submit".
 *
 *  2. o envio leva VARIOS processos. O campo oculto esta no plural e a
 *     lista de cima mostra todos. Registrar um evento so perderia os
 *     demais, exatamente como acontecia na assinatura em bloco.
 */
export const ENVIO = {
  formulario: ['#frmAtividadeListar', 'form[action*="procedimento_enviar"]'],

  // O botao e type="submit"; #sbmEnviar era o terceiro candidato da lista
  // antiga e o unico que acertava.
  botaoConfirmar: ['#sbmEnviar', 'button[name="sbmEnviar"]', '#btnEnviar'],

  rotulosConfirmar: ['enviar'],

  /** Os processos que serao enviados, como a pessoa os ve na tela. */
  processos: ['#selProcedimentos option', 'select[name="selProcedimentos"] option'],

  /** Os mesmos processos, por id interno. */
  idsProtocolos: ['#hdnIdProtocolos', 'input[name="hdnIdProtocolos"]'],

  /**
   * Unidades de destino ja escolhidas.
   *
   * A lista vem vazia e o SEI vai somando as unidades conforme a pessoa
   * escolhe - por isso o que interessa sao as opcoes presentes, nao o campo
   * de busca ao lado.
   */
  unidadesDestino: ['#selUnidades option', 'select[name="selUnidades"] option'],

  /** "Manter processo aberto na unidade atual" */
  manterAberto: ['#chkSinManterAberto', 'input[name="chkSinManterAberto"]'],
};

/**
 * Os processos que esta tela vai enviar.
 *
 * Devolve [{ id, processo }]. Recebe o valor cru do campo oculto e os textos
 * das opcoes da lista, e nao vai ao DOM: assim da para testar a regra sem
 * navegador.
 */
export function processosParaEnviar(valorDoCampo, textosDasOpcoes) {
  const ids = String(valorDoCampo || '').match(/\d+/g) || [];
  const nups = (textosDasOpcoes || []).map((t) => acharNup(t)).filter(Boolean);

  // Contagens iguais: casa por posicao. O SEI monta a lista visivel e o campo
  // oculto na mesma ordem.
  if (ids.length && ids.length === nups.length) {
    return ids.map((id, i) => ({ id, processo: nups[i] }));
  }

  // Contagens diferentes: o NUP e o que a pessoa reconhece no historico,
  // entao ele manda. Sem NUP nenhum, resta o id.
  if (nups.length) return nups.map((processo) => ({ id: null, processo }));
  return ids.map((id) => ({ id, processo: null }));
}
/* ---------------------------------------------------------- andamento */

// O andamento mudou de casa: mora em core/andamento.js, porque a leitura
// dele deixou de ser exclusiva do historico. Reexportado aqui para nao
// quebrar quem ja o importava daqui.
export { ANDAMENTO } from '../../core/andamento.js';

/* --------------------------------------------------- criacao de processo */

/** Tela "Iniciar Processo" (acao=procedimento_gerar). */
export const CRIACAO_PROCESSO = {
  // CONFIRMADO em uso: criar um processo registrou "criacao de processo"
  // no historico, com o NUP certo.
  // No SEI 5.0.4 o formulario e <form id="frmProcedimentoCadastro"> - o id,
  // e nao o name.
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
