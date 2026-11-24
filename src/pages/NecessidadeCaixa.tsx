import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, ContaFixa, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate, addDays } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ShieldAlert,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingDown,
  Building2,
  RefreshCw,
  ArrowRight,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface PiorDia {
  data: string
  saldoProjetado: number
  deficit: number // Quanto falta para ficar positivo
  financeiroNome: string
}

export default function NecessidadeCaixaPage() {
  const navigate = useNavigate()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [contasFixas, setContasFixas] = useState<ContaFixa[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

  // Horizonte: 30, 60, 90 ou 180 dias
  const [horizonte, setHorizonte] = useState<30 | 60 | 90 | 180>(30)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [fins, cts, cfs, lcs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getContasFixas(),
        FinanceiroService.getLancamentos(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setContasFixas(cfs)
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

  // CÁLCULO DE NECESSIDADE DE CAIXA CONSOLIDADA & POR FINANCEIRO
  const {
    saldoDisponivelTotal,
    saidasPrevistasTotal,
    entradasPrevistasTotal,
    necessidadeConsolidada,
    dataPrimeiraNecessidade,
    pioresDias,
    analisePorFinanceiro,
  } = useMemo(() => {
    const hoje = getTodayISODate()

    // 1. Saldo disponível atual total
    let saldoAtual = contas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
    for (const l of lancamentos) {
      if (l.status === 'realizado') {
        if (l.tipo === 'credito') saldoAtual += Number(l.valor)
        else saldoAtual -= Number(l.valor)
      }
    }

    // 2. Análise dia a dia para os próximos 30/60/90/180 dias
    let saldoAcumulado = saldoAtual
    let sumSaidas = 0
    let sumEntradas = 0
    let maxDeficit = 0
    let primeiraDataDeficit: string | null = null
    const todosDiasComSaldo: Array<{ data: string; saldo: number }> = []

    for (let i = 0; i < horizonte; i++) {
      const dataDia = addDays(hoje, i)
      const diaNum = parseInt(dataDia.split('-')[2], 10)

      // Entradas e saídas previstas deste dia
      let entDia = 0
      let saiDia = 0

      for (const l of lancamentos) {
        if (l.status === 'previsto' && l.data === dataDia) {
          if (l.tipo === 'credito') entDia += Number(l.valor)
          else saiDia += Number(l.valor)
        }
      }

      // Contas fixas não lançadas
      for (const cf of contasFixas) {
        if (cf.ativo && cf.dia_vencimento === diaNum) {
          const val = Number(cf.valor_estimado)
          if (cf.tipo === 'receita') entDia += val
          else saiDia += val
        }
      }

      saldoAcumulado = saldoAcumulado + entDia - saiDia
      sumEntradas += entDia
      sumSaidas += saiDia

      todosDiasComSaldo.push({ data: dataDia, saldo: saldoAcumulado })

      if (saldoAcumulado < 0) {
        const deficit = Math.abs(saldoAcumulado)
        if (deficit > maxDeficit) {
          maxDeficit = deficit
        }
        if (!primeiraDataDeficit) {
          primeiraDataDeficit = dataDia
        }
      }
    }

    // 3. Os 5 Piores Dias (onde o saldo é mais negativo ou mais baixo)
    const piores = [...todosDiasComSaldo]
      .sort((a, b) => a.saldo - b.saldo)
      .slice(0, 5)
      .map((d) => ({
        data: d.data,
        saldoProjetado: d.saldo,
        deficit: d.saldo < 0 ? Math.abs(d.saldo) : 0,
        financeiroNome: 'Consolidado',
      }))

    // 4. Análise Individual por Financeiro
    const porFin = financeiros.map((f) => {
      let finSaldoAtual = contas
        .filter((c) => c.financeiro_id === f.id)
        .reduce((acc, c) => acc + Number(c.saldo_inicial), 0)

      const finLancs = lancamentos.filter((l) => l.financeiro_id === f.id)
      for (const l of finLancs) {
        if (l.status === 'realizado') {
          if (l.tipo === 'credito') finSaldoAtual += Number(l.valor)
          else finSaldoAtual -= Number(l.valor)
        }
      }

      let finSaldoAcum = finSaldoAtual
      let finMaxDeficit = 0
      let finPrimeiroDeficit: string | null = null
      let finSaidas = 0

      const finFixas = contasFixas.filter((cf) => cf.financeiro_id === f.id)

      for (let i = 0; i < horizonte; i++) {
        const dataDia = addDays(hoje, i)
        const diaNum = parseInt(dataDia.split('-')[2], 10)
        let e = 0
        let s = 0

        for (const l of finLancs) {
          if (l.status === 'previsto' && l.data === dataDia) {
            if (l.tipo === 'credito') e += Number(l.valor)
            else s += Number(l.valor)
          }
        }
        for (const cf of finFixas) {
          if (cf.ativo && cf.dia_vencimento === diaNum) {
            if (cf.tipo === 'receita') e += Number(cf.valor_estimado)
            else s += Number(cf.valor_estimado)
          }
        }

        finSaldoAcum = finSaldoAcum + e - s
        finSaidas += s

        if (finSaldoAcum < 0) {
          const def = Math.abs(finSaldoAcum)
          if (def > finMaxDeficit) finMaxDeficit = def
          if (!finPrimeiroDeficit) finPrimeiroDeficit = dataDia
        }
      }

      return {
        financeiro: f,
        saldoAtual: finSaldoAtual,
        saidasPrevistas: finSaidas,
        necessidade: finMaxDeficit,
        dataDeficit: finPrimeiroDeficit,
      }
    })

    return {
      saldoDisponivelTotal: saldoAtual,
      saidasPrevistasTotal: sumSaidas,
      entradasPrevistasTotal: sumEntradas,
      necessidadeConsolidada: maxDeficit,
      dataPrimeiraNecessidade: primeiraDataDeficit,
      pioresDias: piores,
      analisePorFinanceiro: porFin,
    }
  }, [financeiros, contas, contasFixas, lancamentos, horizonte])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Necessidade de Caixa</h1>
          <p className="text-sm text-gray-400">
            Previsão consolidada de liquidez, identificando quanto e quando faltará caixa
          </p>
        </div>

        {/* Horizonte 30/60/90/180 */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 uppercase font-bold">Horizonte:</span>
          <div className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]">
            {([30, 60, 90, 180] as const).map((h) => (
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
            size="icon"
            onClick={carregarDados}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-8 w-8"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* REGRA: ALERTA GRANDE QUANDO A NECESSIDADE FOR POSITIVA (FALTA DE CAIXA) */}
      {necessidadeConsolidada > 0 ? (
        <div className="p-6 rounded-2xl bg-[#FF5C5C]/15 border-2 border-[#FF5C5C] shadow-2xl space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-[#FF5C5C]/20 border border-[#FF5C5C] flex items-center justify-center shrink-0">
              <ShieldAlert className="w-7 h-7 text-[#FF5C5C]" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-black text-white tracking-wide uppercase flex items-center gap-2">
                Alerta Crítico: Necessidade de Caixa Detectada!
              </h2>
              <p className="text-gray-300 text-sm mt-1">
                Com base nos lançamentos previstos e contas fixas recorrentes, o caixa consolidado
                ficará negativo em{' '}
                <span className="text-white font-bold">
                  {formatDateBR(dataPrimeiraNecessidade)}
                </span>
                .
              </p>
              <div className="mt-3 flex flex-wrap items-baseline gap-2">
                <span className="text-xs uppercase text-gray-400 font-bold">
                  Déficit Máximo Previsto:
                </span>
                <span className="text-3xl font-black text-[#FF5C5C] font-mono">
                  {formatCurrency(necessidadeConsolidada)}
                </span>
              </div>
            </div>
          </div>
          <div className="pt-2 flex flex-wrap gap-3">
            <Button
              onClick={() => navigate('/mutuos')}
              className="bg-[#FF5C5C] hover:bg-[#e04848] text-white font-bold cursor-pointer"
            >
              Ajustar Mútuos Entre Empresas
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate('/lancamentos')}
              className="border-[#FF5C5C]/40 text-white hover:bg-[#FF5C5C]/20"
            >
              Ver Lançamentos Previstos
            </Button>
          </div>
        </div>
      ) : (
        <Alert className="bg-[#00D68F]/15 border-[#00D68F]/40 text-[#00D68F] p-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#00D68F]/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-[#00D68F]" />
            </div>
            <div>
              <p className="font-bold text-white text-sm">
                Liquidez Saudável nos Próximos {horizonte} Dias
              </p>
              <p className="text-xs text-gray-300">
                Não há projeção de saldo negativo no período analisado. Saldo disponível cobre as
                saídas.
              </p>
            </div>
          </div>
        </Alert>
      )}

      {/* Cards de Métricas Consolidada */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">
            Saldo Disponível Hoje
          </span>
          <div className="text-xl font-bold font-mono mt-1 text-white">
            {formatCurrency(saldoDisponivelTotal)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Soma de todas as contas do grupo</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">
            Saídas Previstas ({horizonte}d)
          </span>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            - {formatCurrency(saidasPrevistasTotal)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Contas a pagar e fixas do período</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">
            Entradas Previstas ({horizonte}d)
          </span>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            + {formatCurrency(entradasPrevistasTotal)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Recebimentos previstos</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">
            Necessidade de Caixa
          </span>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              necessidadeConsolidada > 0 ? 'text-[#FF5C5C]' : 'text-[#00D68F]'
            }`}
          >
            {necessidadeConsolidada > 0 ? formatCurrency(necessidadeConsolidada) : 'R$ 0,00'}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">
            {dataPrimeiraNecessidade
              ? `A partir de ${formatDateBR(dataPrimeiraNecessidade)}`
              : 'Sem déficit previsto'}
          </p>
        </Card>
      </div>

      {/* OS 5 PIORES DIAS */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-[#FF5C5C]" />
            Os 5 Piores Dias de Liquidez ({horizonte} Dias)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Posição</th>
                  <th className="py-3 px-4">Data Projetada</th>
                  <th className="py-3 px-4 text-right">Saldo Projetado</th>
                  <th className="py-3 px-4 text-right">Falta de Caixa (Déficit)</th>
                  <th className="py-3 px-4 text-center">Situação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {pioresDias.map((dia, idx) => (
                  <tr key={dia.data} className="hover:bg-[#1A222D]/40">
                    <td className="py-2.5 px-4 font-bold text-xs text-gray-400">#{idx + 1}</td>
                    <td className="py-2.5 px-4 font-mono text-xs text-white">
                      {formatDateBR(dia.data)}
                    </td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono text-xs font-bold ${
                        dia.saldoProjetado < 0 ? 'text-[#FF5C5C]' : 'text-white'
                      }`}
                    >
                      {formatCurrency(dia.saldoProjetado)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono text-xs text-[#FF5C5C] font-semibold">
                      {dia.deficit > 0 ? formatCurrency(dia.deficit) : 'R$ 0,00'}
                    </td>
                    <td className="py-2.5 px-4 text-center">
                      {dia.saldoProjetado < 0 ? (
                        <Badge className="bg-[#FF5C5C]/20 text-[#FF5C5C] border-[#FF5C5C]/40 text-[10px]">
                          DEFICITÁRIO
                        </Badge>
                      ) : (
                        <Badge className="bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 text-[10px]">
                          POSITIVO
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* ANÁLISE DETALHADA POR FINANCEIRO */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            Necessidade de Caixa Isolada por Financeiro
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4 text-right">Saldo Atual</th>
                  <th className="py-3 px-4 text-right">Saídas Previstas ({horizonte}d)</th>
                  <th className="py-3 px-4 text-right">Necessidade (Déficit)</th>
                  <th className="py-3 px-4">Quando Falta?</th>
                  <th className="py-3 px-4 text-center">Ação Recomendada</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {analisePorFinanceiro.map((item) => (
                  <tr key={item.financeiro.id} className="hover:bg-[#1A222D]/40">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-white">{item.financeiro.nome}</div>
                      <Badge
                        variant="outline"
                        className="text-[10px] mt-0.5"
                        style={{
                          borderColor: `${item.financeiro.cor}66`,
                          color: item.financeiro.cor,
                        }}
                      >
                        {item.financeiro.tipo}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-gray-300">
                      {formatCurrency(item.saldoAtual)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-xs text-[#FF5C5C]">
                      - {formatCurrency(item.saidasPrevistas)}
                    </td>
                    <td
                      className={`py-3 px-4 text-right font-mono text-xs font-bold ${
                        item.necessidade > 0 ? 'text-[#FF5C5C]' : 'text-[#00D68F]'
                      }`}
                    >
                      {item.necessidade > 0 ? formatCurrency(item.necessidade) : 'R$ 0,00'}
                    </td>
                    <td className="py-3 px-4 text-xs font-mono">
                      {item.dataDeficit ? (
                        <span className="text-[#FF5C5C] font-semibold">
                          {formatDateBR(item.dataDeficit)}
                        </span>
                      ) : (
                        <span className="text-gray-500">Sem déficit</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-center">
                      {item.necessidade > 0 ? (
                        <Button
                          size="sm"
                          onClick={() => navigate('/mutuos')}
                          className="h-7 text-xs bg-[#FF5C5C]/20 border border-[#FF5C5C]/50 text-[#FF5C5C] hover:bg-[#FF5C5C]/30"
                        >
                          Solicitar Mútuo
                        </Button>
                      ) : (
                        <span className="text-xs text-[#00D68F] font-semibold">Suficiente</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
