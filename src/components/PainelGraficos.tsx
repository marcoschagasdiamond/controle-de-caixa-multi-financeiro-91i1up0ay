// Camada de gráficos do Painel (nova, abaixo dos cards existentes):
// 1) Despesas por grupo do plano de contas (mês corrente, realizados)
// 2) Receitas por grupo do plano de contas (mês corrente, realizados)
// 3) Orçado vs Realizado por grupo (budgets do mês + realizados), com % consumido
// 4) Tendência de saldo: histórico recente + projeção diária (mesma base da
//    projeção de 30 dias), com dias de saldo NEGATIVO marcados em vermelho.

import { useEffect, useMemo, useState } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import {
  ContaBancaria,
  ContaFixa,
  Financeiro,
  Lancamento,
  LancamentoRecorrente,
  PlanoConta,
  PlanoGrupo,
  Budget,
} from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate, addDays } from '@/lib/formatters'
import { projetarSaldo30Dias } from '@/lib/projecao'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertTriangle } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  Area,
  ReferenceLine,
} from 'recharts'

// Paleta de destaque para as barras (ciclo a partir da 4ª barra)
const PALETA = [
  '#00D68F',
  '#38BDF8',
  '#F59E0B',
  '#A78BFA',
  '#F472B6',
  '#34D399',
  '#60A5FA',
  '#FB923C',
]
const VERDE = '#00D68F'
const VERMELHO = '#FF5C5C'
const AMBAR = '#F59E0B'

const tooltipStyle = {
  backgroundColor: '#0B0F14',
  borderColor: '#232B36',
  borderRadius: '8px',
  color: '#F1F5F9',
} as const

const fmtK = (val: number) => `R$ ${(val / 1000).toFixed(0)}k`

interface Props {
  financeiros: Financeiro[]
  lancamentos: Lancamento[]
  contas: ContaBancaria[]
  contasFixas: ContaFixa[]
  recorrentes: LancamentoRecorrente[]
  financeiroIdSelecionado: string
  saldoAtual: number
  /** Mês de referência no formato YYYY-MM escolhido no seletor do Painel */
  mesAno: string
  /** Rótulo legível do mês escolhido (ex.: "fevereiro/2025") */
  mesLabel?: string
}

export function PainelGraficos({
  financeiros,
  lancamentos,
  contas,
  contasFixas,
  recorrentes,
  financeiroIdSelecionado,
  saldoAtual,
  mesAno,
  mesLabel,
}: Props) {
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [grupos, setGrupos] = useState<PlanoGrupo[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])

  // Mês de referência: o escolhido no seletor do Painel (os cards do topo do
  // Painel já são recalculados lá); aqui controla gráficos por grupo e budgets.
  const mesAtualStr = mesAno

  // Plano de contas é GLOBAL: categorias e grupos vêm sem filtro de financeiro
  useEffect(() => {
    let vivo = true
    Promise.all([FinanceiroService.getPlanoContas(), FinanceiroService.getPlanoGrupos()])
      .then(([pls, gps]) => {
        if (!vivo) return
        setPlanos(pls)
        setGrupos(gps)
      })
      .catch((e) => console.error('Erro ao carregar plano para os gráficos:', e))
    return () => {
      vivo = false
    }
  }, [])

  // Budgets do mês: por financeiro selecionado ou somando todos os visíveis
  useEffect(() => {
    let vivo = true
    const alvos =
      financeiroIdSelecionado !== 'todos' ? [financeiroIdSelecionado] : financeiros.map((f) => f.id)
    if (alvos.length === 0) {
      setBudgets([])
      return
    }
    Promise.all(alvos.map((id) => FinanceiroService.getBudgets(id, mesAtualStr)))
      .then((listas) => {
        if (vivo) setBudgets(listas.flat())
      })
      .catch((e) => console.error('Erro ao carregar budgets para os gráficos:', e))
    return () => {
      vivo = false
    }
  }, [financeiros, financeiroIdSelecionado, mesAtualStr])

  // Agregação por GRUPO do mês corrente (realizados)
  const { despesasPorGrupo, receitasPorGrupo, orcadoVsRealizado } = useMemo(() => {
    const catPorId = new Map(planos.map((p) => [p.id, p]))
    const grupoPorId = new Map(grupos.map((g) => [g.id, g]))

    const despesaMap = new Map<string, { nome: string; total: number; nLanc: number }>()
    const receitaMap = new Map<string, { nome: string; total: number; nLanc: number }>()
    const orcadoMap = new Map<
      string,
      { nome: string; tipo: 'receita' | 'despesa'; orcado: number }
    >()

    for (const b of budgets) {
      const cat = catPorId.get(b.plano_conta_id)
      if (!cat) continue
      const g = cat.grupo_id ? grupoPorId.get(cat.grupo_id) : undefined
      const chave = g ? g.id : `cat:${cat.id}`
      const nome = g ? g.nome : cat.descricao
      const atual = orcadoMap.get(chave) || { nome, tipo: cat.tipo, orcado: 0 }
      atual.orcado += Number(b.valor_orcado) || 0
      orcadoMap.set(chave, atual)
    }

    for (const l of lancamentos) {
      if (l.status !== 'realizado' || !l.data.startsWith(mesAtualStr)) continue
      const cat = l.plano_conta_id ? catPorId.get(l.plano_conta_id) : undefined
      if (!cat) continue
      const g = cat.grupo_id ? grupoPorId.get(cat.grupo_id) : undefined
      const chave = g ? g.id : `cat:${cat.id}`
      const nome = g ? g.nome : cat.descricao
      const mapa = l.tipo === 'debito' ? despesaMap : receitaMap
      const atual = mapa.get(chave) || { nome, total: 0, nLanc: 0 }
      atual.total += Number(l.valor) || 0
      atual.nLanc += 1
      mapa.set(chave, atual)
    }

    const ordenar = (m: Map<string, { nome: string; total: number; nLanc: number }>) =>
      Array.from(m.entries())
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => b.total - a.total)

    // Orçado vs Realizado: um ponto por grupo com orçado OU realizado no mês
    const chaves = new Set<string>([
      ...orcadoMap.keys(),
      ...despesaMap.keys(),
      ...receitaMap.keys(),
    ])

    const linhas = Array.from(chaves)
      .map((k) => {
        const orc = orcadoMap.get(k)
        const desp = despesaMap.get(k)
        const rec = receitaMap.get(k)
        const nome = orc?.nome || desp?.nome || rec?.nome || '—'
        const tipo = orc?.tipo || (desp ? 'despesa' : 'receita')
        const orcado = orc?.orcado || 0
        const realizado = (desp?.total || 0) + (rec?.total || 0)
        const pct = orcado > 0 ? (realizado / orcado) * 100 : null
        return { chave: k, nome, tipo, orcado, realizado, pct }
      })
      .sort((a, b) => Math.max(b.orcado, b.realizado) - Math.max(a.orcado, a.realizado))

    return {
      despesasPorGrupo: ordenar(despesaMap),
      receitasPorGrupo: ordenar(receitaMap),
      orcadoVsRealizado: linhas,
    }
  }, [lancamentos, planos, grupos, budgets, mesAtualStr])

  // TENDÊNCIA DE SALDO: histórico diário (30 dias) + projeção diária (30 dias),
  // mesma base da projeção de 30 dias (previstos + fixas + recorrentes).
  const tendencia = useMemo(() => {
    const hoje = getTodayISODate()
    const pontos: Array<{ label: string; dataISO: string; saldo: number; futuro: boolean }> = []

    // Saldo diário dos últimos 30 dias (realizados)
    let acumulado = saldoAtual
    const porDia = new Map<string, number>()
    for (const l of lancamentos) {
      if (l.status !== 'realizado') continue
      const v = l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor)
      porDia.set(l.data, (porDia.get(l.data) || 0) + v)
    }
    const historico: Array<{ data: string; saldo: number }> = []
    let cursor = addDays(hoje, -30)
    while (cursor < hoje) {
      acumulado += porDia.get(cursor) || 0
      historico.push({ data: cursor, saldo: acumulado })
      cursor = addDays(cursor, 1)
    }

    // Projeção diária: reusa a mesma fonte de detalhes da projeção de 30 dias
    const proj = projetarSaldo30Dias(
      contas,
      lancamentos,
      contasFixas,
      recorrentes,
      financeiroIdSelecionado,
    )
    const porDiaProj = new Map<string, number>()
    for (const d of proj.detalhes) {
      const v = d.tipo === 'credito' ? d.valor : -d.valor
      porDiaProj.set(d.data, (porDiaProj.get(d.data) || 0) + v)
    }
    let saldoProj = saldoAtual
    const futuro: Array<{ data: string; saldo: number }> = []
    cursor = addDays(hoje, 1)
    while (cursor <= addDays(hoje, 30)) {
      saldoProj += porDiaProj.get(cursor) || 0
      futuro.push({ data: cursor, saldo: saldoProj })
      cursor = addDays(cursor, 1)
    }

    const rotulo = (iso: string) => formatDateBR(iso).slice(0, 5)
    for (const h of historico)
      pontos.push({ label: rotulo(h.data), dataISO: h.data, saldo: h.saldo, futuro: false })
    for (const f of futuro)
      pontos.push({ label: rotulo(f.data), dataISO: f.data, saldo: f.saldo, futuro: true })

    const diasNegativos = futuro.filter((f) => f.saldo < 0)
    const primeiroNegativo = diasNegativos[0] || null
    return { pontos, diasNegativos, primeiroNegativo, saldoProjetado30d: saldoProj }
  }, [saldoAtual, lancamentos, contas, contasFixas, recorrentes, financeiroIdSelecionado])

  // Cores das barras: maior valor em verde forte, demais em escala da paleta
  const corBarra = (idx: number, total: number) => {
    if (total <= 1) return VERDE
    return PALETA[idx % PALETA.length]
  }

  const totalDespesas = despesasPorGrupo.reduce((a, d) => a + d.total, 0)
  const totalReceitas = receitasPorGrupo.reduce((a, d) => a + d.total, 0)

  const renderVazio = (msg: string) => (
    <div className="h-56 flex items-center justify-center text-xs text-gray-500 px-4 text-center">
      {msg}
    </div>
  )

  return (
    <div className="space-y-6">
      {/* Linha 1: Despesas x Receitas por grupo */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#FF5C5C] inline-block"
                aria-hidden="true"
              />
              Despesas por Grupo do Plano
            </CardTitle>
            <span className="text-xs text-gray-400 font-mono">Mês corrente • realizado</span>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {despesasPorGrupo.length === 0
              ? renderVazio('Nenhuma despesa realizada neste mês.')
              : (() => {
                  const max = despesasPorGrupo[0].total
                  return (
                    <>
                      <div className="h-56 w-full px-2 pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={despesasPorGrupo}
                            layout="vertical"
                            margin={{ left: 8, right: 24 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#232B36"
                              horizontal={false}
                            />
                            <XAxis
                              type="number"
                              stroke="#64748B"
                              fontSize={10}
                              tickFormatter={fmtK}
                            />
                            <YAxis
                              type="category"
                              dataKey="nome"
                              stroke="#64748B"
                              fontSize={10}
                              width={110}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value: any, _n: any, item: any) => [
                                `${formatCurrency(Number(value))} (${((Number(value) / (item?.payload?.total || 1)) * 100).toFixed(1)}% das despesas)`,
                                'Total',
                              ]}
                            />
                            <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18}>
                              {despesasPorGrupo.map((d, i) => (
                                <Cell
                                  key={d.id}
                                  fill={
                                    d.total === max
                                      ? VERMELHO
                                      : corBarra(i, despesasPorGrupo.length)
                                  }
                                  opacity={d.total === max ? 1 : 0.75}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="px-4 py-2.5 border-t border-[#232B36] flex items-center justify-between text-xs">
                        <span className="text-gray-400">Total do mês</span>
                        <span className="font-mono font-bold text-[#FF5C5C]">
                          {formatCurrency(totalDespesas)} em {despesasPorGrupo.length} grupo(s)
                        </span>
                      </div>
                    </>
                  )
                })()}
          </CardContent>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <span
                className="w-2.5 h-2.5 rounded-full bg-[#00D68F] inline-block"
                aria-hidden="true"
              />
              Receitas por Grupo do Plano
            </CardTitle>
            <span className="text-xs text-gray-400 font-mono">Mês corrente • realizado</span>
          </CardHeader>
          <CardContent className="p-0 pt-2">
            {receitasPorGrupo.length === 0
              ? renderVazio('Nenhuma receita realizada neste mês.')
              : (() => {
                  const max = receitasPorGrupo[0].total
                  return (
                    <>
                      <div className="h-56 w-full px-2 pt-2">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart
                            data={receitasPorGrupo}
                            layout="vertical"
                            margin={{ left: 8, right: 24 }}
                          >
                            <CartesianGrid
                              strokeDasharray="3 3"
                              stroke="#232B36"
                              horizontal={false}
                            />
                            <XAxis
                              type="number"
                              stroke="#64748B"
                              fontSize={10}
                              tickFormatter={fmtK}
                            />
                            <YAxis
                              type="category"
                              dataKey="nome"
                              stroke="#64748B"
                              fontSize={10}
                              width={110}
                              tickLine={false}
                            />
                            <Tooltip
                              contentStyle={tooltipStyle}
                              formatter={(value: any, _n: any, item: any) => [
                                `${formatCurrency(Number(value))} (${((Number(value) / (item?.payload?.total || 1)) * 100).toFixed(1)}% das receitas)`,
                                'Total',
                              ]}
                            />
                            <Bar dataKey="total" radius={[0, 4, 4, 0]} barSize={18}>
                              {receitasPorGrupo.map((r, i) => (
                                <Cell
                                  key={r.id}
                                  fill={
                                    r.total === max ? VERDE : corBarra(i, receitasPorGrupo.length)
                                  }
                                  opacity={r.total === max ? 1 : 0.75}
                                />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="px-4 py-2.5 border-t border-[#232B36] flex items-center justify-between text-xs">
                        <span className="text-gray-400">Total do mês</span>
                        <span className="font-mono font-bold text-[#00D68F]">
                          {formatCurrency(totalReceitas)} em {receitasPorGrupo.length} grupo(s)
                        </span>
                      </div>
                    </>
                  )
                })()}
          </CardContent>
        </Card>
      </div>

      {/* Linha 2: Orçado vs Realizado por grupo */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold">Orçado vs Realizado por Grupo</CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Budgets de {mesLabel ?? mesAtualStr}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {orcadoVsRealizado.length === 0 ? (
            renderVazio('Sem budgets ou lançamentos neste mês. Defina orçados na aba Budget.')
          ) : (
            <>
              <div className="h-64 w-full px-2 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={orcadoVsRealizado} margin={{ left: 8, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232B36" vertical={false} />
                    <XAxis
                      dataKey="nome"
                      stroke="#64748B"
                      fontSize={10}
                      interval={0}
                      angle={-20}
                      textAnchor="end"
                      height={58}
                      tickLine={false}
                    />
                    <YAxis stroke="#64748B" fontSize={11} tickFormatter={fmtK} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      formatter={(value: any, name: any) => [
                        formatCurrency(Number(value)),
                        String(name),
                      ]}
                    />
                    <Bar
                      dataKey="orcado"
                      name="Orçado (R$)"
                      fill="#38BDF8"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                    <Bar
                      dataKey="realizado"
                      name="Realizado (R$)"
                      fill={VERDE}
                      radius={[4, 4, 0, 0]}
                      maxBarSize={36}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              {/* % consumido por grupo */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 divide-x divide-y divide-[#232B36] border-t border-[#232B36]">
                {orcadoVsRealizado.map((g) => {
                  const pct = g.pct
                  const corPct =
                    pct === null
                      ? 'text-gray-500'
                      : pct <= 90
                        ? 'text-[#00D68F]'
                        : pct <= 100
                          ? 'text-amber-400'
                          : 'text-[#FF5C5C]'
                  return (
                    <div key={g.chave} className="p-2.5">
                      <div className="text-[10px] uppercase text-gray-500 font-semibold truncate flex items-center gap-1">
                        {g.nome}
                        <span
                          className={`text-[9px] px-1 rounded ${
                            g.tipo === 'receita'
                              ? 'bg-[#00D68F]/10 text-[#00D68F]'
                              : 'bg-[#FF5C5C]/10 text-[#FF5C5C]'
                          }`}
                        >
                          {g.tipo === 'receita' ? 'rec' : 'desp'}
                        </span>
                      </div>
                      <div className={`text-[11px] font-mono font-bold mt-0.5 ${corPct}`}>
                        {pct === null
                          ? g.realizado > 0
                            ? 'sem teto'
                            : '—'
                          : `${pct.toFixed(0)}% consumido`}
                      </div>
                      <div className="w-full bg-[#0B0F14] h-1.5 rounded-full overflow-hidden mt-1">
                        <div
                          className={`h-full ${pct === null ? 'bg-gray-600' : pct <= 90 ? 'bg-[#00D68F]' : pct <= 100 ? 'bg-amber-400' : 'bg-[#FF5C5C]'}`}
                          style={{ width: `${Math.min(pct ?? 100, 100)}%` }}
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Linha 3: Tendência de saldo com alerta futuro */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-bold">
            Tendência de Saldo (30 dias atrás → 30 dias à frente)
          </CardTitle>
          {tendencia.diasNegativos.length > 0 && tendencia.primeiroNegativo && (
            <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[#FF5C5C] bg-[#FF5C5C]/10 border border-[#FF5C5C]/30 rounded-md px-2 py-1">
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              Saldo negativo em {formatDateBR(tendencia.primeiroNegativo.data)} —{' '}
              {tendencia.diasNegativos.length} dia(s) no vermelho
            </span>
          )}
        </CardHeader>
        <CardContent className="p-0">
          {tendencia.pontos.length === 0 ? (
            renderVazio('Sem dados de saldo para montar a tendência.')
          ) : (
            <>
              <div className="h-60 w-full px-2 pt-3">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={tendencia.pontos} margin={{ left: 8, right: 16 }}>
                    <defs>
                      <linearGradient id="gradTendencia" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={VERDE} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={VERDE} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232B36" vertical={false} />
                    <XAxis
                      dataKey="label"
                      stroke="#64748B"
                      fontSize={10}
                      minTickGap={28}
                      tickLine={false}
                    />
                    <YAxis stroke="#64748B" fontSize={11} tickFormatter={fmtK} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      labelFormatter={(label: any, payload: any[]) => {
                        const p = payload?.[0]?.payload
                        return p
                          ? `${formatDateBR(p.dataISO)} • ${p.futuro ? 'projeção' : 'realizado'}`
                          : String(label)
                      }}
                      formatter={(value: any) => [formatCurrency(Number(value)), 'Saldo']}
                    />
                    <ReferenceLine y={0} stroke={VERMELHO} strokeDasharray="4 4" />
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo"
                      stroke={VERDE}
                      strokeWidth={2}
                      fill="url(#gradTendencia)"
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo (projeção)"
                      stroke={VERMELHO}
                      strokeWidth={2}
                      dot={{ r: 1.5, fill: VERMELHO }}
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="px-4 py-2.5 border-t border-[#232B36] flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-gray-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#00D68F] inline-block" aria-hidden="true" />{' '}
                  Histórico (realizado)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 bg-[#FF5C5C] inline-block" aria-hidden="true" />{' '}
                  Projeção (previstos + fixas + recorrentes)
                </span>
                <span className="ml-auto font-mono">
                  Saldo projetado em 30 dias:{' '}
                  <b className={tendencia.saldoProjetado30d < 0 ? 'text-[#FF5C5C]' : 'text-white'}>
                    {formatCurrency(tendencia.saldoProjetado30d)}
                  </b>
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
