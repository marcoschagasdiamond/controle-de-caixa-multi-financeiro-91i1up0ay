// Lógica pura do Extrato por Favorecido (contraparte): busca, filtros, totais e CSV.
import { Lancamento } from '@/types/financeiro'
import { formatDateBR } from '@/lib/formatters'
import { valorCSV } from '@/lib/csv'

export type PeriodoRelatorio = 'mes' | 'ano' | 'tudo'
export type TipoPagamento = 'todos' | 'pago' | 'recebido'

export interface LinhaRelatorioPessoa {
  id: string
  data: string
  valor: number
  descricao: string
  tipo: 'credito' | 'debito'
  status: 'previsto' | 'realizado'
  financeiro_id: string
  empresa: string
  conta: string
  contraparte: string
}

export interface GrupoEmpresa {
  financeiroId: string
  empresa: string
  linhas: LinhaRelatorioPessoa[]
  totais: TotaisPessoa
}

export interface TotaisPessoa {
  totalPago: number
  totalRecebido: number
  quantidade: number
  previstos: number
}

// Minúsculas e sem acentos, para comparar nomes de forma tolerante
export const normalizarTexto = (s: string): string =>
  s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()

// Nomes distintos de contraparte que contêm o termo digitado
export function sugerirContrapartes(
  lancamentos: Lancamento[],
  termo: string,
  limite = 8,
): string[] {
  const t = normalizarTexto(termo)
  if (!t) return []
  const nomes = new Map<string, string>()
  for (const l of lancamentos) {
    const nome = (l.contraparte ?? '').trim()
    if (!nome) continue
    const chave = normalizarTexto(nome)
    if (chave.includes(t) && !nomes.has(chave)) nomes.set(chave, nome)
  }
  return Array.from(nomes.values())
    .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    .slice(0, limite)
}

export interface FiltrosRelatorio {
  termo: string
  pessoa: string | null // contraparte escolhida nas sugestões (match exato)
  periodo: PeriodoRelatorio
  tipo: TipoPagamento
  hoje: string // YYYY-MM-DD
  financeiroId?: string | null // empresa (financeiro) escolhida no filtro; null = todas
}

// Aplica busca por pessoa, empresa, período e tipo sobre TODOS os lançamentos recebidos
export function filtrarRelatorio(lancamentos: Lancamento[], f: FiltrosRelatorio): Lancamento[] {
  const termo = normalizarTexto(f.termo)
  if (!f.pessoa && !termo) return []

  return lancamentos.filter((l) => {
    const contra = normalizarTexto(l.contraparte ?? '')
    if (!contra) return false
    if (f.pessoa) {
      if (contra !== normalizarTexto(f.pessoa)) return false
    } else if (!contra.includes(termo)) {
      return false
    }

    if (f.financeiroId && l.financeiro_id !== f.financeiroId) return false

    if (f.periodo === 'mes' && l.data.slice(0, 7) !== f.hoje.slice(0, 7)) return false
    if (f.periodo === 'ano' && l.data.slice(0, 4) !== f.hoje.slice(0, 4)) return false

    if (f.tipo === 'pago' && l.tipo !== 'debito') return false
    if (f.tipo === 'recebido' && l.tipo !== 'credito') return false
    return true
  })
}

// Converte lançamentos em linhas de tabela, da data mais recente para a mais antiga
export function montarLinhasRelatorio(
  lancamentos: Lancamento[],
  nomesEmpresa: Map<string, string>,
  nomesConta: Map<string, string>,
): LinhaRelatorioPessoa[] {
  return lancamentos
    .map((l) => ({
      id: l.id,
      data: l.data,
      valor: Number(l.valor) || 0,
      descricao: l.descricao,
      tipo: l.tipo,
      status: l.status,
      financeiro_id: l.financeiro_id,
      empresa: nomesEmpresa.get(l.financeiro_id) ?? '—',
      conta: nomesConta.get(l.conta_id) ?? '—',
      contraparte: l.contraparte ?? '',
    }))
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0))
}

// Totais contam somente lançamentos REALIZADOS; previstos aparecem mas ficam fora
export function calcularTotais(linhas: LinhaRelatorioPessoa[]): TotaisPessoa {
  let totalPago = 0
  let totalRecebido = 0
  let previstos = 0
  for (const l of linhas) {
    if (l.status !== 'realizado') {
      previstos++
      continue
    }
    if (l.tipo === 'debito') totalPago += l.valor
    else totalRecebido += l.valor
  }
  return { totalPago, totalRecebido, quantidade: linhas.length, previstos }
}

export const rotuloTipo = (tipo: 'credito' | 'debito') => (tipo === 'debito' ? 'Pago' : 'Recebido')
export const rotuloStatus = (status: 'previsto' | 'realizado') =>
  status === 'realizado' ? 'Realizado' : 'Previsto'

// Agrupa as linhas por empresa (financeiro), com subtotais; empresas em ordem alfabética
export function agruparPorEmpresa(linhas: LinhaRelatorioPessoa[]): GrupoEmpresa[] {
  const mapa = new Map<string, LinhaRelatorioPessoa[]>()
  for (const l of linhas) {
    const lista = mapa.get(l.financeiro_id)
    if (lista) lista.push(l)
    else mapa.set(l.financeiro_id, [l])
  }
  return Array.from(mapa.entries())
    .map(([financeiroId, lista]) => ({
      financeiroId,
      empresa: lista[0].empresa,
      linhas: lista,
      totais: calcularTotais(lista),
    }))
    .sort((a, b) => a.empresa.localeCompare(b.empresa, 'pt-BR'))
}

const CABECALHO_CSV = ['Data', 'Valor (R$)', 'Descrição', 'Empresa', 'Conta', 'Tipo', 'Status']

const linhaCSV = (l: LinhaRelatorioPessoa): unknown[] => [
  formatDateBR(l.data),
  valorCSV(l.valor),
  l.descricao,
  l.empresa,
  l.conta,
  rotuloTipo(l.tipo),
  rotuloStatus(l.status),
]

const rodapeCSV = (totais: TotaisPessoa): unknown[][] => [
  [],
  ['Total pago (R$)', valorCSV(totais.totalPago)],
  ['Total recebido (R$)', valorCSV(totais.totalRecebido)],
  ['Quantidade de lançamentos', String(totais.quantidade)],
]

// Cabeçalho e linhas do CSV: mesmas colunas da tabela, com os totais no rodapé
export function montarCSVRelatorio(linhas: LinhaRelatorioPessoa[], totais: TotaisPessoa) {
  const corpo: unknown[][] = linhas.map(linhaCSV)
  return { cabecalho: CABECALHO_CSV, linhas: [...corpo, ...rodapeCSV(totais)] }
}

// CSV da visão por empresa: cada empresa traz suas linhas seguidas de um subtotal (pago e recebido)
export function montarCSVPorEmpresa(grupos: GrupoEmpresa[], totais: TotaisPessoa) {
  const corpo: unknown[][] = []
  for (const g of grupos) {
    for (const l of g.linhas) corpo.push(linhaCSV(l))
    corpo.push([
      '',
      valorCSV(g.totais.totalPago),
      `Subtotal pago — ${g.empresa}`,
      g.empresa,
      '',
      'Pago',
      `${g.totais.quantidade} lançamento(s)`,
    ])
    corpo.push([
      '',
      valorCSV(g.totais.totalRecebido),
      `Subtotal recebido — ${g.empresa}`,
      g.empresa,
      '',
      'Recebido',
      '',
    ])
    corpo.push([])
  }
  return { cabecalho: CABECALHO_CSV, linhas: [...corpo, ...rodapeCSV(totais)] }
}
