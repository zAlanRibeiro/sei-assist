/**
 * Testes da troca de unidade.
 *
 * Duas coisas aqui já tinham cobrado caro neste projeto e por isso têm teste
 * próprio: a barra do SEI traz DUAS cópias de cada elemento com o mesmo id, e
 * o `data-label` das tabelas não existe no HTML que vem do servidor.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

globalThis.chrome = { runtime: { id: 'teste' } };

const { lerUnidades, acharUnidadeNaBarra } = await import(
  '../src/content/features/unidade/seletores.js'
);
const { elemento, instalarDocumento } = await import('./domFalso.mjs');

/* ------------------------------------------------------- a barra do topo */

/**
 * A barra real do SEI 5.0.4: o mesmo `id` duas vezes, uma para tela estreita
 * (`d-md-none`) e outra para tela larga (`d-none d-md-flex`).
 */
function barraReal({ visivelEhASegunda = true } = {}) {
  const link = (texto) =>
    elemento('a', {
      id: 'lnkInfraUnidade',
      class: 'form-control infraAcaoBarraConjugada',
      title: 'Divisão de Estatísticas',
      href: '#',
    }, [texto]);

  const movel = link('NIT/NITTRANS/DIVEST');
  const padrao = link('NIT/NITTRANS/DIVEST');

  // O domFalso não tem layout; simulamos a visibilidade como o navegador a
  // reporta: getClientRects() vazio para quem está escondido.
  movel.getClientRects = () => (visivelEhASegunda ? [] : [{}]);
  padrao.getClientRects = () => (visivelEhASegunda ? [{}] : []);

  const raiz = elemento('div', { id: 'divInfraBarraSistema' }, [
    elemento('div', { id: 'divInfraBarraSistemaMovel', class: 'd-md-none' }, [movel]),
    elemento('div', { id: 'divInfraBarraSistemaPadraoD', class: 'd-none d-md-flex' }, [padrao]),
  ]);

  return { raiz, movel, padrao };
}

test('a barra tem duas cópias do mesmo id e pegamos a visível', () => {
  // getElementById devolveria a PRIMEIRA, que em tela larga é a escondida.
  // Foi esse erro que fez a marca "Assist" não aparecer.
  const { raiz, padrao } = barraReal();
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), padrao, 'a de tela larga é a visível aqui');
});

test('em tela estreita, a visível é a outra', () => {
  const { raiz, movel } = barraReal({ visivelEhASegunda: false });
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), movel);
});

test('barra sem unidade nenhuma não quebra', () => {
  const raiz = elemento('div', {}, [elemento('span', {}, ['nada aqui'])]);
  instalarDocumento(raiz);

  assert.equal(acharUnidadeNaBarra(raiz), null);
});

/* ------------------------------------------------- a tela de troca */

/**
 * A tabela real de "Trocar Unidade".
 *
 * @param {boolean} comDataLabel  o HTML do servidor NÃO tem esses atributos;
 *   quem os põe é o JavaScript do SEI, depois. Por isso os dois casos.
 */
function telaDeTroca(unidades, { comDataLabel = true } = {}) {
  const th = (t) => elemento('th', { class: 'infraTh' }, [t]);

  const linha = (u, i) => {
    const radio = elemento('input', {
      id: `chkInfraItem${i}`,
      name: 'chkInfraItem',
      class: 'infraRadioInput',
      type: 'radio',
      title: u.sigla,
      ...(u.atual ? { checked: 'checked' } : {}),
    });

    const td = (rotulo, texto) =>
      elemento('td', comDataLabel ? { 'data-label': rotulo } : {}, [texto]);

    return elemento('tr', { class: 'infraTrClara' }, [
      elemento('td', comDataLabel ? { 'data-label': ' ' } : {}, [
        elemento('div', { class: 'infraRadioDiv' }, [
          radio,
          elemento('label', { class: 'infraRadioLabel', for: `chkInfraItem${i}` }, []),
        ]),
      ]),
      td('Sigla', u.sigla),
      td('Descrição', u.descricao),
      td('Órgão', u.orgao),
    ]);
  };

  return elemento('body', {}, [
    elemento('form', { id: 'frmInfraSelecaoUnidade' }, [
      elemento('table', { class: 'infraTableResponsiva infraTable' }, [
        elemento('tr', {}, [th(''), th('Sigla'), th('Descrição'), th('Órgão')]),
        ...unidades.map(linha),
      ]),
    ]),
  ]);
}

const TRES = [
  { sigla: 'NIT/NITTRANS/DIVEST', descricao: 'Divisão de Estatísticas', orgao: 'NITEROI', atual: true },
  { sigla: 'NIT/NITTRANS/DEPGM', descricao: 'Departamento Geral', orgao: 'NITEROI' },
  { sigla: 'NIT/NITTRANS/CHEFGAB', descricao: 'Chefia de Gabinete', orgao: 'NITEROI' },
];

test('lê as unidades da tela de troca', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));
  const lidas = lerUnidades(doc);

  assert.equal(lidas.length, 3);
  assert.deepEqual(lidas.map((u) => u.sigla), TRES.map((u) => u.sigla));
  assert.equal(lidas[0].descricao, 'Divisão de Estatísticas');
  assert.equal(lidas[0].idDoCampo, 'chkInfraItem0');
});

test('a unidade atual é a que está marcada', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));
  const lidas = lerUnidades(doc);

  assert.deepEqual(lidas.map((u) => u.atual), [true, false, false]);
});

test('sem data-label, lê pelo cabeçalho', () => {
  // O HTML que vem do servidor não tem data-label: quem põe é o JavaScript do
  // SEI. A lista de blocos com dois registros já foi lida como zero por causa
  // disso, em silêncio.
  const doc = instalarDocumento(telaDeTroca(TRES, { comDataLabel: false }));
  const lidas = lerUnidades(doc);

  assert.equal(lidas.length, 3);
  assert.equal(lidas[1].sigla, 'NIT/NITTRANS/DEPGM');
  assert.equal(lidas[1].descricao, 'Departamento Geral');
});

test('a linha de cabeçalho não vira unidade', () => {
  const doc = instalarDocumento(telaDeTroca(TRES));

  assert.equal(
    lerUnidades(doc).some((u) => u.sigla === 'Sigla'),
    false,
  );
});

test('tela sem tabela devolve lista vazia, não erro', () => {
  const doc = instalarDocumento(elemento('body', {}, [elemento('p', {}, ['Nada'])]));

  assert.deepEqual(lerUnidades(doc), []);
});

test('o title do rádio salva quando a coluna Sigla não é encontrada', () => {
  // Rede para instalação com a tabela em outra forma: o rádio traz a sigla.
  const raiz = elemento('body', {}, [
    elemento('form', { id: 'frmInfraSelecaoUnidade' }, [
      elemento('table', { class: 'infraTable' }, [
        elemento('tr', {}, [elemento('th', {}, ['']), elemento('th', {}, ['Outra coisa'])]),
        elemento('tr', {}, [
          elemento('td', {}, [
            elemento('input', {
              id: 'chkInfraItem0',
              name: 'chkInfraItem',
              type: 'radio',
              title: 'NIT/NITTRANS/DEPGM',
            }),
          ]),
          elemento('td', {}, ['irrelevante']),
        ]),
      ]),
    ]),
  ]);

  assert.equal(lerUnidades(instalarDocumento(raiz))[0].sigla, 'NIT/NITTRANS/DEPGM');
});

/* --------------------------------------------- a regra escrita com sangue */

import fs from 'node:fs';

/**
 * Só o CÓDIGO, sem comentários.
 *
 * A regra proíbe montar URL, não falar sobre montar URL — e o cabeçalho do
 * arquivo precisa justamente explicar por que isso derruba a sessão.
 */
function semComentarios(caminho) {
  return fs
    .readFileSync(caminho, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

const FONTE = semComentarios('src/content/features/unidade/index.js');
const FONTE_SELETORES = semComentarios('src/content/features/unidade/seletores.js');

test('esta feature nunca monta URL do SEI', () => {
  // A primeira versão montava a URL da tela de troca copiando os parâmetros
  // infra_* da página atual. O infra_hash é calculado POR AÇÃO — é token
  // contra falsificação de requisição. Copiado de uma ação para outra, dá
  // "hash inválido" na navegação e DERRUBA A SESSÃO numa busca em segundo
  // plano. Foi o que aconteceu com o usuário.
  //
  // A URL certa quem sabe é o link do próprio SEI. Aciona-se o link.
  for (const proibido of ['infra_hash', 'infra_sistema', 'controlador.php', 'new URL(']) {
    for (const [nome, fonte] of [
      ['index.js', FONTE],
      ['seletores.js', FONTE_SELETORES],
    ]) {
      assert.equal(
        fonte.includes(proibido),
        false,
        `${nome} monta URL do SEI ("${proibido}") — foi isso que derrubou a sessão`,
      );
    }
  }
});

test('esta feature não faz requisição nenhuma', () => {
  // A lista vem da tela que a pessoa abriu, não de uma consulta. Buscar em
  // segundo plano foi exatamente o caminho que matou a sessão.
  for (const proibido of ['rede.js', 'fetch(', 'buscarHtml', 'XMLHttpRequest']) {
    assert.equal(FONTE.includes(proibido), false, `index.js consulta o SEI ("${proibido}")`);
  }
});

test('a navegação sai do link do SEI, não de location.href', () => {
  assert.equal(
    /location\.href\s*=/.test(FONTE),
    false,
    'navegar por conta própria exige montar URL — e URL montada derruba a sessão',
  );
  assert.ok(FONTE.includes('ancora.click()'), 'a navegação tem de acionar o link do SEI');
});

/* ------------------------------------------------------- o aviso da captura */

const { mensagemDaCaptura, listaMudou } = await import(
  '../src/content/features/unidade/index.js'
);

test('com uma unidade, o aviso explica por que a lista não abre', () => {
  // É o caso de quem só tem uma. Silêncio aqui parece defeito, quando na
  // verdade é o comportamento certo.
  const recado = mensagemDaCaptura(1);

  assert.match(recado, /1 unidade/);
  assert.match(recado, /a partir de 2/);
});

test('com várias, o aviso diz que a lista está pronta', () => {
  assert.match(mensagemDaCaptura(3), /3 unidades/);
  assert.match(mensagemDaCaptura(3), /pela barra/);
});

test('sem unidade nenhuma não há o que dizer', () => {
  assert.equal(mensagemDaCaptura(0), null);
  assert.equal(mensagemDaCaptura(null), null);
});

test('listaMudou distingue duas listas', () => {
  const a = [{ sigla: 'X' }, { sigla: 'Y' }];

  assert.equal(listaMudou(a, [{ sigla: 'X' }, { sigla: 'Y' }]), false);
  assert.equal(listaMudou(a, [{ sigla: 'X' }, { sigla: 'Z' }]), true, 'unidade trocada');
  assert.equal(listaMudou(a, [{ sigla: 'X' }]), true, 'unidade removida');
  assert.equal(listaMudou(null, a), true, 'primeira captura');
});

test('o aviso é guardado por listaMudou, e não disparado sempre', () => {
  // O teste acima cobre a COMPARAÇÃO; este cobre a FIAÇÃO. Sabotei tirando o
  // guarda da chamada e nenhum teste caiu — sinal de que a comparação estava
  // testada e o uso dela não. Quem passa por esta tela toda hora não precisa
  // do mesmo recado toda hora.
  assert.match(
    FONTE,
    /listaMudou\([^)]*\)\)\s*return;/,
    'a captura deveria sair cedo quando a lista não mudou',
  );
});

/* ---------------------------------------------------- o conteúdo do painel */

const { itensDoPainel, notaDoPainel } = await import(
  '../src/content/features/unidade/index.js'
);

test('a lista marca a unidade atual e libera as outras', () => {
  const itens = itensDoPainel(TRES, 'NIT/NITTRANS/DIVEST');

  assert.deepEqual(itens.map((i) => i.atual), [true, false, false]);
  assert.deepEqual(itens.map((i) => i.acionavel), [false, true, true]);
  assert.equal(itens[1].descricao, 'Departamento Geral');
});

test('a unidade atual vem da BARRA, não da lista guardada', () => {
  // Sutileza que já estaria errada sem este teste: TRES traz DIVEST marcada
  // como atual, porque era ela quando a lista foi guardada. Depois de trocar
  // para DEPGM, quem está certo é a barra — e desabilitar a linha da DIVEST
  // impediria a pessoa de voltar para ela.
  const itens = itensDoPainel(TRES, 'NIT/NITTRANS/DEPGM');

  assert.equal(itens[0].acionavel, true, 'dá para voltar para a DIVEST');
  assert.equal(itens[1].atual, true, 'a DEPGM é a atual agora');
});

test('com uma unidade só, a nota explica', () => {
  const itens = itensDoPainel([TRES[0]], 'NIT/NITTRANS/DIVEST');

  assert.equal(notaDoPainel(itens), 'Você só tem acesso a esta unidade.');
});

test('com várias, e todas acionáveis, não há nota', () => {
  assert.equal(notaDoPainel(itensDoPainel(TRES, 'NIT/NITTRANS/DIVEST')), null);
});

test('lista vazia não vira nota', () => {
  assert.equal(notaDoPainel([]), null);
  assert.equal(notaDoPainel(null), null);
});

test('a barra desconhecida não desabilita ninguém', () => {
  // Se a sigla da barra não bater com nenhuma da lista (órgão que formata
  // diferente), o certo é deixar todas clicáveis em vez de travar tudo.
  const itens = itensDoPainel(TRES, 'OUTRA/COISA');

  assert.equal(itens.every((i) => i.acionavel), true);
});

/* ------------------------------------------------------------- a opção */

const feature = (await import('../src/content/features/unidade/index.js')).default;

test('a lista com uma unidade vem ligada, e continua opcional', () => {
  // Nasceu desligada por medo de trocar um clique útil (ir para a tela do
  // SEI) por um painel que não oferece nada. O medo deixou de valer quando a
  // tela do SEI passou a estar DENTRO do painel — ver o teste seguinte.
  assert.equal(feature.opcoesPadrao.mostrarComUmaUnidade, true);
  assert.ok(feature.rotulosOpcoes.mostrarComUmaUnidade, 'quem não quiser precisa poder desligar');
});

test('o painel nunca é beco sem saída: a tela do SEI está dentro dele', () => {
  // É esta saída que torna seguro abrir a lista com uma unidade só. Sem ela,
  // quem clicasse querendo a tela do SEI ficaria preso num painel que não
  // oferece nada.
  // No TEXTO do botão, e não em qualquer lugar: a primeira versão desta
  // asserção casava com o `title` do atalho da barra, então apagar o botão do
  // painel não derrubava nada.
  assert.match(
    FONTE,
    /text: 'Abrir a tela de troca/,
    'o painel precisa de um botão que leve à tela do SEI',
  );
  assert.match(
    FONTE,
    /onclick:\s*aoAbrirTela/,
    'e esse botão tem de acionar a ida para a tela',
  );
});

test('sem lista guardada, o clique não fica mudo', () => {
  // A primeira vez cai aqui: ainda não visitamos a tela de troca. Sair calado
  // faria parecer que a extensão simplesmente não fez nada.
  assert.match(
    FONTE,
    /if \(!guardadas\) \{[\s\S]{0,300}?toast\(/,
    'o caminho sem lista deveria explicar o que vai acontecer',
  );
});

test('o mínimo para abrir a lista sai da opção', () => {
  // Sabotei fixando o mínimo em 2 e nenhum teste caiu: a opção estava
  // declarada e não usada. Este é o teste da fiação.
  assert.match(
    FONTE,
    /minimo\s*=\s*ctx\.opcoes\.mostrarComUmaUnidade/,
    'o limite deveria depender da opção, não ser fixo',
  );
});

/* ------------------------------------------------------- onde o painel cai */

const { posicionarPainel } = await import('../src/content/features/unidade/index.js');

/** A caixa da unidade na barra: encostada à direita, como no SEI. */
const naBarra = { left: 1500, right: 1700, width: 200, bottom: 40 };
const TELA = { largura: 1920, scrollX: 0, scrollY: 0 };

test('o painel fica centrado sob a unidade', () => {
  // Antes ele era alinhado pela direita usando a largura MÍNIMA como se fosse
  // a real — e a real cresce com o nome mais comprido da lista. Saía torto
  // para a esquerda, que foi o que apareceu na tela.
  const { left } = posicionarPainel(naBarra, 300, TELA);

  const centroDaAncora = naBarra.left + naBarra.width / 2;
  assert.equal(left + 300 / 2, centroDaAncora, 'os dois centros têm de coincidir');
});

test('não passa da borda direita da janela', () => {
  const encostada = { left: 1800, right: 1900, width: 100, bottom: 40 };
  const { left } = posicionarPainel(encostada, 300, TELA);

  assert.ok(left + 300 <= TELA.largura, 'o painel inteiro cabe na tela');
  assert.equal(left, 1920 - 300 - 8);
});

test('não passa da borda esquerda', () => {
  const canto = { left: 0, right: 40, width: 40, bottom: 40 };
  const { left } = posicionarPainel(canto, 300, TELA);

  assert.equal(left, 8, 'encosta na margem, não em valor negativo');
});

test('painel mais largo que a janela encosta na margem', () => {
  // O teto ficaria abaixo do piso; sem o Math.max de fora, a borda esquerda
  // iria para a área invisível.
  const { left } = posicionarPainel(naBarra, 3000, { largura: 400, scrollX: 0, scrollY: 0 });

  assert.equal(left, 8);
});

test('a rolagem entra na conta', () => {
  const { left, top } = posicionarPainel(naBarra, 300, {
    largura: 1920,
    scrollX: 30,
    scrollY: 500,
  });

  // centro 1600, menos meia largura 150, dá 1450; mais a rolagem.
  assert.equal(left, 1450 + 30);
  assert.equal(top, 40 + 500 + 4);
});

test('o painel cai logo abaixo da unidade', () => {
  assert.equal(posicionarPainel(naBarra, 300, TELA).top, 44);
});

test('o painel é pendurado ANTES de ser medido', () => {
  // offsetWidth de um elemento fora do documento é zero, e um painel de
  // largura zero seria centrado no lugar errado. A ordem é a regra aqui, e
  // sabotá-la não derrubava teste nenhum antes desta linha.
  const ondePendura = FONTE.indexOf('document.body.appendChild(painel)');
  const ondeMede = FONTE.indexOf('painel.offsetWidth');

  assert.notEqual(ondePendura, -1, 'o painel precisa entrar no documento');
  assert.notEqual(ondeMede, -1, 'a largura real precisa ser medida');
  assert.ok(ondePendura < ondeMede, 'medir antes de pendurar daria largura zero');
});
