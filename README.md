# SEI Assist

Extensão de navegador (Chrome/Edge, Manifest V3) que adiciona melhorias de
navegação, preenchimento e organização ao **SEI — Sistema Eletrônico de
Informações**.

A extensão atua por *content script*: injeta JS/CSS nas telas do SEI, já que o
sistema não expõe API para esse tipo de personalização.

Funciona em qualquer instalação do SEI — cada órgão hospeda o sistema no
próprio domínio, e a extensão reconhece o padrão, não um endereço fixo.

## O que ela faz

- **Histórico do que você assinou, enviou e criou.** Painel no Controle de
  Processos, com busca, filtro por período, distinção entre o que foi assinado
  pelo bloco e pela árvore do processo, e exportação para CSV. Registros
  marcados como **favoritos** sobrevivem à limpeza da lista.
- **Alerta de bloco de assinatura.** Avisa quando entra bloco novo na sua
  unidade, com contador no ícone, tarja na página e marcador no menu.
- **Rascunho no editor.** Recupera o texto quando a sessão do SEI expira no
  meio da redação — a perda mais cara do dia a dia.
- **Data por extenso.** Um botão na barra do editor escreve o fecho no cursor.
- **Cópia do número do processo.** Um "C" ao lado de cada NUP na tela.
- **Tema herdado do SEI.** O painel veste as cores do seu órgão, inclusive no
  modo escuro.

## O que ela não faz

**Não assina, não envia, não tramita, não conclui e não exclui nada.** Essa é a
restrição central do projeto, não um detalhe: existe uma trava explícita em
[`core/guard.js`](src/content/core/guard.js) que bloqueia clique automático em
qualquer botão crítico, e um teste que a verifica.

**Nada sai da sua máquina.** Não há servidor, telemetria nem conta de usuário.
O histórico fica em `chrome.storage.local`, que não sincroniza. A extensão faz
uma única espécie de requisição — um `GET` de mesma origem ao seu próprio SEI,
para consultar o bloco de assinatura — e não pede `host_permissions`.

Essas garantias não são só promessa de texto: estão escritas como teste
executável em [`testes/privacidade.test.mjs`](testes/privacidade.test.mjs). A
suíte reprova se alguém abrir uma saída de rede nova, ler o campo de senha,
guardar URL do SEI ou pedir permissão a mais.

Detalhes em [`docs/privacidade.md`](docs/privacidade.md).

---

## Instalação (modo desenvolvedor)

1. Abra `chrome://extensions` (ou `edge://extensions`).
2. Ative **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha esta pasta.
4. Abra o SEI do seu órgão. O ícone da extensão fica ativo na barra.

Depois de editar arquivos, clique em **Atualizar** no card da extensão e
recarregue a aba do SEI.

## Apontando para o SEI do seu órgão

Cada órgão hospeda o SEI em um domínio próprio. Por padrão o `manifest.json`
casa com **qualquer host que tenha `/sei/` no caminho**, que é a instalação
padrão do sistema:

```json
"matches": ["*://*/sei/*"]
```

Isso funciona na maioria dos casos, mas é amplo. Quando você souber a URL
exata, troque nos **dois** blocos de `content_scripts`:

```json
"matches": ["https://sei.seuorgao.gov.br/*"]
```

Se o SEI do seu órgão não estiver sob `/sei/` (algumas instalações usam
`/sei/controlador.php` na raiz, outras um caminho customizado), o ajuste do
`matches` é obrigatório — só o `manifest.json` precisa mudar.

Há ainda uma segunda trava: mesmo que o `matches` case, o content script só
liga se `isSeiPage()` reconhecer marcadores do SEI na página
([env.js](src/content/core/env.js)). Assim a extensão não interfere em páginas
que por acaso tenham `/sei/` na URL.

---

## Estrutura

```
manifest.json                     declaração da extensão (MV3)
assets/icons/                     ícones gerados
src/
  shared/constantes.js            nomes de telas, frames e chaves de storage
  content/
    loader.js                     único script no manifest; carrega o ESM
    main.js                       bootstrap: detecta contexto e chama o registry
    core/
      env.js                      "onde estou?" — tela, frame, versão do SEI
      dom.js                      seletores robustos, espera, preenchimento
      ui.js                       toast, diálogo, painel, botão na barra
      hotkeys.js                  atalhos de teclado
      settings.js                 preferências (chrome.storage.sync)
      guard.js                    trava contra ações irreversíveis
      registry.js                 liga/desliga features conforme tela e config
      log.js                      log silencioso por padrão
    features/
      index.js                    catálogo — a lista de features
      historico/                   painel de assinaturas e envios
      inspetor/                   ferramenta de captura de estrutura da tela
  background/service-worker.js    instalação e canal de mensagens
  popup/                          liga/desliga rápido
  options/                        configuração completa
  styles/content.css              CSS injetado (tudo prefixado `seix-`)
docs/                             guias
testes/                           testes e validação estática (Node, sem deps)
package.json                      só os scripts de desenvolvimento
```

## Como funciona

1. O manifest injeta apenas [loader.js](src/content/loader.js) — em **todos os
   frames**, porque a tela do SEI é montada com iframes (`ifrArvore`,
   `ifrVisualizacao`, `ifrConteudoVisualizacao`…).
2. O loader faz `import()` dinâmico de [main.js](src/content/main.js). A partir
   daí todo o código é ESM de verdade, com `import`/`export`.
3. O `main.js` monta o **contexto**: qual tela, qual frame, qual versão.
4. O [registry](src/content/core/registry.js) percorre o catálogo de features e
   ativa só as que se aplicam àquela tela/frame e estão ligadas nas
   preferências.

Consequência prática: **adicionar uma funcionalidade nova não exige tocar no
`manifest.json`** — só criar a pasta da feature e adicionar uma linha em
[features/index.js](src/content/features/index.js).

### Identificação de tela

O HTML do SEI muda entre versões e instâncias, mas o parâmetro `acao` do
`controlador.php` é estável. É por ele que as features decidem onde rodam. O
mapa `acao → nome de tela` está em
[constantes.js](src/shared/constantes.js).

### Seletores

Prefira, nesta ordem: `data-*` → `name` → texto visível → estrutura relativa →
`id`. Evite classes de layout (`.infraTd`, etc.), que mudam com tema e versão.
Os helpers de [dom.js](src/content/core/dom.js) (`acharPorTexto`,
`acharBotaoComando`, `acharCampoPorRotulo`) já fazem isso com fallback.

---

## Regra de segurança

Nenhuma feature pode disparar sozinha uma ação que **assina, envia, tramita,
conclui, publica, anexa ou exclui** algo no SEI. Esses atos têm efeito jurídico
e são irreversíveis.

A trava está em [guard.js](src/content/core/guard.js): cliques programáticos
devem passar por `cliqueSeguro()`, que bloqueia alvos críticos e, quando a
feature pede explicitamente, exige confirmação do usuário em diálogo.

Automações permitidas: navegação, preenchimento de campos, filtros, ordenação,
marcadores, atalhos e mudanças visuais.

---

## Inspetor de tela

A feature `inspetor` (ligada por padrão) existe para apoiar o desenvolvimento.

Na tela do SEI, pressione **Ctrl+Shift+E**. Um painel abre com duas opções:

- **Copiar esta tela inteira** — copia o esqueleto do frame atual;
- **Escolher um elemento…** — o cursor vira mira; clique no trecho que
  interessa e só aquela subárvore é copiada. `Esc` cancela.

O que é copiado é a **estrutura**: tags, `id`, `name`, `class`, `data-*`,
`aria-*`, `onclick` (só o nome da função) e textos curtos de rótulo. Conteúdo
de processo, números longos e e-mails são substituídos por marcadores
(`[conteudo]`, `[numero]`, `[email]`) antes de ir para a área de transferência.

O mesmo conteúdo também é impresso no console (F12), caso a cópia falhe.

---

## Depuração

No console da página do SEI:

```js
localStorage.setItem('seix:debug', '1');  // liga os logs
localStorage.removeItem('seix:debug');    // desliga
```

Avisos e erros aparecem sempre; `debug`/`info` só com a flag ligada.

---

## Convenções

- Prefixo `seix-` em toda classe CSS, id e evento injetado na página, para não
  colidir com o CSS `infra*` do SEI.
- Código e comentários em português. Os módulos de `src/content/` usam
  comentários sem acento (ASCII); as páginas da extensão (`popup/`, `options/`)
  usam português completo.
- Módulos de feature **não podem ter efeito colateral no import** — o popup e a
  página de opções importam o catálogo só para ler metadados.

## Testes

Não há dependências: usa o runner nativo do Node (v18+).

```bash
npm run validar   # sintaxe, imports, manifest, web_accessible_resources, CSS
npm test          # testes de lógica (node --test)
npm run check     # os dois
```

`npm run validar` roda sem navegador e pega a classe de erro mais comum aqui:
import apontando para arquivo que não existe, caminho errado no
`manifest.json`, módulo fora de `web_accessible_resources` (que faria o
`import()` do loader falhar em silêncio).

`npm test` inclui dois testes que não são sobre lógica, e sim sobre não
regredir:

- **`referencias.test.mjs`** — acusa chamada a função que não existe. Duas
  vezes uma edição apagou uma função ainda em uso e só o navegador percebeu;
  `node --check` valida sintaxe, não referências.
- **`privacidade.test.mjs`** — quebra se alguém abrir uma saída de rede nova,
  pedir permissão a mais, gravar link do SEI ou reintroduzir a opção de ver
  eventos de outras pessoas. A regra de rede já mudou uma vez, e o arquivo
  registra o porquê: era "nenhuma chamada, nunca"; o alerta de bloco de
  assinatura exigiu perguntar ao SEI, então ela foi **estreitada** em vez de
  removida — uma porta só, só `GET`, só a mesma origem, sem corpo. Em alguns
  aspectos ficou mais forte: agora o método e a origem também são cobrados.

Os testes cobrem a lógica pura — elegibilidade de features, merge de
configurações, e a fusão de registros do histórico. O que depende de DOM real
do SEI não é testável fora do navegador; para isso, use o Inspetor.

## Funcionalidades

### Alerta de bloco de assinatura

Avisa quando entra bloco novo na assinatura da sua unidade, ou quando um bloco
que já estava lá muda de estado — sem você precisar abrir a tela. O aviso
aparece em três lugares: contador no ícone da extensão, tarja na página do SEI
e um marcador no menu **Blocos**, que ao expandir aparece em **Assinatura**.

**Só lê.** Nunca assina, devolve ou atribui bloco nenhum.

Enquanto houver uma aba do SEI aberta, a extensão pede a página do bloco a cada
N minutos (10 por padrão) e compara com a leitura anterior. Três detalhes que
não são óbvios:

- **A URL sai do próprio menu da página**, nunca é montada. As URLs do SEI
  carregam `infra_hash`, e uma URL com hash errado derruba a sessão.
- **A primeira leitura nunca alerta.** Instalar com quinze blocos parados não
  pode virar quinze avisos de "chegou agora". Mas "lista vazia já guardada" é
  diferente de "nunca olhei": no primeiro caso, um bloco novo *é* novidade.
- **O intervalo é contado pelo relógio, não por timer.** O content script morre
  a cada navegação e o SEI navega o tempo todo; sem o carimbo guardado, trocar
  de tela cinquenta vezes daria cinquenta consultas.

Blocos de outras unidades e blocos concluídos não geram alerta — o corte é
feito antes da comparação, não depois.

### Histórico de assinaturas e envios

Painel no Controle de Processos (**Ctrl+Shift+H**) com a linha do tempo do que
você assinou e dos processos que você enviou, inclusive de processos já
concluídos ou tramitados. Abas Tudo / Assinei / Enviei, busca, filtro por
período e exportação para CSV.

**É um caderno pessoal.** Esta funcionalidade não faz chamada de rede nenhuma,
não há `host_permissions`, e o histórico fica em `chrome.storage.local` — não
sincroniza, não sai da máquina. Isso
é verificado por [testes/privacidade.test.mjs](testes/privacidade.test.mjs), não
só prometido aqui.

O SEI não expõe índice de "o que eu assinei e enviei", então o histórico é
acumulado a partir de fontes passivas: o bloco `Documento assinado
eletronicamente por…` no corpo do documento, o link `acao=assinatura_listar` na
árvore, a tela de assinatura, a tela Consultar Andamento e a tela Enviar
Processo. Detalhes e limitações em [docs/historico.md](docs/historico.md).

### Inspetor de tela

Ferramenta de desenvolvimento. Ver a seção acima.

## Próximos passos

Ver [docs/como-adicionar-uma-feature.md](docs/como-adicionar-uma-feature.md).

## Licença

MIT — veja [LICENSE](LICENSE). Use, adapte e distribua à vontade,
inclusive em outros órgãos.

A extensão não tem vínculo com o SEI. É um projeto independente.
