/**
 * Testes da porta de rede.
 *
 * O privacidade.test.mjs cobra a FORMA do arquivo (só GET, uma porta só, sem
 * corpo). Aqui se cobra o COMPORTAMENTO das duas travas que impedem os dois
 * modos de errar feio:
 *
 *   - falar com outro servidor;
 *   - confundir a tela de login com um bloco vazio, e avisar o contrário do
 *     que está acontecendo.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { mesmaOrigem, ehTelaDeLogin, ErroDeRede } = await import('../src/content/core/rede.js');

const SEI = 'https://leste.sei.rj.gov.br/sei/controlador.php?acao=procedimento_controlar';

/* ------------------------------------------------------------ mesma origem */

test('caminho relativo é a mesma origem', () => {
  assert.equal(mesmaOrigem('controlador.php?acao=bloco_assinatura_listar', SEI), true);
  assert.equal(mesmaOrigem('/sei/controlador.php', SEI), true);
});

test('URL absoluta do mesmo SEI passa', () => {
  assert.equal(mesmaOrigem('https://leste.sei.rj.gov.br/sei/x.php', SEI), true);
});

test('outro domínio é recusado', () => {
  assert.equal(mesmaOrigem('https://exemplo.com/x', SEI), false);
  // Subdomínio diferente é outra origem, por mais parecido que pareça.
  assert.equal(mesmaOrigem('https://outro.sei.rj.gov.br/sei/x.php', SEI), false);
});

test('mudar o esquema é outra origem', () => {
  // http:// para o mesmo host mandaria a sessão em texto claro.
  assert.equal(mesmaOrigem('http://leste.sei.rj.gov.br/sei/x.php', SEI), false);
});

test('porta diferente é outra origem', () => {
  assert.equal(mesmaOrigem('https://leste.sei.rj.gov.br:8443/sei/x.php', SEI), false);
});

test('URL vazia ou inválida é recusada em vez de virar a própria página', () => {
  // new URL('', base) devolve a base: sem uma trava explícita, um engano de
  // quem chama viraria uma busca silenciosa da própria tela.
  for (const lixo of ['', '   ', null, undefined, 42, 'http://']) {
    assert.equal(mesmaOrigem(lixo, SEI), false, `deveria recusar ${JSON.stringify(lixo)}`);
  }
});

test('javascript: não escapa pela checagem', () => {
  assert.equal(mesmaOrigem('javascript:alert(1)', SEI), false);
  assert.equal(mesmaOrigem('data:text/html,<b>x</b>', SEI), false);
});

/* --------------------------------------------------------- sessão expirada */

test('reconhece a tela de login do SEI', () => {
  // Sessão expirada não devolve erro HTTP: devolve o login com status 200.
  assert.equal(ehTelaDeLogin('<form action="controlador.php?acao=login">'), true);
  assert.equal(ehTelaDeLogin('<input name="pwdSenha" type="password">'), true);
});

test('a página do bloco não é confundida com login', () => {
  const bloco = '<table id="tblBlocos"><tr><td>Assinatura</td></tr></table>';
  assert.equal(ehTelaDeLogin(bloco), false);
});

test('resposta vazia conta como login', () => {
  // Na dúvida, "não consegui olhar" — nunca "o bloco está vazio".
  assert.equal(ehTelaDeLogin(''), true);
  assert.equal(ehTelaDeLogin(null), true);
});

test('só o começo do HTML é examinado', () => {
  // A palavra "password" no rodapé de uma página legítima não pode derrubar a
  // leitura; e limitar o trecho evita varrer um HTML gigante a cada consulta.
  const grande = `<table id="tblBlocos">${'<tr><td>doc</td></tr>'.repeat(500)}type="password"`;
  assert.equal(ehTelaDeLogin(grande), false);
});

/* --------------------------------------------------------------- erro tipado */

test('ErroDeRede carrega o motivo separado da mensagem', () => {
  // Quem chama precisa distinguir "sessão expirada" de "bloco vazio" para não
  // dar o alerta errado.
  const erro = new ErroDeRede('sessao expirada');
  assert.equal(erro.motivo, 'sessao expirada');
  assert.ok(erro instanceof Error);
});

/* ------------------------------------------------------------- codificação */

const { detectarCharset } = await import('../src/content/core/rede.js');

test('o Content-Type manda', () => {
  assert.equal(detectarCharset('text/html; charset=ISO-8859-1'), 'iso-8859-1');
  assert.equal(detectarCharset('text/html;charset="utf-8"'), 'utf-8');
});

test('sem charset no cabeçalho, vale o <meta> do HTML', () => {
  assert.equal(
    detectarCharset('text/html', '<html><head><meta charset="iso-8859-1">'),
    'iso-8859-1',
  );
  assert.equal(
    detectarCharset(null, '<meta http-equiv="Content-Type" content="text/html; charset=windows-1252">'),
    'windows-1252',
  );
});

test('sem nenhuma pista, UTF-8', () => {
  assert.equal(detectarCharset('text/html', '<html><head><title>x</title>'), 'utf-8');
  assert.equal(detectarCharset(null, ''), 'utf-8');
  assert.equal(detectarCharset(undefined), 'utf-8');
});

test('o cabeçalho tem prioridade sobre o meta', () => {
  // Quando os dois discordam, quem serve o arquivo sabe mais que quem o
  // escreveu.
  assert.equal(
    detectarCharset('text/html; charset=iso-8859-1', '<meta charset="utf-8">'),
    'iso-8859-1',
  );
});

test('ISO-8859-1 lido como UTF-8 estraga justamente o acento', () => {
  // A prova do defeito que derrubou o alerta de bloco: "Número" servido em
  // latin1 e lido como UTF-8 vira "N\uFFFDmero", e a busca pela coluna falha.
  const latin1 = new Uint8Array([0x4e, 0xfa, 0x6d, 0x65, 0x72, 0x6f]); // Número
  assert.equal(new TextDecoder('utf-8').decode(latin1), 'N\uFFFDmero');
  assert.equal(new TextDecoder('iso-8859-1').decode(latin1), 'Número');
});
