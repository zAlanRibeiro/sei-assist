/**
 * Constantes compartilhadas entre content script, popup e pagina de opcoes.
 * Nao importa nada e nao toca no DOM — pode ser usado em qualquer contexto.
 */

export const NS = 'seix';          // prefixo de classes CSS, ids e eventos
export const NOME = 'SEI Assist';
export const STORAGE_KEY = 'seix:config';
export const STORAGE_AREA = 'sync';  // 'sync' acompanha o usuario entre maquinas

/**
 * Mapa acao (query string do controlador.php) -> nome estavel de tela.
 *
 * O SEI muda muito de HTML entre versoes/instancias, mas o parametro `acao`
 * do controlador.php e a coisa mais estavel que existe no sistema. E por ele
 * que as features decidem em que tela rodam.
 */
export const ACOES = {
  procedimento_controlar: 'controle-processos',
  procedimento_trabalhar: 'processo',
  // O formulario de criacao. Confirmado no SEI 5.0.4.
  procedimento_gerar: 'novo-processo',
  procedimento_cadastrar: 'novo-processo',
  // Só a LISTA de tipos, antes do formulario: nao tem o que capturar.
  procedimento_escolher_tipo: 'escolher-tipo-processo',
  procedimento_visualizar: 'processo',
  arvore_visualizar: 'arvore',
  documento_escolher_tipo: 'escolher-tipo-documento',
  documento_gerar: 'gerar-documento',
  documento_alterar: 'alterar-documento',
  documento_visualizar: 'visualizar-documento',
  documento_assinar: 'assinar-documento',
  procedimento_enviar: 'enviar-processo',
  // CONFIRMAR: nome da acao da tela "Consultar Andamento". O parser nao
  // depende disto - ele detecta a tela pelo conteudo -, mas o nome ajuda no log.
  procedimento_historico: 'andamento',
  procedimento_andamento: 'andamento',
  bloco_assinatura_assinar: 'assinar-documento',
  editor_montar: 'editor',
  editor_visualizar: 'editor',
  protocolo_pesquisar: 'pesquisa',
  md_pesq_processo_pesquisar: 'pesquisa',
  procedimento_pesquisar: 'pesquisa',
  base_conhecimento_listar: 'base-conhecimento',
  bloco_assinatura_listar: 'bloco-assinatura',
  bloco_interno_listar: 'bloco-interno',
  relacao_bloco_protocolo_listar: 'bloco-conteudo',
  marcador_listar: 'marcadores',
  acompanhamento_especial_listar: 'acompanhamento-especial',
  contato_listar: 'contatos',
  usuario_listar: 'usuarios',
  procedimento_controlar_retornar: 'controle-processos',
};

/** Telas onde nao faz sentido nenhuma feature rodar (ex.: login). */
export const ACOES_IGNORADAS = new Set(['login', 'usuario_logar', 'sistema_login']);

/**
 * Nomes de frame usados pelo SEI. O SEI e todo montado em iframes, e cada
 * frame recebe uma copia do content script (all_frames: true no manifest),
 * entao a feature precisa saber em qual pedaco da tela ela esta.
 */
export const FRAMES = {
  ifrArvore: 'arvore',                       // arvore de documentos (esquerda)
  ifrVisualizacao: 'visualizacao',           // painel direito
  ifrConteudoVisualizacao: 'conteudo',       // conteudo dentro do painel direito
  ifrArvoreHtml: 'arvore-html',
  ifrVisualizacaoHtml: 'visualizacao-html',
  ifrEditor: 'editor',
  // A assinatura abre num modal. Sem esta linha o papel do frame ficava
  // 'desconhecido' no log, o que atrapalhou o diagnostico.
  'modal-frame': 'modal',
};
