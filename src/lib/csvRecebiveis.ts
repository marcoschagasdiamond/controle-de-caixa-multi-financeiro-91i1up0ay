/**
 * Parser e normalização de CSV de RECEBÍVEIS SEM DATA (contratos a receber).
 * Reutiliza o parser genérico de planilhas (sheetParser) e adiciona:
 * - detecção automática de mapeamento pelo nome do cabeçalho (pt-BR);
 * - parse de valores "R$ 1.234,56";
 * - normalização de gatilhos e casamento de categorias/financeiros.
 */
import { parseCSV, normalizeCurrency } from '@/lib/sheetParser'
import { Financeiro, PlanoConta, RecebivelSemData } from '@/types/financeiro'

export const CAMPOS_RECEBIVEL = [
  'descricao',
  'valor',
  'contratante',
  'gatilho',
  'parcelas',
  'categoria',
  'observacao',
  'financeiro',
] as const

export type CampoRecebivel = (typeof CAMPOS_RECEBIVEL)[number]

export const LABEL_CAMPO: Record<CampoRecebivel, string> = {
  descricao: 'Descrição *',
  valor: 'Valor total (R$) *',
  contratante: 'Contratante',
  gatilho: 'Gatilho',
  parcelas: 'Nº de parcelas',
  categoria: 'Categoria',
  observacao: 'Observação',
  financeiro: 'Financeiro',
}

// Termos que identificam cada campo pelo cabeçalho (avaliados na ordem)
const TERMOS_CAMPO: Record<CampoRecebivel, string[]> = {
  descricao: [
    'descricao',
    'descrição',
    'descript',
    'contrato',
    'histórico',
    'historico',
    'recebível',
    'recebivel',
  ],
  valor: ['valor', 'total', 'montante', 'amount'],
  contratante: ['contratante', 'cliente', 'tomador', 'pagador', 'empresa'],
  gatilho: ['gatilho', 'status', 'situação', 'situacao', 'condição', 'condicao'],
  parcelas: ['parcela', 'parcelas', 'nº parcelas', 'qtd'],
  categoria: ['categoria', 'plano', 'rubrica', 'conta contábil', 'conta contabil'],
  observacao: ['observação', 'observacao', 'obs', 'detalhe', 'anotação', 'anotacao'],
  financeiro: ['financeiro', 'empresa destino', 'entidade', 'cpf/cnpj', 'unidade'],
}

// Ordem importa: parcelas antes de valor (para não casar "parcelas" em "valor"); etc.
const ORDEM_DETECCAO: CampoRecebivel[] = [
  'contratante',
  'parcelas',
  'categoria',
  'observacao',
  'gatilho',
  'financeiro',
  'descricao',
  'valor',
]

export const removerAcentos = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Sugere mapeamento campo → nome da coluna do arquivo (ou '' se não achou) */
export function sugerirMapeamento(headers: string[]): Record<CampoRecebivel, string> {
  const map = {} as Record<CampoRecebivel, string>
  const usadas = new Set<string>()
  for (const campo of ORDEM_DETECCAO) {
    const termos = TERMOS_CAMPO[campo]
    const header = headers.find((h) => {
      if (usadas.has(h)) return false
      const n = removerAcentos(h.toLowerCase().trim())
      return termos.some((t) => n.includes(removerAcentos(t)))
    })
    if (header) {
      map[campo] = header
      usadas.add(header)
    } else {
      map[campo] = ''
    }
  }
  return map
}

/** Normaliza o texto do gatilho para o enum existente */
export function normalizarGatilho(texto: string): {
  status_gatilho: RecebivelSemData['status_gatilho']
  gatilho_outro: string | null
} {
  const n = removerAcentos(texto.toLowerCase().trim())
  if (!n) return { status_gatilho: 'aguardando_despacho', gatilho_outro: null }
  if (n.includes('despacho')) return { status_gatilho: 'aguardando_despacho', gatilho_outro: null }
  if (
    n.includes('término') ||
    n.includes('termino') ||
    n.includes('conclus') ||
    n.includes('entrega')
  )
    return { status_gatilho: 'aguardando_termino', gatilho_outro: null }
  return { status_gatilho: 'outro', gatilho_outro: texto.trim() }
}

/** Parse de número de parcelas: vazio = null; inválido = -1 (erro) */
export function normalizarParcelas(texto: string): number | null {
  const n = texto.trim()
  if (!n) return null
  const num = parseInt(n.replace(/[^\d]/g, ''), 10)
  if (isNaN(num) || num < 1) return -1
  return num
}

/** Casamento de categoria por código (exato) ou descrição (contém) — plano GLOBAL */
export function casarCategoria(texto: string, planos: PlanoConta[]): PlanoConta | null {
  const t = removerAcentos(texto.toLowerCase().trim())
  if (!t) return null
  const receitas = planos.filter((p) => p.tipo === 'receita')
  const porCodigo = receitas.find((p) => p.codigo && removerAcentos(p.codigo.toLowerCase()) === t)
  if (porCodigo) return porCodigo
  const porDescricaoExata = receitas.find((p) => removerAcentos(p.descricao.toLowerCase()) === t)
  if (porDescricaoExata) return porDescricaoExata
  const porContem = receitas.find((p) => removerAcentos(p.descricao.toLowerCase()).includes(t))
  return porContem ?? null
}

/** Casamento de financeiro por nome (contém, acentos ignorados) */
export function casarFinanceiro(nome: string, financeiros: Financeiro[]): Financeiro | null {
  const n = removerAcentos(nome.toLowerCase().trim())
  if (!n) return null
  return (
    financeiros.find((f) => removerAcentos(f.nome.toLowerCase()) === n) ??
    financeiros.find((f) => removerAcentos(f.nome.toLowerCase()).includes(n)) ??
    null
  )
}

export interface LinhaImportada {
  linha: number // 1-based, só dados
  descricao: string
  valor: number
  contratante: string | null
  status_gatilho: RecebivelSemData['status_gatilho']
  gatilho_outro: string | null
  total_parcelas: number | null
  plano_conta_id: string | null
  observacao: string | null
  financeiro_id: string | null
}

export interface ResultadoParse {
  linhas: LinhaImportada[]
  erros: Array<{ linha: number; motivo: string }>
}

/** Converte as linhas cruas do CSV em recebíveis, usando o mapeamento do usuário */
export function transformarLinhas(
  rows: string[][],
  headers: string[],
  map: Record<CampoRecebivel, string>,
  financeiros: Financeiro[],
  planos: PlanoConta[],
): ResultadoParse {
  const idx: Partial<Record<CampoRecebivel, number>> = {}
  for (const campo of CAMPOS_RECEBIVEL) {
    if (map[campo]) idx[campo] = headers.indexOf(map[campo])
  }

  const linhas: LinhaImportada[] = []
  const erros: Array<{ linha: number; motivo: string }> = []

  rows.forEach((cells, i) => {
    const numLinha = i + 1
    const get = (c: CampoRecebivel) => {
      const j = idx[c]
      return j !== undefined && j >= 0 ? (cells[j] ?? '').trim() : ''
    }

    const descricao = get('descricao')
    const valorTexto = get('valor')
    const valor = valorTexto ? normalizeCurrency(valorTexto) : 0

    if (!descricao) {
      erros.push({ linha: numLinha, motivo: 'Descrição vazia' })
      return
    }
    if (!valor || valor <= 0) {
      erros.push({ linha: numLinha, motivo: `Valor inválido ("${valorTexto}")` })
      return
    }

    const gatilho = normalizarGatilho(get('gatilho'))
    let parcelas: number | null = null
    const parcelasTexto = get('parcelas')
    if (parcelasTexto) {
      parcelas = normalizarParcelas(parcelasTexto)
      if (parcelas === -1) {
        erros.push({ linha: numLinha, motivo: `Nº de parcelas inválido ("${parcelasTexto}")` })
        return
      }
      if (parcelas !== null && parcelas < 2) parcelas = null // 1 = pagamento único
    }

    const finTexto = get('financeiro')
    let financeiro_id: string | null = null
    if (finTexto) {
      const fin = casarFinanceiro(finTexto, financeiros)
      if (!fin) {
        erros.push({ linha: numLinha, motivo: `Financeiro não encontrado: "${finTexto}"` })
        return
      }
      financeiro_id = fin.id
    }

    const catTexto = get('categoria')
    const plano = catTexto ? casarCategoria(catTexto, planos) : null
    const categoriaNome = get('categoria')

    linhas.push({
      linha: numLinha,
      descricao,
      valor,
      contratante: get('contratante') || null,
      status_gatilho: gatilho.status_gatilho,
      gatilho_outro: gatilho.gatilho_outro,
      total_parcelas: parcelas && parcelas > 1 ? parcelas : null,
      plano_conta_id: plano?.id ?? null,
      observacao: get('observacao') || null,
      financeiro_id,
    })
    void categoriaNome
  })

  return { linhas, erros }
}

/** Normaliza texto para comparação de duplicidade (minúsculas, sem espaços extras) */
const chaveDuplicidade = (r: { descricao: string; valor: number; contratante?: string | null }) =>
  `${removerAcentos(r.descricao.toLowerCase().trim())}|${r.valor.toFixed(2)}|${removerAcentos(
    (r.contratante || '').toLowerCase().trim(),
  )}`

/**
 * Separa linhas em novas / duplicadas, considerando:
 * - os recebíveis já existentes no banco (pendentes);
 * - repetições dentro do próprio arquivo.
 */
export function separarDuplicados(
  linhas: LinhaImportada[],
  existentes: RecebivelSemData[],
): { novas: LinhaImportada[]; duplicadas: LinhaImportada[] } {
  const chavesExistentes = new Set(
    existentes
      .filter((r) => r.status === 'pendente')
      .map((r) =>
        chaveDuplicidade({
          descricao: r.descricao,
          valor: Number(r.valor_total),
          contratante: r.contratante,
        }),
      ),
  )
  const novas: LinhaImportada[] = []
  const duplicadas: LinhaImportada[] = []
  for (const l of linhas) {
    const chave = chaveDuplicidade(l)
    if (chavesExistentes.has(chave) || novas.some((n) => chaveDuplicidade(n) === chave)) {
      duplicadas.push(l)
    } else {
      novas.push(l)
    }
  }
  return { novas, duplicadas }
}
