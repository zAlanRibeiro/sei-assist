# Como adicionar uma funcionalidade

Três passos: criar a pasta, escrever o objeto da feature, registrar no
catálogo. Nada no `manifest.json`.

## 1. Criar a pasta

```
src/content/features/meu-recurso/index.js
```

Se a feature crescer, quebre em arquivos irmãos (`seletores.js`, `ui.js`…) e
importe a partir do `index.js`.

## 2. Escrever a feature

```js
import { registrarAtalho } from '../../core/hotkeys.js';
import { acharBotaoComando, observar, qsa } from '../../core/dom.js';
import { toast } from '../../core/ui.js';
import { cliqueSeguro } from '../../core/guard.js';

export default {
  id: 'meu-recurso',            // único, kebab-case — vira chave no storage
  nome: 'Meu recurso',          // aparece no popup e nas opções
  descricao: 'O que ele faz, em uma frase.',
  padraoAtiva: true,

  // Vira campo editável na tela de opções automaticamente.
  // O tipo do valor define o controle: texto, número ou caixa de seleção.
  opcoesPadrao: { atalho: 'Ctrl+Shift+L', limite: 50, destacar: true },

  // Onde roda. Nomes vêm de ACOES em src/shared/constantes.js.
  telas: ['controle-processos'],   // ou ['*'] para todas
  frames: ['topo'],                // 'topo' | 'arvore' | 'visualizacao' | 'conteudo' | '*'

  // Opcional: condição extra além de tela/frame.
  aplicaSe(ctx) {
    return Boolean(document.querySelector('table.infraTable'));
  },

  // Roda uma vez por frame elegível. Pode ser async.
  // Devolva uma função de limpeza se a feature criar listeners ou elementos.
  setup(ctx) {
    const parar = observar(document.body, () => aplicar(ctx.opcoes));
    const soltarAtalho = registrarAtalho(ctx.opcoes.atalho, () => aplicar(ctx.opcoes), {
      descricao: 'Meu recurso',
    });

    aplicar(ctx.opcoes);

    return () => {
      parar();
      soltarAtalho();
      qsa('.seix-minha-marca').forEach((el) => el.classList.remove('seix-minha-marca'));
    };
  },
};

function aplicar(opcoes) {
  // ...
}
```

### O que vem no `ctx`

| Campo | Conteúdo |
| --- | --- |
| `ctx.screen` | nome estável da tela (`'controle-processos'`, `'processo'`…) |
| `ctx.acao` | valor cru de `acao` na URL (`'procedimento_trabalhar'`) |
| `ctx.frame` | `{ nome, role, topo, principal }` |
| `ctx.versao` | versão do SEI, se der para ler no rodapé |
| `ctx.orgao` | host atual |
| `ctx.opcoes` | opções da feature, já com os defaults aplicados |
| `ctx.param(nome)` | lê um parâmetro da query string |

## 3. Registrar no catálogo

```js
// src/content/features/index.js
import inspetor from './inspetor/index.js';
import meuRecurso from './meu-recurso/index.js';

export default [inspetor, meuRecurso];
```

Recarregue a extensão em `chrome://extensions` e a aba do SEI. A feature já
aparece no popup e nas opções, com os campos de `opcoesPadrao` prontos para
editar.

---

## Escolhendo seletores

O HTML do SEI varia entre versões e órgãos. Ordem de preferência:

1. **`data-*` e `aria-*`** — quando existem, são o mais estável.
2. **`name`** de campos de formulário.
3. **Texto visível** — `acharPorTexto('a, button', 'Gerar Documento')`.
4. **Estrutura relativa** — "o `input` na célula seguinte ao rótulo X".
5. **`id`** — os `id` do framework Infra (`#txtDescricao`, `#tblProcessos`)
   costumam sobreviver entre versões; use como *fallback*, não como primeira
   opção.
6. **Classes de layout** — evite. Mudam com tema e versão.

Helpers prontos em [`core/dom.js`](../src/content/core/dom.js):

| Função | Para quê |
| --- | --- |
| `qsAny([...])` | primeiro seletor da lista que casar |
| `acharPorTexto(sel, texto)` | elementos pelo texto visível (sem acento, sem caixa) |
| `acharBotaoComando(texto)` | botão da barra de comandos, varrendo `<a>`, `<button>`, `<input>` e `<img title>` |
| `acharCampoPorRotulo(rotulo)` | campo pelo texto do rótulo, cobrindo `<label for>` e o padrão `<td>rótulo</td><td>campo</td>` |
| `esperarElemento(sel)` | espera algo aparecer (o SEI monta muita coisa depois do load) |
| `observar(root, cb)` | `MutationObserver` com debounce, devolve função de parada |
| `preencher(campo, valor)` | preenche **e dispara** `input`/`change`/`keyup`/`blur`, que é o que o SEI escuta |
| `frameDoc(nome)` | acessa o documento de outro frame do SEI |

## Trabalhando com os frames

A tela do processo é um conjunto de iframes. O content script roda em cada um,
então declare `frames` com cuidado:

| `role` | Onde é |
| --- | --- |
| `topo` | documento principal |
| `arvore` | árvore de documentos, à esquerda |
| `visualizacao` | painel direito |
| `conteudo` | conteúdo dentro do painel direito |

Uma feature que só desenha um botão na barra deve usar `frames: ['topo']`, ou
ela vai desenhar um botão por frame.

## Ações irreversíveis

Toda automação que clique em algo do SEI usa `cliqueSeguro()`:

```js
import { cliqueSeguro } from '../../core/guard.js';

// Bloqueado: o rótulo bate na lista de ações críticas.
await cliqueSeguro(acharBotaoComando('Assinar Documento'));

// Permitido, mas só depois de confirmação explícita em diálogo.
await cliqueSeguro(botao, { permitirCritico: true, motivo: 'Assinatura em lote' });
```

Navegação, filtro, ordenação e preenchimento não precisam disso.

## Estilos

Adicione as regras em [`src/styles/content.css`](../src/styles/content.css),
sempre com o prefixo `seix-` e usando as variáveis `--seix-*` já definidas.
O arquivo entra em `document_start`, então nada nele pode afetar a página antes
de a extensão adicionar as classes.

### Nunca escreva uma cor solta

Os valores no `:root` do CSS são só o padrão gov.br. Em tempo de execução,
[`core/tema.js`](../src/content/core/tema.js) lê as cores da tela do SEI com
`getComputedStyle` e reescreve esses mesmos tokens na raiz do documento — é
assim que o painel veste o tema do órgão, inclusive o escuro.

Uma cor escrita direto na regra não acompanha nada disso e vira um retângulo
branco dentro de um SEI escuro. Use sempre `var(--seix-token, padrão)`; o
valor de fallback existe só para o arquivo continuar legível isolado.

Há três testes em [`testes/tema.test.mjs`](../testes/tema.test.mjs) guardando
isso: token usado sem declaração, token emitido sem contrapartida no CSS, e
cor solta fora do `:root`.

### A exceção: cor que significa alguma coisa

As cores de evento (`--seix-ev-*`) **não** acompanham o tema. Verde é ASSINADO,
azul é ENVIADO, roxo processo, laranja documento — se mudassem junto com o
tema, dois tipos poderiam virar a mesma cor. Cada uma tem duas formas:

| token | onde | comportamento |
| --- | --- | --- |
| `--seix-ev-X` | preenchimento da etiqueta | fixo, sempre com texto branco |
| `--seix-ev-X-realce` | faixa lateral, texto | matiz fixa, luminosidade ajustada ao fundo |

Para acrescentar um tipo de evento novo, some uma entrada em `EVENTOS` no
`tema.js` e as duas linhas correspondentes no `:root` do CSS. O teste de
higiene reclama se você esquecer uma das pontas.

## Testando

1. `chrome://extensions` → **Atualizar** no card da extensão.
2. Recarregue a aba do SEI.
3. No console da página: `localStorage.setItem('seix:debug', '1')` e recarregue
   de novo para ver os logs de ativação de cada feature.
4. Erros de uma feature são capturados pelo registry e não derrubam as outras —
   procure por `falha ao ativar "<id>"` no console.
