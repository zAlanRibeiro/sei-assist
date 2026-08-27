/**
 * zip.mjs - escreve um arquivo .zip, sem dependência externa.
 *
 * Existe porque as três ferramentas do sistema erram de jeitos diferentes:
 *
 *   Compress-Archive  achata os caminhos quando recebe lista de arquivos, e
 *                     grava separador `\`, que viola a especificação ZIP;
 *   tar.exe           acerta a barra, mas prefixa tudo com `./`, e o
 *                     manifest.json precisa estar na raiz do pacote;
 *   zip               não existe no Windows.
 *
 * Sessenta linhas de formato bem documentado saem mais baratas que três
 * ramificações por plataforma, cada uma com sua peculiaridade. E o resultado é
 * idêntico em qualquer sistema.
 *
 * Grava tudo com deflate e sem atributos de sistema de arquivos: para uma
 * extensão de navegador não há permissão de execução nem link simbólico a
 * preservar.
 */
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

/* --------------------------------------------------------------- CRC-32 */

const TABELA = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = TABELA[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------- data no formato DOS */

function dataDos(quando) {
  const d = quando instanceof Date ? quando : new Date(quando);
  // O formato DOS começa em 1980 e guarda o segundo em passos de 2.
  const ano = Math.max(1980, d.getFullYear());
  const data = ((ano - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
  const hora = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
  return { data, hora };
}

/* ------------------------------------------------------------------ escrita */

const ASSINATURA_LOCAL = 0x04034b50;
const ASSINATURA_CENTRAL = 0x02014b50;
const ASSINATURA_FIM = 0x06054b50;
const METODO_DEFLATE = 8;
const BANDEIRA_UTF8 = 0x0800; // nomes de arquivo em UTF-8

/**
 * Escreve `arquivos` ({ caminho, conteudo, quando }) no zip em `destino`.
 *
 * `caminho` é sempre relativo e sempre com `/`, venha de que sistema vier.
 */
export function escreverZip(destino, arquivos) {
  const locais = [];
  const centrais = [];
  let deslocamento = 0;

  for (const arquivo of arquivos) {
    const nome = Buffer.from(arquivo.caminho.split(path.sep).join('/'), 'utf8');
    const cru = arquivo.conteudo;
    const comprimido = zlib.deflateRawSync(cru, { level: 9 });
    const { data, hora } = dataDos(arquivo.quando || new Date());
    const soma = crc32(cru);

    const cabecalho = Buffer.alloc(30);
    cabecalho.writeUInt32LE(ASSINATURA_LOCAL, 0);
    cabecalho.writeUInt16LE(20, 4); // versão mínima
    cabecalho.writeUInt16LE(BANDEIRA_UTF8, 6);
    cabecalho.writeUInt16LE(METODO_DEFLATE, 8);
    cabecalho.writeUInt16LE(hora, 10);
    cabecalho.writeUInt16LE(data, 12);
    cabecalho.writeUInt32LE(soma, 14);
    cabecalho.writeUInt32LE(comprimido.length, 18);
    cabecalho.writeUInt32LE(cru.length, 22);
    cabecalho.writeUInt16LE(nome.length, 26);
    cabecalho.writeUInt16LE(0, 28); // sem campo extra

    locais.push(cabecalho, nome, comprimido);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(ASSINATURA_CENTRAL, 0);
    central.writeUInt16LE(20, 4); // versão de quem escreveu
    central.writeUInt16LE(20, 6); // versão mínima
    central.writeUInt16LE(BANDEIRA_UTF8, 8);
    central.writeUInt16LE(METODO_DEFLATE, 10);
    central.writeUInt16LE(hora, 12);
    central.writeUInt16LE(data, 14);
    central.writeUInt32LE(soma, 16);
    central.writeUInt32LE(comprimido.length, 20);
    central.writeUInt32LE(cru.length, 24);
    central.writeUInt16LE(nome.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comentário
    central.writeUInt16LE(0, 34); // disco
    central.writeUInt16LE(0, 36); // atributos internos
    central.writeUInt32LE(0, 38); // atributos externos
    central.writeUInt32LE(deslocamento, 42);

    centrais.push(central, nome);
    deslocamento += cabecalho.length + nome.length + comprimido.length;
  }

  const diretorio = Buffer.concat(centrais);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(ASSINATURA_FIM, 0);
  fim.writeUInt16LE(0, 4); // disco
  fim.writeUInt16LE(0, 6); // disco do início do diretório
  fim.writeUInt16LE(arquivos.length, 8);
  fim.writeUInt16LE(arquivos.length, 10);
  fim.writeUInt32LE(diretorio.length, 12);
  fim.writeUInt32LE(deslocamento, 16);
  fim.writeUInt16LE(0, 20); // sem comentário

  fs.writeFileSync(destino, Buffer.concat([...locais, diretorio, fim]));
  return arquivos.length;
}

/**
 * Lê os caminhos de dentro de um zip, pelo diretório central.
 *
 * Serve para conferir o que foi realmente gerado — foi a falta dessa
 * conferência que deixou passar um pacote com todos os arquivos na raiz.
 */
export function caminhosDoZip(arquivo) {
  const b = fs.readFileSync(arquivo);
  const nomes = [];

  for (let i = 0; i < b.length - 4; i++) {
    if (b.readUInt32LE(i) !== ASSINATURA_CENTRAL) continue;
    const tamanhoNome = b.readUInt16LE(i + 28);
    nomes.push(b.toString('utf8', i + 46, i + 46 + tamanhoNome));
  }
  return nomes;
}
