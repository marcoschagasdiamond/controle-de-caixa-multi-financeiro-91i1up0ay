// Utilitários de exportação CSV no padrão brasileiro (Excel pt-BR):
// separador ";", vírgula decimal, BOM UTF-8 para acentos e datas dd/mm/aaaa.

const formatarValorCSV = (n: number) =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Valor monetário sem símbolo (ex.: 1.234,56) — o símbolo R$ fica no cabeçalho da coluna
export const valorCSV = (n: number) => formatarValorCSV(Number(n) || 0)

// Escapa um campo para CSV: aspas quando contém separador, aspas ou quebra de linha
const escaparCampo = (v: unknown): string => {
  if (v === null || v === undefined) return ''
  const s = String(v)
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function baixarCSV(nomeArquivo: string, cabecalho: string[], linhas: unknown[][]) {
  const conteudo = [cabecalho, ...linhas]
    .map((linha) => linha.map(escaparCampo).join(';'))
    .join('\r\n')
  const blob = new Blob(['\uFEFF' + conteudo], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nomeArquivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
