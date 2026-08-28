/**
 * andamento.js - reexportacao.
 *
 * O parser mudou para core/andamento.js quando a trajetoria passou a
 * precisar dele tambem. Este arquivo continua existindo porque captura.js e
 * os testes o importam daqui, e mover import nao melhora nada por si so.
 */
export { ANDAMENTO, lerLinha, lerAndamentos, extrairCriacoes, extrairEnvios } from '../../core/andamento.js';
