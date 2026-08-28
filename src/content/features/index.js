/**
 * Catalogo de features.
 *
 * Para adicionar uma funcionalidade nova:
 *   1. crie src/content/features/<nome>/index.js exportando o objeto da feature;
 *   2. importe e adicione na lista abaixo.
 *
 * Nao e preciso mexer no manifest.json. A ordem da lista e a ordem de carga.
 *
 * Importante: estes modulos nao podem ter efeito colateral no import - o
 * popup e a pagina de opcoes importam este arquivo so para ler os metadados.
 */
import inspetor from './inspetor/index.js';
import historicoAssinaturas from './historico/index.js';
import marca from './marca/index.js';
import blocoAssinatura from './bloco/index.js';
import copiarNumero from './copiar/index.js';
import editor from './editor/index.js';
import trajetoria from './trajetoria/index.js';
import trocarUnidade from './unidade/index.js';

export default [
  historicoAssinaturas,
  blocoAssinatura,
  copiarNumero,
  editor,
  trajetoria,
  trocarUnidade,
  marca,
  inspetor,
];
