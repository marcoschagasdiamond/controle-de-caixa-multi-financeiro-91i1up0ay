// Projeção de caixa para os próximos 30 dias (Painel).
// Concatena: saldo atual (contas + realizados) + lançamentos previstos futuros
// + contas fixas ativas ainda não geradas + ocorrências de lançamentos recorrentes ativos.
// RLS: tudo chega já filtrado por user_id; o filtro por financeiro é aplicado aqui.

import { Lancamento, ContaFixa, LancamentoRecorrente, ContaBancaria } from '@/types/financeiro'
import { recorrenteOcorreEm } from '@/lib/recorrentes'
import { getTodayISODate, addDays } from '@/lib/formatters'

export interface ProjecaoDetalhe {
  data: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  origem: 'lancamento' | 'conta_fixa' | 'recorrente'
}

export interface ProjecaoSaldo {
  saldoAtual: number
  totalEntradasPrevistas: number
  totalSaidasPrevistas: number
  saldoProjetado: number
  detalhes: ProjecaoDetalhe[]
}

function diaEfetivo(diaMes: number, ano: number, mes: number): number {
  const ultimoDia = new Date(ano, mes + 1, 0).getDate()
  return Math.min(diaMes, ultimoDia)
}

function dataISO(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
}

export function projetarSaldo30Dias(
  contas: ContaBancaria[],
  lancamentos: Lancamento[],
  contasFixas: ContaFixa[],
  recorrentes: LancamentoRecorrente[],
  financeiroIdFiltro?: string,
): ProjecaoSaldo {
  const hoje = getTodayISODate()
  const limite = addDays(hoje, 30)
  const filtrar = (id: string) =>
    !financeiroIdFiltro || financeiroIdFiltro === 'todos' || id === financeiroIdFiltro

  // 1. Saldo atual: saldo inicial das contas + lançamentos realizados
  const contasFiltradas = contas.filter((c) => filtrar(c.financeiro_id))
  let saldoAtual = contasFiltradas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
  for (const l of lancamentos) {
    if (!filtrar(l.financeiro_id)) continue
    if (l.status === 'realizado') {
      saldoAtual += l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor)
    }
  }

  const detalhes: ProjecaoDetalhe[] = []
  let totalEntradas = 0
  let totalSaidas = 0
  type ItemProjeção = Omit<ProjecaoDetalhe, 'valor'>
  const push = (d: ItemProjeção, valor: number, sinal: 1 | -1) => {
    const v = Math.abs(valor)
    if (sinal > 0) totalEntradas += v
    else totalSaidas += v
    detalhes.push({ ...d, valor: v })
  }

  // 2. Lançamentos previstos com data futura (após hoje) dentro dos 30 dias
  for (const l of lancamentos) {
    if (!filtrar(l.financeiro_id)) continue
    if (l.status !== 'previsto') continue
    if (l.data <= hoje || l.data > limite) continue
    push(
      { data: l.data, descricao: l.descricao, tipo: l.tipo, origem: 'lancamento' },
      Number(l.valor),
      l.tipo === 'credito' ? 1 : -1,
    )
  }

  // 3. Contas fixas ativas ainda não geradas (sem lançamento realizado correspondente no ciclo)
  for (const cf of contasFixas) {
    if (!cf.ativo || !filtrar(cf.financeiro_id)) continue
    const dia = Math.min(Math.max(Number(cf.dia_vencimento) || 1, 1), 31)
    // Ciclo do mês corrente; se o dia já passou neste mês, avança para o próximo
    let anoCiclo = Number(hoje.slice(0, 4))
    let mesCiclo = Number(hoje.slice(5, 7)) - 1
    if (diaEfetivo(dia, anoCiclo, mesCiclo) < Number(hoje.slice(8, 10))) {
      mesCiclo++
      if (mesCiclo > 11) {
        mesCiclo = 0
        anoCiclo++
      }
    }
    const diaCiclo = diaEfetivo(dia, anoCiclo, mesCiclo)
    const venc = dataISO(anoCiclo, mesCiclo, diaCiclo)
    if (venc < hoje || venc > limite) continue

    // Já existe lançamento realizado equivalente neste ciclo? (evita dupla contagem)
    const ciclo = venc.slice(0, 7)
    const jaGerada = lancamentos.some(
      (l) =>
        l.status === 'realizado' &&
        l.financeiro_id === cf.financeiro_id &&
        l.descricao === cf.descricao &&
        l.data.startsWith(ciclo),
    )
    if (jaGerada) continue

    push(
      { data: venc, descricao: cf.descricao, tipo: 'debito', origem: 'conta_fixa' },
      Number(cf.valor_estimado),
      cf.tipo === 'receita' ? 1 : -1,
    )
  }

  // 4. Ocorrências de lançamentos recorrentes ativos nos próximos 30 dias
  for (const r of recorrentes) {
    if (!r.ativo || !filtrar(r.financeiro_id)) continue
    // varre dia a dia a janela [hoje, limite]
    let cursor = hoje
    while (cursor <= limite) {
      if (recorrenteOcorreEm(cursor, r.dia_mes, r.data_inicial)) {
        // Já existe lançamento previsto/realizado equivalente no mesmo dia e financeiro? evita dupla contagem
        const duplicado = lancamentos.some(
          (l) =>
            l.financeiro_id === r.financeiro_id && l.descricao === r.descricao && l.data === cursor,
        )
        if (!duplicado) {
          push(
            { data: cursor, descricao: r.descricao, tipo: r.tipo, origem: 'recorrente' },
            Number(r.valor),
            r.tipo === 'credito' ? 1 : -1,
          )
        }
      }
      cursor = addDays(cursor, 1)
    }
  }

  detalhes.sort((a, b) => a.data.localeCompare(b.data))
  return {
    saldoAtual,
    totalEntradasPrevistas: totalEntradas,
    totalSaidasPrevistas: totalSaidas,
    saldoProjetado: saldoAtual + totalEntradas - totalSaidas,
    detalhes,
  }
}

// Ocorrências de recorrentes ativos para os próximos vencimentos do Painel
export function ocorrenciasRecorrentes(
  recorrentes: LancamentoRecorrente[],
  lancamentos: Lancamento[],
  financeiroIdFiltro?: string,
  dias = 30,
  max = 5,
): ProjecaoDetalhe[] {
  const hoje = getTodayISODate()
  const limite = addDays(hoje, dias)
  const filtrar = (id: string) =>
    !financeiroIdFiltro || financeiroIdFiltro === 'todos' || id === financeiroIdFiltro
  const lista: ProjecaoDetalhe[] = []
  for (const r of recorrentes) {
    if (!r.ativo || !filtrar(r.financeiro_id)) continue
    let cursor = hoje
    while (cursor <= limite && lista.length < max + 20) {
      if (recorrenteOcorreEm(cursor, r.dia_mes, r.data_inicial)) {
        const duplicado = lancamentos.some(
          (l) =>
            l.financeiro_id === r.financeiro_id &&
            l.descricao === r.descricao &&
            l.data === cursor &&
            (l.status === 'realizado' || l.status === 'previsto'),
        )
        if (!duplicado) {
          lista.push({
            data: cursor,
            descricao: r.descricao,
            valor: Number(r.valor),
            tipo: r.tipo,
            origem: 'recorrente',
          })
        }
      }
      cursor = addDays(cursor, 1)
    }
  }
  return lista.sort((a, b) => a.data.localeCompare(b.data)).slice(0, max)
}
