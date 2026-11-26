// Projeção anual para o DRE (modo "Ano completo" com o toggle ativo).
// Para cada categoria (plano de contas) do financeiro, calcula as ocorrências
// mensais de recorrentes e parcelas no ano selecionado, dedupadas contra os
// lançamentos REALIZADOS daquele mês (uma ocorrência de recorrente que já tem
// lançamento realizado correspondente no mês não entra de novo).
// Os valores projetados são somados ao realizado por categoria/mês na página DRE.

import { recorrenteOcorreEm } from './recorrentes'
import { Lancamento, LancamentoRecorrente } from '@/types/financeiro'

export function calcularProjecaoPorPlano(
  ano: number,
  recorrentes: LancamentoRecorrente[],
  lancamentos: Lancamento[],
  finId: string,
): Map<string, number[]> {
  const mapa = new Map<string, number[]>()

  // Recorrentes/parcelas do financeiro (inativos ficam de fora; a vigência
  // mensal é decidida por recorrenteOcorreEm, igual à Projeção Anual)
  const doFin = recorrentes.filter((r) => r.financeiro_id === finId)

  // Realizados do ano por categoria/mês — contagem por valor exato (±centavo),
  // consumida pelo dedupe par a par (ocorrência ↔ realizado do mesmo valor)
  const usadosPorChave = new Map<string, Map<string, number>>()
  const chaveUsados = (planoId: string, m: number) => `${planoId}|${m}`
  for (const l of lancamentos) {
    if (l.status !== 'realizado') continue
    if (l.financeiro_id !== finId) continue
    if (!l.data.startsWith(`${ano}-`)) continue
    const m = Number(l.data.slice(5, 7)) - 1
    if (!(m >= 0 && m <= 11)) continue
    const chaveValor = Math.abs(Number(l.valor) || 0).toFixed(2)
    const chave = chaveUsados(l.plano_conta_id, m)
    let porValor = usadosPorChave.get(chave)
    if (!porValor) {
      porValor = new Map()
      usadosPorChave.set(chave, porValor)
    }
    porValor.set(chaveValor, (porValor.get(chaveValor) || 0) + 1)
  }

  for (const r of doFin) {
    if (!r.ativo) continue
    if (!r.plano_conta_id) continue
    if (!r.data_inicial) continue

    for (let m = 0; m < 12; m++) {
      const diaISO = `${ano}-${String(m + 1).padStart(2, '0')}-${String(r.dia_mes || 1).padStart(2, '0')}`
      if (!recorrenteOcorreEm(diaISO, r.dia_mes || 1, r.data_inicial, r.total_parcelas)) continue

      const valor = Math.abs(Number(r.valor) || 0)
      if (valor === 0) continue

      // Dedupe par a par: a ocorrência entra de novo se ainda existe um
      // lançamento realizado não casado desta categoria, neste mês, com o
      // mesmo valor (ex.: o recorrente "Copel" já foi marcado como pago).
      const porValor = usadosPorChave.get(chaveUsados(r.plano_conta_id, m))
      const chaveValor = valor.toFixed(2)
      if (porValor && (porValor.get(chaveValor) || 0) > 0) {
        porValor.set(chaveValor, (porValor.get(chaveValor) || 0) - 1)
        continue
      }

      let arr = mapa.get(r.plano_conta_id)
      if (!arr) {
        arr = Array.from({ length: 12 }, () => 0)
        mapa.set(r.plano_conta_id, arr)
      }
      arr[m] += valor
    }
  }

  return mapa
}
