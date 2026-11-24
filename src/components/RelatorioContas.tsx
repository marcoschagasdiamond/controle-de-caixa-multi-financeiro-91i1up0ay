import React, { useState } from 'react'
import { Financeiro, ContaBancaria } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { BarChart3, Building2, Landmark, PieChart, RefreshCw } from 'lucide-react'
import { ResponsiveContainer, PieChart as RePieChart, Pie, Cell, Tooltip, Legend } from 'recharts'

interface Props {
  financeiros: Financeiro[]
  contas: ContaBancaria[]
  loading: boolean
  erro: string | null
  onRecarregar: () => void
}

// Paleta fixa por tipo de conta (cores do tema)
const CORES_TIPO: Record<string, string> = {
  Corrente: '#00D68F',
  Poupança: '#3B82F6',
  Aplicação: '#A78BFA',
}

export default function RelatorioContas({
  financeiros,
  contas,
  loading,
  erro,
  onRecarregar,
}: Props) {
  const [ticker, setTicker] = useState(0)

  // Garante re-render quando os dados terminam de carregar
  React.useEffect(() => {
    if (!loading) setTicker((t) => t + 1)
  }, [loading])

  if (loading) {
    return (
      <div className="flex items-center justify-center p-10 text-gray-400 text-sm gap-2">
        <Loader />
        Carregando relatório...
      </div>
    )
  }

  if (erro) {
    return (
      <div className="bg-[#141A22] border border-[#FF5C5C]/40 rounded-xl p-8 text-center">
        <p className="text-sm text-[#FF5C5C] font-semibold mb-1">Erro ao carregar o relatório</p>
        <p className="text-xs text-gray-400 mb-4">{erro}</p>
        <button
          onClick={onRecarregar}
          className="text-xs text-[#00D68F] hover:underline flex items-center gap-1 mx-auto cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
        </button>
      </div>
    )
  }

  if (contas.length === 0) {
    return (
      <Card className="bg-[#141A22] border-[#232B36] text-white p-8 text-center">
        <p className="text-sm text-gray-500">
          Nenhuma conta bancária cadastrada ainda para gerar o relatório.
        </p>
      </Card>
    )
  }

  // Saldo total por financeiro — base: saldo inicial da conta
  const porFinanceiro = financeiros
    .map((f) => {
      const total = contas
        .filter((c) => c.financeiro_id === f.id)
        .reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
      return { id: f.id, nome: f.nome, cor: f.cor || '#00D68F', tipo: f.tipo, total }
    })
    .sort((a, b) => b.total - a.total)

  const saldoGeral = porFinanceiro.reduce((acc, f) => acc + f.total, 0)

  // Saldo por banco
  const porBancoMap = new Map<string, { total: number; qtd: number }>()
  for (const c of contas) {
    const cur = porBancoMap.get(c.banco) || { total: 0, qtd: 0 }
    cur.total += Number(c.saldo_inicial)
    cur.qtd += 1
    porBancoMap.set(c.banco, cur)
  }
  const porBanco = Array.from(porBancoMap.entries())
    .map(([banco, v]) => ({ banco, ...v }))
    .sort((a, b) => b.total - a.total)

  // Distribuição por tipo
  const porTipoMap = new Map<string, number>()
  for (const c of contas) {
    porTipoMap.set(c.tipo, (porTipoMap.get(c.tipo) || 0) + Number(c.saldo_inicial))
  }
  const porTipo = Array.from(porTipoMap.entries())
    .map(([tipo, total]) => ({ tipo, total }))
    .sort((a, b) => b.total - a.total)

  // Percentual relativo (função segura para total 0)
  const pct = (v: number, total: number) => (total === 0 ? 0 : (v / total) * 100)

  return (
    <div className="space-y-6">
      {/* Resumo geral */}
      <Card className="bg-[#141A22] border-[#232B36] text-white p-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-[#00D68F]" />
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Saldo Total Consolidado
            </span>
          </div>
          <div
            className={`text-xl font-bold font-mono ${
              saldoGeral < 0 ? 'text-[#FF5C5C]' : 'text-[#00D68F]'
            }`}
          >
            {formatCurrency(saldoGeral)}
          </div>
        </div>
        <p className="text-[11px] text-gray-500 mt-1">
          Soma dos saldos iniciais de {contas.length} conta(s) bancária(s) — mesma base usada nos
          cards do Painel.
        </p>
      </Card>

      {/* Saldo por Financeiro */}
      <Card className="bg-[#141A22] border-[#232B36] text-white">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            Saldo por Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 space-y-3">
          {porFinanceiro.map((f) => (
            <div key={f.id}>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full inline-block"
                    style={{ backgroundColor: f.cor }}
                  />
                  <span className="font-semibold text-white">{f.nome}</span>
                  <span className="text-gray-500">({f.tipo})</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-gray-400 font-mono">
                    {pct(f.total, saldoGeral).toFixed(1)}%
                  </span>
                  <span
                    className={`font-mono font-bold ${
                      f.total < 0 ? 'text-[#FF5C5C]' : 'text-white'
                    }`}
                  >
                    {formatCurrency(f.total)}
                  </span>
                </div>
              </div>
              <div className="h-2 rounded-full bg-[#0B0F14] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${Math.min(100, Math.abs(pct(f.total, saldoGeral)))}%`,
                    backgroundColor: f.cor,
                  }}
                />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Saldo por Banco */}
        <Card className="bg-[#141A22] border-[#232B36] text-white">
          <CardHeader className="pb-3 border-b border-[#232B36]">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Landmark className="w-4 h-4 text-[#00D68F]" />
              Saldo por Banco
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {porBanco.map((b) => (
              <div key={b.banco}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-semibold text-white">
                    {b.banco}{' '}
                    <span className="text-gray-500 font-normal">
                      ({b.qtd} conta{b.qtd > 1 ? 's' : ''})
                    </span>
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono">
                      {pct(b.total, saldoGeral).toFixed(1)}%
                    </span>
                    <span
                      className={`font-mono font-bold ${
                        b.total < 0 ? 'text-[#FF5C5C]' : 'text-white'
                      }`}
                    >
                      {formatCurrency(b.total)}
                    </span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-[#0B0F14] overflow-hidden">
                  <div
                    className="h-full rounded-full bg-[#00D68F] transition-all"
                    style={{ width: `${Math.min(100, Math.abs(pct(b.total, saldoGeral)))}%` }}
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* Distribuição por Tipo */}
        <Card className="bg-[#141A22] border-[#232B36] text-white">
          <CardHeader className="pb-3 border-b border-[#232B36]">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#00D68F]" />
              Distribuição por Tipo de Conta
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {/* Donut */}
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <RePieChart>
                  <Pie
                    data={porTipo}
                    dataKey="total"
                    nameKey="tipo"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                  >
                    {porTipo.map((t) => (
                      <Cell key={t.tipo} fill={CORES_TIPO[t.tipo] || '#64748B'} stroke="#141A22" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B0F14',
                      borderColor: '#232B36',
                      borderRadius: '8px',
                      color: '#F1F5F9',
                    }}
                    formatter={(value: any) => formatCurrency(Number(value))}
                  />
                  <Legend wrapperStyle={{ fontSize: 11, color: '#94A3B8' }} />
                </RePieChart>
              </ResponsiveContainer>
            </div>
            {/* Legenda com valores */}
            <div className="space-y-2 mt-2">
              {porTipo.map((t) => (
                <div key={t.tipo} className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: CORES_TIPO[t.tipo] || '#64748B' }}
                    />
                    <span className="text-white font-semibold">{t.tipo}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-gray-400 font-mono">
                      {pct(t.total, saldoGeral).toFixed(1)}%
                    </span>
                    <span className="font-mono font-bold text-white">
                      {formatCurrency(t.total)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Loader() {
  return <RefreshCw className="w-4 h-4 animate-spin" />
}
