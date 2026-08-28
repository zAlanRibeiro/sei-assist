/**
 * seletores.js - onde encaixar a marca na barra do topo do SEI.
 *
 * Mesma disciplina do resto do projeto: o conhecimento fragil sobre o HTML do
 * SEI fica isolado num arquivo so, para quem instalar em outro orgao ter um
 * unico lugar para ajustar.
 *
 * Validado contra: leste.sei.rj.gov.br (Niteroi/RJ), SEI 5.0.4.
 */
import { qsa, qsAny, textoCasa, textoProprio } from '../../core/dom.js';

export const MARCA = {
  /**
   * CONFIRMADO no SEI 5.0.4: o rotulo de ambiente ("Producao") mora num
   * <span class="infraTituloLogoSistema">, logo ao lado do logo.
   *
   * Duas particularidades que so o HTML real revelou:
   *  - o span nao tem id, so classe - por isso a busca e por classe;
   *  - a pagina traz DOIS deles, variantes responsivas, com apenas uma
   *    visivel de cada vez. Escrever no escondido daria exatamente o sintoma
   *    de "nao apareceu".
   */
  rotulo: ['span.infraTituloLogoSistema', '[class*="TituloLogoSistema" i]'],

  /**
   * Rotulos de ambiente, para a busca por texto.
   *
   * Serve de rede para outros orgaos e outras versoes, onde a classe acima
   * pode nao existir. A comparacao passa por norm(), entao acento e caixa nao
   * importam.
   */
  ambientes: ['producao', 'homologacao', 'treinamento', 'desenvolvimento'],

  /**
   * Tags que podem conter o rotulo. Lista fechada de proposito: varrer '*'
   * percorreria a pagina inteira a cada carregamento por um ganho nenhum.
   */
  folhas: 'span, div, a, b, strong, p, td, h1, h2',

  /** Penultima tentativa: o proprio logo do SEI. */
  logo: ['#imgSeiLogo', '#imgSei', 'img[id*="logo" i]', 'img[alt*="sei" i]', '.infraLogoSei'],

  /** Ultima: a barra do sistema inteira, e a marca vai para o fim dela. */
  barra: ['#divInfraBarraSistema', '.infraBarraSistema', '#divInfraCabecalho'],
};

// Visibilidade mora no nucleo desde que a troca de unidade passou a precisar
// dela: a barra do SEI traz DUAS copias de cada elemento, uma para tela larga
// e outra para estreita. Reexportado aqui porque os testes desta feature o
// importam daqui.
import { visivel, escolherVisivel } from '../../core/dom.js';

export { visivel, escolherVisivel };

// Mora no nucleo desde que a copia de NUP passou a precisar dele tambem.
// Reexportado aqui porque os testes desta feature o importam daqui.
export { textoProprio };

/**
 * Acha onde o rotulo de ambiente esta escrito, entre os nos candidatos.
 *
 * Recebe a lista pronta em vez de ir ao DOM: assim da para testar a regra sem
 * navegador, que e onde os erros de verdade aparecem.
 */
export function acharRotuloDeAmbiente(nos) {
  for (const no of nos) {
    const texto = textoProprio(no);
    if (!texto.trim()) continue;

    // Exato: "Ambiente de producao restrito" nao pode virar ancora.
    if (!MARCA.ambientes.some((r) => textoCasa(texto, r, { exato: true }))) continue;

    const temElementos = Boolean(no.children && no.children.length);

    // Duas formas de o SEI escrever isso, e cada uma pede um encaixe:
    //
    //   <span>Producao</span>            -> elemento so para o rotulo; a marca
    //                                       entra logo DEPOIS dele.
    //   <div><img logo>Producao</div>    -> rotulo e texto solto na barra;
    //                                       "depois" jogaria a marca para fora
    //                                       dela, entao entra DENTRO, no fim.
    return {
      ancora: no,
      modo: temElementos ? 'dentro' : 'depois',
      // So faz sentido copiar a classe quando o vizinho e um rotulo de
      // verdade; a de um container traria layout junto.
      modelo: temElementos ? null : no,
    };
  }
  return null;
}

/**
 * Onde encaixar a marca, em ordem de preferencia.
 *
 * Devolve { ancora, modo, modelo } ou null. `modo` diz se a marca entra depois
 * da ancora ou dentro dela; `modelo` so vem quando faz sentido copiar a classe
 * do vizinho para herdar a aparencia da barra.
 */
export function acharAncoraDaMarca(raiz = document) {
  // 1. Classe confirmada no SEI 5.0.4. Entra DENTRO do span: assim a marca
  //    herda fonte, tamanho e cor do rotulo sem copiar classe nenhuma.
  const rotulo = escolherVisivel(qsa(MARCA.rotulo.join(', '), raiz));
  if (rotulo) return { ancora: rotulo, modo: 'dentro', modelo: null };

  // 2. Por texto, para instalacoes onde aquela classe nao existe.
  const porTexto = acharRotuloDeAmbiente(qsa(MARCA.folhas, raiz));
  if (porTexto) return porTexto;

  const logo = qsAny(MARCA.logo, raiz);
  if (logo) {
    // Logo dentro de um link e comum. A marca precisa ficar FORA dele, senao
    // clicar em "Assist" navegaria para a home do SEI.
    const pai = logo.parentElement;
    const alvo = pai && pai.matches && pai.matches('a') ? pai : logo;
    return { ancora: alvo, modo: 'depois', modelo: null };
  }

  const barra = qsAny(MARCA.barra, raiz);
  if (barra) return { ancora: barra, modo: 'dentro', modelo: null };

  return null;
}
