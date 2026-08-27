/**
 * Testes do editor: data por extenso e recuperação de rascunho.
 *
 * O rascunho é a única parte da extensão que guarda conteúdo de documento.
 * Duas regras merecem teste mais que as outras, porque errar nelas apaga
 * trabalho de alguém: quando NÃO guardar, e quando descartar.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { formatarData } = await import('../src/content/features/editor/data.js');
const { chaveDoRascunho, deveGuardar, podar, vigentes, VALIDADE_MS, LIMITE } = await import(
  '../src/content/features/editor/rascunho.js'
);

/* ------------------------------------------------------------------ data */

test('escreve a data por extenso, como o ofício pede', () => {
  const d = new Date(2026, 7, 27); // agosto é o mês 7
  assert.equal(formatarData(d, { cidade: 'Niterói' }), 'Niterói, 27 de agosto de 2026');
});

test('sem cidade, só a data', () => {
  assert.equal(formatarData(new Date(2026, 7, 27)), '27 de agosto de 2026');
  assert.equal(formatarData(new Date(2026, 7, 27), { cidade: '   ' }), '27 de agosto de 2026');
});

test('o formato curto zera os dois dígitos', () => {
  assert.equal(formatarData(new Date(2026, 0, 5), { formato: 'curta' }), '05/01/2026');
});

test('dezembro e janeiro não saem trocados', () => {
  // getMonth() é base zero: é o erro clássico deste tipo de função.
  assert.equal(formatarData(new Date(2026, 11, 31)), '31 de dezembro de 2026');
  assert.equal(formatarData(new Date(2026, 0, 1)), '1 de janeiro de 2026');
});

test('usa a hora local, não a UTC', () => {
  // No fuso do Brasil, a parte de data do ISO escreve o dia ANTERIOR durante
  // toda a noite. Às 21h de 27/08 o ISO já diz 28/08.
  const noite = new Date(2026, 7, 27, 21, 30);
  assert.equal(formatarData(noite, { formato: 'curta' }), '27/08/2026');
});

test('data inválida devolve vazio em vez de "Invalid Date"', () => {
  assert.equal(formatarData(new Date('nada'), { cidade: 'Niterói' }), '');
});

/* --------------------------------------------------------------- chave */

test('sem id de documento não há rascunho', () => {
  // O título muda enquanto se escreve e a URL carrega infra_hash: o id é o
  // único identificador estável. Guardar sob outra coisa seria guardar onde
  // ninguém vai procurar depois.
  assert.equal(chaveDoRascunho(''), null);
  assert.equal(chaveDoRascunho(null), null);
  assert.equal(chaveDoRascunho('  '), null);
  assert.equal(chaveDoRascunho('11965'), 'doc:11965');
});

/* --------------------------------------------------- quando NÃO guardar */

test('texto vazio nunca substitui um rascunho existente', () => {
  // O editor começa vazio antes de carregar o conteúdo. Guardar esse instante
  // apagaria o rascunho bom — o defeito mais caro possível aqui.
  assert.equal(deveGuardar('', 'texto que já estava salvo'), false);
  assert.equal(deveGuardar('   \n  ', 'texto que já estava salvo'), false);
});

test('texto igual ao último não gera escrita nova', () => {
  assert.equal(deveGuardar('mesmo texto', 'mesmo texto'), false);
});

test('texto novo é guardado', () => {
  assert.equal(deveGuardar('parágrafo novo', 'parágrafo'), true);
  assert.equal(deveGuardar('primeiro texto', undefined), true);
});

/* ------------------------------------------------------------- validade */

const agora = new Date('2026-08-27T10:00:00Z').getTime();
const atras = (dias) => new Date(agora - dias * 24 * 60 * 60 * 1000).toISOString();

test('rascunho velho é descartado', () => {
  const guardados = {
    'doc:1': { texto: 'a', quando: atras(1) },
    'doc:2': { texto: 'b', quando: atras(5) },
  };
  assert.deepEqual(Object.keys(podar(guardados, agora)), ['doc:1']);
});

test('o prazo é de três dias', () => {
  assert.equal(VALIDADE_MS, 3 * 24 * 60 * 60 * 1000);
});

test('carimbo corrompido não sobrevive à poda', () => {
  // Guardar para sempre um registro que não dá para datar é o caminho para o
  // storage crescer sem fim.
  const guardados = { 'doc:1': { texto: 'a', quando: 'nao é data' }, 'doc:2': { texto: 'b' } };
  assert.deepEqual(podar(guardados, agora), {});
});

test('mantém no máximo o limite, do mais novo para o mais velho', () => {
  const guardados = {};
  for (let i = 0; i < LIMITE + 5; i++) {
    guardados[`doc:${i}`] = { texto: `t${i}`, quando: new Date(agora - i * 1000).toISOString() };
  }
  const podados = podar(guardados, agora);

  assert.equal(Object.keys(podados).length, LIMITE);
  assert.ok(podados['doc:0'], 'o mais novo tem de ficar');
  assert.ok(!podados[`doc:${LIMITE + 4}`], 'o mais velho tem de sair');
});

test('lista vazia não quebra', () => {
  assert.deepEqual(podar({}, agora), {});
  assert.deepEqual(podar(null, agora), {});
  assert.deepEqual(vigentes(undefined, agora), []);
});

/* ------------------------------------------------ identidade do documento */

const { idDoDocumento } = await import('../src/content/features/editor/seletores.js');

test('o id sai do nome da janela do editor', () => {
  // "janelaEditor_<id_procedimento>_<id_documento>" — só a captura do HTML
  // real revelou esse formato. O segundo número é o documento.
  assert.equal(idDoDocumento('janelaEditor_100001857_115872'), '115872');
});

test('sem nome de janela, cai para o id_documento da URL', () => {
  assert.equal(
    idDoDocumento('', 'https://x/sei/controlador.php?acao=editor_montar&id_documento=115872'),
    '115872',
  );
});

test('o nome da janela tem prioridade sobre a URL', () => {
  // A URL do editor nem sempre traz os ids; o nome da janela sempre traz.
  assert.equal(
    idDoDocumento('janelaEditor_1_999', 'https://x/sei/x.php?id_documento=111'),
    '999',
  );
});

test('sem nenhuma das duas fontes, não há rascunho', () => {
  // Guardar sob id inventado é guardar onde ninguém vai procurar depois.
  assert.equal(idDoDocumento('', ''), null);
  assert.equal(idDoDocumento('outraJanela', 'https://x/sei/x.php'), null);
  assert.equal(idDoDocumento(undefined, undefined), null);
});

test('nome de janela parecido não engana', () => {
  assert.equal(idDoDocumento('janelaEditorAntiga'), null);
});

/* ------------------------------------------- verificação da inserção */

const { contarOcorrencias } = await import('../src/content/features/editor/index.js');

test('reconhece o texto inserido', () => {
  assert.equal(contarOcorrencias('Niterói, 27 de agosto de 2026', 'Niterói, 27 de agosto de 2026'), 1);
  assert.equal(contarOcorrencias('antes\nNiterói, 27 de agosto de 2026\ndepois', 'Niterói, 27 de agosto de 2026'), 1);
});

test('espaço reflowado pelo editor não conta como texto diferente', () => {
  // O CKEditor reflui o texto ao inserir: quebra de linha e espaço mudam de
  // lugar. Comparar caractere a caractere daria falso negativo.
  assert.equal(contarOcorrencias('Niterói,\n27 de   agosto\nde 2026', 'Niterói, 27 de agosto de 2026'), 1);
});

test('conta ocorrências, não presença', () => {
  // Inserir a mesma data duas vezes é legítimo. O que prova a inserção é o
  // número ter subido, não o texto estar lá.
  const data = '27 de agosto de 2026';
  assert.equal(contarOcorrencias(`${data} e depois ${data}`, data), 2);
});

test('texto ausente conta zero', () => {
  assert.equal(contarOcorrencias('outro conteúdo qualquer', '27 de agosto de 2026'), 0);
});

test('mexer só na seleção não conta como inserção', () => {
  // Era este o defeito: a verificação antiga perguntava "mudou alguma coisa?",
  // e sobrar um parágrafo vazio já era "mudou". O log dizia que funcionou e a
  // tela continuava igual.
  const antes = '';
  const depoisDeMexerNaSelecao = '\n';
  const texto = 'Niterói, 27 de agosto de 2026';

  assert.notEqual(antes, depoisDeMexerNaSelecao, 'o innerText realmente muda');
  assert.equal(
    contarOcorrencias(depoisDeMexerNaSelecao, texto),
    contarOcorrencias(antes, texto),
    'mas a contagem não sobe — e é ela que decide',
  );
});

test('agulha vazia nunca conta', () => {
  assert.equal(contarOcorrencias('qualquer coisa', ''), 0);
  assert.equal(contarOcorrencias('qualquer coisa', '   '), 0);
  assert.equal(contarOcorrencias('qualquer coisa', null), 0);
});

test('conteúdo vazio não quebra', () => {
  assert.equal(contarOcorrencias('', 'texto'), 0);
  assert.equal(contarOcorrencias(null, 'texto'), 0);
});

test('rascunho longo é reconhecido pelo começo', () => {
  // Só os primeiros 60 caracteres viram amostra: comparar um rascunho inteiro
  // seria caro e daria falso negativo ao menor reflow do editor.
  const longo =
    'Trata-se de solicitação encaminhada pela Divisão de Estatísticas ' +
    'para análise e manifestação quanto ao plano de trabalho apresentado. '.repeat(6);

  assert.equal(contarOcorrencias(longo, longo), 1);
  assert.equal(
    contarOcorrencias(longo.slice(0, 90), longo),
    1,
    'o começo do rascunho basta para reconhecê-lo',
  );
});

/* ------------------------------------------------- rascunho por seção */

const { recuperar, guardar } = await import('../src/content/features/editor/rascunho.js');
const { temEstrutura } = await import('../src/content/features/editor/seletores.js');

test('seção com tabela ou imagem é considerada estruturada', () => {
  // Cabeçalho traz o timbre; Rodapé traz a tabela de referência do processo.
  // Devolver texto puro para dentro deles achataria a tabela e perderia a
  // imagem — e sem ganho, porque o SEI as gera a partir do modelo.
  const comTabela = { querySelector: (s) => (s.includes('table') ? {} : null) };
  const soTexto = { querySelector: () => null };

  assert.equal(temEstrutura(comTabela), true);
  assert.equal(temEstrutura(soTexto), false);
  assert.equal(temEstrutura(null), false);
});

test('rascunho da versão antiga é convertido, não descartado', async () => {
  // Quem tinha rascunho pendente não pode perdê-lo por causa de uma
  // atualização da extensão. O formato antigo guardava um texto único, que
  // era sempre o corpo.
  const guardados = {
    'doc:1': { texto: 'texto da versão antiga', quando: new Date().toISOString() },
  };
  let lido = null;
  globalThis.chrome = {
    runtime: { id: 'teste' },
    storage: {
      local: {
        get: async () => ({ 'seix:rascunhos': guardados }),
        set: async (v) => {
          lido = v;
        },
      },
    },
  };

  const r = await recuperar('1');
  assert.deepEqual(r.secoes, { 'Corpo do Texto': 'texto da versão antiga' });
  assert.equal(lido, null, 'recuperar não deve gravar nada');
});

test('não grava quando nenhuma seção tem conteúdo', async () => {
  let gravou = false;
  globalThis.chrome = {
    runtime: { id: 'teste' },
    storage: {
      local: {
        get: async () => ({}),
        set: async () => {
          gravou = true;
        },
      },
    },
  };

  const ok = await guardar('1', { 'Corpo do Texto': '', Desfecho: '   ' });
  assert.equal(ok, false);
  assert.equal(gravou, false, 'documento vazio não vira rascunho');
});

test('grava quando alguma seção tem conteúdo', async () => {
  let escrito = null;
  globalThis.chrome = {
    runtime: { id: 'teste' },
    storage: {
      local: {
        get: async () => ({}),
        set: async (v) => {
          escrito = v;
        },
      },
    },
  };

  const ok = await guardar('1', { 'Corpo do Texto': 'trata-se de', Desfecho: '' });
  assert.equal(ok, true);
  assert.deepEqual(escrito['seix:rascunhos']['doc:1'].secoes, {
    'Corpo do Texto': 'trata-se de',
    Desfecho: '',
  });
});
