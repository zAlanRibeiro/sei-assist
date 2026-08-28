/**
 * Testes do tema derivado do SEI.
 *
 * Duas garantias importam aqui, e as duas sao promessas feitas ao usuario:
 *
 *  1. o painel veste o tema do orgao, qualquer que seja - inclusive escuro;
 *  2. as cores que SIGNIFICAM alguma coisa (assinado, enviado, criado, aviso)
 *     nao se perdem no caminho.
 *
 * O ultimo bloco cuida da higiene: todo token usado no CSS tem que estar
 * declarado, e todo token que o tema.js escreve tem que existir no CSS. Sem
 * isso, um erro de digitacao vira uma cor faltando so no navegador do usuario.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  BRANCO,
  PRETO,
  ajustarContraste,
  contraste,
  ehEscura,
  lerCor,
  melhorTextoSobre,
  paraHex,
  paraHsl,
  sobrepor,
} from '../src/content/core/cor.js';
import { derivarPaleta, escolherSuperficie } from '../src/content/core/tema.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------ leitura de cor */

test('lerCor entende o que o getComputedStyle devolve', () => {
  assert.deepEqual(lerCor('rgb(19, 81, 180)'), { r: 19, g: 81, b: 180, a: 1 });
  assert.deepEqual(lerCor('rgba(19, 81, 180, 0.5)'), { r: 19, g: 81, b: 180, a: 0.5 });
  // Forma moderna, que algumas paginas escrevem a mao.
  assert.deepEqual(lerCor('rgb(19 81 180 / 0.5)'), { r: 19, g: 81, b: 180, a: 0.5 });
});

test('lerCor entende os hex que este projeto escreve', () => {
  assert.equal(paraHex(lerCor('#1351b4')), '#1351b4');
  assert.equal(paraHex(lerCor('#fff')), '#ffffff');
  assert.equal(lerCor('#ffffff80').a, 128 / 255);
});

test('lerCor devolve null em vez de lancar', () => {
  // A origem e uma pagina que nao controlamos: nada aqui pode derrubar o boot.
  for (const lixo of ['', null, undefined, 'inherit', 'url(x.png)', '#12345', 'rgb(1, 2)']) {
    assert.equal(lerCor(lixo), null, `deveria ignorar ${JSON.stringify(lixo)}`);
  }
});

test('lerCor nao inventa cor para color() e oklch()', () => {
  // Nao sabemos ler: melhor cair no padrao do que exibir uma cor errada.
  assert.equal(lerCor('color(srgb 0.1 0.2 0.3)'), null);
  assert.equal(lerCor('oklch(0.5 0.1 200)'), null);
});

test('transparente achatado assume a cor de tras', () => {
  // Sem isto, o body transparente do SEI seria lido como preto e o tema
  // inteiro decidiria escuro por engano.
  assert.equal(paraHex(sobrepor(lerCor('transparent'), BRANCO)), '#ffffff');
});

/* --------------------------------------------------------------- contraste */

test('contraste bate com os extremos conhecidos do WCAG', () => {
  assert.equal(Math.round(contraste(BRANCO, PRETO)), 21);
  assert.equal(contraste(BRANCO, BRANCO), 1);
});

test('ehEscura decide por contraste, nao por limiar de luminancia', () => {
  assert.equal(ehEscura(lerCor('#1c1c1c')), true);
  assert.equal(ehEscura(lerCor('#ffffff')), false);
  // Amarelo saturado tem luminancia alta: um `< 0.5` erraria aqui.
  assert.equal(ehEscura(lerCor('#ffd700')), false);
});

test('melhorTextoSobre escolhe o que le', () => {
  assert.deepEqual(melhorTextoSobre(lerCor('#1351b4')), BRANCO);
  assert.deepEqual(melhorTextoSobre(lerCor('#ffd700')), PRETO);
});

/* ------------------------------------------------- ajuste que preserva matiz */

test('ajustarContraste nao mexe no que ja contrasta', () => {
  const verde = lerCor('#168821');
  assert.equal(ajustarContraste(verde, BRANCO, 3), verde);
});

test('ajustarContraste clareia sobre fundo escuro e mantem a matiz', () => {
  const verde = lerCor('#168821');
  const escuro = lerCor('#1c1c1c');
  const ajustado = ajustarContraste(verde, escuro, 4.5);

  assert.ok(contraste(ajustado, escuro) >= 4.5, 'deveria alcancar o contraste pedido');
  const antes = paraHsl(verde).h;
  const depois = paraHsl(ajustado).h;
  assert.ok(Math.abs(antes - depois) < 0.02, `matiz mudou: ${antes} -> ${depois}`);
});

test('ajustarContraste devolve a melhor tentativa quando o alvo e impossivel', () => {
  // Contraste 21 so existe entre preto e branco puros. Pedir isso de um azul
  // nao pode travar nem devolver undefined.
  const resultado = ajustarContraste(lerCor('#1351b4'), BRANCO, 21);
  assert.ok(resultado && Number.isFinite(resultado.r));
});

/* ------------------------------------------------------ paleta derivada */

const CLARO = { fundo: 'rgb(255, 255, 255)', texto: 'rgb(28, 28, 28)', primaria: 'rgb(19, 81, 180)' };
const ESCURO = { fundo: 'rgb(30, 30, 30)', texto: 'rgb(224, 224, 224)', primaria: 'rgb(31, 41, 71)' };

test('tema claro do SEI vira paleta clara', () => {
  const p = derivarPaleta(CLARO);
  assert.equal(p['--seix-esquema'], 'light');
  assert.equal(p['--seix-cor-fundo'], '#ffffff');
  assert.equal(p['--seix-cor-primaria'], '#1351b4');
});

test('tema escuro do SEI vira paleta escura', () => {
  const p = derivarPaleta(ESCURO);
  assert.equal(p['--seix-esquema'], 'dark');
  assert.equal(p['--seix-cor-fundo'], '#1e1e1e');
  // Era isto que estava travado em `light` e deixava os controles do painel
  // claros dentro de um SEI escuro.
  assert.ok(Number(p['--seix-brilho-hover']) > 1, 'no escuro o hover precisa clarear');
});

test('a cor da barra do SEI vira o cabecalho do painel', () => {
  const p = derivarPaleta({ ...CLARO, primaria: 'rgb(21, 115, 71)' });
  assert.equal(p['--seix-cor-primaria'], '#157347', 'deveria adotar o verde do orgao');
  assert.equal(p['--seix-cor-primaria-texto'], '#ffffff');
});

test('texto e fundo sempre contrastam, venha o que vier da tela', () => {
  const casos = [
    CLARO,
    ESCURO,
    { fundo: 'rgb(255, 255, 255)', texto: 'rgb(250, 250, 250)' }, // leitura ruim
    { fundo: 'rgb(30, 30, 30)', texto: 'rgb(35, 35, 35)' },
    {},
  ];
  for (const caso of casos) {
    const p = derivarPaleta(caso);
    const razao = contraste(lerCor(p['--seix-cor-texto']), lerCor(p['--seix-cor-fundo']));
    assert.ok(razao >= 4.5, `contraste ${razao.toFixed(2)} em ${JSON.stringify(caso)}`);
  }
});

test('entrada ilegivel cai no padrao gov.br', () => {
  const p = derivarPaleta({ fundo: 'oklch(0.5 0.1 200)', texto: 'inherit', primaria: null });
  assert.equal(p['--seix-cor-fundo'], '#ffffff');
  assert.equal(p['--seix-cor-primaria'], '#1351b4');
});

test('barra indistinguivel do fundo nao vira cor de destaque', () => {
  // Um branco quase puro como "primaria" deixaria o cabecalho do painel
  // invisivel; melhor ignorar a leitura.
  const p = derivarPaleta({ ...CLARO, primaria: 'rgb(253, 253, 253)' });
  assert.equal(p['--seix-cor-primaria'], '#1351b4');
});

/* ------------------------------------------- o que NAO pode mudar com o tema */

const EVENTOS = {
  assinatura: '#168821',
  envio: '#1351b4',
  'processo-criado': '#6d28d9',
  'documento-criado': '#b45309',
};

test('o preenchimento das etiquetas de evento nunca muda', () => {
  // Promessa ao usuario: o tema muda, mas ASSINADO e sempre o mesmo verde e
  // ENVIADO o mesmo azul - senao dois tipos poderiam virar a mesma cor.
  for (const entrada of [CLARO, ESCURO, {}]) {
    const p = derivarPaleta(entrada);
    for (const [nome, hex] of Object.entries(EVENTOS)) {
      assert.equal(p[`--seix-ev-${nome}`], hex, `${nome} mudou no tema ${p['--seix-esquema']}`);
    }
  }
});

test('a faixa lateral do evento continua legivel em tema escuro', () => {
  const p = derivarPaleta(ESCURO);
  const fundo = lerCor(p['--seix-cor-fundo']);
  for (const nome of Object.keys(EVENTOS)) {
    const realce = lerCor(p[`--seix-ev-${nome}-realce`]);
    assert.ok(contraste(realce, fundo) >= 3, `${nome} some no fundo escuro`);
  }
});

test('a faixa lateral mantem a matiz do evento', () => {
  const p = derivarPaleta(ESCURO);
  for (const [nome, hex] of Object.entries(EVENTOS)) {
    const antes = paraHsl(lerCor(hex)).h;
    const depois = paraHsl(lerCor(p[`--seix-ev-${nome}-realce`])).h;
    assert.ok(Math.abs(antes - depois) < 0.02, `${nome}: matiz ${antes} -> ${depois}`);
  }
});

test('o aviso continua ambar e legivel nos dois temas', () => {
  for (const entrada of [CLARO, ESCURO]) {
    const p = derivarPaleta(entrada);
    const fundo = lerCor(p['--seix-cor-aviso-fundo']);
    const texto = lerCor(p['--seix-cor-aviso-texto']);
    assert.ok(contraste(texto, fundo) >= 4.5, 'texto do aviso ilegivel');

    const matiz = paraHsl(texto).h * 360;
    assert.ok(matiz > 20 && matiz < 70, `deixou de ser ambar: matiz ${matiz.toFixed(0)}`);
  }
});

test('as cores de estado seguem legiveis sobre o fundo do tema', () => {
  for (const entrada of [CLARO, ESCURO]) {
    const p = derivarPaleta(entrada);
    const fundo = lerCor(p['--seix-cor-fundo']);
    for (const nome of ['sucesso', 'alerta', 'erro']) {
      const razao = contraste(lerCor(p[`--seix-cor-${nome}`]), fundo);
      assert.ok(razao >= 4.5, `${nome} com contraste ${razao.toFixed(2)}`);
    }
  }
});

/* ----------------------------------------------------- higiene CSS x tema.js */

const css = fs.readFileSync(path.join(RAIZ, 'src/styles/content.css'), 'utf8');

/** Tokens declarados no bloco :root. */
function declarados() {
  const bloco = css.slice(css.indexOf(':root {'), css.indexOf('#seix-root {'));
  return new Set([...bloco.matchAll(/(--seix-[\w-]+)\s*:/g)].map((m) => m[1]));
}

test('todo token usado no CSS esta declarado no :root', () => {
  const tem = declarados();
  const usados = new Set([...css.matchAll(/var\((--seix-[\w-]+)/g)].map((m) => m[1]));
  const faltando = [...usados].filter((t) => !tem.has(t));
  assert.deepEqual(faltando, [], `usados sem declaracao: ${faltando.join(', ')}`);
});

test('todo token que o tema.js escreve existe no CSS', () => {
  // Se o tema escrever um token que o CSS nao usa, ele muda nada - e o erro so
  // apareceria como "a cor nao mudou" no navegador do usuario.
  const tem = declarados();
  const emitidos = Object.keys(derivarPaleta(CLARO));
  const orfaos = emitidos.filter((t) => !tem.has(t));
  assert.deepEqual(orfaos, [], `emitidos sem contrapartida no CSS: ${orfaos.join(', ')}`);
});

test('nenhuma cor solta sobrou fora do :root', () => {
  // Cor fora de token nao acompanha o tema. A unica excecao e o branco da
  // etiqueta, que fica sobre a cor cheia do evento.
  const corpo = css.slice(css.indexOf('#seix-root {'));
  const soltas = [...corpo.matchAll(/^\s*[\w-]*color:\s*(#[0-9a-fA-F]{3,8})/gm)].map((m) => m[1]);
  assert.deepEqual(soltas, ['#ffffff'], `cores fora de token: ${soltas.join(', ')}`);
});

test('estilo injetado no DOM do SEI tambem usa token, nao cor crua', () => {
  // O link do historico e o unico ponto onde a extensao escreve estilo
  // direto no HTML do SEI (inline, porque o content.css perde a disputa de
  // cascata). A disciplina de token vale la tambem, senao aquele pedaco
  // deixa de acompanhar o tema sem ninguem perceber.
  const src = fs.readFileSync(path.join(RAIZ, 'src/content/features/historico/index.js'), 'utf8');
  const soltas = [];
  for (const achado of src.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
    const antes = src.slice(Math.max(0, achado.index - 60), achado.index);
    if (!/var\(--seix-[\w-]+,\s*$/.test(antes)) soltas.push(achado[0]);
  }
  assert.deepEqual(soltas, [], 'cor fora de token: ' + soltas.join(', '));
});

test('todo token usado em JS esta declarado no :root', () => {
  // Fecha o laco: o teste do CSS so olha o proprio CSS, entao um token
  // escrito num estilo inline (o link do historico, a marca "Assist")
  // passaria batido e a cor sairia vazia so no navegador do usuario.
  const tem = declarados();
  const faltando = new Set();

  const varrer = (dir) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const caminho = path.join(dir, entrada.name);
      if (entrada.isDirectory()) {
        varrer(caminho);
      } else if (entrada.name.endsWith('.js')) {
        const src = fs.readFileSync(caminho, 'utf8');
        for (const achado of src.matchAll(/var\((--seix-[\w-]+)/g)) {
          if (!tem.has(achado[1])) faltando.add(`${entrada.name}: ${achado[1]}`);
        }
      }
    }
  };
  varrer(path.join(RAIZ, 'src'));

  assert.deepEqual([...faltando], [], `token sem declaracao: ${[...faltando].join(', ')}`);
});

test('a marca fica fora do tema, de proposito', () => {
  // Pedido explicito do usuario: branco fixo. Se algum dia o tema.js passar
  // a emitir este token, a marca deixaria de ser branca sem ninguem pedir.
  assert.ok(!Object.keys(derivarPaleta(ESCURO)).includes('--seix-marca-cor'));
});

/* --------------------------------------------------- de qual frame ler */

test('a superfície vem do primeiro documento que tem fundo próprio', () => {
  // Frame do SEI costuma ser transparente: quem pinta o escuro é o documento
  // de fora. Lendo só o frame local, um SEI escuro produzia painel branco no
  // meio do preto — foi o que apareceu na tela do andamento.
  const escolhida = escolherSuperficie([
    { fundo: null, texto: '#ffffff' },
    { fundo: '#1c1c1c', texto: '#f5f5f5' },
  ]);

  assert.equal(escolhida.fundo, '#1c1c1c');
});

test('fundo e texto saem sempre do mesmo documento', () => {
  // Pegar o fundo escuro de um e o texto escuro de outro daria preto no preto.
  const escolhida = escolherSuperficie([
    { fundo: null, texto: '#111111' },
    { fundo: '#1c1c1c', texto: '#f5f5f5' },
  ]);

  assert.equal(escolhida.texto, '#f5f5f5', 'não pode herdar o texto de quem não deu o fundo');
});

test('o frame local tem preferência quando pinta o próprio fundo', () => {
  const escolhida = escolherSuperficie([
    { fundo: '#ffffff', texto: '#1c1c1c' },
    { fundo: '#1c1c1c', texto: '#f5f5f5' },
  ]);

  assert.equal(escolhida.fundo, '#ffffff');
});

test('página inteira transparente cai no padrão', () => {
  const escolhida = escolherSuperficie([{ fundo: null, texto: '#ffffff' }]);

  assert.equal(escolhida.fundo, null);
  assert.equal(escolhida.texto, null, 'texto sem fundo conhecido não decide nada');
});
