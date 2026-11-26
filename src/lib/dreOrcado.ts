// DRE vs Orçamento: comparação entre o realizado (e, opcionalmente, projetado)
// e o orçado da tabela de budgets — por categoria, subtotal de grupo, totais
// de bloco e RESULTADO. Semântica de cores igual à tela Budget (verde bom,
// amarelo atenção, vermelho ruim), mas com a direção coerente por tipo:
// em DESPESA gastar menos que o orçado é bom; em RECEITA receber menos é ruim.

import { Budget } from '@/types/financeiro'

export interface CompDRE {
  orcado: number
  realizado: number
  variacaoR$: number // orçado − realizado
  percentual: number // realizado ÷ orçado × 100 (0 quando orçado = 0)
}

// Orçado por categoria e mês (posição 0 = jan) a partir das linhas de budgets
// do financeiro. prefixoPeriodo: "YYYY-MM" (mês único) ou "YYYY-" (ano inteiro,
// soma os 12 meses nas suas posições).
export function orcadoPorPlano(
  budgets: Budget[],
  finId: string,
  prefixoPeriodo: string,
): Map<string, number[]> {
  const mapa = new Map<string, number[]>()
  for (const b of budgets) {
    if (b.financeiro_id !== finId) continue
    if (!b.mes_ano.startsWith(prefixoPeriodo)) continue
    const m = Number(b.mes_ano.slice(5, 7)) - 1
    if (!(m >= 0 && m <= 11)) continue
    let arr = mapa.get(b.plano_conta_id)
    if (!arr) {
      arr = Array.from({ length: 12 }, () => 0)
      mapa.set(b.plano_conta_id, arr)
    }
    arr[m] += Number(b.valor_orcado) || 0
  }
  return mapa
}

// Comparação de uma linha para o período exibido: mês único = posição do mês;
// ano completo = soma das 12 posições. realizadoMes pode já incluir projeção.
export function calcularComp(
  orcadoMes: number[],
  realizadoMes: number[],
  modoAno: boolean,
  mesIdx: number,
): CompDRE {
  const orcado = modoAno ? soma(orcadoMes) : (orcadoMes[mesIdx] ?? 0)
  const realizado = modoAno ? soma(realizadoMes) : (realizadoMes[mesIdx] ?? 0)
  return {
    orcado,
    realizado,
    variacaoR$: orcado - realizado,
    percentual: orcado > 0 ? (realizado / orcado) * 100 : 0,
  }
}

const soma = (arr: number[]) => arr.reduce((a, b) => a + b, 0)

// Cor da variação na mesma semântica da tela Budget (verde ≤90%, amarelo
// 90–100%, vermelho >100% de execução), espelhada para RECEITAS: executar
// ABAIXO do orçado é ruim, acima é bom (a "boa" direção é coerente por tipo).
// Sem orçado (orcado = 0) não pinta: cinza neutro.
export function classeComp(c: CompDRE, tipo: 'receita' | 'despesa'): string {
  if (c.orcado <= 0) return 'text-gray-400'
  const pct = c.percentual
  if (tipo === 'despesa') {
    if (pct <= 90) return 'text-[#00D68F]'
    if (pct <= 100) return 'text-amber-400'
    return 'text-[#FF5C5C]'
  }
  if (pct >= 100) return 'text-[#00D68F]'
  if (pct >= 90) return 'text-amber-400'
  return 'text-[#FF5C5C]'
}

// Sinal exibido da variação em R$ e %: positivo = executou "a favor"
// (despesa abaixo do orçado / receita acima); negativo = contra.
export function sinalComp(c: CompDRE, tipo: 'receita' | 'despesa'): string {
  if (c.orcado <= 0) return ''
  if (tipo === 'despesa') return c.percentual <= 100 ? '+' : '−'
  return c.percentual >= 100 ? '+' : '−'
}

export const percentualComp = (c: CompDRE) => (c.orcado > 0 ? `${c.percentual.toFixed(1)}%` : '—')
