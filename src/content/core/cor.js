/**
 * cor.js - aritmetica de cor. Sem DOM, sem efeito colateral.
 *
 * Existe para o tema.js poder derivar a paleta do painel a partir das cores
 * que o SEI ja pinta na tela. Como cada orgao usa um tema diferente - e o
 * usuario ainda pode ligar o modo escuro do proprio SEI - nao da para chutar
 * valores fixos: e preciso medir contraste e ajustar.
 *
 * Tudo aqui e funcao pura (entra cor, sai cor), o que mantem o modulo
 * testavel no `node --test` sem navegador nenhum.
 *
 * Representacao interna: { r, g, b, a } com r/g/b em 0-255 e a em 0-1.
 */

export const BRANCO = { r: 255, g: 255, b: 255, a: 1 };
export const PRETO = { r: 0, g: 0, b: 0, a: 1 };

const NOMEADAS = {
  transparent: { r: 0, g: 0, b: 0, a: 0 },
  white: BRANCO,
  black: PRETO,
};

const limitar = (v, min, max) => Math.min(max, Math.max(min, v));

/**
 * Le uma cor CSS. Devolve null - nunca lanca - para o que nao souber ler,
 * porque a origem e `getComputedStyle` de uma pagina que nao controlamos.
 *
 * Cobre o que o navegador devolve na pratica (`rgb()` e `rgba()`) e as formas
 * hex que este projeto escreve. Nao cobre `color(srgb ...)` nem `oklch()`: o
 * SEI nao usa, e devolver null faz o tema.js cair no padrao, que e seguro.
 */
export function lerCor(valor) {
  if (!valor) return null;

  if (typeof valor === 'object') {
    const { r, g, b } = valor;
    if (![r, g, b].every(Number.isFinite)) return null;
    return { r, g, b, a: Number.isFinite(valor.a) ? valor.a : 1 };
  }

  const texto = String(valor).trim().toLowerCase();
  if (NOMEADAS[texto]) return { ...NOMEADAS[texto] };

  if (texto.startsWith('#')) {
    const hex = texto.slice(1);
    const curto = hex.length === 3 || hex.length === 4;
    const cheio = curto ? hex.split('').map((c) => c + c).join('') : hex;
    if (cheio.length !== 6 && cheio.length !== 8) return null;
    if (!/^[0-9a-f]+$/.test(cheio)) return null;
    const n = (i) => parseInt(cheio.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: cheio.length === 8 ? n(6) / 255 : 1 };
  }

  const m = texto.match(/^rgba?\(([^)]+)\)$/);
  if (!m) return null;

  // Aceita "r, g, b, a" e a forma moderna "r g b / a" com o mesmo split.
  const partes = m[1].split(/[\s,/]+/).filter(Boolean);
  if (partes.length < 3) return null;

  const canal = (t) => {
    const bruto = parseFloat(t);
    if (!Number.isFinite(bruto)) return null;
    return Math.round(limitar(t.endsWith('%') ? (bruto * 255) / 100 : bruto, 0, 255));
  };
  const r = canal(partes[0]);
  const g = canal(partes[1]);
  const b = canal(partes[2]);
  if (r === null || g === null || b === null) return null;

  let a = 1;
  if (partes[3] !== undefined) {
    const bruto = parseFloat(partes[3]);
    if (Number.isFinite(bruto)) a = partes[3].endsWith('%') ? bruto / 100 : bruto;
  }
  return { r, g, b, a: limitar(a, 0, 1) };
}

/** Serializa para `#rrggbb`. O alfa se perde de proposito: os tokens sao opacos. */
export function paraHex({ r, g, b }) {
  const h = (v) => Math.round(limitar(v, 0, 255)).toString(16).padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Achata uma cor semitransparente contra um fundo.
 *
 * Necessario porque o `background-color` computado do `body` do SEI vem
 * `rgba(0, 0, 0, 0)` com frequencia; sem achatar, a luminancia sairia a de
 * preto puro e o tema inteiro decidiria errado.
 */
export function sobrepor(frente, fundo) {
  const a = Number.isFinite(frente.a) ? frente.a : 1;
  if (a >= 1) return { r: frente.r, g: frente.g, b: frente.b, a: 1 };
  return {
    r: frente.r * a + fundo.r * (1 - a),
    g: frente.g * a + fundo.g * (1 - a),
    b: frente.b * a + fundo.b * (1 - a),
    a: 1,
  };
}

/** Luminancia relativa (WCAG 2.1). */
export function luminancia({ r, g, b }) {
  const canal = (v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
}

/** Razao de contraste WCAG: 1 (igual) a 21 (preto sobre branco). */
export function contraste(a, b) {
  const la = luminancia(a);
  const lb = luminancia(b);
  const alto = Math.max(la, lb);
  const baixo = Math.min(la, lb);
  return (alto + 0.05) / (baixo + 0.05);
}

/**
 * Uma cor e "escura" quando texto branco le melhor sobre ela do que preto.
 * Definir assim - por contraste, nao por limiar de luminancia - evita o caso
 * classico do amarelo saturado, que tem luminancia alta mas engana um `< 0.5`.
 */
export function ehEscura(cor) {
  return contraste(cor, BRANCO) > contraste(cor, PRETO);
}

/** Escolhe entre texto claro e escuro o que le melhor sobre `cor`. */
export function melhorTextoSobre(cor, claro = BRANCO, escuro = PRETO) {
  return contraste(cor, claro) >= contraste(cor, escuro) ? claro : escuro;
}

/** Interpola linearmente: peso 0 devolve `a`, peso 1 devolve `b`. */
export function misturar(a, b, peso) {
  const p = limitar(peso, 0, 1);
  return {
    r: a.r + (b.r - a.r) * p,
    g: a.g + (b.g - a.g) * p,
    b: a.b + (b.b - a.b) * p,
    a: 1,
  };
}

export function paraHsl({ r, g, b }) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  if (!d) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === rn) h = ((gn - bn) / d + (gn < bn ? 6 : 0)) / 6;
  else if (max === gn) h = ((bn - rn) / d + 2) / 6;
  else h = ((rn - gn) / d + 4) / 6;
  return { h, s, l };
}

export function deHsl({ h, s, l }) {
  const lc = limitar(l, 0, 1);
  if (!s) {
    const v = Math.round(lc * 255);
    return { r: v, g: v, b: v, a: 1 };
  }
  const q = lc < 0.5 ? lc * (1 + s) : lc + s - lc * s;
  const p = 2 * lc - q;
  const canal = (t) => {
    let x = t;
    if (x < 0) x += 1;
    if (x > 1) x -= 1;
    if (x < 1 / 6) return p + (q - p) * 6 * x;
    if (x < 1 / 2) return q;
    if (x < 2 / 3) return p + (q - p) * (2 / 3 - x) * 6;
    return p;
  };
  return {
    r: Math.round(canal(h + 1 / 3) * 255),
    g: Math.round(canal(h) * 255),
    b: Math.round(canal(h - 1 / 3) * 255),
    a: 1,
  };
}

/**
 * Move a cor na escala de luminosidade ate ela ler sobre `fundo`, mantendo
 * matiz e saturacao.
 *
 * E o que preserva a identidade das cores de evento quando o SEI esta escuro:
 * o verde de ASSINADO continua verde, so clareia o suficiente para aparecer.
 * Se nem no extremo der o contraste pedido, devolve a melhor tentativa - um
 * painel com contraste imperfeito ainda e melhor que um sem cor nenhuma.
 */
export function ajustarContraste(cor, fundo, minimo = 4.5) {
  if (contraste(cor, fundo) >= minimo) return cor;

  const hsl = paraHsl(cor);
  const passo = ehEscura(fundo) ? 0.02 : -0.02;
  let melhor = cor;
  let melhorRazao = contraste(cor, fundo);

  for (let i = 1; i <= 50; i++) {
    const l = hsl.l + passo * i;
    if (l < 0 || l > 1) break;
    const tentativa = deHsl({ ...hsl, l });
    const razao = contraste(tentativa, fundo);
    if (razao > melhorRazao) {
      melhor = tentativa;
      melhorRazao = razao;
    }
    if (razao >= minimo) return tentativa;
  }
  return melhor;
}
