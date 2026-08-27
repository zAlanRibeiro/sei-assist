/**
 * sessao.js - quem esta logado e em qual unidade.
 *
 * Serve para o filtro "so as minhas". Ordem de confianca:
 *
 *  1. o que estiver configurado a mao nas opcoes (sempre vence);
 *  2. o title do link do usuario na barra do topo, que no SEI 5 traz nome E
 *     login de uma vez: "Alan Doyle Costa Ribeiro (alan.ribeiro@x.gov.br/NITEROI)";
 *  3. o campo "Assinante" da tela de assinatura.
 *
 * O passo 2 costuma bastar, entao as opcoes de nome e login existem so como
 * saida de emergencia para instalacoes que montem essa barra de outro jeito.
 */
import { primeiro, ASSINATURA, SESSAO } from './seletores.js';
import { norm } from '../../core/dom.js';
import { prepararIdentidades } from './identidade.js';
import { log } from '../../core/log.js';

/** Descarta o que claramente nao e nome de pessoa. */
function pareceNome(texto) {
  if (!texto) return false;
  const limpo = texto.trim();
  if (limpo.length < 3 || limpo.length > 80) return false;
  if (!/[a-zA-ZÀ-ÿ]{3}/.test(limpo)) return false;
  // "NIT/NITTRANS/DIVEST" e unidade, nao pessoa.
  if (limpo.includes('/') && limpo === limpo.toUpperCase()) return false;
  return true;
}

/**
 * @param {object} [opcoes] opcoes da feature
 * @param {Document} [doc] documento onde procurar
 * @returns {string|null}
 */
/**
 * Separa "Nome Completo (login/ORGAO)" em nome e login.
 *
 * E assim que o SEI 5 monta o title do link do usuario na barra do topo:
 *
 *   <a id="lnkUsuarioSistema"
 *      title="Alan Doyle Costa Ribeiro (alan.ribeiro@orgao.gov.br/NITEROI)">
 *
 * As duas identidades que o historico precisa - o nome, que a assinatura usa,
 * e o login, que o andamento usa - estao ali de graca.
 */
export function separarNomeELogin(titulo) {
  const texto = String(titulo || '').replace(/\s+/g, ' ').trim();
  if (!texto) return { nome: null, login: null };

  const abre = texto.indexOf('(');
  if (abre === -1) return { nome: texto || null, login: null };

  const nome = texto.slice(0, abre).trim();
  const dentro = texto.slice(abre + 1).replace(/\)\s*$/, '').trim();
  const login = dentro.split('/')[0].trim();

  return { nome: nome || null, login: login || null };
}

/** Le o title do link do usuario na barra do topo. */
function daBarraDoTopo(doc) {
  const el = primeiro(SESSAO.usuario, doc);
  if (!el) return { nome: null, login: null };
  return separarNomeELogin(el.getAttribute('title') || el.textContent || '');
}

/**
 * @param {object} [opcoes] opcoes da feature
 * @param {Document} [doc] documento onde procurar
 * @returns {string|null}
 */
export function usuarioAtual(opcoes = {}, doc = document) {
  if (opcoes.nomeUsuario) return opcoes.nomeUsuario.trim();

  // 2. barra do topo: traz o nome completo
  const { nome } = daBarraDoTopo(doc);
  if (pareceNome(nome)) return nome;

  // 3. campo "Assinante", que so existe na tela de assinatura
  const campo = primeiro(ASSINATURA.assinante, doc);
  const doCampo = campo && campo.value ? campo.value.trim() : '';
  if (pareceNome(doCampo)) return doCampo;

  log.debug('usuario logado nao identificado; use a opcao nomeUsuario');
  return null;
}

/** O login do SEI - neste orgao, o e-mail institucional. */
export function loginAtual(opcoes = {}, doc = document) {
  if (opcoes.loginUsuario) return opcoes.loginUsuario.trim();

  const { login } = daBarraDoTopo(doc);
  return login && login.length >= 4 ? login : null;
}

export function unidadeAtual(doc = document) {
  const el = primeiro(SESSAO.unidade, doc);
  if (!el) return null;
  const texto = (el.textContent || el.value || '').trim();
  return texto && texto.length <= 60 ? texto : null;
}

/** Compara nomes ignorando acento e caixa. */
export function mesmoUsuario(a, b) {
  if (!a || !b) return false;
  return norm(a) === norm(b);
}

/**
 * Todas as identidades conhecidas do dono, prontas para comparacao.
 *
 * Junta o nome (que a tela de assinatura entrega) e o login/e-mail (que so o
 * usuario sabe informar). Lista vazia significa "nao sei quem e o dono" - e,
 * nesse caso, a extensao nao grava nada vindo de fonte ambigua.
 */
export function identidadesDoDono(opcoes = {}, doc = document) {
  return prepararIdentidades([usuarioAtual(opcoes, doc), loginAtual(opcoes, doc)]);
}
