import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, Lancamento, FechamentoFinanceiroView } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  FileText,
  Printer,
  Building2,
  DollarSign,
  ArrowUpRight,
  ArrowDownRight,
  Calendar,
  Layers,
  Clock,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react'

export default function FechamentoPage() {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [fechamentoView, setFechamentoView] = useState<FechamentoFinanceiroView[]>([])
  const [loading, setLoading] = useState(true)

  // Aba ativa: 'consolidado' ou ID do financeiro
  const [activeTab, setActiveTab] = useState<string>('')

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [fins, cts, lcs, fView] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getFechamento(),
      ])

      setFinanceiros(fins)
      setContas(cts)
      setLancamentos(lcs)
      setFechamentoView(fView)

      if (fins.length > 0 && !activeTab) {
        setActiveTab(fins[0].id)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // REGRA: Exportar PDF via impressão nativa do navegador
  const handlePrint = () => {
    window.print()
  }

  // Cálculo individual por financeiro
  const getDadosFinanceiro = (finId: string) => {
    const fin = financeiros.find((f) => f.id === finId)
    const viewItem = fechamentoView.find((v) => v.financeiro_id === finId)

    // Contas do financeiro
    const contasFin = contas.filter((c) => c.financeiro_id === finId)
    const saldoInicial = contasFin.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)

    const lcs = lancamentos.filter((l) => l.financeiro_id === finId)
    const entradasRealizadas = lcs
      .filter((l) => l.tipo === 'credito' && l.status === 'realizado')
      .reduce((acc, l) => acc + Number(l.valor), 0)

    const saidasRealizadas = lcs
      .filter((l) => l.tipo === 'debito' && l.status === 'realizado')
      .reduce((acc, l) => acc + Number(l.valor), 0)

    const resultado = entradasRealizadas - saidasRealizadas
    const saldoFinal = saldoInicial + resultado

    // Títulos em aberto (previstos)
    const titulosAReceber = lcs.filter((l) => l.tipo === 'credito' && l.status === 'previsto')
    const titulosAPagar = lcs.filter((l) => l.tipo === 'debito' && l.status === 'previsto')
    const totalAReceber = titulosAReceber.reduce((acc, l) => acc + Number(l.valor), 0)
    const totalAPagar = titulosAPagar.reduce((acc, l) => acc + Number(l.valor), 0)

    return {
      fin,
      contas: contasFin,
      saldoInicial,
      entradasRealizadas,
      saidasRealizadas,
      resultado,
      saldoFinal,
      titulosAReceber,
      titulosAPagar,
      totalAReceber,
      totalAPagar,
    }
  }

  // Visão Consolidada do Grupo (Visão adicional, NUNCA como base)
  const dadosConsolidados = useMemo(() => {
    const totalSaldoInicial = contas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
    const totalEntradas = lancamentos
      .filter((l) => l.tipo === 'credito' && l.status === 'realizado')
      .reduce((acc, l) => acc + Number(l.valor), 0)
    const totalSaidas = lancamentos
      .filter((l) => l.tipo === 'debito' && l.status === 'realizado')
      .reduce((acc, l) => acc + Number(l.valor), 0)
    const resultado = totalEntradas - totalSaidas
    const saldoFinal = totalSaldoInicial + resultado

    const totalPrevReceber = lancamentos
      .filter((l) => l.tipo === 'credito' && l.status === 'previsto')
      .reduce((acc, l) => acc + Number(l.valor), 0)
    const totalPrevPagar = lancamentos
      .filter((l) => l.tipo === 'debito' && l.status === 'previsto')
      .reduce((acc, l) => acc + Number(l.valor), 0)

    return {
      saldoInicial: totalSaldoInicial,
      entradas: totalEntradas,
      saidas: totalSaidas,
      resultado,
      saldoFinal,
      totalPrevReceber,
      totalPrevPagar,
    }
  }, [contas, lancamentos])

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Fechamento Financeiro</h1>
          <p className="text-sm text-gray-400">
            Prestação de contas e conciliação de saldos por entidade com visão consolidada auxiliar
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handlePrint}
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer shadow-lg shadow-[#00D68F]/20"
          >
            <Printer className="w-4 h-4 mr-2" />
            Exportar / Imprimir PDF
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

      {/* Conteúdo Imprimível */}
      <div className="space-y-6 print:text-black">
        {/* Abas por Financeiro (Uma aba por financeiro + consolidado auxiliar) */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="bg-[#141A22] border border-[#232B36] p-1 flex flex-wrap gap-1 w-full justify-start print:hidden">
            {financeiros.map((f) => (
              <TabsTrigger
                key={f.id}
                value={f.id}
                className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold cursor-pointer"
              >
                <span
                  className="w-2 h-2 rounded-full mr-1.5 inline-block"
                  style={{ backgroundColor: f.cor || '#00D68F' }}
                />
                {f.nome} ({f.tipo})
              </TabsTrigger>
            ))}
            <TabsTrigger
              value="consolidado"
              className="data-[state=active]:bg-[#38BDF8] data-[state=active]:text-[#0B0F14] text-xs font-semibold cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5 mr-1" />
              Consolidado do Grupo (Visão Adicional)
            </TabsTrigger>
          </TabsList>

          {/* CONTEÚDO DAS ABAS INDIVIDUAIS DE CADA FINANCEIRO */}
          {financeiros.map((fin) => {
            const d = getDadosFinanceiro(fin.id)
            return (
              <TabsContent key={fin.id} value={fin.id} className="space-y-6 mt-4">
                {/* Header do Relatório da Entidade */}
                <div className="p-6 rounded-xl bg-[#141A22] border border-[#232B36] text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className="w-3.5 h-3.5 rounded-full"
                        style={{ backgroundColor: fin.cor || '#00D68F' }}
                      />
                      <h2 className="text-xl font-bold text-white tracking-tight">{fin.nome}</h2>
                      <Badge
                        variant="outline"
                        style={{ borderColor: fin.cor, color: fin.cor }}
                        className="text-xs"
                      >
                        {fin.tipo}
                      </Badge>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      {fin.tipo === 'PJ'
                        ? `CNPJ: ${fin.cpf_cnpj || 'Não informado'} | Regime: ${fin.regime_tributario || 'Simples'}`
                        : `CPF: ${fin.cpf_cnpj || 'Não informado'}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400 font-semibold">
                      Status Contábil
                    </span>
                    <div className="text-sm font-bold text-[#00D68F] flex items-center justify-end gap-1">
                      <ShieldCheck className="w-4 h-4" />
                      Segregação Ativa
                    </div>
                  </div>
                </div>

                {/* 5 CARDS: Saldo Inicial, Entradas, Saídas, Resultado e Saldo Final */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                    <span className="text-xs text-gray-400 font-semibold uppercase">
                      Saldo Inicial
                    </span>
                    <div className="text-lg font-bold font-mono mt-1 text-white">
                      {formatCurrency(d.saldoInicial)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Abertura de contas</p>
                  </Card>

                  <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                    <span className="text-xs text-gray-400 font-semibold uppercase">
                      Entradas (+)
                    </span>
                    <div className="text-lg font-bold font-mono mt-1 text-[#00D68F]">
                      + {formatCurrency(d.entradasRealizadas)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Realizadas no período</p>
                  </Card>

                  <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                    <span className="text-xs text-gray-400 font-semibold uppercase">
                      Saídas (-)
                    </span>
                    <div className="text-lg font-bold font-mono mt-1 text-[#FF5C5C]">
                      - {formatCurrency(d.saidasRealizadas)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Realizadas no período</p>
                  </Card>

                  <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                    <span className="text-xs text-gray-400 font-semibold uppercase">Resultado</span>
                    <div
                      className={`text-lg font-bold font-mono mt-1 ${
                        d.resultado >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                      }`}
                    >
                      {d.resultado >= 0 ? '+' : ''}
                      {formatCurrency(d.resultado)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Entradas - Saídas</p>
                  </Card>

                  <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                    <span className="text-xs text-gray-400 font-semibold uppercase">
                      Saldo Final
                    </span>
                    <div
                      className={`text-lg font-black font-mono mt-1 ${
                        d.saldoFinal >= 0 ? 'text-white' : 'text-[#FF5C5C]'
                      }`}
                    >
                      {formatCurrency(d.saldoFinal)}
                    </div>
                    <p className="text-[10px] text-gray-500 mt-1">Posição em caixa</p>
                  </Card>
                </div>

                {/* TÍTULOS EM ABERTO (PREVISTOS A RECEBER E A PAGAR) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="bg-[#141A22] border-[#232B36] text-white">
                    <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        <ArrowUpRight className="w-4 h-4 text-[#00D68F]" />
                        Títulos em Aberto a Receber (Previsto)
                      </CardTitle>
                      <Badge className="bg-[#00D68F]/20 text-[#00D68F] font-mono">
                        {formatCurrency(d.totalAReceber)}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0 max-h-56 overflow-y-auto">
                      {d.titulosAReceber.length === 0 ? (
                        <div className="p-4 text-xs text-gray-500 text-center">
                          Nenhum recebimento em aberto previsto.
                        </div>
                      ) : (
                        <div className="divide-y divide-[#232B36]">
                          {d.titulosAReceber.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium text-white">{item.descricao}</span>
                                <span className="text-[10px] text-gray-400 block font-mono">
                                  Vencimento: {item.data}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-[#00D68F]">
                                + {formatCurrency(item.valor)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="bg-[#141A22] border-[#232B36] text-white">
                    <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
                      <CardTitle className="text-sm font-bold text-white flex items-center gap-2">
                        <ArrowDownRight className="w-4 h-4 text-[#FF5C5C]" />
                        Títulos em Aberto a Pagar (Previsto)
                      </CardTitle>
                      <Badge className="bg-[#FF5C5C]/20 text-[#FF5C5C] font-mono">
                        {formatCurrency(d.totalAPagar)}
                      </Badge>
                    </CardHeader>
                    <CardContent className="p-0 max-h-56 overflow-y-auto">
                      {d.titulosAPagar.length === 0 ? (
                        <div className="p-4 text-xs text-gray-500 text-center">
                          Nenhum pagamento em aberto previsto.
                        </div>
                      ) : (
                        <div className="divide-y divide-[#232B36]">
                          {d.titulosAPagar.map((item) => (
                            <div
                              key={item.id}
                              className="p-2.5 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-medium text-white">{item.descricao}</span>
                                <span className="text-[10px] text-gray-400 block font-mono">
                                  Vencimento: {item.data}
                                </span>
                              </div>
                              <span className="font-mono font-bold text-[#FF5C5C]">
                                - {formatCurrency(item.valor)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            )
          })}

          {/* VISÃO CONSOLIDADA DO GRUPO (Apenas como adicional) */}
          <TabsContent value="consolidado" className="space-y-6 mt-4">
            <div className="p-4 rounded-xl bg-sky-950/40 border border-sky-800/50 text-white flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Layers className="w-5 h-5 text-sky-400" />
                  Visão Consolidada do Grupo Empresarial
                </h2>
                <p className="text-xs text-sky-200 mt-0.5">
                  Esta é uma visão gerencial suplementar. A base contábil permanece estritamente
                  segregada por financeiro.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                <span className="text-xs text-gray-400 font-semibold uppercase">
                  Saldo Inicial Total
                </span>
                <div className="text-lg font-bold font-mono mt-1 text-white">
                  {formatCurrency(dadosConsolidados.saldoInicial)}
                </div>
              </Card>

              <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                <span className="text-xs text-gray-400 font-semibold uppercase">
                  Total Entradas
                </span>
                <div className="text-lg font-bold font-mono mt-1 text-[#00D68F]">
                  + {formatCurrency(dadosConsolidados.entradas)}
                </div>
              </Card>

              <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                <span className="text-xs text-gray-400 font-semibold uppercase">Total Saídas</span>
                <div className="text-lg font-bold font-mono mt-1 text-[#FF5C5C]">
                  - {formatCurrency(dadosConsolidados.saidas)}
                </div>
              </Card>

              <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                <span className="text-xs text-gray-400 font-semibold uppercase">
                  Resultado Global
                </span>
                <div
                  className={`text-lg font-bold font-mono mt-1 ${
                    dadosConsolidados.resultado >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                  }`}
                >
                  {formatCurrency(dadosConsolidados.resultado)}
                </div>
              </Card>

              <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
                <span className="text-xs text-gray-400 font-semibold uppercase">
                  Saldo Final Global
                </span>
                <div className="text-lg font-black font-mono mt-1 text-white">
                  {formatCurrency(dadosConsolidados.saldoFinal)}
                </div>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
