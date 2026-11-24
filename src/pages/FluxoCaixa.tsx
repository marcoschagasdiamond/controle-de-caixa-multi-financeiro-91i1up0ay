import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import {
  Financeiro,
  ContaBancaria,
  ContaFixa,
  Lancamento,
  LancamentoRecorrente,
} from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate, addDays } from '@/lib/formatters'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { recorrenteOcorreEm } from '@/lib/recorrentes'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  TrendingUp,
  Calendar,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  DollarSign,
  Building2,
  CalendarClock,
  RefreshCw,
  Download,
  Printer,
} from 'lucide-react'
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts'

interface DiaFluxo {
  data: string // YYYY-MM-DD
  saldoInicial: number
  entradasPrevistas: number
  saidasPrevistas: number
  saldoDoDia: number
  saldoAcumulado: number
  contasFixasIncluidas: string[]
}

export default function FluxoCaixaPage() {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [contasFixas, setContasFixas] = useState<ContaFixa[]>([])
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

  // Seletor de financeiro ou consolidado
  const [selectedFinId, setSelectedFinId] = useState<string>('consolidado')
  // Horizonte de projeção: 30, 60 ou 90 dias
  const [horizonte, setHorizonte] = useState<30 | 60 | 90>(30)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [fins, cts, cfs, rcs, lcs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getContasFixas(),
        FinanceiroService.getLancamentosRecorrentes(),
        FinanceiroService.getLancamentos(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setContasFixas(cfs)
      setRecorrentes(rcs)
      setLancamentos(lcs)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // CÁLCULO DO FLUXO DE CAIXA DIÁRIO
  // Inclui saldo atual realizado inicial + lançamentos futuros previstos + contas fixas ainda não geradas
  const { diasFluxo, totalEntradas, totalSaidas, saldoFinalProjetado, diasNegativosCount } =
    useMemo(() => {
      // 1. Saldo inicial base
      let saldoBase = 0
      const contasFiltradas =
        selectedFinId === 'consolidado'
          ? contas
          : contas.filter((c) => c.financeiro_id === selectedFinId)

      saldoBase = contasFiltradas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)

      // Adiciona lançamentos realizados até hoje
      const hoje = getTodayISODate()
      const lancsFiltrados =
        selectedFinId === 'consolidado'
          ? lancamentos
          : lancamentos.filter((l) => l.financeiro_id === selectedFinId)

      for (const l of lancsFiltrados) {
        if (l.status === 'realizado') {
          if (l.tipo === 'credito') saldoBase += Number(l.valor)
          else saldoBase -= Number(l.valor)
        }
      }

      // 2. Construir lista diária para o horizonte (30, 60 ou 90 dias)
      const dias: DiaFluxo[] = []
      let saldoAcumulado = saldoBase
      let sumEntradas = 0
      let sumSaidas = 0
      let negCount = 0

      const contasFixasFiltradas =
        selectedFinId === 'consolidado'
          ? contasFixas
          : contasFixas.filter((cf) => cf.financeiro_id === selectedFinId)

      const recorrentesFiltrados =
        selectedFinId === 'consolidado'
          ? recorrentes
          : recorrentes.filter((r) => r.financeiro_id === selectedFinId)

      for (let i = 0; i < horizonte; i++) {
        const dataDia = addDays(hoje, i)
        const [anoStr, mesStr, diaStr] = dataDia.split('-')
        const diaNum = parseInt(diaStr, 10)

        let entradas = 0
        let saidas = 0
        const fixasDoDia: string[] = []

        // Lançamentos previstos cadastrados para esta data
        const lcsDoDia = lancsFiltrados.filter((l) => l.status === 'previsto' && l.data === dataDia)
        for (const l of lcsDoDia) {
          if (l.tipo === 'credito') entradas += Number(l.valor)
          else saidas += Number(l.valor)
        }

        // REGRA OBRIGATÓRIA: Incluir contas fixas ainda não geradas no fluxo diário
        for (const cf of contasFixasFiltradas) {
          if (cf.ativo && cf.dia_vencimento === diaNum) {
            // Verifica se já não foi criado um lançamento equivalente nesta data
            const jaLancado = lcsDoDia.some((l) =>
              l.descricao.toLowerCase().includes(cf.descricao.toLowerCase()),
            )
            if (!jaLancado) {
              const val = Number(cf.valor_estimado)
              if (cf.tipo === 'receita') {
                entradas += val
                fixasDoDia.push(`+ ${cf.descricao} (Recorrente)`)
              } else {
                saidas += val
                fixasDoDia.push(`- ${cf.descricao} (Recorrente)`)
              }
            }
          }
        }

        // Lançamentos recorrentes mensais ativos (programação; o pagamento real é lançado à mão)
        for (const rc of recorrentesFiltrados) {
          if (rc.ativo && recorrenteOcorreEm(dataDia, rc.dia_mes, rc.data_inicial)) {
            const val = Number(rc.valor)
            if (rc.tipo === 'credito') {
              entradas += val
              fixasDoDia.push(`+ ${rc.descricao} (Recorrente mensal)`)
            } else {
              saidas += val
              fixasDoDia.push(`- ${rc.descricao} (Recorrente mensal)`)
            }
          }
        }

        const saldoInicialDoDia = saldoAcumulado
        const saldoDoDia = entradas - saidas
        saldoAcumulado = saldoInicialDoDia + saldoDoDia

        sumEntradas += entradas
        sumSaidas += saidas
        if (saldoAcumulado < 0) {
          negCount++
        }

        dias.push({
          data: dataDia,
          saldoInicial: saldoInicialDoDia,
          entradasPrevistas: entradas,
          saidasPrevistas: saidas,
          saldoDoDia,
          saldoAcumulado,
          contasFixasIncluidas: fixasDoDia,
        })
      }

      return {
        diasFluxo: dias,
        totalEntradas: sumEntradas,
        totalSaidas: sumSaidas,
        saldoFinalProjetado: saldoAcumulado,
        diasNegativosCount: negCount,
      }
    }, [contas, lancamentos, contasFixas, recorrentes, selectedFinId, horizonte])

  const nomeFinanceiroSelecionado =
    selectedFinId === 'consolidado'
      ? 'Visão Consolidada (Grupo)'
      : financeiros.find((f) => f.id === selectedFinId)?.nome || ''

  const periodoInicio = diasFluxo[0]?.data || getTodayISODate()
  const periodoFim = diasFluxo[diasFluxo.length - 1]?.data || periodoInicio

  // Exporta a tabela diária atual (financeiro e horizonte escolhidos) em CSV BR
  const handleExportarCSV = () => {
    const slug = nomeFinanceiroSelecionado
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    baixarCSV(
      `fluxo-caixa-${slug}-${horizonte}-dias.csv`,
      [
        'Data',
        'Saldo Inicial (R$)',
        'Entradas Previstas (R$)',
        'Saídas Previstas (R$)',
        'Saldo do Dia (R$)',
        'Saldo Acumulado (R$)',
      ],
      diasFluxo.map((d) => [
        formatDateBR(d.data),
        valorCSV(d.saldoInicial),
        valorCSV(d.entradasPrevistas),
        valorCSV(d.saidasPrevistas),
        valorCSV(d.saldoDoDia),
        valorCSV(d.saldoAcumulado),
      ]),
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho exibido apenas na impressão */}
      <div className="hidden print:block text-black">
        <h1 className="text-xl font-bold">Relatório de Fluxo de Caixa Projetado</h1>
        <p className="text-sm">Financeiro: {nomeFinanceiroSelecionado}</p>
        <p className="text-sm">
          Período: {formatDateBR(periodoInicio)} a {formatDateBR(periodoFim)} ({horizonte} dias)
        </p>
        <p className="text-sm">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
      </div>

      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Fluxo de Caixa Projetado</h1>
          <p className="text-sm text-gray-400">
            Projeção diária com segregação por financeiro, incluindo contas fixas e destaque de
            saldo negativo
          </p>
        </div>

        {/* Seletores */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Financeiro */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            <select
              value={selectedFinId}
              onChange={(e) => setSelectedFinId(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            >
              <option value="consolidado">Visão Consolidada (Grupo)</option>
              {financeiros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          {/* Horizonte 30/60/90 dias */}
          <div className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]">
            {([30, 60, 90] as const).map((h) => (
              <button
                key={h}
                onClick={() => setHorizonte(h)}
                className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                  horizonte === h ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
                }`}
              >
                {h} Dias
              </button>
            ))}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarCSV}
            disabled={diasFluxo.length === 0}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
          >
            <Download className="w-3.5 h-3.5 mr-2" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
          >
            <Printer className="w-3.5 h-3.5 mr-2" />
            Imprimir
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={carregarDados}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Saldo Atual</span>
            <DollarSign className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-white">
            {formatCurrency(diasFluxo[0]?.saldoInicial || 0)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Disponível em contas hoje</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Entradas Previstas
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            + {formatCurrency(totalEntradas)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Próximos {horizonte} dias</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Saídas Previstas</span>
            <ArrowDownRight className="w-4 h-4 text-[#FF5C5C]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            - {formatCurrency(totalSaidas)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Lançamentos + contas fixas</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Saldo Final Projetado
            </span>
            {diasNegativosCount > 0 ? (
              <AlertTriangle className="w-4 h-4 text-[#FF5C5C]" />
            ) : (
              <CalendarClock className="w-4 h-4 text-[#00D68F]" />
            )}
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              saldoFinalProjetado < 0 ? 'text-[#FF5C5C]' : 'text-white'
            }`}
          >
            {formatCurrency(saldoFinalProjetado)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {diasNegativosCount > 0
              ? `${diasNegativosCount} dia(s) com saldo no vermelho!`
              : 'Sem dias com saldo negativo'}
          </p>
        </Card>
      </div>

      {/* GRÁFICO RECHARTS DE FLUXO DE CAIXA */}
      <Card className="bg-[#141A22] border-[#232B36] text-white p-6 shadow-xl print:hidden">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#00D68F]" />
            Curva de Saldo Acumulado & Movimentações Diárias ({horizonte} Dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={diasFluxo}>
              <CartesianGrid strokeDasharray="3 3" stroke="#232B36" />
              <XAxis
                dataKey="data"
                stroke="#64748B"
                fontSize={11}
                tickFormatter={(val) => formatDateBR(val).slice(0, 5)}
              />
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
                labelFormatter={(label) => `Data: ${formatDateBR(label)}`}
              />
              <Legend />
              <Bar dataKey="entradasPrevistas" name="Entradas (R$)" fill="#00D68F" opacity={0.8} />
              <Bar dataKey="saidasPrevistas" name="Saídas (R$)" fill="#FF5C5C" opacity={0.8} />
              <Line
                type="monotone"
                dataKey="saldoAcumulado"
                name="Saldo Acumulado (R$)"
                stroke="#38BDF8"
                strokeWidth={2}
                dot={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* TABELA DIÁRIA COM DESTAQUE EM VERMELHO PARA SALDOS NEGATIVOS */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#00D68F]" />
              Detalhamento Diário ({horizonte} Dias)
            </CardTitle>
            <span className="text-xs text-gray-400">
              Contas fixas recorrentes embutidas automaticamente
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-[500px] print:max-h-none">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider sticky top-0 z-10 font-semibold">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4 text-right">Saldo Inicial</th>
                  <th className="py-3 px-4 text-right">Entradas Previstas</th>
                  <th className="py-3 px-4 text-right">Saídas Previstas</th>
                  <th className="py-3 px-4 text-right">Resultado do Dia</th>
                  <th className="py-3 px-4 text-right">Saldo Acumulado</th>
                  <th className="py-3 px-4">Itens Recorrentes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {diasFluxo.map((dia) => {
                  const isNegativo = dia.saldoAcumulado < 0
                  return (
                    <tr
                      key={dia.data}
                      className={`transition-colors ${
                        isNegativo
                          ? 'bg-[#FF5C5C]/15 hover:bg-[#FF5C5C]/20 border-l-4 border-l-[#FF5C5C]'
                          : 'hover:bg-[#1A222D]/50'
                      }`}
                    >
                      <td className="py-2.5 px-4 font-mono text-xs whitespace-nowrap text-gray-300 font-medium">
                        {formatDateBR(dia.data)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-gray-400">
                        {formatCurrency(dia.saldoInicial)}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-[#00D68F] font-semibold">
                        {dia.entradasPrevistas > 0
                          ? `+ ${formatCurrency(dia.entradasPrevistas)}`
                          : '-'}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono text-xs text-[#FF5C5C] font-semibold">
                        {dia.saidasPrevistas > 0 ? `- ${formatCurrency(dia.saidasPrevistas)}` : '-'}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono text-xs font-semibold ${
                          dia.saldoDoDia > 0
                            ? 'text-[#00D68F]'
                            : dia.saldoDoDia < 0
                              ? 'text-[#FF5C5C]'
                              : 'text-gray-500'
                        }`}
                      >
                        {formatCurrency(dia.saldoDoDia)}
                      </td>
                      <td
                        className={`py-2.5 px-4 text-right font-mono text-xs font-bold ${
                          isNegativo ? 'text-[#FF5C5C] text-sm' : 'text-white'
                        }`}
                      >
                        {formatCurrency(dia.saldoAcumulado)}
                      </td>
                      <td className="py-2.5 px-4 text-xs print:hidden">
                        {dia.contasFixasIncluidas.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {dia.contasFixasIncluidas.map((fixa, idx) => (
                              <Badge
                                key={idx}
                                variant="outline"
                                className="text-[10px] py-0 border-[#2E3B4D] text-amber-300 bg-amber-400/10"
                              >
                                {fixa}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <span className="text-gray-600 text-xs">-</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
