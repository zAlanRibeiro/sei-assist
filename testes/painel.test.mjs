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
