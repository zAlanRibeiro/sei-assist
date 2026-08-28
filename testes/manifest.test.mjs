/**
 * Testes do manifest.
 *
 * O manifest é o único arquivo cujo erro impede a extensão de carregar por
 * inteiro — não falha uma funcionalidade, falha tudo, e o Chrome só diz o que
 * está errado na hora de instalar.
 *
 * Cada teste aqui corresponde a um erro que já aconteceu ou que a loja recusa.
 * O `node --check` não ajuda: JSON válido pode ser manifest inválido.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(RAIZ, 'manifest.json'), 'utf8'));

/**
 * Padrão de correspondência aceito em `web_accessible_resources`.
 *
 * Esquema e host podem ser curinga; o caminho tem de ser exatamente `/*`.
 */
const PADRAO_WAR = /^[a-z*]+:\/\/[^/]+\/\*$/;

/** Padrão de content script: aceita caminho, ao contrário do de cima. */
const PADRAO_CONTENT = /^[a-z*]+:\/\/[^/]+\/.*$/;

test('web_accessible_resources usa padrão com caminho /*', () => {
  // Defeito real: restringi para "*://*/sei/*" achando que apertava a
  // segurança, e o Chrome recusou o manifest inteiro com "Invalid match
  // pattern". A extensão parou de carregar.
  //
  // Não é possível restringir esse campo por caminho. Quem quiser esconder os
  // arquivos da extensão de outros sites usa `use_dynamic_url`, não o padrão.
  for (const recurso of manifest.web_accessible_resources) {
    for (const padrao of recurso.matches) {
      assert.ok(
        PADRAO_WAR.test(padrao),
        `"${padrao}" não é aceito aqui: o caminho precisa ser /*`,
      );
    }
  }
});

test('os content scripts apontam para o controlador do SEI', () => {
  // "/sei/" sozinho casava com qualquer site que tivesse isso no caminho -
  // https://loja.exemplo.com/sei/produto entrava. A assinatura de verdade do
  // SEI e o controlador: toda tela do sistema passa por ele.
  //
  // O "*" no fim cobre a query (?acao=...). O padrao NAO exige nada dentro
  // dela de proposito: se o Chrome casar so o caminho, o "*" casa vazio e o
  // padrao continua valendo. Assim a precisao nao depende de um detalhe de
  // implementacao do navegador.
  for (const script of manifest.content_scripts) {
    for (const padrao of script.matches) {
      assert.ok(PADRAO_CONTENT.test(padrao), `padrão inválido: ${padrao}`);
      assert.ok(
        padrao.includes('/sei/controlador.php'),
        `${padrao} casaria com site que não é SEI`,
      );
    }
  }
});

test('nenhum padrão recorta o SEI por domínio', () => {
  // TENTACAO REGISTRADA: o SEI++ usa "*://*.br/*" e isso parece apertar a
  // seguranca de graca. Nao e de graca. SEI em intranet de orgao existe -
  // http://sei.orgao.local/sei/, ou direto num IP - e nenhum desses casa com
  // *.br. Em web_accessible_resources isso seria fatal: o import() dos
  // modulos falharia e a extensao inteira nao subiria, exatamente como no
  // episodio do use_dynamic_url.
  //
  // Pior: quem desenvolve aqui esta num SEI .br, entao o defeito passaria
  // batido no unico ambiente onde da para testar.
  const todos = [
    ...manifest.content_scripts.flatMap((c) => c.matches),
    ...manifest.web_accessible_resources.flatMap((r) => r.matches),
  ];

  for (const padrao of todos) {
    const host = padrao.split('://')[1].split('/')[0];
    assert.equal(host, '*', `${padrao} exclui quem hospeda o SEI fora desse domínio`);
  }
});

test('todo arquivo citado no manifest existe', () => {
  // Caminho errado aqui vira erro de carregamento, não aviso.
  const citados = [
    ...manifest.content_scripts.flatMap((c) => [...(c.js || []), ...(c.css || [])]),
    manifest.background.service_worker,
    manifest.options_ui.page,
    manifest.action.default_popup,
    ...Object.values(manifest.icons),
    ...Object.values(manifest.action.default_icon),
  ];

  for (const arquivo of citados) {
    assert.ok(fs.existsSync(path.join(RAIZ, arquivo)), `citado no manifest e ausente: ${arquivo}`);
  }
});

test('as permissões continuam sendo só duas', () => {
  // Permissão a mais é pergunta a mais na revisão da loja, e a extensão não
  // precisa de nenhuma além destas.
  assert.deepEqual(manifest.permissions.sort(), ['activeTab', 'storage']);
  assert.equal(manifest.host_permissions, undefined);
});

test('a versão está no formato que a loja aceita', () => {
  assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
});

test('o manifest é da versão 3', () => {
  // MV2 deixou de ser aceito na Chrome Web Store.
  assert.equal(manifest.manifest_version, 3);
});

test('os recursos expostos cobrem o que o carregador importa', () => {
  // O loader.js importa os módulos por URL da extensão; se um caminho não
  // estiver exposto, a importação falha em tempo de execução — e só naquele
  // ponto, o que é difícil de rastrear.
  const expostos = manifest.web_accessible_resources.flatMap((r) => r.resources);
  // features/ entra na lista porque o main.js importa cada uma delas: a
  // ausência só apareceria em tempo de execução, e só naquela tela.
  const NECESSARIOS = [
    'src/content/main.js',
    'src/content/core/*.js',
    'src/content/features/*.js',
    'src/content/features/*/*.js',
    'src/shared/*.js',
  ];
  for (const necessario of NECESSARIOS) {
    const coberto = expostos.some((padrao) => {
      if (padrao === necessario) return true;
      const regex = new RegExp(`^${padrao.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
      return regex.test(necessario) || expostos.includes(necessario);
    });
    assert.ok(coberto, `não exposto em web_accessible_resources: ${necessario}`);
  }
});

/* ------------------------------------------------ impressão digital */

/**
 * TENTADO E REVERTIDO: use_dynamic_url nao funciona nesta extensao.
 *
 * O problema e real: com URL estatica, qualquer site pode pedir
 * chrome-extension://<id>/src/content/core/dom.js e ver se responde - e, com
 * o id fixo de uma extensao publicada, descobrir que a pessoa usa SEI.
 *
 * `use_dynamic_url: true` seria a resposta certa, e o Chrome ate devolve a URL
 * dinamica em getURL(). Mas o import() dinamico dela falha:
 *
 *   TypeError: Failed to fetch dynamically imported module:
 *   chrome-extension://1caf7289-.../src/content/main.js
 *
 * Ou seja: getURL() entrega a URL com o GUID de sessao, e o fetch do modulo
 * nao passa. O carregamento inteiro da extensao depende desse import (ver
 * loader.js), entao a extensao simplesmente nao sobe.
 *
 * A saida de verdade seria nao precisar de web_accessible_resources: um unico
 * arquivo empacotado em content_scripts, sem import() em tempo de execucao.
 * Isso exige um passo de build que o projeto nao tem.
 *
 * Se alguem tentar de novo: teste NO NAVEGADOR antes de commitar.
 */

test('não expomos o que ninguém carrega em tempo de execução', () => {
  // Todo caminho exposto é um alvo de sondagem a mais. Os ícones vêm de
  // `icons` e `action.default_icon`, que o Chrome lê sozinho — expô-los em
  // web_accessible_resources não servia para nada.
  const expostos = manifest.web_accessible_resources.flatMap((r) => r.resources);
  assert.equal(
    expostos.some((r) => r.startsWith('assets/')),
    false,
    'assets/ não é carregado por nenhum script; expor só aumenta a superfície',
  );
});
