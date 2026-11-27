// Recebíveis sem data: IMPORTAÇÃO de CSV (diálogo em 4 passos) e EXPORTAÇÃO CSV.
// Importação: mapeamento por cabeçalho, prévia com dedupe e gravação via serviço.
// Exportação: padrão brasileiro (separador ";", vírgula decimal, BOM para Excel).
import { RecebivelSemData, Financeiro, PlanoConta } from '@/types/financeiro'
import { parseCSV } from '@/lib/sheetParser'
import { formatDateBR } from '@/lib/formatters'
import { labelGatilho } from '@/components/RecebiveisSemData'
import { valorCSV } from '@/lib/csv'

// ---------- Campos / rótulos ----------

export type CampoRecebivel =
  | 'descricao'
  | 'valor'
  | 'contratante'
  | 'gatilho'
  | 'parcelas'
  | 'categoria'
  | 'observacao'
  | 'financeiro'
  | 'data_prevista'

export const CAMPOS_RECEBIVEL: CampoRecebivel[] = [
  'descricao',
  'valor',
  'contratante',
  'gatilho',
  'parcelas',
  'categoria',
  'observacao',
  'financeiro',
  'data_prevista',
]

export const LABEL_CAMPO: Record<CampoRecebivel, string> = {
  descricao: 'Descrição',
  valor: 'Valor (R$)',
  contratante: 'Contratante',
  gatilho: 'Status do gatilho',
  parcelas: 'Nº de parcelas',
  categoria: 'Categoria (plano de contas)',
  observacao: 'Observação',
  financeiro: 'Financeiro (empresa)',
  data_prevista: 'Data prevista de recebimento',
}

// ---------- Normalização ----------

export const removerAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const chave = (s: string) =>
  removerAcentos(String(s || ''))
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

const normalizarValor = (texto: string): number | null => {
  let t = String(texto || '').trim()
  if (!t) return null
  t = t.replace(/[R$\s]/gi, '')
  // "1.234,56" pt-BR ou "1234.56" en-US
  if (/,\d{2}$/.test(t)) t = t.replace(/\./g, '').replace(',', '.')
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '')
  const n = parseFloat(t)
  return isNaN(n) ? null : n
}

export const normalizarGatilho = (texto: string): RecebivelSemData['status_gatilho'] => {
  const c = chave(texto)
  if (c.includes('termino') || c.includes('contrato')) return 'aguardando_termino'
  if (c.includes('outro') || c.includes('outros')) return 'outro'
  return 'aguardando_despacho'
}

export const normalizarParcelas = (texto: string): number | null => {
  const t = String(texto || '').trim()
  if (!t) return null
  const m = t.match(/\d+/)
  if (!m) return null
  const n = parseInt(m[0], 10)
  return n >= 2 ? n : null
}

const MESES: Record<string, number> = {
  jan: 1,
  fev: 2,
  mar: 3,
  abr: 4,
  mai: 5,
  jun: 6,
  jul: 7,
  ago: 8,
  set: 9,
  out: 10,
  nov: 11,
  dez: 12,
}

// Aceita dd/mm/aaaa, aaaa-mm-dd e "12 mar 2026"; devolve ISO (yyyy-mm-dd) ou null.
const normalizarData = (texto: string): string | null => {
  const t = String(texto || '').trim()
  if (!t) return null
  let m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (m) {
    const dia = parseInt(m[1], 10)
    const mes = parseInt(m[2], 10)
    let ano = parseInt(m[3], 10)
    if (ano < 100) ano += 2000
    if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31)
      return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
    return null
  }
  m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}`
  m = t.match(/^(\d{1,2})\s*([a-zA-Z]{3})\w*\s*(\d{2,4})$/)
  if (m) {
    const mes = MESES[m[2].toLowerCase()]
    if (mes) {
      let ano = parseInt(m[3], 10)
      if (ano < 100) ano += 2000
      return `${ano}-${String(mes).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`
    }
  }
  return null
}

export const casarCategoria = (texto: string, planos: PlanoConta[]): string | null => {
  const t = String(texto || '').trim()
  if (!t) return null
  const c = chave(t)
  const porCodigo = planos.find((p) => p.codigo && chave(p.codigo) === c)
  if (porCodigo) return porCodigo.id
  const porDescricao = planos.find((p) => chave(p.descricao) === c)
  if (porDescricao) return porDescricao.id
  const porPrefixo = planos.find(
    (p) =>
      c.length >= 4 &&
      (chave(p.descricao).startsWith(c) || chave(p.descricao + p.codigo).startsWith(c)),
  )
  return porPrefixo?.id || null
}

export const casarFinanceiro = (texto: string, financeiros: Financeiro[]): string | null => {
  const t = String(texto || '').trim()
  if (!t) return null
  const c = chave(t)
  return (
    financeiros.find((f) => chave(f.nome) === c)?.id ||
    financeiros.find((f) => chave(f.nome).includes(c) && c.length >= 4)?.id ||
    financeiros.find((f) => c.includes(chave(f.nome)) && chave(f.nome).length >= 4)?.id ||
    null
  )
}

// ---------- Tipos de linha ----------

export interface LinhaImportada {
  linha: number // nº da linha no arquivo (1-based, sem cabeçalho)
  descricao: string
  valor: number
  total_parcelas: number | null
  contratante: string | null
  status_gatilho: RecebivelSemData['status_gatilho']
  gatilho_outro: string | null
  observacao: string | null
  data_prevista: string | null
  financeiro_id: string | null
  plano_conta_id: string | null
}

export interface ResultadoParse {
  linhas: LinhaImportada[]
  erros: Array<{ linha: number; motivo: string }>
}

// ---------- Mapeamento ----------

export const sugerirMapeamento = (headers: string[]): Record<CampoRecebivel, string> => {
  const map = Object.fromEntries(CAMPOS_RECEBIVEL.map((c) => [c, ''])) as Record<
    CampoRecebivel,
    string
  >
  for (const h of headers) {
    const c = chave(h)
    if (!map.descricao && (c.includes('descric') || c === 'contrato' || c === 'item'))
      map.descricao = h
    else if (!map.valor && (c.includes('valor') || c === 'total')) map.valor = h
    else if (
      !map.contratante &&
      (c.includes('contrat') || c.includes('cliente') || c.includes('fornecedor'))
    )
      map.contratante = h
    else if (!map.gatilho && (c.includes('gatilho') || c.includes('status'))) map.gatilho = h
    else if (!map.parcelas && (c.includes('parcela') || c === 'nparcelas')) map.parcelas = h
    else if (
      !map.categoria &&
      (c.includes('categor') || c.includes('plano') || c.includes('conta'))
    )
      map.categoria = h
    else if (!map.observacao && (c.includes('observ') || c.includes('nota'))) map.observacao = h
    else if (!map.financeiro && (c.includes('financeiro') || c.includes('empresa')))
      map.financeiro = h
    else if (
      !map.data_prevista &&
      (c.includes('prevista') || c.includes('previsao') || c.includes('data'))
    )
      map.data_prevista = h
  }
  return map
}

// ---------- Transformação ----------

export const transformarLinhas = (
  rows: string[][],
  headers: string[],
  map: Record<CampoRecebivel, string>,
  financeiros: Financeiro[],
  planos: PlanoConta[],
): ResultadoParse => {
  const col = (campo: CampoRecebivel) => {
    const h = map[campo]
    return h ? headers.indexOf(h) : -1
  }
  const idx = Object.fromEntries(CAMPOS_RECEBIVEL.map((c) => [c, col(c)])) as Record<
    CampoRecebivel,
    number
  >

  const linhas: LinhaImportada[] = []
  const erros: Array<{ linha: number; motivo: string }> = []

  rows.forEach((row, i) => {
    const nLinha = i + 2 // +2: cabeçalho é a linha 1
    if (row.every((c) => !String(c || '').trim())) return // linha vazia

    const descricao = idx.descricao >= 0 ? String(row[idx.descricao] || '').trim() : ''
    const valorBruto = idx.valor >= 0 ? String(row[idx.valor] || '') : ''
    const valor = normalizarValor(valorBruto)

    if (!descricao) {
      erros.push({ linha: nLinha, motivo: 'Descrição vazia' })
      return
    }
    if (valor === null || valor <= 0) {
      erros.push({ linha: nLinha, motivo: `Valor inválido: "${valorBruto}"` })
      return
    }

    const gatilhoBruto = idx.gatilho >= 0 ? String(row[idx.gatilho] || '').trim() : ''
    const statusGatilho = gatilhoBruto ? normalizarGatilho(gatilhoBruto) : 'aguardando_despacho'

    linhas.push({
      linha: nLinha,
      descricao,
      valor,
      total_parcelas:
        idx.parcelas >= 0 ? normalizarParcelas(String(row[idx.parcelas] || '')) : null,
      contratante: idx.contratante >= 0 ? String(row[idx.contratante] || '').trim() || null : null,
      status_gatilho: statusGatilho,
      gatilho_outro: statusGatilho === 'outro' && gatilhoBruto ? gatilhoBruto : null,
      observacao: idx.observacao >= 0 ? String(row[idx.observacao] || '').trim() || null : null,
      data_prevista:
        idx.data_prevista >= 0 ? normalizarData(String(row[idx.data_prevista] || '')) : null,
      financeiro_id:
        idx.financeiro >= 0
          ? casarFinanceiro(String(row[idx.financeiro] || ''), financeiros)
          : null,
      plano_conta_id:
        idx.categoria >= 0 ? casarCategoria(String(row[idx.categoria] || ''), planos) : null,
    })
  })

  return { linhas, erros }
}

// ---------- Duplicidade ----------

const chaveDuplicidade = (r: {
  descricao: string
  valor_total: number | string
  contratante?: string | null
}) => `${chave(r.descricao)}|${Number(r.valor_total).toFixed(2)}|${chave(r.contratante || '')}`

// Pendentes existentes com mesma descrição + valor + contratante são duplicatas.
export const separarDuplicados = (
  linhas: LinhaImportada[],
  existentes: RecebivelSemData[],
): { novas: LinhaImportada[]; duplicadas: LinhaImportada[] } => {
  const chavesExistentes = new Set(
    existentes
      .filter((r) => r.status === 'pendente')
      .map((r) => chaveDuplicidade({ ...r, valor_total: Number(r.valor_total) })),
  )
  const novas: LinhaImportada[] = []
  const duplicadas: LinhaImportada[] = []
  for (const l of linhas) {
    if (
      chavesExistentes.has(
        chaveDuplicidade({
          descricao: l.descricao,
          valor_total: l.valor,
          contratante: l.contratante || undefined,
        }),
      )
    )
      duplicadas.push(l)
    else novas.push(l)
  }
  return { novas, duplicadas }
}

// ---------- Exportação ----------

const cabecalhoExport = [
  'Descrição',
  'Empresa',
  'Valor (R$)',
  'Status',
  'Data prevista',
  'Observação',
  'Data de conversão',
]

// Exporta pendentes + convertidos (na ordem recebida) com total pendente no rodapé.
export const linhasRecebiveisCSV = (
  recebiveis: RecebivelSemData[],
  financeiros: Financeiro[],
): string[][] => {
  const linhas: string[][] = [cabecalhoExport]
  let total = 0
  for (const r of recebiveis) {
    const fin = financeiros.find((f) => f.id === r.financeiro_id)
    const valor = Number(r.valor_total) || 0
    if (r.status === 'pendente') total += valor
    linhas.push([
      r.descricao,
      fin?.nome || '',
      valorCSV(valor),
      r.status === 'convertido' ? 'Convertido' : labelGatilho(r),
      r.data_prevista ? formatDateBR(r.data_prevista) : '',
      r.observacao || '',
      r.status === 'convertido' && r.updated_at
        ? formatDateBR(String(r.updated_at).slice(0, 10))
        : '',
    ])
  }
  linhas.push([])
  linhas.push(['Total pendente', '', valorCSV(total), '', '', '', ''])
  return linhas
}

// Monta e baixa o CSV de recebíveis (pendentes + convertidos) com BOM para Excel.
export const exportarRecebiveisCSV = (
  recebiveis: RecebivelSemData[],
  financeiros: Financeiro[],
) => {
  const linhas = linhasRecebiveisCSV(recebiveis, financeiros)
  const conteudo =
    '\uFEFF' +
    linhas
      .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recebiveis-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// ---------- Export CONSOLIDADO por empresa ----------
// Um CSV com seção por empresa: nome da empresa como cabeçalho, recebíveis
// pendentes dela (uma linha cada), total da seção; ao final, o total geral.

// Monta as linhas do CSV consolidado (seção por empresa + total geral ao final).
export const linhasRecebiveisConsolidadoCSV = (
  recebiveis: RecebivelSemData[],
  financeiros: Financeiro[],
): string[][] => {
  const linhas: string[][] = []
  const cabecalhoItens = ['Descrição', 'Contratante', 'Status', 'Data prevista', 'Valor (R$)']
  let totalGeral = 0

  // Empresas na ordem em que os financeiros aparecem (mesma da tela)
  for (const fin of financeiros) {
    const itens = recebiveis.filter((r) => r.financeiro_id === fin.id && r.status === 'pendente')
    if (itens.length === 0) continue
    linhas.push([`Empresa: ${fin.nome}`])
    linhas.push(cabecalhoItens)
    let totalEmpresa = 0
    for (const r of itens) {
      const valor = Number(r.valor_total) || 0
      totalEmpresa += valor
      totalGeral += valor
      linhas.push([
        r.descricao,
        r.contratante || '',
        labelGatilho(r),
        r.data_prevista ? formatDateBR(r.data_prevista) : '',
        valorCSV(valor),
      ])
    }
    linhas.push([`Total ${fin.nome}`, '', '', '', valorCSV(totalEmpresa)])
    linhas.push([])
  }

  linhas.push(['TOTAL GERAL', '', '', '', valorCSV(totalGeral)])
  return linhas
}

// Baixa o CSV consolidado (seções por empresa) com BOM para Excel.
export const exportarRecebiveisConsolidadoCSV = (
  recebiveis: RecebivelSemData[],
  financeiros: Financeiro[],
) => {
  const linhas = linhasRecebiveisConsolidadoCSV(recebiveis, financeiros)
  const conteudo =
    '\uFEFF' +
    linhas
      .map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')
  const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `recebiveis-consolidado-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export { parseCSV }
