/**
 * Parser robusto de CSV e XLSX/XLS para extratos bancários brasileiros.
 * Suporta delimitadores , ; \t e diferentes formatos de data e valor monetário.
 */

export interface ParsedExtratoRow {
  data: string // YYYY-MM-DD
  descricao: string
  documento?: string
  valor: number
  tipo: 'credito' | 'debito'
}

export function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (lines.length === 0) return { headers: [], rows: [] }

  // Detecta separador (, ou ; ou \t)
  const firstLine = lines[0]
  const countSemicolon = (firstLine.match(/;/g) || []).length
  const countComma = (firstLine.match(/,/g) || []).length
  const countTab = (firstLine.match(/\t/g) || []).length

  let separator = ';'
  if (countComma > countSemicolon && countComma > countTab) separator = ','
  else if (countTab > countSemicolon && countTab > countComma) separator = '\t'

  const parseLine = (line: string): string[] => {
    const result: string[] = []
    let cur = ''
    let inQuotes = false
    for (let i = 0; i < line.length; i++) {
      const char = line[i]
      if (char === '"') {
        inQuotes = !inQuotes
      } else if (char === separator && !inQuotes) {
        result.push(cur.trim().replace(/^"|"$/g, ''))
        cur = ''
      } else {
        cur += char
      }
    }
    result.push(cur.trim().replace(/^"|"$/g, ''))
    return result
  }

  const headers = parseLine(lines[0])
  const rows = lines.slice(1).map(parseLine)
  return { headers, rows }
}

/**
 * Tenta normalizar uma data encontrada em planilhas para YYYY-MM-DD
 */
export function normalizeDate(str: string): string | null {
  if (!str) return null
  const clean = str.trim()

  // dd/mm/yyyy ou dd-mm-yyyy
  const dmy = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (dmy) {
    const d = dmy[1].padStart(2, '0')
    const m = dmy[2].padStart(2, '0')
    const y = dmy[3]
    return `${y}-${m}-${d}`
  }

  // yyyy-mm-dd
  const ymd = clean.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/)
  if (ymd) {
    const y = ymd[1]
    const m = ymd[2].padStart(2, '0')
    const d = ymd[3].padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  // Se for timestamp ou date válida no JS
  const parsed = new Date(clean)
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear()
    const m = String(parsed.getMonth() + 1).padStart(2, '0')
    const d = String(parsed.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }

  return null
}

/**
 * Normaliza valores com R$, vírgulas ou negativos
 */
export function normalizeCurrency(val: string | number): number {
  if (typeof val === 'number') return val
  if (!val) return 0
  let str = String(val)
    .trim()
    .replace(/R\$\s?/gi, '')
    .replace(/\s/g, '')

  // Tratar formato brasileiro 1.234,56 ou americano 1,234.56
  if (str.includes(',') && str.includes('.')) {
    if (str.indexOf('.') < str.indexOf(',')) {
      // 1.234,56 -> 1234.56
      str = str.replace(/\./g, '').replace(',', '.')
    } else {
      // 1,234.56 -> 1234.56
      str = str.replace(/,/g, '')
    }
  } else if (str.includes(',')) {
    str = str.replace(',', '.')
  }

  const num = parseFloat(str)
  return isNaN(num) ? 0 : num
}
