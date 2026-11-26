// Cálculo de vencimento dos lançamentos (datas ISO yyyy-mm-dd, sem fuso).

export type SituacaoPagamento = 'em_dia' | 'em_atraso' | 'sem_vencimento'

/** Dias entre duas datas ISO (b - a). Positivo quando b é depois de a. */
export function diasEntre(a: string, b: string): number {
  const ta = Date.UTC(Number(a.slice(0, 4)), Number(a.slice(5, 7)) - 1, Number(a.slice(8, 10)))
  const tb = Date.UTC(Number(b.slice(0, 4)), Number(b.slice(5, 7)) - 1, Number(b.slice(8, 10)))
  return Math.round((tb - ta) / 86400000)
}

/** Realizado: data <= vencimento = em dia; data > vencimento = em atraso. */
export function situacaoRealizado(
  data: string,
  dataVencimento: string | null | undefined,
): SituacaoPagamento {
  if (!dataVencimento) return 'sem_vencimento'
  return diasEntre(dataVencimento, data) > 0 ? 'em_atraso' : 'em_dia'
}

/** Dias de atraso de um realizado (0 quando em dia ou sem vencimento). */
export function diasAtraso(data: string, dataVencimento: string | null | undefined): number {
  if (!dataVencimento) return 0
  return Math.max(0, diasEntre(dataVencimento, data))
}
