/**
 * Testes das decisões do painel de histórico.
 *
 * O painel desenha muito e decide pouco — mas o pouco que ele decide é sobre
 * APAGAR DADO, e isso merece teste sem navegador.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

globalThis.chrome = {
  runtime: { id: 'teste' },
  storage: { local: { get: async () => ({}), set: async () => {} }, onChanged: { addListener() {} } },
};

const { comoRemover } = await import('../src/content/features/historico/painel.js');

test('favorito sempre pergunta antes de remover', () => {
  // O "x" fica a um pixel da estrela. Um clique errado não pode levar calado
  // justamente o registro que a pessoa marcou para não sumir.
  const favorito = { id: 'a', favorito: true };

  assert.deepEqual(comoRemover(favorito, {}), { perguntar: true, comCaixa: false });
  assert.deepEqual(
    comoRemover(favorito, { confirmarRemocao: false }),
    { perguntar: true, comCaixa: false },
    'nem com o aviso desligado o favorito sai calado',
  );
});

test('favorito não oferece a caixa de desligar', () => {
  // Desproteger à mão o que se protegeu à mão, sim; por uma caixinha marcada
  // de passagem enquanto se apaga outra coisa, não.
  assert.equal(comoRemover({ favorito: true }, {}).comCaixa, false);
});

test('registro comum pergunta uma vez e pode ser calado', () => {
  const comum = { id: 'b' };

  assert.deepEqual(comoRemover(comum, {}), { perguntar: true, comCaixa: true });
  assert.equal(comoRemover(comum, { confirmarRemocao: false }).perguntar, false);
  assert.equal(comoRemover(comum, { confirmarRemocao: true }).perguntar, true);
});

test('sem opções salvas, pergunta', () => {
  // O padrão é perguntar: quem nunca escolheu não escolheu o silêncio.
  assert.equal(comoRemover({}, {}).perguntar, true);
  assert.equal(comoRemover({}, undefined).perguntar, true);
  assert.equal(comoRemover(null, {}).perguntar, true);
});

test('a caixa só desliga o aviso quando se confirma', () => {
  // Marcar a caixa e clicar em Cancelar não pode desligar um aviso que a
  // pessoa acabou de decidir não seguir. Por isso `aoLembrar` é chamado
  // dentro do botão de confirmar, e não no fechamento.
  const ui = fs.readFileSync('src/content/core/ui.js', 'utf8');
  const primario = ui.slice(ui.indexOf('text: confirmarTexto'));
  const cancelar = ui.slice(ui.indexOf('text: cancelarTexto'), ui.indexOf('text: confirmarTexto'));

  assert.match(primario.slice(0, 200), /aoLembrar\(/, 'confirmar deveria avisar quem escuta');
  assert.equal(/aoLembrar\(/.test(cancelar), false, 'cancelar não pode desligar nada');
});

/* ------------------------------------------ a saída manual do pendente */

const FONTE_PAINEL = fs.readFileSync('src/content/features/historico/painel.js', 'utf8');

test('só documento pendente ganha o botão de resolver', () => {
  // Botão que não faz nada é pior que botão nenhum: assinatura e envio não
  // têm o que resolver.
  assert.match(
    FONTE_PAINEL,
    /function pendente\(registro\) \{\s*return registro\.tipoEvento === 'documento-criado' && !registro\.assinadoVisto;/,
  );
  assert.match(FONTE_PAINEL, /pendente\(registro\)\s*\?\s*el\('button'/, 'a linha decide pelo estado');
});

test('resolver marca como visto, não apaga o registro', () => {
  // A diferença importa: o "x" apagaria a criação do histórico; aqui o
  // registro continua, só sai da lista de pendentes.
  const trecho = FONTE_PAINEL.slice(FONTE_PAINEL.indexOf('async (interno) =>'));

  assert.match(trecho.slice(0, 200), /marcarAssinadosVistos\(\[interno\]\)/);
  assert.equal(/remover\(/.test(trecho.slice(0, 200)), false, 'resolver não é remover');
});
