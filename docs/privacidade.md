# Política de Privacidade — SEI Assist

**Última atualização:** 27 de agosto de 2026
**Versão da extensão:** 1.0.0

## Resumo

O SEI Assist não coleta, não transmite e não vende dados. Não há servidor, não
há analytics, não há conta de usuário. Tudo que a extensão guarda fica no seu
próprio navegador, nesta máquina, e some quando você desinstala.

O único tráfego de rede que ela gera é uma leitura do **seu próprio SEI**, na
mesma origem da página que você já está usando, com a sua sessão — a mesma
requisição que aconteceria se você abrisse aquela tela.

## O que fica guardado

Tudo em `chrome.storage.local` — o armazenamento local da extensão, que **não**
sincroniza entre dispositivos.

| O quê | Para quê | Por quanto tempo |
| --- | --- | --- |
| Histórico de atos seus (assinou, enviou, criou) | Montar o painel de histórico | Até você apagar; favoritos ficam até você desmarcar |
| Rascunho do editor (nunca de documento restrito) | Recuperar texto se a sessão do SEI expirar | 3 dias, ou até salvar o documento |
| Estado do bloco de assinatura | Saber o que é novidade desde a última olhada | Substituído a cada consulta |
| Preferências | Atalhos, intervalos, o que está ligado | Até você desinstalar |

### O histórico

Guarda **apenas atos seus**: número do documento, número do processo, tipo,
unidade, cargo, data e hora. O corte é feito na captura, não na exibição — ato
de colega no mesmo processo não chega a ser gravado.

Não há e nunca houve opção de ver o histórico de outra pessoa.

### O rascunho do editor

É a única parte que guarda **conteúdo de documento**. Ela existe porque a sessão
do SEI expira em silêncio e leva junto o texto que você estava escrevendo.

Limites deliberados: fica só no armazenamento local, expira em 3 dias, é apagado
assim que o documento é salvo, guarda no máximo 20 rascunhos, e pode ser
desligado por inteiro nas opções.

**Documento restrito ou sigiloso não vira rascunho.** O armazenamento local não
é cifrado, e o conteúdo desses documentos é justamente o que não deveria ficar
em disco. Quando a extensão identifica o nível de acesso como restrito ou
sigiloso, ela não guarda nada e avisa na tela — em vez de falhar em silêncio.

A extensão descobre o nível na **árvore do processo**, na janela que abriu o
editor: o SEI marca ali o documento de acesso fechado, e a ausência dessa marca
num documento que está na árvore significa que ele é público.

Quando ela **não consegue identificar** o nível, o comportamento padrão é
guardar, e a opção *"Só guardar rascunho quando o documento for público"* muda
isso para não guardar. O padrão é esse porque a leitura do nível ainda não foi
confirmada contra todas as telas do SEI: recusar tudo que não é reconhecido
desligaria a recuperação de rascunho para quem depende dela. Quem prefere o
lado seguro liga a opção.

### O que NUNCA é lido ou guardado

- **Sua senha.** O campo aparece nos seletores da extensão apenas documentado
  como algo a ignorar. Há teste automatizado que reprova se alguém tentar lê-lo.
- **Links do SEI.** As URLs do SEI carregam um `infra_hash` de sessão; guardá-las
  não serviria para nada e criaria risco. Há teste que reprova a gravação de URL.
- **Dados de outras pessoas.**
- **Qualquer coisa fora de páginas do SEI.**

## Rede

A extensão faz **um** tipo de requisição, e apenas se o alerta de bloco de
assinatura estiver ligado: um `GET` para a página "Blocos de Assinatura" do SEI
em que você já está logado, para comparar com a leitura anterior e avisar o que
mudou.

Restrições verificadas por teste automatizado:

- só um arquivo do projeto pode fazer requisição (`src/content/core/rede.js`);
- só o método `GET` — nunca `POST`, `PUT`, `PATCH` ou `DELETE`;
- só a **mesma origem** da página aberta; outro domínio é recusado antes de sair
  da máquina;
- sem corpo na requisição;
- `XMLHttpRequest`, `sendBeacon`, WebSocket e EventSource são proibidos em todo
  o projeto.

Nada é enviado a servidor de terceiros. Nenhum dado sai da sua máquina.

## Permissões, e por que cada uma

- **`storage`** — guardar o histórico e as preferências localmente. É o que
  torna a extensão útil entre uma sessão e outra.
- **`activeTab`** — agir na aba do SEI que você está usando.

A extensão **não pede `host_permissions`**. Ela funciona apenas nas páginas em
que já está rodando.

## Ações no SEI

A extensão **não assina, não envia, não conclui e não exclui nada**. Ela lê a
tela, organiza informação e preenche campos quando você pede.

Existe uma trava explícita no código (`src/content/core/guard.js`) que bloqueia
qualquer clique automático em botões de assinar, enviar, tramitar, concluir ou
excluir. Isso é verificado por teste.

## Código aberto

O código-fonte está disponível e as garantias acima não são apenas promessas de
texto: elas estão escritas como testes executáveis em
`testes/privacidade.test.mjs`. Rodando `npm test`, a suíte reprova se alguém
adicionar uma saída de rede nova, ler o campo de senha, guardar URL do SEI ou
pedir permissão a mais.

## Contato

Dúvidas ou problemas: abra uma issue no repositório do projeto.

## Mudanças nesta política

Se a extensão passar a guardar ou transmitir algo diferente, esta página muda
antes da versão ser publicada, e a mudança fica registrada no histórico do
repositório.
