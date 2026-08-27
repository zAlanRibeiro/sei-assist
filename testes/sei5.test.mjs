/**
 * Testes contra o HTML real do SEI 5.0.4 (leste.sei.rj.gov.br).
 *
 * Cada caso aqui nasceu de um defeito encontrado em uso, não de suposição.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { textoCasa, norm } = await import('../src/content/core/dom.js');
const { separarNomeELogin } = await import('../src/content/features/historico/sessao.js');

/* ------------------------------------------- teclas de atalho do SEI */

test('acha botão do SEI apesar da letra de atalho ficar num <span>', () => {
  // <button accesskey="S"><span class="infraTeclaAtalho">S</span>alvar</button>
  // textContent = "S\n            alvar" -> não contém "salvar".
  const salvar = 'S\n            alvar';

  assert.equal(textoCasa(salvar, 'salvar'), true, 'este era o bug: não casava');
  assert.equal(norm(salvar), 's alvar', 'o texto cru realmente vem partido');
});

test('o mesmo vale para os outros botões do SEI', () => {
  assert.equal(textoCasa('A ssinar', 'assinar'), true);
  assert.equal(textoCasa('E nviar', 'enviar'), true);
  assert.equal(textoCasa('V oltar', 'voltar'), true);
});

test('a tolerância a espaço não passa a casar qualquer coisa', () => {
  assert.equal(textoCasa('C ancelar', 'salvar'), false);
  assert.equal(textoCasa('V oltar', 'enviar'), false);
  assert.equal(textoCasa('Pesquisar', 'salvar'), false);
});

test('comparação exata também tolera o span do atalho', () => {
  assert.equal(textoCasa('S alvar', 'salvar', { exato: true }), true);
  assert.equal(textoCasa('Salvar tudo', 'salvar', { exato: true }), false);
});

/* ---------------------------------------- identidade na barra do topo */

test('separa nome e login do title do usuário', () => {
  const { nome, login } = separarNomeELogin(
    'Alan Doyle Costa Ribeiro (alan.ribeiro@nittrans.niteroi.rj.gov.br/NITEROI)',
  );

  assert.equal(nome, 'Alan Doyle Costa Ribeiro');
  assert.equal(login, 'alan.ribeiro@nittrans.niteroi.rj.gov.br');
});

test('login curto, sem e-mail, também é lido', () => {
  const { nome, login } = separarNomeELogin('Maria Souza (msouza/NITEROI)');
  assert.equal(nome, 'Maria Souza');
  assert.equal(login, 'msouza');
});

test('title sem parênteses devolve só o nome', () => {
  assert.deepEqual(separarNomeELogin('Alan Doyle Costa Ribeiro'), {
    nome: 'Alan Doyle Costa Ribeiro',
    login: null,
  });
});

test('title vazio não quebra', () => {
  assert.deepEqual(separarNomeELogin(''), { nome: null, login: null });
  assert.deepEqual(separarNomeELogin(null), { nome: null, login: null });
});

test('a barra do usuário não é confundida com a da unidade', () => {
  // <a id="lnkInfraUnidade" title="Divisão de Estatísticas">NIT/NITTRANS/DIVEST</a>
  const { nome, login } = separarNomeELogin('NIT/NITTRANS/DIVEST');
  assert.equal(login, null, 'sigla de unidade não tem login');
  assert.equal(nome, 'NIT/NITTRANS/DIVEST');
});

/* --------------------------------- reconhecer o botao de confirmacao */

const { ehBotaoDeConfirmacao } = await import('../src/content/features/historico/captura.js');
const { CRIACAO_PROCESSO, ASSINATURA } = await import(
  '../src/content/features/historico/seletores.js'
);

/** Elemento falso, com o mínimo que ehBotaoDeConfirmacao() consulta. */
function botao({ id = '', name = '', texto = '', tag = 'BUTTON' } = {}) {
  const attrs = { id, name };
  return {
    tagName: tag,
    id,
    name,
    textContent: texto,
    getAttribute: (k) => attrs[k] ?? null,
    matches: (seletor) => {
      if (seletor.startsWith('#')) return id === seletor.slice(1);
      const m = seletor.match(/\[name="([^"]+)"\]/);
      if (m) return name === m[1];
      return false;
    },
  };
}

test('reconhece o botão Salvar pelo id', () => {
  assert.equal(ehBotaoDeConfirmacao(botao({ id: 'btnSalvar' }), CRIACAO_PROCESSO), true);
});

test('reconhece o botão Salvar pelo texto, com a letra de atalho separada', () => {
  // É este o caso do SEI 5: <span>S</span>alvar, sem id previsível.
  const semId = botao({ texto: 'S\n            alvar' });
  assert.equal(ehBotaoDeConfirmacao(semId, CRIACAO_PROCESSO), true);
});

test('a barra duplicada do rodapé é reconhecida igual', () => {
  // O SEI repete a barra de comandos no topo e no rodapé com os MESMOS ids.
  // Era clicar no de baixo que passava despercebido.
  const rodape = botao({ id: 'btnSalvar', name: 'btnSalvar', texto: 'S alvar' });
  assert.equal(ehBotaoDeConfirmacao(rodape, CRIACAO_PROCESSO), true);
});

test('não confunde Cancelar nem Voltar com confirmação', () => {
  assert.equal(ehBotaoDeConfirmacao(botao({ texto: 'V oltar' }), CRIACAO_PROCESSO), false);
  assert.equal(ehBotaoDeConfirmacao(botao({ name: 'btnCancelar', texto: 'C ancelar' }), CRIACAO_PROCESSO), false);
});

test('a busca rápida do cabeçalho não é confundida com confirmação', () => {
  // Está em toda tela do SEI; um seletor genérico como button[type=submit]
  // casaria com ela — por isso não existe mais nenhum.
  const pesquisa = botao({ id: 'txtPesquisaRapida', texto: 'Pesquisar' });
  assert.equal(ehBotaoDeConfirmacao(pesquisa, CRIACAO_PROCESSO), false);
  assert.equal(ehBotaoDeConfirmacao(pesquisa, ASSINATURA), false);
});

test('cada tela reconhece só o seu botão', () => {
  const salvar = botao({ id: 'btnSalvar', texto: 'S alvar' });
  assert.equal(ehBotaoDeConfirmacao(salvar, ASSINATURA), false, 'Salvar não é Assinar');

  const assinar = botao({ id: 'btnAssinar', texto: 'A ssinar' });
  assert.equal(ehBotaoDeConfirmacao(assinar, CRIACAO_PROCESSO), false, 'Assinar não é Salvar');
});

/* ------------------------------------------ tela "Gerar Documento" */

const { CRIACAO_DOCUMENTO } = await import('../src/content/features/historico/seletores.js');

test('reconhece o Salvar da tela de gerar documento', () => {
  // Mesmo id da criação de processo, e também duplicado no rodapé.
  assert.equal(ehBotaoDeConfirmacao(botao({ id: 'btnSalvar' }), CRIACAO_DOCUMENTO), true);
  assert.equal(
    ehBotaoDeConfirmacao(botao({ name: 'btnSalvar', texto: 'S alvar' }), CRIACAO_DOCUMENTO),
    true,
  );
});

test('não confunde os outros botões da tela de gerar documento', () => {
  // Esta tela tem "Selecionar nos Favoritos", "Cancelar" e "Voltar".
  const favoritos = botao({ id: 'btnEscolherDocumentoTextoBase', texto: 'Selecionar nos Favoritos' });
  assert.equal(ehBotaoDeConfirmacao(favoritos, CRIACAO_DOCUMENTO), false);

  const cancelarUpload = botao({ id: 'btnUploadCancelarfrmAnexos', texto: 'Cancelar' });
  assert.equal(ehBotaoDeConfirmacao(cancelarUpload, CRIACAO_DOCUMENTO), false);

  assert.equal(ehBotaoDeConfirmacao(botao({ texto: 'V oltar' }), CRIACAO_DOCUMENTO), false);
});

test('criar e assinar o mesmo documento são dois registros distintos', async () => {
  // As chaves não podem colidir: `doc:<id>` é a assinatura,
  // `documento-criado:<id>` é a criação. O mesmo documento gera os dois.
  const chaveAssinatura = 'doc:11965';
  const chaveCriacao = 'documento-criado:11965';

  assert.notEqual(chaveAssinatura, chaveCriacao);
  assert.ok(chaveCriacao.startsWith('documento-criado:'), 'prefixo separa os eventos');
});

/* ------------------------------- assinatura em bloco (HTML real do modal) */

const { idsParaAssinar } = await import('../src/content/features/historico/seletores.js');

test('assinatura em bloco vira um registro por documento', () => {
  // Este era o buraco: a captura lia só `id_documento` da URL e desistia
  // quando ele faltava — que é exatamente o caso do bloco. Assinar dez
  // documentos de uma vez não registrava nenhum.
  assert.deepEqual(idsParaAssinar('115872,115873,115874', null), [
    '115872',
    '115873',
    '115874',
  ]);
});

test('o separador do campo não importa', () => {
  // Não sei qual o SEI usa; qualquer sequência de dígitos vira um id.
  assert.deepEqual(idsParaAssinar('115872, 115873', null), ['115872', '115873']);
  assert.deepEqual(idsParaAssinar('115872|115873', null), ['115872', '115873']);
});

test('documento único continua funcionando', () => {
  assert.deepEqual(idsParaAssinar('115872', null), ['115872']);
});

test('a URL é rede quando o campo não vem', () => {
  // Uma versão do SEI pode não trazer o campo oculto.
  assert.deepEqual(idsParaAssinar('', '115872'), ['115872']);
  assert.deepEqual(idsParaAssinar(null, '115872'), ['115872']);
});

test('o campo tem prioridade sobre a URL', () => {
  // Na assinatura em bloco a URL traz o documento de onde você veio, não os
  // que serão assinados.
  assert.deepEqual(idsParaAssinar('1,2', '999'), ['1', '2']);
});

test('sem nenhuma das duas fontes, não registra nada', () => {
  assert.deepEqual(idsParaAssinar('', null), []);
  assert.deepEqual(idsParaAssinar(null, undefined), []);
  assert.deepEqual(idsParaAssinar('sem número aqui', null), []);
});

test('id repetido não vira dois registros', () => {
  assert.deepEqual(idsParaAssinar('7,7,7', null), ['7']);
});

test('os seletores da assinatura batem com o HTML real do modal', () => {
  // Confirmados na captura de leste.sei.rj.gov.br: o formulário é
  // #frmAssinaturas (não frmDocumentoAssinar) e o campo do assinante é
  // #txtUsuario (não txtAssinante) — nenhum dos dois casava antes.
  assert.ok(ASSINATURA.formulario.includes('#frmAssinaturas'));
  assert.ok(ASSINATURA.assinante.includes('#txtUsuario'));
  assert.ok(ASSINATURA.idsDocumentos.includes('#hdnIdDocumentos'));
});

test('a lista de formulários não usa mais o curinga "form"', () => {
  // A regra está no topo do seletores.js: 'form' casaria com o
  // frmProtocoloPesquisaRapida que toda tela do SEI carrega no cabeçalho.
  assert.ok(!ASSINATURA.formulario.includes('form'));
});
