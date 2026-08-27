# Publicar na Chrome Web Store

Roteiro do que a loja pede e do que responder. O pacote sai de
`npm run empacotar`.

## Antes de enviar

- [ ] `npm run check` passando
- [ ] Versão do `manifest.json` maior que a publicada (a loja recusa reenvio com
      a mesma versão)
- [ ] `docs/privacidade.md` publicado numa **URL pública** (ver abaixo)
- [ ] Capturas de tela prontas (1280×800 ou 640×400, no mínimo uma)
- [ ] Ícone de 128×128 — já existe em `assets/icons/icon128.png`

## A URL da política de privacidade

A loja exige um endereço público, não um arquivo. O caminho mais barato é o
GitHub: suba o repositório e ative o GitHub Pages, ou simplesmente use o link
direto do arquivo renderizado:

```
https://github.com/<usuário>/<repo>/blob/main/docs/privacidade.md
```

Isso é aceito. Um Gist público também serve.

## Ficha da loja

**Nome:** SEI Assist

**Descrição curta** (132 caracteres):

> Histórico do que você assinou e enviou no SEI, alerta de bloco de assinatura,
> rascunho no editor e cópia rápida do processo.

**Categoria:** Ferramentas (Workflow & Planning)

**Idioma:** Português (Brasil)

**Descrição longa** — o texto do `README.md` serve de base. Vale abrir dizendo o
que ela NÃO faz, porque é a primeira dúvida de quem trabalha com processo
eletrônico: *"Não assina, não envia e não conclui nada. Só lê, organiza e
preenche."*

## Declaração de finalidade única

A loja exige uma finalidade única. A nossa:

> Auxiliar quem usa o SEI (Sistema Eletrônico de Informações) a acompanhar os
> próprios atos e a navegar pelo sistema, sem executar ações em nome do usuário.

## Justificativa de cada permissão

O formulário pede uma frase por permissão. Estas respondem ao que é perguntado:

**`storage`**
> Guarda localmente o histórico dos atos do próprio usuário, o rascunho do
> editor e as preferências. Nada é transmitido.

**`activeTab`**
> Permite agir na aba do SEI que o usuário está usando no momento.

**Host permissions**
> Nenhuma é solicitada.

**Padrão de correspondência `*://*/sei/*`**
> Cada órgão hospeda o SEI no próprio domínio (sei.orgao.gov.br,
> processo.orgao.gov.br etc.). Não existe um domínio único, então o padrão
> precisa cobrir o caminho `/sei/` em qualquer host. A extensão verifica se a
> página é realmente o SEI antes de agir.

Essa última costuma ser a pergunta do revisor. Vale responder antes de ser
perguntado.

## Declaração de uso de dados

No formulário "Privacy practices", marque:

| Item | Resposta |
| --- | --- |
| Personally identifiable information | **Não** |
| Health information | Não |
| Financial and payment information | Não |
| Authentication information | **Não** — a senha nunca é lida |
| Personal communications | Não |
| Location | Não |
| Web history | Não |
| User activity | Não |
| Website content | **Sim** — o rascunho do editor guarda o texto do documento |

E as três declarações obrigatórias:

- [x] Não vendo nem transfiro dados a terceiros
- [x] Não uso nem transfiro dados para fins alheios à funcionalidade
- [x] Não uso nem transfiro dados para avaliar crédito ou emprestar dinheiro

O "Sim" em *Website content* é o único que exige atenção: é o rascunho, ele fica
só na máquina do usuário, e a política de privacidade explica os limites (3 dias,
apagado ao salvar, desligável).

## O que esperar da revisão

O padrão amplo (`*://*/sei/*`) e o "Sim" em conteúdo de site costumam gerar
pedido de esclarecimento. As respostas acima cobrem os dois. A revisão leva de
alguns dias a duas semanas.

Se pedirem justificativa adicional, o argumento mais forte é que a extensão não
tem `host_permissions`, não faz requisição a terceiros, e as garantias são
verificáveis: o código é aberto e `testes/privacidade.test.mjs` transforma cada
uma delas em teste executável.

## Depois de publicada

Cada correção exige subir a versão no `manifest.json` e reenviar. Atualizações
costumam ser revisadas mais rápido que o primeiro envio.
