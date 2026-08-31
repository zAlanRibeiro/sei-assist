/**
 * Testes do historico de assinaturas, com um chrome.storage falso em memoria.
 *
 * O ponto sensivel e a deduplicacao: o mesmo documento chega por duas fontes
 * (tela de assinatura e arvore), cada uma sabendo metade da historia. A fusao
 * nao pode perder o que a outra ja sabia.
 *
 * Rodar:  node --test testes/*.test.mjs
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const memoria = {};

// sessionStorage falso: a pendencia de criacao usa o de verdade porque ele e
// sincrono - ver o comentario em guardarPendencia().
const sessao = new Map();
globalThis.sessionStorage = {
  getItem: (k) => (sessao.has(k) ? sessao.get(k) : null),
  setItem: (k, v) => sessao.set(k, String(v)),
  removeItem: (k) => sessao.delete(k),
};

globalThis.chrome = {
  // runtime.id e o sinal de que o vinculo com a extensao esta vivo. Sem ele,
  // comContexto() considera o contexto invalidado e nao executa nada.
  runtime: { id: 'teste' },
  storage: {
    local: {
      get: async (chave) => ({ [chave]: memoria[chave] }),
      set: async (obj) => Object.assign(memoria, obj),
      remove: async (chave) => {
        delete memoria[chave];
      },
    },
    onChanged: { addListener() {}, removeListener() {} },
  },
};

const hist = await import('../src/content/features/historico/armazenamento.js');

/** Como a tela de assinatura ve o evento: data exata e autor, sem numero. */
const daAssinatura = {
  id: 'doc:99',
  documento: null,
  tipo: null,
  processo: '00000.000123/2024-11',
  assinante: 'Alan',
  quando: '2026-08-24T14:00:00.000Z',
  quandoExato: true,
  confirmado: false,
  origem: 'assinatura',
};

/** Como a arvore ve o mesmo documento depois: numero e prova, sem autor. */
const daArvore = {
  id: 'doc:99',
  documento: '1234567',
  tipo: 'Oficio',
  assinante: null,
  quando: '2026-08-24T18:00:00.000Z',
  quandoExato: false,
  confirmado: true,
  origem: 'arvore',
};

beforeEach(async () => {
  await hist.limpar();
  hist.limparPendencia(hist.PENDENCIA_PROCESSO);
});

test('grava e conta um registro', async () => {
  await hist.registrar(daAssinatura);
  assert.equal(await hist.contar(), 1);
});

test('registro sem id e recusado', async () => {
  assert.equal(await hist.registrar({ documento: '1' }), null);
  assert.equal(await hist.contar(), 0);
});

test('as duas fontes se fundem em um registro so, sem perder informacao', async () => {
  await hist.registrar(daAssinatura);
  await hist.registrar(daArvore);

  const [reg] = await hist.listar();
  assert.equal(await hist.contar(), 1, 'nao pode duplicar');
  assert.equal(reg.documento, '1234567', 'a arvore completa o numero');
  assert.equal(reg.tipo, 'Oficio', 'a arvore completa o tipo');
  assert.equal(reg.assinante, 'Alan', 'nulo da arvore nao apaga o autor');
  assert.equal(reg.processo, '00000.000123/2024-11', 'o NUP sobrevive');
  assert.equal(reg.quando, '2026-08-24T14:00:00.000Z', 'vale a data exata');
  assert.equal(reg.quandoExato, true, 'quandoExato nao regride');
  assert.equal(reg.confirmado, true, 'a arvore confirma a assinatura');
});

test('a ordem das fontes nao importa', async () => {
  await hist.registrar(daArvore);
  await hist.registrar(daAssinatura);

  const [reg] = await hist.listar();
  assert.equal(reg.documento, '1234567');
  assert.equal(reg.assinante, 'Alan');
  assert.equal(reg.confirmado, true);
  assert.equal(reg.quandoExato, true);
});

test('lista do mais recente para o mais antigo', async () => {
  await hist.registrar(daAssinatura);
  await hist.registrar({ ...daAssinatura, id: 'doc:100', quando: '2026-08-25T09:00:00.000Z' });

  assert.deepEqual((await hist.listar()).map((r) => r.id), ['doc:100', 'doc:99']);
});

test('filtros de busca, periodo, autor e confirmacao', async () => {
  await hist.registrar(daAssinatura);
  await hist.registrar(daArvore);
  await hist.registrar({
    ...daAssinatura,
    id: 'doc:100',
    origem: 'documento',
    assinante: 'Beatriz',
    quando: '2026-08-25T09:00:00.000Z',
  });

  const ids = (lista) => lista.map((r) => r.id);

  assert.deepEqual(ids(await hist.listar({ busca: '1234567' })), ['doc:99'], 'busca por numero');
  assert.deepEqual(ids(await hist.listar({ busca: 'OFICIO' })), ['doc:99'], 'busca ignora caixa');
  assert.deepEqual(
    ids(await hist.listar({ desde: new Date('2026-08-25T00:00:00.000Z') })),
    ['doc:100'],
    'filtro por periodo',
  );
  assert.deepEqual(
    ids(await hist.listar({ somenteMinhas: true, usuario: 'Alan' })),
    ['doc:99'],
    'somente as minhas',
  );
  assert.equal((await hist.listar({})).length, 2, 'sem identidade, nao filtra por autor');
  assert.deepEqual(ids(await hist.listar({ somenteConfirmados: true })), ['doc:99']);
});

test('descartarPendente remove o pendente e poupa o confirmado', async () => {
  await hist.registrar(daAssinatura);
  await hist.registrar(daArvore); // confirma doc:99
  await hist.registrar({ ...daAssinatura, id: 'doc:100' }); // segue pendente

  assert.equal(await hist.descartarPendente('doc:100'), true);
  assert.equal(await hist.descartarPendente('doc:99'), false, 'confirmado nao se descarta');
  assert.deepEqual((await hist.listar()).map((r) => r.id), ['doc:99']);
});

test('o bloco do documento tem a palavra final sobre a data', async () => {
  // A captura no momento do ato erra por segundos; o bloco impresso no
  // documento traz a data que o SEI carimbou.
  await hist.registrar({ ...daAssinatura, quando: '2026-08-24T14:00:07.000Z' });
  await hist.registrar({
    id: 'doc:99',
    quando: '2026-07-02T19:59:00.000Z',
    quandoExato: true,
    confirmado: true,
    origem: 'documento',
    assinante: 'Alan Doyle Costa Ribeiro',
    cargo: 'Estagiário',
  });

  const [reg] = await hist.listar();
  assert.equal(reg.quando, '2026-07-02T19:59:00.000Z', 'vale a data do documento');
  assert.equal(reg.cargo, 'Estagiário');
  assert.equal(reg.processo, '00000.000123/2024-11', 'o resto do registro sobrevive');
});

test('a arvore chegando depois nao estraga a data do documento', async () => {
  await hist.registrar({ id: 'doc:99', quando: '2026-07-02T19:59:00.000Z', quandoExato: true, origem: 'documento' });
  await hist.registrar({ ...daArvore, quando: '2026-08-24T18:00:00.000Z' });

  const [reg] = await hist.listar();
  assert.equal(reg.quando, '2026-07-02T19:59:00.000Z');
});

/* --------------------------------------------------------------- envios */

const umEnvio = {
  id: 'envio:NIT-050131/000463/2026:2026-07-02T19:59',
  tipoEvento: 'envio',
  processo: 'NIT-050131/000463/2026',
  idProcedimento: '9233',
  destino: 'NIT/OUTRA',
  assinante: 'Alan Doyle Costa Ribeiro',
  quando: '2026-07-02T19:59:00.000Z',
  quandoExato: true,
  confirmado: true,
  origem: 'envio',
};

test('registro sem tipoEvento e tratado como assinatura', async () => {
  await hist.registrar(daAssinatura);
  assert.equal((await hist.listar())[0].tipoEvento, 'assinatura');
});

test('filtra a linha do tempo por tipo de evento', async () => {
  await hist.registrar({ ...daAssinatura, tipoEvento: 'assinatura' });
  await hist.registrar(umEnvio);

  assert.equal((await hist.listar()).length, 2, 'tudo junto por padrao');
  assert.equal((await hist.listar({ tipoEvento: 'tudo' })).length, 2);
  assert.deepEqual(
    (await hist.listar({ tipoEvento: 'envio' })).map((r) => r.id),
    [umEnvio.id],
  );
  assert.deepEqual(
    (await hist.listar({ tipoEvento: 'assinatura' })).map((r) => r.id),
    ['doc:99'],
  );
});

test('registrarEnvio: o mesmo ato visto duas vezes nao duplica', async () => {
  // captura no momento do clique: sabe o id_procedimento, erra por segundos
  await hist.registrarEnvio({
    ...umEnvio,
    id: 'envio:9233:2026-07-02T19:59',
    processo: null,
    quando: '2026-07-02T19:59:04.000Z',
    destino: null,
    origem: 'envio',
  });

  // depois, o andamento: sabe o NUP, o destino e a hora carimbada
  await hist.registrarEnvio({ ...umEnvio, origem: 'andamento' });

  const lista = await hist.listar({ tipoEvento: 'envio' });
  assert.equal(lista.length, 1, 'juntou pelo id_procedimento + proximidade no tempo');
  assert.equal(lista[0].destino, 'NIT/OUTRA', 'o andamento completou o destino');
  assert.equal(lista[0].quando, '2026-07-02T19:59:00.000Z', 'vale a hora do andamento');
  assert.equal(lista[0].assinante, 'Alan Doyle Costa Ribeiro');
});

test('registrarEnvio: dois envios distantes no tempo sao dois registros', async () => {
  await hist.registrarEnvio(umEnvio);
  await hist.registrarEnvio({
    ...umEnvio,
    id: 'envio:NIT-050131/000463/2026:2026-07-10T11:00',
    quando: '2026-07-10T11:00:00.000Z',
  });
  assert.equal((await hist.listar({ tipoEvento: 'envio' })).length, 2);
});

test('registrarEnvio: processos diferentes nunca se juntam', async () => {
  await hist.registrarEnvio(umEnvio);
  await hist.registrarEnvio({
    ...umEnvio,
    id: 'envio:OUTRO:2026-07-02T19:59',
    processo: 'NIT-050131/000999/2026',
    idProcedimento: '9999',
  });
  assert.equal((await hist.listar({ tipoEvento: 'envio' })).length, 2);
});

test('CSV sai no formato que o Excel pt-BR abre', async () => {
  const csv = hist.paraCsv([{ quando: 'x', documento: 'a"b', tipo: null }]);
  const linhas = csv.split('\r\n');

  assert.equal(csv.charCodeAt(0), 0xfeff, 'BOM na primeira posicao do arquivo');
  assert.equal(
    linhas[0].replace(/^﻿/, ''),
    'quando;tipoEvento;documento;tipo;processo;assinante;cargo;descricao;unidade;destino;confirmado;origem',
  );
  assert.ok(linhas[1].includes('"a""b"'), 'aspas duplicadas (RFC 4180)');
  assert.ok(linhas[1].includes(';"";'), 'nulo vira campo vazio');
});

// Neste orgao o login do SEI e o e-mail institucional.
const EU = ['Alan Doyle Costa Ribeiro', 'alan.ribeiro@nittrans.niteroi.rj.gov.br'];

test('o painel casa por nome completo ou por e-mail institucional', async () => {
  await hist.registrar({ ...daAssinatura, origem: 'documento', assinante: 'Alan Doyle Costa Ribeiro' });
  await hist.registrarEnvio({
    ...umEnvio,
    origem: 'andamento',
    assinante: 'alan.ribeiro@nittrans.niteroi.rj.gov.br',
  });
  await hist.registrar({
    ...daAssinatura,
    id: 'doc:777',
    origem: 'documento',
    assinante: 'Beatriz Lopes',
  });

  const minhas = await hist.listar({ identidades: EU });

  assert.equal(minhas.length, 2, 'a assinatura (nome) e o envio (e-mail) sao meus');
  assert.equal(minhas.some((r) => r.id === 'doc:777'), false, 'o da Beatriz fica de fora');
});

test('casa mesmo se o SEI mostrar so a parte antes do @', async () => {
  await hist.registrarEnvio({ ...umEnvio, origem: 'andamento', assinante: 'alan.ribeiro' });

  const minhas = await hist.listar({ identidades: EU });
  assert.equal(minhas.length, 1, 'o e-mail configurado contem o login curto');
});

test('e-mail de colega nao passa pelo filtro', async () => {
  await hist.registrarEnvio({
    ...umEnvio,
    origem: 'andamento',
    assinante: 'ana.maciel@nittrans.niteroi.rj.gov.br',
  });

  assert.equal((await hist.listar({ identidades: EU })).length, 0);
});

test('autor curto demais nao casa por substring', async () => {
  // Sem piso de tamanho, "ana" casaria com qualquer e-mail que a contivesse
  // (alan.ribeiro@... nao contem, mas o risco e real com outros nomes).
  await hist.registrarEnvio({ ...umEnvio, origem: 'andamento', assinante: 'ala' });

  assert.equal(
    (await hist.listar({ identidades: EU })).length,
    0,
    'autor com menos de 4 caracteres e ambiguo demais',
  );
});

test('sem identidade conhecida o painel nao filtra por autor', async () => {
  // Nao ha o que comparar. A protecao real esta na captura, que nesse caso
  // simplesmente nao grava nada vindo de fonte ambigua.
  await hist.registrar(daAssinatura);
  await hist.registrarEnvio(umEnvio);
  assert.equal((await hist.listar({})).length, 2);
});

/* ------------------------------------------------------------- migracoes */

test('v1 -> v2: apaga as URLs do SEI que ficaram gravadas', async () => {
  // Formato antigo: guardava o link, que carrega infra_hash (selo de sessao)
  // e que, depois de expirado, fazia o SEI recusar o acesso e deslogar.
  memoria['seix:historico-assinaturas'] = {
    versao: 1,
    registros: {
      'doc:99': {
        id: 'doc:99',
        documento: '00009400',
        assinante: 'Alan Doyle Costa Ribeiro',
        quando: '2026-07-02T19:59:00.000Z',
        url: 'https://leste.sei.rj.gov.br/sei/controlador.php?acao=documento_visualizar&id_documento=11965',
      },
    },
  };

  const [reg] = await hist.listar();
  assert.equal('url' in reg, false, 'a URL foi apagada');
  assert.equal(reg.documento, '00009400', 'o resto do registro sobreviveu');

  const guardado = memoria['seix:historico-assinaturas'];
  assert.equal(guardado.versao, 3, 'a migracao foi persistida');
  assert.equal('url' in guardado.registros['doc:99'], false, 'apagada no disco tambem');
});

test('a migracao nao roda de novo em dados ja migrados', async () => {
  await hist.registrar(daAssinatura);
  const antes = JSON.stringify(memoria['seix:historico-assinaturas']);
  await hist.listar();
  assert.equal(JSON.stringify(memoria['seix:historico-assinaturas']), antes);
});

test('v3: apaga registros sem autor, que nao podem ser atribuidos a ninguem', async () => {
  memoria['seix:historico-assinaturas'] = {
    versao: 2,
    registros: {
      // Coletado da arvore, que nao diz quem assinou. Pode ser de um colega.
      'doc:1': { id: 'doc:1', documento: '111', origem: 'arvore', quando: '2026-07-01T10:00:00.000Z' },
      // Assinatura minha, lida do corpo do documento.
      'doc:2': {
        id: 'doc:2',
        documento: '222',
        assinante: 'Alan Doyle Costa Ribeiro',
        origem: 'documento',
        quando: '2026-07-02T10:00:00.000Z',
      },
      // Ato meu, capturado na hora: fica mesmo sem nome preenchido.
      'doc:3': { id: 'doc:3', origem: 'assinatura', quando: '2026-07-03T10:00:00.000Z' },
    },
  };

  const ids = (await hist.listar()).map((r) => r.id).sort();
  assert.deepEqual(ids, ['doc:2', 'doc:3'], 'o registro anonimo da arvore saiu');
});

/* ------------------------------------------------------------- purgar */

test('purgarDeOutros apaga evento de colega e poupa o meu', async () => {
  await hist.registrar({ ...daAssinatura, origem: 'documento', assinante: 'Alan Doyle Costa Ribeiro' });
  await hist.registrar({ ...daAssinatura, id: 'doc:outro', origem: 'documento', assinante: 'Beatriz Lopes' });

  const apagados = await hist.purgarDeOutros(EU);

  assert.equal(apagados, 1);
  assert.deepEqual((await hist.listar()).map((r) => r.id), ['doc:99']);
});

test('purgarDeOutros nunca apaga o que eu mesmo fiz na tela', async () => {
  // Protecao contra erro de digitacao nas opcoes: se o nome configurado
  // estiver errado, o que a pessoa assinou/enviou nao pode evaporar.
  await hist.registrar({ ...daAssinatura, origem: 'assinatura', assinante: 'Nome Digitado Errado' });
  await hist.registrarEnvio({ ...umEnvio, origem: 'envio', assinante: 'outro.login@x.gov.br' });

  assert.equal(await hist.purgarDeOutros(EU), 0);
  assert.equal(await hist.contar(), 2);
});

test('purgarDeOutros nao faz nada sem identidade conhecida', async () => {
  await hist.registrar({ ...daAssinatura, origem: 'documento', assinante: 'Beatriz Lopes' });
  assert.equal(await hist.purgarDeOutros([]), 0, 'sem saber quem e o dono, nao apaga nada');
  assert.equal(await hist.contar(), 1);
});

/* --------------------------------------------- criacao em duas etapas */

test('a pendencia de criacao fica fora do historico', async () => {
  // Enquanto o SEI nao atribui o NUP, o ato nao e um registro: nao pode
  // aparecer na listagem nem na exportacao.
  hist.guardarPendencia(hist.PENDENCIA_PROCESSO, {
    quando: '2026-08-26T12:00:00.000Z',
    tipo: 'Administrativo: Comunicado',
    assinante: 'Alan Doyle Costa Ribeiro',
  });

  assert.equal(await hist.contar(), 0, 'pendencia nao conta como registro');
  assert.deepEqual(await hist.listar(), []);

  const pendencia = hist.lerPendencia(hist.PENDENCIA_PROCESSO);
  assert.equal(pendencia.tipo, 'Administrativo: Comunicado');
});

test('limparPendenciaDeCriacao apaga a pendencia', () => {
  hist.guardarPendencia(hist.PENDENCIA_PROCESSO, { quando: '2026-08-26T12:00:00.000Z' });
  hist.limparPendencia(hist.PENDENCIA_PROCESSO);
  assert.equal(hist.lerPendencia(hist.PENDENCIA_PROCESSO), null);
});

test('sem pendencia guardada, ler devolve null', () => {
  assert.equal(hist.lerPendencia(hist.PENDENCIA_PROCESSO), null);
});

test('a pendencia e gravada de forma SINCRONA', () => {
  // Este e o ponto do desenho: clicar em Salvar navega a pagina no mesmo
  // instante. Se a gravacao fosse assincrona, o ato se perderia no caminho -
  // foi exatamente o que acontecia com chrome.storage.
  const devolvido = hist.guardarPendencia(hist.PENDENCIA_PROCESSO, { quando: '2026-08-26T12:00:00.000Z' });

  assert.equal(devolvido, true, 'devolve o resultado, nao uma promessa');
  assert.notEqual(
    hist.lerPendencia(hist.PENDENCIA_PROCESSO),
    null,
    'ja esta legivel na linha seguinte, sem await',
  );
});

/* ------------------------------------------------ fila de atos pendentes */

test('o ato enfileirado sobrevive a navegacao e vira registro depois', async () => {
  // Simula o clique em Assinar: enfileira de forma sincrona...
  const ok = hist.enfileirarAto('registrar', { ...daAssinatura, id: 'doc:555' });
  assert.equal(ok, true);
  assert.equal(await hist.contar(), 0, 'ainda nao esta no historico');

  // ...e o carregamento da tela seguinte descarrega a fila.
  assert.equal(await hist.descarregarAtos(), 1);
  assert.deepEqual((await hist.listar()).map((r) => r.id), ['doc:555']);
});

test('a fila e esvaziada, nao repete a cada tela', async () => {
  hist.enfileirarAto('registrar', { ...daAssinatura, id: 'doc:556' });
  await hist.descarregarAtos();

  assert.equal(await hist.descarregarAtos(), 0, 'a segunda passagem nao acha nada');
  assert.equal(await hist.contar(), 1);
});

test('a fila guarda varios atos em ordem', async () => {
  hist.enfileirarAto('registrar', { ...daAssinatura, id: 'doc:1' });
  hist.enfileirarAto('proximidade', { ...umEnvio, id: 'envio:1' });

  assert.equal(await hist.descarregarAtos(), 2);
  assert.equal(await hist.contar(), 2);
});

test('envio enfileirado passa pela reconciliacao por proximidade', async () => {
  // O andamento ja tinha registrado este envio; o ato enfileirado nao pode
  // virar um segundo registro do mesmo ato.
  await hist.registrarPorProximidade({ ...umEnvio, origem: 'andamento' });
  hist.enfileirarAto('proximidade', {
    ...umEnvio,
    id: 'envio:9233:2026-07-02T19:59',
    processo: null,
    quando: '2026-07-02T19:59:03.000Z',
    origem: 'envio',
  });

  await hist.descarregarAtos();
  assert.equal(await hist.contar(), 1, 'juntou com o registro do andamento');
});

test('fila vazia nao faz nada', async () => {
  assert.equal(await hist.descarregarAtos(), 0);
});

/* --------------------------------------- completar numero do documento */

test('completa o numero de quem foi criado antes de o SEI numerar', async () => {
  // A criacao e capturada no clique em Salvar, quando o documento ainda nao
  // tem numero: so o id interno existe.
  await hist.registrar({
    id: 'documento-criado:11965',
    tipoEvento: 'documento-criado',
    idInterno: '11965',
    tipo: 'Despacho',
    documento: null,
    quando: '2026-08-26T14:44:00.000Z',
    origem: 'criacao',
    assinante: 'Alan Doyle Costa Ribeiro',
  });

  // Depois a arvore mostra os dois lado a lado.
  const completados = await hist.completarNumeros({ 11965: '00009400' });

  assert.equal(completados, 1);
  assert.equal((await hist.listar())[0].documento, '00009400');
});

test('nao sobrescreve numero que ja existe', async () => {
  await hist.registrar({ ...daArvore, id: 'doc:99', idInterno: '99', documento: '1234567' });
  assert.equal(await hist.completarNumeros({ 99: '9999999' }), 0);
  assert.equal((await hist.listar())[0].documento, '1234567');
});

test('registro sem id interno nao e tocado', async () => {
  await hist.registrar({ ...daAssinatura, id: 'num:so-numero', idInterno: null, documento: null });
  assert.equal(await hist.completarNumeros({ 11965: '00009400' }), 0);
});

test('mapa vazio nao faz leitura nem gravacao', async () => {
  assert.equal(await hist.completarNumeros({}), 0);
  assert.equal(await hist.completarNumeros(null), 0);
});

/* ------------------------------------------------- filtro por origem do ato */

test('filtra assinaturas feitas pelo bloco', async () => {
  await hist.registrar({ ...daAssinatura, id: 'a', via: 'bloco' });
  await hist.registrar({ ...daAssinatura, id: 'b', via: 'processo' });

  assert.deepEqual(
    (await hist.listar({ via: 'bloco' })).map((r) => r.id),
    ['a'],
  );
  assert.deepEqual(
    (await hist.listar({ via: 'processo' })).map((r) => r.id),
    ['b'],
  );
});

test('"todas" nao filtra nada', async () => {
  await hist.registrar({ ...daAssinatura, id: 'a', via: 'bloco' });
  await hist.registrar({ ...daAssinatura, id: 'b' });

  assert.equal((await hist.listar({ via: 'tudo' })).length, 2);
  assert.equal((await hist.listar({})).length, 2, 'sem o filtro, tambem nao');
});

test('registro sem origem some ao filtrar por uma delas', async () => {
  // E o preco de saber a origem: o que foi recolhido do corpo do documento
  // nao tem como sabe-la, porque a assinatura ja tinha acontecido quando a
  // extensao o viu. O painel marca esses como "origem desconhecida", para a
  // ausencia nao parecer defeito.
  await hist.registrar({ ...daAssinatura, id: 'antigo' });

  assert.equal((await hist.listar({ via: 'bloco' })).length, 0);
  assert.equal((await hist.listar({ via: 'processo' })).length, 0);
  assert.equal((await hist.listar({ via: 'tudo' })).length, 1);
});

/* -------------------------------------------- a fila esvazia antes de gravar */

test('descarregar duas vezes nao grava o ato duas vezes', async () => {
  // Passou a rodar em qualquer frame, e nao so no de cima: a janela de
  // assinatura e um iframe, e o topo nao recarrega depois de assinar. Como
  // dois frames podem descarregar ao mesmo tempo, a fila e esvaziada ANTES da
  // gravacao - o segundo encontra fila vazia.
  hist.enfileirarAto('registrar', { ...daAssinatura, id: 'x', via: 'processo' });

  assert.equal(await hist.descarregarAtos(), 1);
  assert.equal(await hist.descarregarAtos(), 0, 'a segunda passagem nao acha nada');

  const registros = await hist.listar({});
  assert.equal(registros.filter((r) => r.id === 'x').length, 1);
});

test('o ato enfileirado carrega a origem ate o historico', async () => {
  // O elo que estava faltando: o `via` sai da tela de assinatura, atravessa a
  // fila e chega ao registro.
  hist.enfileirarAto('registrar', { ...daAssinatura, id: 'y', via: 'bloco' });
  await hist.descarregarAtos();

  const [registro] = await hist.listar({ via: 'bloco' });
  assert.equal(registro.id, 'y');
});

test('varredura posterior nao apaga a origem ja gravada', async () => {
  // A varredura do corpo do documento nao sabe a origem e grava por cima. Se
  // ela apagasse o campo, assinar e depois abrir o documento devolveria
  // "origem desconhecida".
  await hist.registrar({ ...daAssinatura, id: 'z', via: 'bloco' });
  await hist.registrar({ id: 'z', tipoEvento: 'assinatura', documento: '00097393' });

  const [registro] = await hist.listar({ via: 'bloco' });
  assert.equal(registro.documento, '00097393', 'o numero novo entrou');
  assert.equal(registro.via, 'bloco', 'e a origem sobreviveu');
});

/* ------------------------------------------------------------- favoritos */

const DONO = 'Alan';
const quandoAgora = () => new Date().toISOString();
const zerar = () => hist.limpar({ inclusiveFavoritos: true });
const meus = (extra = {}) => hist.listar({ identidades: [DONO], ...extra });

test('favoritar marca e desmarca', async () => {
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });

  assert.equal(await hist.favoritar('a'), true);
  assert.equal((await meus({ somenteFavoritos: true })).length, 1);

  assert.equal(await hist.favoritar('a', false), false);
  assert.equal((await meus({ somenteFavoritos: true })).length, 0);
});

test('favoritar registro que não existe devolve null', async () => {
  await zerar();

  assert.equal(await hist.favoritar('nao-existe'), null);
});

test('a limpeza preserva os favoritos', async () => {
  // É a razão de a estrela existir. Sem isto, favoritar não significa nada.
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });
  await hist.registrar({ id: 'b', documento: '2', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('b');

  const { restaram } = await hist.limpar();

  assert.equal(restaram, 1);
  assert.deepEqual((await meus()).map((r) => r.id), ['b']);
});

test('a limpeza total leva os favoritos junto', async () => {
  // Tem de existir um caminho até o vazio — mas só pedindo por ele.
  await zerar();
  await hist.registrar({ id: 'b', documento: '2', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('b');

  await hist.limpar({ inclusiveFavoritos: true });

  assert.equal((await meus()).length, 0);
});

test('gravar de novo não apaga a estrela', async () => {
  // O mesmo documento é visto por várias fontes — assinatura, árvore,
  // andamento. Nenhuma delas conhece o favorito, e sem proteção a segunda
  // passagem desmarcaria em silêncio o que a pessoa marcou à mão.
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('a');

  await hist.registrar({
    id: 'a',
    documento: '1',
    tipo: 'Despacho',
    quando: quandoAgora(),
    assinante: DONO,
  });

  const [registro] = await meus();
  assert.equal(registro.favorito, true);
  assert.equal(registro.tipo, 'Despacho', 'o resto do registro continua sendo atualizado');
});

test('separarFavoritos conta o que sai e o que fica', () => {
  const { guardados, quantosSaem } = hist.separarFavoritos({
    a: { favorito: true },
    b: {},
    c: { favorito: true },
    d: {},
  });

  assert.deepEqual(Object.keys(guardados).sort(), ['a', 'c']);
  assert.equal(quantosSaem, 2);
});

test('separarFavoritos aceita vazio', () => {
  assert.deepEqual(hist.separarFavoritos({}), { guardados: {}, quantosSaem: 0 });
  assert.deepEqual(hist.separarFavoritos(null), { guardados: {}, quantosSaem: 0 });
});

test('nem um favorito:false explícito desmarca a estrela', async () => {
  // O teste acima passava mesmo sem a proteção, porque `novo` não trazia o
  // campo e o espalhamento do antigo já o preservava. O caso que a proteção
  // de fato cobre é este: o filtro do merge descarta null, undefined e '',
  // mas NÃO descarta false — então uma fonte que mandasse `favorito: false`
  // apagaria a marca. Só a pessoa desmarca, pelo `favoritar`.
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('a');

  await hist.registrar({
    id: 'a',
    documento: '1',
    quando: quandoAgora(),
    assinante: DONO,
    favorito: false,
  });

  const [registro] = await meus();
  assert.equal(registro.favorito, true);
});

/* --------------------------------------------- limpar só o que está na lista */

test('removerVarios apaga só os ids pedidos', async () => {
  // "Limpar" passou a significar "limpar o que está NESTA lista": quem está na
  // aba de processos criados espera que o botão leve os processos criados, não
  // a assinatura de ontem que nem está na tela.
  await zerar();
  for (const id of ['a', 'b', 'c']) {
    await hist.registrar({ id, documento: id, quando: quandoAgora(), assinante: DONO });
  }

  const { apagados } = await hist.removerVarios(['a', 'c']);

  assert.equal(apagados, 2);
  assert.deepEqual((await meus()).map((r) => r.id), ['b']);
});

test('removerVarios poupa os favoritos e diz quantos', async () => {
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });
  await hist.registrar({ id: 'b', documento: '2', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('b');

  const { apagados, poupados } = await hist.removerVarios(['a', 'b']);

  assert.equal(apagados, 1);
  assert.equal(poupados, 1);
  assert.deepEqual((await meus()).map((r) => r.id), ['b']);
});

test('removerVarios leva os favoritos quando se pede', async () => {
  await zerar();
  await hist.registrar({ id: 'b', documento: '2', quando: quandoAgora(), assinante: DONO });
  await hist.favoritar('b');

  const { apagados } = await hist.removerVarios(['b'], { inclusiveFavoritos: true });

  assert.equal(apagados, 1);
  assert.equal((await meus()).length, 0);
});

test('removerVarios ignora id que não existe', async () => {
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });

  const { apagados } = await hist.removerVarios(['a', 'fantasma', null]);

  assert.equal(apagados, 1);
});

test('removerVarios com lista vazia não mexe em nada', async () => {
  await zerar();
  await hist.registrar({ id: 'a', documento: '1', quando: quandoAgora(), assinante: DONO });

  assert.deepEqual(await hist.removerVarios([]), { apagados: 0, poupados: 0 });
  assert.deepEqual(await hist.removerVarios(null), { apagados: 0, poupados: 0 });
  assert.equal((await meus()).length, 1);
});

/* ------------------------------------------------- o que ainda falta assinar */

const criado = (idInterno, extra = {}) => ({
  id: `documento-criado:${idInterno}`,
  idInterno: String(idInterno),
  tipoEvento: 'documento-criado',
  documento: `0010${idInterno}`,
  quando: quandoAgora(),
  assinante: DONO,
  ...extra,
});

const assinado = (idInterno, extra = {}) => ({
  id: `doc:${idInterno}`,
  tipoEvento: 'assinatura',
  documento: `0010${idInterno}`,
  quando: quandoAgora(),
  assinante: DONO,
  ...extra,
});

test('idInternoDe lê as duas formas de chave', () => {
  // Criação e assinatura gravam ids diferentes sobre o MESMO id do documento.
  // É essa coincidência que permite juntar por chave exata.
  assert.equal(hist.idInternoDe({ id: 'documento-criado:11965' }), '11965');
  assert.equal(hist.idInternoDe({ id: 'doc:11965' }), '11965');
  assert.equal(hist.idInternoDe({ id: 'doc:11965', idInterno: '11965' }), '11965');
  assert.equal(hist.idInternoDe({ id: 'outra-coisa:9' }), null);
  assert.equal(hist.idInternoDe(null), null);
});

test('documento criado e não assinado fica pendente', async () => {
  await zerar();
  await hist.registrar(criado(1));

  const pendentes = hist.pendentesDeAssinatura(await meus());
  assert.deepEqual(pendentes.map((r) => r.idInterno), ['1']);
});

test('documento com assinatura conhecida sai da lista', async () => {
  await zerar();
  await hist.registrar(criado(1));
  await hist.registrar(assinado(1));

  assert.deepEqual(hist.pendentesDeAssinatura(await meus()), []);
});

test('a assinatura de OUTRO documento não resolve este', async () => {
  // Junção por chave exata, e não por proximidade: o erro fácil aqui seria
  // dar por assinado o documento errado.
  await zerar();
  await hist.registrar(criado(1));
  await hist.registrar(assinado(2));

  assert.deepEqual(
    hist.pendentesDeAssinatura(await meus()).map((r) => r.idInterno),
    ['1'],
  );
});

test('envio e criação de processo não entram na conta', async () => {
  // Com idInterno de propósito: sem ele, estes registros seriam descartados
  // por não ter chave, e o teste passaria mesmo sem o filtro de tipoEvento —
  // que é justamente o que ele existe para cobrar. Sabotei tirando o filtro e
  // o teste antigo não caiu.
  await zerar();
  await hist.registrar({
    id: 'env:1',
    idInterno: '77',
    tipoEvento: 'envio',
    quando: quandoAgora(),
    assinante: DONO,
  });
  await hist.registrar({
    id: 'proc:1',
    idInterno: '88',
    tipoEvento: 'processo-criado',
    quando: quandoAgora(),
    assinante: DONO,
  });

  assert.deepEqual(hist.pendentesDeAssinatura(await meus()), []);
});

test('a varredura da árvore é quem resolve o pendente alheio', () => {
  // Fiação, não função: os testes acima chamam marcarAssinadosVistos à mão.
  // Sabotei tirando a chamada da varredura e nenhum deles caiu.
  const fonte = fs.readFileSync('src/content/features/historico/captura.js', 'utf8');

  assert.match(
    fonte,
    /await marcarAssinadosVistos\(assinadosNaArvore\);/,
    'a árvore precisa marcar como vistos os documentos assinados',
  );
  assert.match(
    fonte,
    /const assinadosNaArvore = links[\s\S]{0,200}?id_documento/,
    'e os ids têm de sair dos links de assinatura da árvore',
  );
});

test('a árvore resolve o que foi assinado por outra pessoa', async () => {
  // O histórico é estritamente pessoal: a assinatura do chefe no que você
  // criou nunca vira registro. Sem esta correção, o documento ficaria
  // pendente para sempre.
  await zerar();
  await hist.registrar(criado(1));
  assert.equal(hist.pendentesDeAssinatura(await meus()).length, 1);

  const marcados = await hist.marcarAssinadosVistos(['1']);

  assert.equal(marcados, 1);
  assert.deepEqual(hist.pendentesDeAssinatura(await meus()), []);
});

test('marcar duas vezes não conta duas vezes', async () => {
  await zerar();
  await hist.registrar(criado(1));

  assert.equal(await hist.marcarAssinadosVistos(['1']), 1);
  assert.equal(await hist.marcarAssinadosVistos(['1']), 0, 'já estava marcado');
  assert.equal(await hist.marcarAssinadosVistos([]), 0);
  assert.equal(await hist.marcarAssinadosVistos(null), 0);
});

test('marcar um id que não é meu não inventa registro', async () => {
  await zerar();

  assert.equal(await hist.marcarAssinadosVistos(['9999']), 0);
  assert.equal((await meus()).length, 0);
});

test('os pendentes vêm do mais antigo para o mais novo', async () => {
  // O esquecido há mais tempo é o que interessa.
  await zerar();
  await hist.registrar(criado(1, { quando: '2026-08-01T10:00:00.000Z' }));
  await hist.registrar(criado(2, { quando: '2026-08-20T10:00:00.000Z' }));
  await hist.registrar(criado(3, { quando: '2026-08-10T10:00:00.000Z' }));

  assert.deepEqual(
    hist.pendentesDeAssinatura(await meus()).map((r) => r.idInterno),
    ['1', '3', '2'],
  );
});

test('lista vazia não quebra', () => {
  assert.deepEqual(hist.pendentesDeAssinatura([]), []);
  assert.deepEqual(hist.pendentesDeAssinatura(null), []);
});

test('marcar por número resolve o pendente', async () => {
  // A tela do bloco não expõe o id interno em lugar nenhum — o link do
  // documento é href="#" com onclick. Só o número visível.
  await zerar();
  await hist.registrar(criado(1));

  assert.equal(await hist.marcarAssinadosPorNumero(['00101']), 1);
  assert.deepEqual(hist.pendentesDeAssinatura(await meus()), []);
});

test('marcar por número só atinge criação de documento', async () => {
  // Quem garante isso é o PREFIXO: marcarAssinadosVistos só encontra chave
  // . Um registro de assinatura com o mesmo número não
  // tem onde ser marcado.
  await zerar();
  await hist.registrar(assinado(1));

  assert.equal(await hist.marcarAssinadosPorNumero(['00101']), 0);
  assert.equal((await meus())[0].assinadoVisto, undefined);
});

test('número que não está no histórico não marca nada', async () => {
  await zerar();
  await hist.registrar(criado(1));

  assert.equal(await hist.marcarAssinadosPorNumero(['99999']), 0);
  assert.equal(await hist.marcarAssinadosPorNumero([]), 0);
  assert.equal(await hist.marcarAssinadosPorNumero(null), 0);
  assert.equal(hist.pendentesDeAssinatura(await meus()).length, 1);
});

test('a varredura do bloco entra no varrer()', () => {
  // Fiação: os testes acima chamam a marcação à mão. Sabotei tirando a
  // chamada de varrer() e nenhum deles caiu.
  const fonte = fs.readFileSync('src/content/features/historico/captura.js', 'utf8');

  assert.match(fonte, /const doBloco = await varrerBlocoDeAssinatura\(\);/);
  assert.match(fonte, /doCorpo \+ daArvore \+ doAndamento \+ doBloco/);
});

test('a varredura do andamento resolve os pendentes', () => {
  // Fiação. É a terceira fonte automática, e a única que enxerga assinatura
  // de terceiro sem depender da árvore da sua unidade.
  const fonte = fs.readFileSync('src/content/features/historico/captura.js', 'utf8');
  const trecho = fonte.slice(fonte.indexOf('export async function varrerAndamento'));

  assert.match(
    trecho.slice(0, 1200),
    /marcarAssinadosPorNumero\([\s\S]{0,200}?documentoAssinado/,
    'o andamento deveria marcar como vistos os documentos assinados',
  );
});

test('não há mais marcação manual de assinatura', () => {
  // Ela existia só porque o caminho automático não estava pronto. Com três
  // fontes automáticas — árvore, bloco e andamento —, um botão de "marcar
  // como assinado" seria uma forma de mentir para si mesmo numa lista cujo
  // valor inteiro é ser verdadeira.
  const painel = fs.readFileSync('src/content/features/historico/painel.js', 'utf8');

  assert.equal(/aoResolver|seix-hist__resolvido/.test(painel), false);
});
