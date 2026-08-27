/**
 * Detecta chamada a função que não existe.
 *
 * Duas vezes neste projeto uma edição apagou uma função ainda em uso
 * (`capturarNaAssinatura`, depois `criarGatilho`), e nas duas só o navegador
 * percebeu — `node --check` valida sintaxe, não referências.
 *
 * A regra: um nome chamado como função precisa estar ligado a alguma coisa no
 * próprio arquivo (declaração, import, parâmetro, método, desestruturação) ou
 * ser um global conhecido. Se não estiver, é engano.
 *
 * Heurística, não compilador: prefere deixar passar um caso raro a acusar
 * código correto.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NL = String.fromCharCode(10);
const BARRA = String.fromCharCode(92);

function arquivos(dir, saida = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) arquivos(p, saida);
    else if (p.endsWith('.js')) saida.push(p);
  }
  return saida;
}

/**
 * Apaga comentários e conteúdo de texto, numa varredura só.
 *
 * Tem de ser uma passagem única: tirar comentário antes de string quebra em
 * `// não faça isso` (a apóstrofe abriria uma string), e o contrário quebra em
 * `'http://exemplo'`. Quebras de linha são preservadas para o número da linha
 * continuar correto.
 */
/**
 * Onde uma barra pode iniciar um literal de regex.
 *
 * Depois de identificador, número ou `)` a barra é divisão; depois de
 * pontuação de abertura, de operador ou de nada, é regex. Sem essa
 * distinção, um literal como /janelaEditor_(\d+)/ vira 'janelaEditor_('
 * para o detector, que o lê como chamada a uma função inexistente.
 */
const ABRE_REGEX = /[([{,;:=!&|?+\-*%~^<>]$/;
const PALAVRAS_ANTES_DE_REGEX = ['return', 'typeof', 'case', 'in', 'of', 'do', 'else'];

/** O texto termina com esta palavra, como palavra inteira? */
function terminaComPalavra(texto, palavra) {
  if (!texto.endsWith(palavra)) return false;
  const anterior = texto[texto.length - palavra.length - 1];
  return anterior === undefined || !/[\w$]/.test(anterior);
}

function iniciaRegexPorPalavra(antes) {
  return PALAVRAS_ANTES_DE_REGEX.some((p) => terminaComPalavra(antes, p));
}

/** A barra na posição atual inicia um regex? */
function iniciaRegex(saidaAteAqui) {
  const antes = saidaAteAqui.replace(/\s+$/, '');
  if (!antes) return true;
  if (ABRE_REGEX.test(antes)) return true;
  return iniciaRegexPorPalavra(antes);
}

function limpar(codigo) {
  let saida = '';
  let estado = 'normal';
  let aspa = null;
  let classe = false; // dentro de [...] o / não fecha o regex

  for (let i = 0; i < codigo.length; i++) {
    const c = codigo[i];
    const proximo = codigo[i + 1];

    if (estado === 'normal') {
      if (c === '/' && proximo === '/') {
        estado = 'linha';
        continue;
      }
      if (c === '/' && proximo === '*') {
        estado = 'bloco';
        i++;
        continue;
      }
      if (c === "'" || c === '"' || c === '`') {
        estado = 'texto';
        aspa = c;
        continue;
      }
      if (c === '/' && iniciaRegex(saida)) {
        estado = 'regex';
        classe = false;
        continue;
      }
      saida += c;
      continue;
    }

    if (estado === 'regex') {
      // Quebra de linha dentro de literal de regex não existe: se apareceu,
      // era divisão e não regex. Volta ao normal sem engolir a linha.
      if (c === '\n') {
        estado = 'normal';
        saida += c;
        continue;
      }
      if (c === '\\') {
        i++; // escapado: pula o próximo, seja ele qual for
        continue;
      }
      if (c === '[') classe = true;
      else if (c === ']') classe = false;
      else if (c === '/' && !classe) estado = 'normal';
      continue;
    }

    if (estado === 'linha') {
      if (c === NL) {
        estado = 'normal';
        saida += NL;
      }
      continue;
    }

    if (estado === 'bloco') {
      if (c === NL) saida += NL;
      if (c === '*' && proximo === '/') {
        estado = 'normal';
        i++;
      }
      continue;
    }

    // texto
    if (c === BARRA) {
      i++;
      continue;
    }
    if (c === NL) saida += NL;
    if (c === aspa) {
      estado = 'normal';
      aspa = null;
    }
  }

  return saida;
}

/** Palavras que parecem chamada mas são sintaxe. */
const SINTAXE = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'new',
  'await', 'delete', 'void', 'in', 'of', 'do', 'else', 'yield', 'import', 'async',
  'try', 'finally', 'throw', 'super', 'this', 'case',
]);

/** Globais disponíveis num content script. */
const GLOBAIS = new Set([
  'document', 'window', 'console', 'chrome', 'navigator', 'location', 'localStorage',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame',
  'Promise', 'Array', 'Object', 'JSON', 'URL', 'URLSearchParams', 'Date', 'Number',
  'String', 'Boolean', 'Math', 'Set', 'Map', 'WeakMap', 'RegExp', 'Error', 'TypeError',
  // Usados pela porta de rede para decodificar a resposta do SEI.
  'TextDecoder', 'TextEncoder', 'Uint8Array', 'AbortController', 'URL', 'DOMParser',
  'DataTransfer', 'ClipboardEvent', 'MutationObserver', 'CSS', 'Intl',
  'Symbol', 'Blob', 'CSS', 'Node', 'Event', 'CustomEvent', 'MutationObserver',
  'Intl', 'parseInt', 'parseFloat', 'isNaN', 'structuredClone', 'DOMParser', 'FormData',
  'AbortController', 'queueMicrotask', 'fetch',
]);

/** Nomes ligados a alguma coisa no arquivo. Generoso de propósito. */
function nomesLigados(codigo) {
  const ligados = new Set();
  const adicionar = (texto) => {
    for (const nome of String(texto || '').match(/[A-Za-z_$][\w$]*/g) || []) ligados.add(nome);
  };

  for (const m of codigo.matchAll(/\b(?:function|class)\s+([A-Za-z_$][\w$]*)/g)) ligados.add(m[1]);
  for (const m of codigo.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) ligados.add(m[1]);

  // método de objeto:  setup(ctx) {   — é definição, não chamada
  for (const m of codigo.matchAll(/(?:^|[,{])\s*([A-Za-z_$][\w$]*)\s*\([^()]*\)\s*\{/gm)) {
    ligados.add(m[1]);
  }

  for (const m of codigo.matchAll(/[{[]([^{}[\]]*)[}\]]\s*(?:=|=>|\))/g)) adicionar(m[1]);
  for (const m of codigo.matchAll(/import\s+([^;]+?)\s+from/g)) adicionar(m[1]);
  for (const m of codigo.matchAll(/\(([^()]*)\)\s*(?:=>|\{)/g)) adicionar(m[1]);
  for (const m of codigo.matchAll(/([A-Za-z_$][\w$]*)\s*=>/g)) ligados.add(m[1]);
  for (const m of codigo.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)/g)) ligados.add(m[1]);

  return ligados;
}

/**
 * Nomes chamados como função.
 *
 * Sem espaço antes do parêntese de propósito: o projeto é formatado assim, e
 * exigir isso evita casar com trecho de expressão regular como
 * `/Processo (remetido|recebido)/`. Barra invertida antes também exclui, para
 * não confundir `(` e `\d(` de dentro de uma expressão regular.
 */
function nomesChamados(codigo) {
  const chamados = new Map();
  for (const m of codigo.matchAll(/(^|[^.\w$?\\])([A-Za-z_$][\w$]*)\(/gm)) {
    const nome = m[2];
    if (SINTAXE.has(nome) || GLOBAIS.has(nome)) continue;
    if (!chamados.has(nome)) chamados.set(nome, codigo.slice(0, m.index).split(NL).length);
  }
  return chamados;
}

test('nenhuma chamada a função inexistente em src/', () => {
  const problemas = [];

  for (const arquivo of arquivos(path.join(raiz, 'src'))) {
    const codigo = limpar(fs.readFileSync(arquivo, 'utf8'));
    const ligados = nomesLigados(codigo);

    for (const [nome, linha] of nomesChamados(codigo)) {
      if (ligados.has(nome)) continue;
      problemas.push(`${path.relative(raiz, arquivo).split(path.sep).join('/')}:${linha} ${nome}()`);
    }
  }

  assert.deepEqual(problemas, [], 'nome chamado sem estar declarado nem importado');
});
