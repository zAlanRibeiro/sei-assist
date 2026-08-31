/**
 * armazenamento.js - o historico em si.
 *
 * Fica em chrome.storage.local (nao sync) por dois motivos: o volume passa
 * facil do limite de 100 KB do sync, e sao dados de processo administrativo -
 * nao devem trafegar pela conta do navegador sem o usuario pedir.
 *
 * Formato:
 *   { versao: 1, registros: { [id]: Registro } }
 *
 * Registro:
 *   id          chave de deduplicacao (numero do documento, quando existe)
 *   documento   numero SEI do documento
 *   tipo        'Oficio', 'Despacho', ...
 *   processo    NUP do processo
 *   unidade     unidade em que o usuario estava
 *   assinante   nome de quem assinou
 *   quando      ISO 8601 - momento da captura
 *   quandoExato true se veio da propria tela de assinatura
 *   confirmado  false enquanto nao houver prova de que a assinatura foi aceita
 *   origem      'assinatura' | 'arvore'
 *   url         link para o documento no SEI
 */
import { log } from '../../core/log.js';
import { comContexto } from '../../core/runtime.js';
import { ehMinha, ehDoProprioAto, prepararIdentidades } from './identidade.js';

const CHAVE = 'seix:historico-assinaturas';
const MAX_REGISTROS = 5000;



const VERSAO = 3;
const vazio = () => ({ versao: VERSAO, registros: {} });

/**
 * Migracoes do formato guardado.
 *
 * v3: apaga registros sem autor. O historico passou a ser estritamente
 * pessoal, e registro que ninguem assina nao pode ser atribuido a voce - logo
 * nao tem como ser mostrado, e guardar dado sobre terceiro sem necessidade e
 * exatamente o que nao queremos.
 *
 * v1 -> v2: apaga o campo `url` dos registros. Guardavamos o link do SEI, o
 * que era errado por dois motivos: o link carrega `infra_hash`, um selo de
 * sessao que nao deveria ficar parado no disco; e ele para de funcionar
 * quando a sessao acaba, fazendo o SEI recusar o acesso e deslogar quem
 * clicasse. Hoje guardamos so identificadores.
 */
function migrar(dados) {
  if ((dados.versao || 1) >= VERSAO) return { dados, mudou: false };

  const anterior = dados.versao || 1;

  for (const [id, registro] of Object.entries(dados.registros || {})) {
    if (anterior < 2 && 'url' in registro) delete registro.url;

    if (anterior < 3 && !registro.assinante && !ehDoProprioAto(registro)) {
      delete dados.registros[id];
    }
  }

  dados.versao = VERSAO;
  return { dados, mudou: true };
}

async function ler() {
  return comContexto(
    async () => {
      const bruto = await chrome.storage.local.get(CHAVE);
      const { dados, mudou } = migrar({ ...vazio(), ...(bruto?.[CHAVE] || {}) });

      if (mudou) {
        await escrever(dados);
        log.info('historico migrado para o formato v' + VERSAO);
      }
      return dados;
    },
    vazio(),
    'nao consegui ler o historico',
  );
}

async function escrever(dados) {
  return comContexto(
    () => chrome.storage.local.set({ [CHAVE]: dados }),
    undefined,
    'nao consegui gravar o historico',
  );
}

/**
 * Descarta os mais antigos quando passa do teto.
 *
 * FAVORITO SAI POR ULTIMO. Quem marcou um registro disse, com todas as
 * letras, que quer aquele guardado - e perde-lo por causa do teto seria a
 * mesma quebra de promessa que perde-lo na limpeza.
 *
 * Mas a promessa nao vira crescimento sem limite: se so os favoritos ja
 * passarem do teto, os mais antigos DELES tambem caem. O teto e absoluto;
 * favorito muda a ordem da fila, nao a existencia dela.
 */
function aparar(registros) {
  const ids = Object.keys(registros);
  if (ids.length <= MAX_REGISTROS) return registros;

  const doMaisVelho = (a, b) => (registros[a].quando < registros[b].quando ? -1 : 1);
  const comuns = ids.filter((id) => !registros[id].favorito).sort(doMaisVelho);
  const favoritos = ids.filter((id) => registros[id].favorito).sort(doMaisVelho);

  // A fila de descarte: primeiro todos os comuns, do mais velho ao mais novo;
  // só depois os favoritos, na mesma ordem.
  const fila = [...comuns, ...favoritos];
  const quantos = ids.length - MAX_REGISTROS;
  for (const id of fila.slice(0, quantos)) delete registros[id];

  const favoritosPerdidos = fila.slice(0, quantos).filter((id) => favoritos.includes(id)).length;
  log.warn(
    `historico passou de ${MAX_REGISTROS} registros; ${quantos} descartado(s)` +
      (favoritosPerdidos ? `, incluindo ${favoritosPerdidos} favorito(s)` : ', nenhum favorito'),
  );
  return registros;
}

/**
 * Qual data vale quando duas fontes discordam.
 *
 * O bloco impresso no corpo do documento e autoritativo: e a data que o
 * proprio SEI carimbou na assinatura. Depois dele vem qualquer data exata
 * (a captura no momento do ato, que erra por segundos). Por ultimo, a data
 * aproximada da arvore, que e so "quando a extensao viu".
 */
const FONTES_AUTORITATIVAS = new Set(['documento', 'andamento']);

function melhorData(antigo, novo) {
  if (FONTES_AUTORITATIVAS.has(novo.origem)) return novo.quando || antigo.quando;
  if (FONTES_AUTORITATIVAS.has(antigo.origem)) return antigo.quando;
  if (antigo.quandoExato) return antigo.quando;
  return novo.quando || antigo.quando;
}

/**
 * Grava um registro. Se ja existir um com o mesmo id, mescla - preferindo
 * sempre o dado mais especifico (quandoExato e confirmado nao regridem).
 */
export async function registrar(novo) {
  if (!novo?.id) {
    log.warn('registro sem id ignorado', novo);
    return null;
  }

  const dados = await ler();
  const antigo = dados.registros[novo.id];

  const mesclado = antigo
    ? {
        ...antigo,
        ...Object.fromEntries(Object.entries(novo).filter(([, v]) => v !== null && v !== undefined && v !== '')),
        quando: melhorData(antigo, novo),
        quandoExato: antigo.quandoExato || Boolean(novo.quandoExato),
        confirmado: antigo.confirmado || Boolean(novo.confirmado),
        // Favorito é escolha da pessoa, não dado colhido da tela: nenhuma
        // fonte pode desmarcar. Sem esta linha, o mesmo documento visto de
        // novo pela árvore apagaria a estrela em silêncio.
        favorito: antigo.favorito || Boolean(novo.favorito),
      }
    : novo;

  // Registros gravados antes de existir envio nao tem tipoEvento.
  if (!mesclado.tipoEvento) mesclado.tipoEvento = 'assinatura';

  dados.registros[novo.id] = mesclado;
  await escrever({ ...dados, registros: aparar(dados.registros) });
  log.debug('registro gravado:', mesclado.id, mesclado.documento);
  return mesclado;
}

/**
 * Grava um evento de processo reaproveitando o registro existente quando for
 * o mesmo ato visto por outra fonte.
 *
 * Envio e criacao nao tem id proprio como o documento tem: a captura no ato
 * conhece o id_procedimento, o andamento conhece o NUP. Entao juntamos pelo
 * processo mais a proximidade no tempo - ninguem envia nem cria o mesmo
 * processo duas vezes no intervalo de dois minutos.
 */
export async function registrarPorProximidade(novo, janelaMs = 2 * 60 * 1000) {
  const dados = await ler();

  const mesmoProcesso = (r) =>
    (novo.processo && r.processo === novo.processo) ||
    (novo.idProcedimento && r.idProcedimento === novo.idProcedimento);

  // Dois documentos criados no mesmo processo com poucos segundos de
  // diferenca cairiam na mesma janela. Quando os dois lados sabem o numero,
  // ele desempata; quando so um sabe, a proximidade decide.
  const mesmoNumero = (r) =>
    !novo.documento || !r.documento || r.documento === novo.documento;

  const semelhante = Object.values(dados.registros).find(
    (r) =>
      r.tipoEvento === novo.tipoEvento &&
      mesmoProcesso(r) &&
      mesmoNumero(r) &&
      Math.abs(new Date(r.quando) - new Date(novo.quando)) <= janelaMs,
  );

  return registrar(semelhante ? { ...novo, id: semelhante.id } : novo);
}

/** Mantido pelo nome antigo, que dizia menos do que a funcao faz. */
export const registrarEnvio = registrarPorProximidade;

/** Marca como confirmado (houve prova de que a assinatura foi aceita). */
export async function confirmar(id) {
  const dados = await ler();
  if (!dados.registros[id]) return false;
  dados.registros[id].confirmado = true;
  await escrever(dados);
  return true;
}

/** Remove pendentes antigos de um documento - assinatura recusada. */
export async function descartarPendente(id) {
  const dados = await ler();
  const reg = dados.registros[id];
  if (!reg || reg.confirmado) return false;
  delete dados.registros[id];
  await escrever(dados);
  log.debug('pendente descartado:', id);
  return true;
}

export async function remover(id) {
  const dados = await ler();
  delete dados.registros[id];
  await escrever(dados);
}

/**
 * Marca ou desmarca um registro como favorito.
 *
 * Favorito é a única marca do histórico que a pessoa põe à mão — todo o
 * resto é colhido da tela. É por isso que ela sobrevive à limpeza e à poda:
 * é a única informação aqui que ninguém consegue recuperar depois.
 *
 * @returns {boolean|null} o estado novo, ou null se o registro não existe.
 */
export async function favoritar(id, valor = true) {
  const dados = await ler();
  const registro = dados.registros[id];
  if (!registro) return null;

  registro.favorito = Boolean(valor);
  if (!registro.favorito) delete registro.favorito;

  await escrever(dados);
  return Boolean(valor);
}

/** Quantos registros a limpeza levaria e quantos ficariam. */
export function separarFavoritos(registros) {
  const lista = Object.entries(registros || {});
  const guardados = Object.fromEntries(lista.filter(([, r]) => r && r.favorito));
  return { guardados, quantosSaem: lista.length - Object.keys(guardados).length };
}

/**
 * Limpa o histórico, PRESERVANDO os favoritos.
 *
 * O favorito existe justamente para não sumir aqui. Quem quiser apagar tudo
 * mesmo passa `inclusiveFavoritos` — e isso é uma segunda decisão, tomada
 * numa segunda confirmação, não um efeito colateral da primeira.
 */
export async function limpar({ inclusiveFavoritos = false } = {}) {
  if (inclusiveFavoritos) {
    await escrever(vazio());
    return { restaram: 0 };
  }

  const dados = await ler();
  const { guardados } = separarFavoritos(dados.registros);
  await escrever({ ...vazio(), registros: guardados });
  return { restaram: Object.keys(guardados).length };
}

/**
 * @param {{busca?: string, desde?: Date, tipoEvento?: string,
 *          identidades?: string[], somenteConfirmados?: boolean}} filtro
 */
export async function listar(filtro = {}) {
  const dados = await ler();
  let lista = Object.values(dados.registros);

  if (filtro.desde) {
    const limite = filtro.desde.toISOString();
    lista = lista.filter((r) => r.quando >= limite);
  }
  if (filtro.tipoEvento && filtro.tipoEvento !== 'tudo') {
    lista = lista.filter((r) => (r.tipoEvento || 'assinatura') === filtro.tipoEvento);
  }
  if (filtro.somenteConfirmados) {
    lista = lista.filter((r) => r.confirmado);
  }
  if (filtro.somenteFavoritos) {
    lista = lista.filter((r) => r.favorito);
  }
  // Por onde o ato passou. Registro antigo e registro recolhido do corpo do
  // documento nao tem essa informacao - a assinatura ja aconteceu quando a
  // extensao o viu -, entao filtrar por origem esconde esses. E o preco de
  // saber a origem, e o rotulo "origem desconhecida" no painel deixa claro
  // quais sao.
  if (filtro.via && filtro.via !== 'tudo') {
    lista = lista.filter((r) => r.via === filtro.via);
  }
  // O historico e estritamente pessoal: se sabemos quem e o dono, so o que e
  // dele aparece. Nao ha opcao de ver evento de outra pessoa.
  const identidades = prepararIdentidades([filtro.usuario, ...(filtro.identidades || [])]);
  if (identidades.length) {
    lista = lista.filter((r) => ehDoProprioAto(r) || ehMinha(r.assinante, identidades));
  }

  if (filtro.busca) {
    const termo = filtro.busca.toLowerCase();
    lista = lista.filter((r) =>
      [r.documento, r.tipo, r.descricao, r.processo, r.assinante, r.cargo, r.unidade, r.destino]
        .filter(Boolean)
        .some((campo) => String(campo).toLowerCase().includes(termo)),
    );
  }

  return lista.sort((a, b) => (a.quando < b.quando ? 1 : -1));
}

/**
 * Acha o id de um registro pelo numero visivel do documento.
 *
 * Serve para juntar fontes que nao compartilham a mesma chave: a arvore e a
 * tela de assinatura conhecem o id_documento interno, mas o bloco de
 * assinatura impresso no corpo do documento so traz o codigo verificador
 * (o numero visivel). Sem isso o mesmo documento viraria dois registros.
 *
 * A busca e linear, mas roda no maximo uma vez por documento aberto.
 */
export async function idPorNumero(numero) {
  if (!numero) return null;
  const dados = await ler();
  const achado = Object.values(dados.registros).find((r) => r.documento === numero);
  return achado ? achado.id : null;
}

/**
 * Preenche o numero visivel dos registros que ainda nao o tem.
 *
 * A criacao de um documento e capturada antes de o SEI atribuir o numero -
 * so o id interno existe naquele instante. Quando a arvore e lida depois, ela
 * traz os dois, e este passo fecha a lacuna sozinho.
 *
 * @param {Record<string, string>} mapa idInterno -> numero visivel
 * @returns {Promise<number>} quantos registros foram completados
 */
export async function completarNumeros(mapa) {
  if (!mapa || !Object.keys(mapa).length) return 0;

  const dados = await ler();
  let alterados = 0;

  for (const registro of Object.values(dados.registros)) {
    if (registro.documento || !registro.idInterno) continue;

    const numero = mapa[registro.idInterno];
    if (!numero) continue;

    registro.documento = numero;
    alterados++;
  }

  if (alterados) {
    await escrever(dados);
    log.info(`${alterados} registro(s) ganharam o numero do documento`);
  }
  return alterados;
}

/** Um registro pelo id, ou null. */
export async function obter(id) {
  const dados = await ler();
  return dados.registros[id] || null;
}

/**
 * Apaga o que nao e do dono.
 *
 * Roda quando a identidade fica conhecida, para limpar o que foi coletado
 * antes de a extensao passar a filtrar na captura. Nunca apaga registro vindo
 * do proprio ato (ver ehDoProprioAto): assim, um erro de digitacao nas opcoes
 * nao destroi justamente o que a pessoa fez.
 */
export async function purgarDeOutros(listaDeIdentidades) {
  const identidades = prepararIdentidades(listaDeIdentidades);
  if (!identidades.length) return 0;

  const dados = await ler();
  let apagados = 0;

  for (const [id, registro] of Object.entries(dados.registros)) {
    if (ehDoProprioAto(registro)) continue;
    if (ehMinha(registro.assinante, identidades)) continue;
    delete dados.registros[id];
    apagados++;
  }

  if (apagados) {
    await escrever(dados);
    log.info(`${apagados} registro(s) de outras pessoas apagados do historico`);
  }
  return apagados;
}

export async function contar() {
  const dados = await ler();
  return Object.keys(dados.registros).length;
}

/** Avisa quando o historico mudar (outra aba, outro frame). */
export function onMudanca(callback) {
  const handler = (changes, area) => {
    if (area === 'local' && changes[CHAVE]) callback();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}

const COLUNAS = [
  'quando',
  'tipoEvento',
  'documento',
  'tipo',
  'processo',
  'assinante',
  'cargo',
  'descricao',
  'unidade',
  'destino',
  'confirmado',
  'origem',
];

/** Gera CSV com separador ';' e BOM, que e o que o Excel em pt-BR espera. */
export function paraCsv(registros) {
  const escapar = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const linhas = [COLUNAS.join(';')];
  for (const r of registros) linhas.push(COLUNAS.map((c) => escapar(r[c])).join(';'));
  return '\ufeff' + linhas.join('\r\n');
}

/* ------------------------------------------------- criacao em duas etapas */

/** Uma pendencia por tipo de criacao: as duas coexistem sem se atrapalhar. */
export const PENDENCIA_PROCESSO = 'seix:criacao-pendente';
export const PENDENCIA_DOCUMENTO = 'seix:documento-pendente';

/**
 * Guarda uma criacao que ainda nao tem numero.
 *
 * Vale para processo e para documento: nos dois casos o SEI so atribui o
 * numero depois de salvar, e ele so aparece na tela seguinte.
 *
 * POR QUE sessionStorage E NAO chrome.storage
 * chrome.storage e assincrono. Clicar em Salvar navega a pagina no mesmo
 * instante, e a gravacao nao chega a completar - o ato era capturado e se
 * perdia no caminho. sessionStorage e SINCRONO: quando a funcao retorna, o
 * dado ja esta gravado, aconteca o que acontecer com a pagina.
 *
 * Tambem e o escopo certo: vive na aba (o ato e a tela seguinte sao a mesma
 * aba) e some quando ela fecha. Nao ha o que limpar depois.
 */
export function guardarPendencia(chave, dados) {
  try {
    sessionStorage.setItem(chave, JSON.stringify(dados));
    log.info('criacao pendente guardada, aguardando o numero:', chave);
    return true;
  } catch (err) {
    log.error('nao consegui guardar a criacao pendente:', err);
    return false;
  }
}

export function lerPendencia(chave) {
  try {
    const bruto = sessionStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}

export function limparPendencia(chave) {
  try {
    sessionStorage.removeItem(chave);
  } catch {
    /* nada a fazer */
  }
}

/* --------------------------------------------------- fila de atos pendentes */

const CHAVE_FILA = 'seix:atos-pendentes';

/**
 * Enfileira um ato capturado no momento em que ele acontece.
 *
 * Mesmo motivo da pendencia de criacao: clicar em Assinar ou Enviar navega a
 * pagina imediatamente, e chrome.storage e assincrono demais para essa
 * janela - o registro se perdia. Aqui a gravacao e sincrona; a passagem para o
 * historico de verdade acontece no proximo carregamento, com calma.
 *
 * @param {'registrar'|'proximidade'} modo qual gravacao usar ao descarregar
 * @param {object} registro
 */
export function enfileirarAto(modo, registro) {
  try {
    const fila = lerFila();
    fila.push({ modo, registro });
    sessionStorage.setItem(CHAVE_FILA, JSON.stringify(fila));
    log.info('ato enfileirado:', registro.tipoEvento, registro.id);
    return true;
  } catch (err) {
    log.error('nao consegui enfileirar o ato:', err);
    return false;
  }
}

function lerFila() {
  try {
    const bruto = sessionStorage.getItem(CHAVE_FILA);
    const fila = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(fila) ? fila : [];
  } catch {
    return [];
  }
}

/**
 * Passa a fila para o historico. Chamado a cada carregamento de tela.
 * @returns {Promise<number>} quantos atos foram gravados
 */
export async function descarregarAtos() {
  const fila = lerFila();
  if (!fila.length) return 0;

  // Esvazia antes de gravar: se algo falhar no meio, o pior caso e perder um
  // ato - melhor do que repetir a fila inteira a cada tela para sempre.
  try {
    sessionStorage.removeItem(CHAVE_FILA);
  } catch {
    /* segue mesmo assim */
  }

  let gravados = 0;
  for (const item of fila) {
    if (!item || !item.registro) continue;
    if (item.modo === 'proximidade') await registrarPorProximidade(item.registro);
    else await registrar(item.registro);
    gravados++;
  }

  log.info(`${gravados} ato(s) pendente(s) gravado(s) no historico`);
  return gravados;
}
