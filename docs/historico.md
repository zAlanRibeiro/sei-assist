# Histórico de assinaturas e envios

Painel no **Controle de Processos** com a linha do tempo do que você assinou e
dos processos que você enviou — inclusive de processos que já saíram da sua
lista, por terem sido concluídos ou tramitados.

Abrir: botão **Histórico** na barra de comandos, ou **Ctrl+Shift+H**.

Cinco abas: **Tudo**, **Assinados**, **Enviados**, **Proc. criados** e
**Doc. criados**. Na aba Tudo cada linha traz uma etiqueta e uma faixa colorida
à esquerda:

| Etiqueta | Cor | Evento |
| --- | --- | --- |
| `ASSINADO` | verde | você assinou um documento |
| `ENVIADO` | azul | você tramitou um processo |
| `PROC. CRIADO` | roxo | você abriu um processo |
| `DOC. CRIADO` | laranja | você gerou um documento |

Cada assinatura mostra o documento **e o processo em que ele está**. Se o
processo aparecer como *desconhecido*, é porque o corpo do documento não trazia
o número e a extensão não conseguiu lê-lo na árvore; reabrir o processo
costuma resolver.

---

## Privacidade

Isto é um caderno pessoal, não um sistema de controle. O desenho segue disso:

- **Só aparece o que é seu.** Não existe controle para ver evento de outra
  pessoa — nem escondido, nem em opção avançada.
- **Evento de colega não é sequer gravado.** O corte é na captura, não na
  exibição: quando a extensão lê o corpo de um documento ou o andamento de um
  processo, ela vê atos de várias pessoas e descarta tudo que não é seu, antes
  de escrever no disco.
- **Nada sai da máquina.** O histórico não faz chamada de rede nenhuma.
  Desde o alerta de bloco de assinatura a extensão passou a ter *uma* porta
  de rede ([`core/rede.js`](../src/content/core/rede.js)), e ela é estreita:
  só `GET`, só para a mesma origem do SEI em que você já está, sem corpo na
  requisição. É a mesma leitura que você faria abrindo a tela. `XMLHttpRequest`,
  `sendBeacon`, WebSocket e EventSource continuam proibidos em todo o projeto.
- **O manifest não pede acesso a host nenhum.** Só `storage` e `activeTab`.
- **O histórico fica em `chrome.storage.local`** — nesta máquina, neste perfil.
  Não sincroniza. (O `storage.sync` guarda só preferências: atalho, quais
  funcionalidades estão ligadas.)
- **O campo de senha nunca é lido.** Aparece em `seletores.js` só para
  documentar o que é ignorado.

Isso não está só escrito aqui: está em
[`testes/privacidade.test.mjs`](../testes/privacidade.test.mjs). Se alguém
abrir uma saída de rede nova, tirar o `GET` ou a checagem de origem da porta
existente, pedir permissão a mais, trocar `local` por `sync`,
fizer a captura clicar em algo ou reintroduzir a opção de ver os outros, a
suíte quebra. Rode com `npm test`.

### A extensão precisa saber quem é você

Sem isso ela não consegue separar o que é seu — e, na dúvida, **não grava**.

As duas identidades vêm de graça da barra do topo do SEI 5:

```html
<a id="lnkUsuarioSistema"
   title="Alan Doyle Costa Ribeiro (alan.ribeiro@orgao.gov.br/NITEROI)">
```

O nome (que a assinatura usa) e o login (que o andamento usa) estão ali, no
mesmo atributo. As opções `nomeUsuario` e `loginUsuario` existem só como saída
de emergência, para instalações que montem essa barra de outro jeito.

Enquanto não souber quem é você, o painel avisa em vez de fingir que está tudo
certo, e registra apenas o que você assinar, enviar ou criar com a extensão
instalada.

### Limpeza do que foi coletado antes

Quem usou a extensão antes desta mudança pode ter evento de colega guardado.
Duas coisas cuidam disso, sozinhas:

- a migração **v3** apaga registro sem autor — o que veio da árvore e não pode
  ser atribuído a ninguém;
- assim que a identidade fica conhecida, a extensão apaga os registros de
  outras pessoas.

O que **nunca** é apagado por essa limpeza é o que veio do seu próprio ato
(tela de assinatura e tela de envio). Assim, um erro de digitação nas opções
não destrói justamente o que você fez.

---

## Por que o histórico precisa ser construído

O SEI não tem uma tela de "o que eu assinei e enviei". O Controle de Processos
lista só o que está aberto na sua unidade agora — processo concluído ou
tramitado desaparece dali. E não existe, na interface, índice consultável por
usuário.

Então este histórico não é *lido* do SEI: ele é *acumulado* pela extensão a
partir do que dá para observar enquanto você usa o sistema. Consequência que
vale deixar explícita: **o histórico começa vazio**, e enche conforme você
trabalha ou abre processos antigos.

---

## Assinaturas — três fontes

### 1. Bloco impresso no corpo do documento ← a mais rica

Todo documento assinado carrega, no próprio HTML:

> Documento assinado eletronicamente por **Alan Doyle Costa Ribeiro**,
> Estagiário, em 02/07/2026, às 16:59, conforme art. 1º, III, "b", da Lei
> 11.419/2006.

e, junto ao QR Code, `informando o código verificador 00009400`.

Entrega **tudo**: nome, cargo, data e hora exatas, número do documento. E
funciona em qualquer documento antigo que você abrir — é a única fonte
verdadeiramente retroativa para assinaturas.

É texto, não ícone nem classe CSS: sobrevive a troca de tema e de versão.
Documento com várias assinaturas gera um registro por assinatura.

Não funciona em PDF anexado, que não é HTML gerado pelo SEI.

### 2. Árvore de documentos

Documento assinado ganha, na árvore, um link para a tela de assinaturas:

```
controlador.php?acao=assinatura_listar&...&id_documento=11965&arvore=1
```

A presença desse link prova que está assinado, e o `href` entrega de graça o
`id_documento` — a chave que junta as fontes. Detectar por link é bem mais
robusto que por nome de arquivo de ícone: é função, não estilo.

**Esta fonte não cria registro.** A árvore não diz quem assinou, e um histórico
pessoal não pode guardar evento que talvez seja de outra pessoa. Ela só
*completa e confirma* o que já é seu: o número, o tipo e a prova de que a
assinatura foi aceita.

### 3. Tela de assinatura

Pega o ato no momento em que acontece, com o seu nome e o cargo escolhido.

O campo **Assinante** dessa tela vem preenchido pelo SEI com o nome de quem
está logado — é de lá que sai a sua identificação, já que a barra superior do
seu órgão mostra só a unidade (`NIT/NITTRANS/DIVEST`).

---

## Envios e criações — duas fontes

### A. Consultar Andamento ← a retroativa

O andamento é o histórico oficial do processo. Cada linha traz data/hora,
unidade, usuário e a descrição:

```
02/07/2026 16:59 | NIT/NITTRANS/DIVEST | alan.ribeiro@nittrans.niteroi.rj.gov.br |
Processo remetido pela unidade NIT/NITTRANS/DIVEST
```

Para envios **e criações**, é o que o bloco de assinatura é para assinaturas:
retroativo e autoritativo, com data carimbada pelo SEI. Cada padrão de texto
reconhecido vira um tipo de evento — adicionar um tipo novo é, quase sempre,
acrescentar uma linha em `ANDAMENTO.padroes`.

Detalhe que importa: *"remetido pela unidade X"* diz de **onde saiu**, não para
onde foi. O destino vem da entrada *"recebido na unidade Y"* de mesmo horário —
o parser casa as duas. Se a unidade destino ainda não abriu o processo, o
destino fica vazio.

O parser não depende da ordem das colunas: para cada linha ele procura a célula
que parece data/hora e a que casa com um padrão conhecido.

### C. Tela "Iniciar Processo"

Captura no clique em Salvar. Como o SEI só atribui o NUP na tela seguinte, o
ato passa pela fila descrita adiante, em duas etapas.

### D. Tela "Gerar Documento"

Mesma forma da criação de processo: o SEI só atribui o número do documento
depois de salvar. O ato fica pendente e é fechado na tela seguinte, que traz
`id_documento` na URL — o editor do documento novo.

Esta tela roda **dentro do frame `ifrVisualizacao`**, então o número do
processo vem do campo oculto `#hdnIdProcedimento` ou do frame de cima, nunca da
URL da própria tela.

### B. Tela "Enviar Processo"

Pega o ato no momento, com certeza de que foi você — o andamento identifica por
login (que neste órgão é o **e-mail institucional**), esta fonte identifica por
nome completo.

Igual à de assinatura: **passiva**. Nunca clica em Enviar, nunca submete o
formulário, nunca chama `preventDefault`. Se o envio falhar, o andamento
simplesmente não confirma, e o registro fica marcado como não confirmado.

---

## Por que o ato é enfileirado antes de virar registro

Confirmar uma assinatura, um envio ou uma criação **navega a página no mesmo
instante**. `chrome.storage` é assíncrono e não vence essa corrida: a extensão
capturava o ato e ele se perdia antes de chegar ao disco.

Por isso o ato é gravado de forma **síncrona** em `sessionStorage` — quando a
função retorna, o dado já está lá, aconteça o que acontecer com a página — e só
vira registro no carregamento seguinte, sem pressa.

`sessionStorage` também é o escopo certo: vive na aba (o ato e a tela seguinte
são a mesma aba) e some quando ela fecha.

A criação de processo usa o mesmo mecanismo com um passo a mais, porque o SEI
só atribui o NUP na tela seguinte:

1. no clique em Salvar, o ato é guardado sem número;
2. na primeira tela em que um NUP aparecer, a pendência é fechada e vira
   registro.

Janela de 2 minutos, apagada assim que resolve — do contrário, criar um
processo e sair navegando faria a criação grudar no processo errado.

## Como as fontes se juntam

| Evento | Chave | Quando falta |
| --- | --- | --- |
| assinatura | `id_documento` | busca pelo número visível do documento |
| envio | processo + minuto | reaproveita registro do mesmo processo até 2 min de distância |

Ninguém envia o mesmo processo duas vezes no mesmo minuto — é o que torna essa
chave segura.

Na fusão, o dado mais específico ganha e nada regride: `confirmado` só vai de
não para sim, e a data carimbada pelo SEI (documento ou andamento) vence
qualquer estimativa.

---

## Limitações — leia antes de confiar no painel

1. **Não é retroativo sozinho.** Só entra o que você abrir. Não há varredura
   automática do seu passado no SEI, e não vai haver: isso significaria dezenas
   de requisições ao servidor do órgão a cada carga de tela.
2. **PDF anexado** entra só pela árvore — sem autor e com data aproximada.
3. **Envio antigo só aparece se você abrir "Consultar Andamento"** daquele
   processo.
4. **Sem identidade, as fontes retroativas não gravam.** A assinatura
   identifica por nome completo; o andamento, pelo login (aqui, o e-mail
   institucional). O nome é aprendido sozinho na tela de assinatura; o login
   você preenche nas opções.
5. **Só neste navegador.** Teto de 5.000 registros; passando disso, os mais
   antigos são descartados.
6. **Assinatura em bloco** e a tela **Enviar Processo** ainda não foram
   validadas contra o HTML real — seletores marcados `CONFIRMAR`.
7. **As abas de criação dependem do texto do andamento** para o histórico
   retroativo. Reconheço
   `Processo … gerado` e `Documento … gerado`, nas duas ordens de palavra, mas
   ainda não vi o texto real do seu órgão. Se essas abas vierem vazias mesmo
   depois de abrir o Consultar Andamento, é `ANDAMENTO.padroes` que precisa de
   ajuste — e uma captura da tela resolve.
8. **O botão fica flutuando** no canto inferior direito, porque a barra de
   comandos do Controle de Processos ainda não foi identificada.

---

## Opções

| Opção | Padrão | Para quê |
| --- | --- | --- |
| `atalho` | `Ctrl+Shift+H` | abre e fecha o painel |
| `nomeUsuario` | vazio | seu nome, se não for detectado |
| `loginUsuario` | vazio | seu login no SEI — o e-mail institucional |
| `periodoPadrao` | `30` | `7`, `30` ou `tudo` |
| `varrerAoAbrirProcesso` | ligado | desligue para não coletar nada |

## Por que não há link para o SEI

O painel mostra o número do documento e o do processo como **botões que
copiam**, não como links. Isso é deliberado.

Todo link do SEI carrega um `infra_hash` — um selo que o servidor valida. Sem
ele o SEI recusa o acesso com "link não assinado" e chega a encerrar a sessão.
Com ele, o link só vale enquanto aquela sessão viver: guardado no histórico,
vira um link quebrado e um pedaço de sessão parado no disco.

Não existe URL estável para um documento do SEI. Então guardamos
identificadores (número, `id_documento`, `id_procedimento`) e você copia o
número para colar na pesquisa do SEI.

Quem já tinha links gravados: a migração v1→v2 os apaga sozinha na primeira
leitura do histórico.

## Exportação

**Exportar CSV** baixa o que estiver visível no filtro atual, com BOM e
separador `;` — o formato que o Excel em português abre sem configuração.

## O que já foi confirmado contra o SEI real

Validado em `leste.sei.rj.gov.br`, **SEI 5.0.4**:

| Coisa | Como é de verdade |
| --- | --- |
| Botão Salvar | `<button id="btnSalvar" type="button" onclick="confirmarDados()">` — **não** é submit |
| Texto do botão | a letra do atalho fica num `<span>`: `<span>S</span>alvar` → `textContent` é `"S alvar"` |
| Formulário de criação | `<form id="frmProcedimentoCadastro">` — pelo `id`, não pelo `name` |
| Identidade | `#lnkUsuarioSistema[title]` traz nome e login juntos |
| Unidade | `<a id="lnkInfraUnidade">NIT/NITTRANS/DIVEST</a>` |
| Versão | no `title` da imagem do logo, não no texto da página |
| Barra de comandos | **duplicada** no topo e no rodapé, com os mesmos `id` — dois `<button id="btnSalvar">` na mesma página |
| Gerar documento | `<form id="frmDocumentoCadastro">` dentro do frame `ifrVisualizacao`; tipo em `<label id="lblSerieTitulo">` |
| Documento assinado | link `acao=assinatura_listar` na árvore |
| Assinatura no documento | `Documento assinado eletronicamente por …, em …, às …` |

Dois detalhes merecem destaque, porque cada um custou um ciclo de depuração:

**O `<span>` do atalho** quebra qualquer busca de botão por texto no SEI.
`acharPorTexto()` compara também sem espaço nenhum por causa disso — ver
`textoCasa()` em [`core/dom.js`](../src/content/core/dom.js).

**A barra de comandos duplicada** faz `querySelector('#btnSalvar')` devolver
apenas a cópia do topo. Clicar no botão do rodapé passava despercebido. Por
isso a captura escuta o clique **delegado no documento** e decide no momento em
que ele acontece — ver `ehBotaoDeConfirmacao()` em
[`captura.js`](../src/content/features/historico/captura.js).

## Quando algo parar de funcionar

Todo seletor frágil está em
[`seletores.js`](../src/content/features/historico/seletores.js), em listas de
candidatos testadas em ordem. Os marcados `CONFIRMAR` ainda não foram vistos no
HTML real.

### Lendo o rastro de uma criação de processo

Com `localStorage.setItem('seix:debug', '1')`, a sequência esperada é:

```
captura de criacao de processo armada (formulario: frmProcedimentoCadastro; clique: delegado no documento)
confirmacao de criacao de processo detectada em btnSalvar
criacao pendente guardada, aguardando o numero do processo
criacao de processo registrada: NIT-050131/003592/2026
```

Onde a sequência parar aponta o defeito: sem a primeira linha, a feature não
roda naquela tela; sem a segunda, o clique não chega ao ouvinte; sem a quarta,
o NUP não foi encontrado na tela seguinte.

**Cuidado com `sessionStorage.getItem('seix:criacao-pendente')`**: ele devolve
`null` tanto quando nada foi capturado quanto quando a captura funcionou e a
pendência já foi consumida. Não serve para diagnosticar — use o log.

### Avisos

Ligue o log com `localStorage.setItem('seix:debug', '1')` e procure avisos como
`formulario de envio nao encontrado`. Depois use o Inspetor (**Ctrl+Shift+E**)
na tela correspondente e corrija a lista.

> A pasta é `historico/`, mas o `id` da feature continua
> `historico-assinaturas`: ele é a chave no storage, e mudá-lo apagaria as
> preferências já salvas.
