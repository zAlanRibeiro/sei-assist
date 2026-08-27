/**
 * data.js - a data como documento oficial escreve.
 *
 * Funcao pura, sem DOM: entra um Date, sai texto. Fica separada do resto para
 * poder ser testada, porque erro de data e o tipo de coisa que so aparece em
 * dezembro, ou no dia 1.
 */

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

/**
 * Formatos disponiveis.
 *
 * `extenso` e o do fecho de oficio e memorando; `curta` serve para o corpo do
 * texto, onde a data por extenso pesa.
 */
export const FORMATOS = {
  extenso: 'Cidade, 27 de agosto de 2026',
  curta: '27/08/2026',
};

const doisDigitos = (n) => String(n).padStart(2, '0');

/**
 * Escreve a data.
 *
 * A cidade so entra no formato por extenso, e so quando informada - sem ela o
 * resultado e "27 de agosto de 2026", que ainda serve.
 *
 * Usa getDate/getMonth (hora local) de proposito, e nao a parte de data do
 * ISO: o ISO e UTC, e no fuso do Brasil isso escreve o dia anterior a noite
 * inteira.
 */
export function formatarData(data = new Date(), { formato = 'extenso', cidade = '' } = {}) {
  const d = data instanceof Date ? data : new Date(data);
  if (Number.isNaN(d.getTime())) return '';

  if (formato === 'curta') {
    return `${doisDigitos(d.getDate())}/${doisDigitos(d.getMonth() + 1)}/${d.getFullYear()}`;
  }

  const porExtenso = `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  const lugar = String(cidade || '').trim();
  return lugar ? `${lugar}, ${porExtenso}` : porExtenso;
}
