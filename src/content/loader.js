/**
 * loader.js - unico script declarado no manifest.
 *
 * Content scripts do MV3 nao aceitam `"type": "module"` na declaracao do
 * manifest, entao o resto do codigo e carregado daqui por import() dinamico.
 * Isso permite que tudo seja ESM de verdade, sem listar cada arquivo novo no
 * manifest.json.
 *
 * O import() pode falhar por dois motivos bem diferentes, e o tratamento
 * abaixo separa os dois porque a correcao de cada um e outra:
 *
 *  1. CONTEXTO ORFAO - a extensao foi recarregada (ou atualizada) enquanto
 *     esta aba estava aberta. O content script antigo continua vivo na pagina,
 *     mas perdeu o vinculo com a extensao: chrome.runtime.id some e qualquer
 *     busca a chrome-extension:// falha. Nao e defeito, e o esperado - basta
 *     recarregar a pagina. Por isso e registrado como aviso discreto, e nao
 *     como erro.
 *
 *  2. FALHA REAL - contexto vivo e mesmo assim nao carregou. Aí sim e problema
 *     nosso (recurso fora de web_accessible_resources, ou politica de
 *     seguranca da pagina barrando o import). Esse caso reporta em detalhe.
 */
(() => {
  const MARCA = '__seixCarregando';
  if (window[MARCA]) return;
  window[MARCA] = true;

  const PREFIXO = '[SEI Assist]';

  /** chrome.runtime.id some quando o contexto e invalidado. */
  function contextoVivo() {
    try {
      return Boolean(chrome && chrome.runtime && chrome.runtime.id);
    } catch {
      return false;
    }
  }

  function avisarOrfao() {
    // Discreto de proposito: acontece toda vez que a extensao e recarregada
    // com abas abertas, e a solucao (F5) ja e conhecida do usuario.
    console.debug(
      `${PREFIXO} contexto invalidado (a extensao foi recarregada). ` +
        'Recarregue a pagina do SEI para reativar.',
    );
  }

  async function carregar(tentativa = 1) {
    if (!contextoVivo()) {
      window[MARCA] = false;
      avisarOrfao();
      return;
    }

    try {
      await import(chrome.runtime.getURL('src/content/main.js'));
    } catch (err) {
      // Uma segunda chance cobre a corrida entre o content script entrar e a
      // extensao terminar de subir, logo apos uma atualizacao.
      if (tentativa < 2) {
        setTimeout(() => carregar(tentativa + 1), 300);
        return;
      }

      window[MARCA] = false;

      if (!contextoVivo()) {
        avisarOrfao();
        return;
      }

      console.error(
        `${PREFIXO} nao consegui carregar os modulos com o contexto ativo.\n` +
          `URL da pagina: ${location.href.split('&infra_')[0]}\n` +
          `Frame: ${window.name || '(principal)'}\n` +
          'Causa provavel: a politica de seguranca desta tela barra o import ' +
          'dinamico, ou o arquivo saiu de web_accessible_resources.',
        err,
      );
    }
  }

  carregar();
})();
