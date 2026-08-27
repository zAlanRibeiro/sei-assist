/**
 * Testes de privacidade.
 *
 * Requisito do projeto: o histórico é do dono e de mais ninguém. Ele existe
 * para a pessoa consultar o que ela mesma assinou e enviou — não é telemetria,
 * não é relatório para chefia, não sai da máquina.
 *
 * Este arquivo transforma esse requisito em teste. Se alguém (inclusive um
 * assistente) abrir uma saída de rede nova ou pedir permissão demais, a
 * suíte quebra.
 *
 * A regra de rede mudou uma vez, e vale registrar por quê. Até a versão
 * anterior era "nenhuma chamada, nunca". O alerta de bloco de assinatura
 * exigiu perguntar ao SEI para avisar sem o usuário abrir a tela, então a
 * regra foi estreitada em vez de removida: uma porta só (core/rede.js),
 * só GET, só a mesma origem, sem corpo. Em alguns aspectos isso é mais
 * forte que antes — agora o método e a origem também são cobrados.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function arquivos(dir, ext, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, ext, saida);
    else if (p.endsWith(ext)) saida.push(p);
  }
  return saida;
}

const fontes = arquivos(path.join(raiz, 'src'), '.js').map((p) => ({
  caminho: path.relative(raiz, p).split(path.sep).join('/'),
  texto: fs.readFileSync(p, 'utf8'),
}));

const manifest = JSON.parse(fs.readFileSync(path.join(raiz, 'manifest.json'), 'utf8'));

/**
 * Remove comentarios antes de procurar por chamadas proibidas.
 *
 * Sem isto, um comentario explicando que NAO chamamos preventDefault derruba
 * o proprio teste. Feito com indexOf em vez de regex de proposito: evita
 * escapes e nunca toca em regex ou string no meio do codigo.
 */
function removerBlocos(texto) {
  const ABRE = '/' + '*';
  const FECHA = '*' + '/';
  let saida = '';
  let i = 0;

  while (i < texto.length) {
    const inicio = texto.indexOf(ABRE, i);
    if (inicio === -1) {
      saida += texto.slice(i);
      break;
    }
    saida += texto.slice(i, inicio);

    const fim = texto.indexOf(FECHA, inicio + 2);
    if (fim === -1) break; // bloco sem fechamento: descarta o resto
    i = fim + 2;
  }
  return saida;
}

function semComentarios(texto) {
  const NL = String.fromCharCode(10);
  return removerBlocos(texto)
    .split(NL)
    .filter((linha) => !linha.trim().startsWith('//'))
    .join(NL);
}

/**
 * APIs de rede que continuam proibidas em TODO arquivo, sem exceção.
 *
 * Nenhuma delas serve para o que a extensão precisa (ler uma página do
 * próprio SEI), e todas serviriam para mandar dados embora.
 */
const SAIDAS_DE_REDE = [
  [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
  [/\bsendBeacon\s*\(/, 'navigator.sendBeacon()'],
  [/\bnew\s+WebSocket\b/, 'WebSocket'],
  [/\bnew\s+EventSource\b/, 'EventSource'],
  [/\bimportScripts\s*\(/, 'importScripts()'],
];

/**
 * A única porta de rede permitida.
 *
 * Até a versão anterior a extensão não falava com servidor nenhum. O alerta
 * de bloco de assinatura exigiu perguntar ao SEI, então a regra foi
 * ESTREITADA em vez de removida: existe um arquivo, e só um, que pode
 * chamar fetch — e os testes abaixo cobram o que ele tem direito de fazer.
 */
const PORTA_DE_REDE = 'src/content/core/rede.js';

test('as saídas de rede que mandam dados embora continuam proibidas', () => {
  const achados = [];
  for (const { caminho, texto } of fontes) {
    const codigo = semComentarios(texto);
    for (const [padrao, nome] of SAIDAS_DE_REDE) {
      if (padrao.test(codigo)) achados.push(`${caminho}: ${nome}`);
    }
  }
  assert.deepEqual(achados, [], 'nenhuma delas é necessária para ler uma página');
});

test('só um arquivo no projeto inteiro pode chamar fetch', () => {
  // Espalhar fetch pelo código dissolveria a garantia: cada chamada nova
  // teria que ser auditada uma a uma. Com uma porta só, basta auditar ela.
  const chamam = fontes
    .filter(({ texto }) => /\bfetch\s*\(/.test(semComentarios(texto)))
    .map(({ caminho }) => caminho);

  assert.deepEqual(chamam, [PORTA_DE_REDE], `fetch fora da porta: ${chamam.join(
)}`);
});

test('a porta de rede só faz GET', () => {
  // POST, PUT, PATCH e DELETE são o que alteraria processo no SEI. A
  // restrição original do projeto — nada que assine, envie ou conclua sem
  // confirmação — passa por aqui.
  const porta = fontes.find((f) => f.caminho === PORTA_DE_REDE);
  assert.ok(porta, 'a porta de rede não existe mais; este teste precisa ser revisto');

  const codigo = semComentarios(porta.texto);
  for (const verbo of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    assert.equal(
      new RegExp(`['"\`]${verbo}['"\`]`).test(codigo),
      false,
      `a porta de rede não pode usar ${verbo}`,
    );
  }
  assert.ok(/method:\s*'GET'/.test(codigo), 'o método precisa estar explícito');
});

test('a porta de rede recusa outra origem antes de sair da máquina', () => {
  const porta = fontes.find((f) => f.caminho === PORTA_DE_REDE);
  const codigo = semComentarios(porta.texto);

  assert.ok(/mesmaOrigem\s*\(/.test(codigo), 'precisa checar a origem');
  assert.ok(
    /if\s*\(!mesmaOrigem[^)]*\)[\s\S]{0,120}throw/.test(codigo),
    'a checagem precisa BARRAR, não só avisar',
  );
});

test('a porta de rede não manda corpo nenhum', () => {
  // Sem corpo não há o que vazar: o tráfego é a mesma leitura que a pessoa
  // faria abrindo a tela.
  const porta = fontes.find((f) => f.caminho === PORTA_DE_REDE);
  assert.equal(/\bbody\s*:/.test(semComentarios(porta.texto)), false);
});

test('o manifest não pede acesso a hosts', () => {
  assert.equal(
    manifest.host_permissions,
    undefined,
    'host_permissions permitiria requisições a domínios — não é preciso para ler a página',
  );
});

test('as permissões continuam mínimas', () => {
  const permitidas = new Set(['storage', 'activeTab']);
  for (const p of manifest.permissions || []) {
    assert.ok(permitidas.has(p), `permissão inesperada no manifest: "${p}"`);
  }
});

test('o histórico fica em storage.local, que não sincroniza', () => {
  const arquivo = fontes.find((f) => f.caminho.endsWith('historico/armazenamento.js'));
  assert.ok(arquivo, 'armazenamento do histórico não encontrado');
  assert.ok(arquivo.texto.includes('chrome.storage.local'), 'deve usar storage.local');
  assert.equal(
    /chrome\.storage\.sync/.test(semComentarios(arquivo.texto)),
    false,
    'storage.sync sairia da máquina, rumo à conta do navegador',
  );
});

test('o campo de senha nunca é lido', () => {
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  assert.ok(captura, 'captura.js não encontrado');
  const codigo = semComentarios(captura.texto);

  // O seletor da senha existe só para documentar o que é ignorado;
  // ler o value dele seria o erro grave.
  assert.equal(/ASSINATURA\.senha/.test(codigo), false, 'nem referenciar o seletor de senha');
  assert.equal(/type=["']password/.test(codigo), false, 'nenhuma leitura de campo de senha');
});

test('a captura é passiva: não clica, não submete, não bloqueia o SEI', () => {
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const codigo = semComentarios(captura.texto);

  for (const [padrao, nome] of [
    [/\.click\s*\(/, 'click()'],
    [/\.submit\s*\(/, 'submit()'],
    [/preventDefault/, 'preventDefault()'],
  ]) {
    assert.equal(padrao.test(codigo), false, `captura.js não pode chamar ${nome} — só observa`);
  }
});

test('o inspetor não vaza conteúdo de processo', () => {
  const esqueleto = fontes.find((f) => f.caminho.endsWith('inspetor/esqueleto.js'));
  assert.ok(esqueleto, 'esqueleto.js não encontrado');
  assert.ok(esqueleto.texto.includes('redigir'), 'deve redigir o conteúdo antes de copiar');
  assert.ok(esqueleto.texto.includes('[email]'), 'e-mails viram marcador');
  assert.ok(esqueleto.texto.includes('[numero]'), 'números longos viram marcador');
});

test('nenhuma URL do SEI e guardada nem transformada em link', () => {
  // Link do SEI carrega infra_hash: selo de sessao. Guardar era errado duas
  // vezes — deixava material de sessao no disco e, depois de expirado, fazia
  // o SEI recusar o acesso e deslogar quem clicasse no painel.
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const painel = fontes.find((f) => f.caminho.endsWith('historico/painel.js'));

  assert.equal(
    /\burl:\s/.test(semComentarios(captura.texto)),
    false,
    'captura.js nao deve gravar campo url',
  );
  assert.equal(
    /location\.href\.split/.test(semComentarios(captura.texto)),
    false,
    'cortar a URL em &infra_ era justamente o que produzia o "link nao assinado"',
  );
  assert.equal(
    /registro\.url/.test(semComentarios(painel.texto)),
    false,
    'o painel nao deve renderizar link para o SEI',
  );
});

test('a migracao que apaga URLs antigas continua no lugar', () => {
  const armazenamento = fontes.find((f) => f.caminho.endsWith('historico/armazenamento.js'));
  assert.ok(
    armazenamento.texto.includes("delete registro.url"),
    'a migracao v1->v2 limpa os links gravados antes da correcao',
  );
});

test('o historico e estritamente pessoal: sem controle para ver os outros', () => {
  const painel = fontes.find((f) => f.caminho.endsWith('historico/painel.js'));
  const codigo = semComentarios(painel.texto);

  assert.equal(
    /somenteMinhas/.test(codigo),
    false,
    'nao deve existir opcao de alternar entre "meus" e "todos"',
  );
  assert.ok(
    codigo.includes('identidades'),
    'a listagem sempre passa as identidades do dono',
  );
});

test('as fontes ambiguas so gravam evento do dono', () => {
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const codigo = semComentarios(captura.texto);

  // Corpo do documento e andamento mostram atos de qualquer pessoa da unidade.
  // Sem o teste de identidade, a extensao acumularia dado de colega.
  assert.ok(codigo.includes('ehMinha'), 'captura.js deve checar identidade antes de gravar');

  const varrerArvore = codigo.slice(codigo.indexOf('export async function varrerArvore'));
  assert.ok(
    varrerArvore.includes('await obter(id)'),
    'a arvore nao diz quem assinou, entao so pode confirmar registro existente',
  );
});

test('nenhuma lista de formulário usa o curinga "form"', () => {
  // Toda tela do SEI carrega <form id="frmProtocoloPesquisaRapida"> no
  // cabeçalho. O curinga faria a extensão escutar a busca rápida em vez do
  // formulário da tela — e armar captura em telas que não são a esperada.
  const seletores = fontes.find((f) => f.caminho.endsWith('historico/seletores.js'));
  const codigo = semComentarios(seletores.texto);

  assert.equal(
    /^\s*'form',\s*$/m.test(codigo),
    false,
    'o curinga "form" casa com a busca rápida do cabeçalho',
  );
});

test('a captura arma pelos três caminhos: submit, clique e Enter', () => {
  // O SEI 5 usa <button type="button" onclick="confirmarDados()">, que não
  // dispara submit; formulário submetido por script também não dispara; e na
  // tela de assinatura o caminho mais natural é digitar a senha e apertar
  // Enter, que não dispara nenhum dos dois.
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const codigo = semComentarios(captura.texto);

  assert.ok(codigo.includes("addEventListener('submit'"), 'escuta o submit');
  assert.ok(codigo.includes("addEventListener('click'"), 'escuta o clique');
  assert.ok(codigo.includes("addEventListener('keydown'"), 'escuta o Enter');
});

test('a escuta de teclado não encosta no valor dos campos', () => {
  // O formulário de assinatura contém o campo de senha. Escutar teclas ali
  // exige disciplina: a captura lê a TECLA e o id do elemento, nunca o valor.
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const codigo = semComentarios(captura.texto);

  const inicio = codigo.indexOf('const aoTeclar');
  assert.ok(inicio > 0, 'ouvinte de teclado não encontrado');
  const ouvinte = codigo.slice(inicio, codigo.indexOf('};', inicio));

  assert.equal(/\.value/.test(ouvinte), false, 'não pode ler .value');
  assert.equal(/\bsenha\b/i.test(ouvinte), false, 'não pode nem mencionar senha');
});

test('o ato é gravado na hora, não só na tela seguinte', () => {
  // A fila em sessionStorage atravessa a NAVEGAÇÃO, não a JANELA. O editor do
  // SEI abre em janela própria, com sessionStorage independente: assinar por
  // lá enfileirava o ato numa fila que a aba principal nunca leria, e que
  // morria quando o SEI fechava o editor. Sem a gravação imediata, o ato se
  // perdia inteiro.
  const captura = fontes.find((f) => f.caminho.endsWith('historico/captura.js'));
  const codigo = semComentarios(captura.texto);

  const inicio = codigo.indexOf('const anotarComRede');
  assert.ok(inicio > 0, 'anotarComRede não encontrada');
  const corpo = codigo.slice(inicio, inicio + 900);

  assert.ok(corpo.includes('descarregarAtos()'), 'precisa gravar sem esperar a próxima tela');
});
