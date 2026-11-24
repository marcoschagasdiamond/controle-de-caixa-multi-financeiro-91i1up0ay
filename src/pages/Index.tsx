import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, Lancamento, ExtratoItem, ContaFixa } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertaContasFixas } from '@/components/AlertaContasFixas'
import {
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Scale,
  CheckCheck,
  Calendar,
  Building2,
  TrendingUp,
  Clock,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  RefreshCw,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

export default function Index() {
  const navigate = useNavigate()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [extratoItens, setExtratoItens] = useState<ExtratoItem[]>([])
  const [contasFixas, setContasFixas] = useState<ContaFixa[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro de financeiro ou consolidado no Painel
  const [selectedFinId, setSelectedFinId] = useState<string>('todos')

  const carregarPainel = async () => {
    try {
      setLoading(true)
      const [fins, cts, lcs, ext, cfs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getExtratoItens(),
        FinanceiroService.getContasFixas(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setLancamentos(lcs)
      setExtratoItens(ext)
      setContasFixas(cfs)
    } catch (err) {
      console.error('Erro ao carregar painel:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarPainel()
  }, [])

  // Se o sistema estiver vazio (nenhum financeiro), redireciona/convida para o onboarding
  const isEmpty = !loading && financeiros.length === 0

  // Filtragem dos dados conforme o financeiro selecionado
  const contasFiltradas = useMemo(() => {
    if (selectedFinId === 'todos') return contas
    return contas.filter((c) => c.financeiro_id === selectedFinId)
  }, [contas, selectedFinId])

  const lancamentosFiltrados = useMemo(() => {
    if (selectedFinId === 'todos') return lancamentos
    return lancamentos.filter((l) => l.financeiro_id === selectedFinId)
  }, [lancamentos, selectedFinId])

  const extratoFiltrado = useMemo(() => {
    if (selectedFinId === 'todos') return extratoItens
    return extratoItens.filter((e) => e.financeiro_id === selectedFinId)
  }, [extratoItens, selectedFinId])

  // CÁLCULO DOS CARDS DO PAINEL
  // 1. Saldo Total
  const saldoTotal = useMemo(() => {
    let base = contasFiltradas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
    for (const l of lancamentosFiltrados) {
      if (l.status === 'realizado') {
        if (l.tipo === 'credito') base += Number(l.valor)
        else base -= Number(l.valor)
      }
    }
    return base
  }, [contasFiltradas, lancamentosFiltrados])

  // 2. Entradas do Mês Atual
  const mesAtualStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const entradasDoMes = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) => l.tipo === 'credito' && l.status === 'realizado' && l.data.startsWith(mesAtualStr),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAtualStr])

  // 3. Saídas do Mês Atual
  const saidasDoMes = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) => l.tipo === 'debito' && l.status === 'realizado' && l.data.startsWith(mesAtualStr),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAtualStr])

  // 4. Resultado do Mês
  const resultadoDoMes = entradasDoMes - saidasDoMes

  // 5. Pendentes de Conciliação
  const pendentesConciliacaoCount = useMemo(() => {
    return extratoFiltrado.filter(
      (e) => e.status === 'pendente' || e.status === 'sem_correspondencia',
    ).length
  }, [extratoFiltrado])

  // GRÁFICO DE BARRAS: Entradas vs Saídas dos últimos 6 meses
  const dadosGrafico6Meses = useMemo(() => {
    const meses: Array<{ mesAno: string; label: string; entradas: number; saidas: number }> = []
    const hoje = new Date()

    for (let i = 5; i >= 0; i--) {
      const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)
      const ano = d.getFullYear()
      const mes = String(d.getMonth() + 1).padStart(2, '0')
      const mesAno = `${ano}-${mes}`
      const nomeMes = d.toLocaleDateString('pt-BR', { month: 'short' })
      const label = `${nomeMes.replace('.', '')}/${ano.toString().slice(2)}`

      const ent = lancamentosFiltrados
        .filter(
          (l) => l.tipo === 'credito' && l.status === 'realizado' && l.data.startsWith(mesAno),
        )
        .reduce((acc, l) => acc + Number(l.valor), 0)

      const sai = lancamentosFiltrados
        .filter((l) => l.tipo === 'debito' && l.status === 'realizado' && l.data.startsWith(mesAno))
        .reduce((acc, l) => acc + Number(l.valor), 0)

      meses.push({
        mesAno,
        label,
        entradas: ent,
        saidas: sai,
      })
    }

    return meses
  }, [lancamentosFiltrados])

  // PRÓXIMOS VENCIMENTOS (Lançamentos previstos e contas fixas próximas)
  const proximosVencimentos = useMemo(() => {
    const hoje = getTodayISODate()
    const previstos = lancamentosFiltrados
      .filter((l) => l.status === 'previsto' && l.data >= hoje)
      .slice(0, 5)
    return previstos
  }, [lancamentosFiltrados])

  // ÚLTIMOS LANÇAMENTOS
  const ultimosLancamentos = useMemo(() => {
    return lancamentosFiltrados.slice(0, 5)
  }, [lancamentosFiltrados])

  // Onboarding trigger se sistema estiver limpo
  if (isEmpty) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-[#00D68F]/10 border border-[#00D68F]/30 flex items-center justify-center mx-auto shadow-xl">
          <ShieldCheck className="w-9 h-9 text-[#00D68F]" />
        </div>
        <div className="space-y-2">
          <h1 className="text-3xl font-black text-white tracking-tight">
            Bem-vindo ao Controle Multi-Financeiro
          </h1>
          <p className="text-gray-400 text-sm max-w-lg mx-auto">
            O sistema nasce limpo e vazio para garantir segregação contábil autêntica. Inicie agora
            o onboarding em 4 passos para cadastrar seu primeiro financeiro, contas e plano.
          </p>
        </div>

        <Card className="bg-[#141A22] border-[#232B36] text-left p-6 shadow-2xl">
          <h3 className="text-xs uppercase tracking-wider text-[#00D68F] font-bold mb-3 flex items-center gap-2">
            <Sparkles className="w-4 h-4" />
            O que vamos configurar em minutos:
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
            <div className="p-3 rounded-lg bg-[#0B0F14] border border-[#232B36]">
              <b className="text-white block mb-0.5">1. Financeiro PF ou PJ</b>
              Razão social, CPF/CNPJ, regime e sócios
            </div>
            <div className="p-3 rounded-lg bg-[#0B0F14] border border-[#232B36]">
              <b className="text-white block mb-0.5">2. Contas Bancárias</b>
              Banco, agência, conta e saldo inicial
            </div>
            <div className="p-3 rounded-lg bg-[#0B0F14] border border-[#232B36]">
              <b className="text-white block mb-0.5">3. Plano de Contas</b>
              Categorias exclusivas de receitas e despesas
            </div>
            <div className="p-3 rounded-lg bg-[#0B0F14] border border-[#232B36]">
              <b className="text-white block mb-0.5">4. Contas Fixas</b>
              Aluguel, luz, salários e contas recorrentes
            </div>
          </div>
          <div className="mt-6 flex justify-center">
            <Button
              onClick={() => navigate('/onboarding')}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold px-8 h-12 text-sm shadow-xl shadow-[#00D68F]/20 cursor-pointer"
            >
              Iniciar Onboarding Guiado
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Painel Financeiro</h1>
          <p className="text-sm text-gray-400">
            Visão integrada com garantia de segregação patrimonial
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Seletor de Financeiro */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            <select
              value={selectedFinId}
              onChange={(e) => setSelectedFinId(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            >
              <option value="todos">Todas as Entidades (Consolidado)</option>
              {financeiros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={carregarPainel}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <Button
            onClick={() => navigate('/lancamentos')}
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
          >
            Novo Lançamento
          </Button>
        </div>
      </div>

      {/* 5 CARDS DE MÉTRICAS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Card 1: Saldo Total */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Saldo em Caixa</span>
            <DollarSign className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              saldoTotal < 0 ? 'text-[#FF5C5C]' : 'text-white'
            }`}
          >
            {formatCurrency(saldoTotal)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Disponível em contas bancárias</p>
        </Card>

        {/* Card 2: Entradas do Mês */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Entradas do Mês</span>
            <ArrowUpRight className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            + {formatCurrency(entradasDoMes)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Créditos realizados no mês</p>
        </Card>

        {/* Card 3: Saídas do Mês */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Saídas do Mês</span>
            <ArrowDownRight className="w-4 h-4 text-[#FF5C5C]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            - {formatCurrency(saidasDoMes)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Débitos realizados no mês</p>
        </Card>

        {/* Card 4: Resultado */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Resultado Líquido</span>
            <Scale className="w-4 h-4 text-gray-400" />
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              resultadoDoMes >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
            }`}
          >
            {resultadoDoMes >= 0 ? '+' : ''}
            {formatCurrency(resultadoDoMes)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">Entradas - Saídas do mês</p>
        </Card>

        {/* Card 5: Pendentes de Conciliação */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Extrato Pendente</span>
            <CheckCheck className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-amber-400">
            {pendentesConciliacaoCount} item(s)
          </div>
          <button
            onClick={() => navigate('/conciliacao')}
            className="text-[10px] text-gray-400 hover:text-white underline mt-1 text-left block cursor-pointer"
          >
            Abrir conciliação
          </button>
        </Card>
      </div>

      {/* ALERTA DIÁRIO: Contas fixas vencidas e vencendo nos próximos 7 dias */}
      <AlertaContasFixas
        contasFixas={contasFixas}
        financeiros={financeiros}
        lancamentos={lancamentos}
        financeiroIdFiltro={selectedFinId}
        onPagamentoRegistrado={carregarPainel}
      />

      {/* GRÁFICO DE 6 MESES: Entradas vs Saídas */}
      <Card className="bg-[#141A22] border-[#232B36] text-white p-6 shadow-xl">
        <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#00D68F]" />
            Evolução de Entradas vs Saídas (Últimos 6 Meses)
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">Valores Realizados</span>
        </CardHeader>
        <CardContent className="p-0 h-64 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dadosGrafico6Meses}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232B36" />
              <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickFormatter={(val) => `R$ ${(val / 1000).toFixed(0)}k`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0B0F14',
                  borderColor: '#232B36',
                  borderRadius: '8px',
                  color: '#F1F5F9',
                }}
                formatter={(value: any) => formatCurrency(Number(value))}
              />
              <Legend />
              <Bar dataKey="entradas" name="Entradas (R$)" fill="#00D68F" radius={[4, 4, 0, 0]} />
              <Bar dataKey="saidas" name="Saídas (R$)" fill="#FF5C5C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* DUAS COLUNAS: PRÓXIMOS VENCIMENTOS x ÚLTIMOS LANÇAMENTOS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Próximos Vencimentos */}
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-amber-400" />
              Próximos Vencimentos Previstos
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/fluxo-caixa')}
              className="text-xs text-gray-400 hover:text-white h-7 cursor-pointer"
            >
              Ver Fluxo
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {proximosVencimentos.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                Nenhum vencimento previsto para os próximos dias.
              </div>
            ) : (
              <div className="divide-y divide-[#232B36]">
                {proximosVencimentos.map((l) => (
                  <div key={l.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white">{l.descricao}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{formatDateBR(l.data)}</span>
                        <span>•</span>
                        <span>{l.contraparte || 'Sem contraparte'}</span>
                      </div>
                    </div>
                    <span
                      className={`font-mono font-bold ${
                        l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                      }`}
                    >
                      {l.tipo === 'credito' ? '+' : '-'} {formatCurrency(l.valor)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Últimos Lançamentos */}
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#00D68F]" />
              Últimos Lançamentos Realizados
            </CardTitle>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/lancamentos')}
              className="text-xs text-gray-400 hover:text-white h-7 cursor-pointer"
            >
              Ver Todos
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {ultimosLancamentos.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                Nenhum lançamento registrado.
              </div>
            ) : (
              <div className="divide-y divide-[#232B36]">
                {ultimosLancamentos.map((l) => {
                  const fin = financeiros.find((f) => f.id === l.financeiro_id)
                  return (
                    <div key={l.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-semibold text-white">{l.descricao}</div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                          <span className="font-mono">{formatDateBR(l.data)}</span>
                          {fin && (
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-mono"
                              style={{ borderColor: fin.cor, color: fin.cor }}
                            >
                              {fin.nome}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <span
                        className={`font-mono font-bold ${
                          l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                        }`}
                      >
                        {l.tipo === 'credito' ? '+' : '-'} {formatCurrency(l.valor)}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
