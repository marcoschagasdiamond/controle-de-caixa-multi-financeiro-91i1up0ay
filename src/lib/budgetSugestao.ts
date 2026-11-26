// Cálculo da sugestão de valor orçado do Budget (tela Budget vs Realizado).
// Sugestão por categoria = média dos valores REALIZADOS dos últimos 12 meses
// (a média usa só os meses que têm lançamento realizado) SOMADA às ocorrências
// de recorrentes/parcelados com vencimento no mês alvo — via recorrenteOcorreEm
// (src/lib/recorrentes.ts), a mesma regra da Projeção Anual e do Fluxo de Caixa.
//
// Sem dupla contagem: uma ocorrência de recorrente que já tem lançamento
// equivalente no mês (mesma descrição e data, realizado OU previsto — mesmo
// critério de dedupe de src/lib/projecao.ts) não entra na soma, porque o valor
// dela já está dentro da média realizada.
//
// Categorias sem histórico e sem recorrente ficam com sugestão 0 (não inventa valor).

import { Lancamento, LancamentoRecorrente, PlanoConta } from '@/types/financeiro'
import { recorrenteOcorreEm } from './recorrentes'

export const MESES_HISTORICO_SUGESTAO = 12

export interface SugestaoOrcado {
  // plano_conta_id → valor sugerido (0 quando não há base para sugerir)
  porPlano: Map<string, number>
  // Quantos meses da janela têm pelo menos um lançamento realizado do financeiro
  mesesConsiderados: number
}

// Vencimento de um recorrente dentro do mês (YYYY-MM): dia_mes limitado ao
// último dia do mês (31 → 28/30), igual à Projeção Anual de Recorrentes.
function vencimentoNoMes(mesAno: string, diaMes: number): string {
  const [ano, mes] = mesAno.split('-').map(Number)
  const ultimoDia = new Date(ano, mes, 0).getDate()
  const dia = Math.min(Math.max(Number(diaMes) || 1, 1), ultimoDia)
  return `${mesAno}-${String(dia).padStart(2, '0')}`
}

// Lista os N meses anteriores ao mês alvo (YYYY-MM), mais recentes primeiro,
// sem contar o próprio mês alvo. Ex.: alvo 2026-03, N=2 → ['2026-02', '2026-01']
export function mesesAnteriores(mesAlvo: string, n: number): string[] {
  const [ano, mes] = mesAlvo.split('-').map(Number)
  const lista: string[] = []
  for (let i = 1; i <= n; i++) {
    const d = new Date(ano, mes - 1 - i, 1)
    lista.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  return lista
}

export function calcularSugestaoOrcado(
  planos: PlanoConta[],
  lancamentos: Lancamento[],
  recorrentes: LancamentoRecorrente[],
  financeiroId: string,
  mesAlvo: string, // YYYY-MM
): SugestaoOrcado {
  const meses = mesesAnteriores(mesAlvo, MESES_HISTORICO_SUGESTAO)

  // 1. Média realizada por categoria: soma por mês dentro da janela e divide
  //    pelo número de meses que têm movimento realizado da categoria.
  const somaPorPlanoMes = new Map<string, Map<string, number>>()
  const mesesComMovimento = new Set<string>()
  for (const l of lancamentos) {
    if (l.financeiro_id !== financeiroId) continue
    if (l.status !== 'realizado') continue
    const mes = l.data.slice(0, 7)
    if (!meses.includes(mes)) continue
    mesesComMovimento.add(mes)
    if (!l.plano_conta_id) continue
    let porMes = somaPorPlanoMes.get(l.plano_conta_id)
    if (!porMes) {
      porMes = new Map()
      somaPorPlanoMes.set(l.plano_conta_id, porMes)
    }
    porMes.set(mes, (porMes.get(mes) || 0) + Number(l.valor || 0))
  }

  const mediaPorPlano = new Map<string, number>()
  for (const [planoId, porMes] of somaPorPlanoMes) {
    if (porMes.size === 0) continue
    let soma = 0
    for (const v of porMes.values()) soma += v
    mediaPorPlano.set(planoId, soma / porMes.size)
  }

  // 2. Recorrentes/parcelas com vencimento no mês alvo (ativo + financeiro),
  //    excluindo ocorrências já representadas por lançamento equivalente no mês.
  const dataVenc = (r: LancamentoRecorrente) => vencimentoNoMes(mesAlvo, r.dia_mes)
  const temLancamentoEquivalente = (r: LancamentoRecorrente, data: string) =>
    lancamentos.some(
      (l) =>
        l.financeiro_id === r.financeiro_id &&
        l.descricao === r.descricao &&
        l.data === data &&
        (l.status === 'realizado' || l.status === 'previsto'),
    )

  const recorrentePorPlano = new Map<string, number>()
  for (const r of recorrentes) {
    if (!r.ativo || r.financeiro_id !== financeiroId) continue
    if (!r.plano_conta_id) continue
    const data = dataVenc(r)
    if (!recorrenteOcorreEm(data, r.dia_mes, r.data_inicial, r.total_parcelas)) continue
    if (temLancamentoEquivalente(r, data)) continue
    recorrentePorPlano.set(
      r.plano_conta_id,
      (recorrentePorPlano.get(r.plano_conta_id) || 0) + Number(r.valor || 0),
    )
  }

  // 3. Sugestão final = média + recorrentes/parcelas do mês (0 quando não há base)
  const porPlano = new Map<string, number>()
  for (const plano of planos) {
    if (!plano.ativo) continue
    const media = mediaPorPlano.get(plano.id) || 0
    const rec = recorrentePorPlano.get(plano.id) || 0
    const total = Math.round((media + rec) * 100) / 100
    porPlano.set(plano.id, total)
  }

  return { porPlano, mesesConsiderados: mesesComMovimento.size }
}
