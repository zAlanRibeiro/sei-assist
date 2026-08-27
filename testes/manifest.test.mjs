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

test('os content scripts casam com o SEI de qualquer órgão', () => {
  // Cada órgão hospeda o SEI no próprio domínio; o que é comum é o caminho.
  for (const script of manifest.content_scripts) {
    for (const padrao of script.matches) {
      assert.ok(PADRAO_CONTENT.test(padrao), `padrão inválido: ${padrao}`);
      assert.ok(padrao.includes('/sei/'), `${padrao} casaria com site que não é SEI`);
    }
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
  for (const necessario of ['src/content/main.js', 'src/content/core/*.js', 'src/shared/*.js']) {
    const coberto = expostos.some((padrao) => {
      if (padrao === necessario) return true;
      const regex = new RegExp(`^${padrao.split('*').map((p) => p.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')}$`);
      return regex.test(necessario) || expostos.includes(necessario);
    });
    assert.ok(coberto, `não exposto em web_accessible_resources: ${necessario}`);
  }
});
