import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import {
  Financeiro,
  PlanoConta,
  Lancamento,
  LancamentoRecorrente,
  Budget,
} from '@/types/financeiro'
import { formatCurrency, getTodayISODate } from '@/lib/formatters'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  PieChart,
  Calendar,
  Building2,
  DollarSign,
  TrendingDown,
  TrendingUp,
  Check,
  Edit2,
  RefreshCw,
  Loader2,
  Download,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'
import { Wand2 } from 'lucide-react'
import { calcularSugestaoOrcado, MESES_HISTORICO_SUGESTAO } from '@/lib/budgetSugestao'
import {
  DialogoSugestaoOrcado,
  LinhaSugestao,
  ModoSugestao,
} from '@/components/DialogoSugestaoOrcado'

// Interface para as linhas da tabela de Budget
interface LinhaBudgetItem {
  plano: PlanoConta
  orcado: number
  realizado: number
  variacaoR$: number
  percentual: number
}

export default function BudgetPage() {
  const { toast } = useToast()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  // Seletores: Financeiro e Mês (YYYY-MM)
  const currentMonthStr = useMemo(() => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [])

  const [selectedFinId, setSelectedFinId] = useState<string>('')
  const [selectedMes, setSelectedMes] = useState<string>(currentMonthStr)

  // Edição na célula: { [planoId]: valorEditado }
  const [editingPlanoId, setEditingPlanoId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState<string>('')
  const [savingCell, setSavingCell] = useState(false)

  // Estado do diálogo "Preencher com sugestão"
  const [dialogoSugestao, setDialogoSugestao] = useState(false)
  const [aplicandoSugestao, setAplicandoSugestao] = useState(false)

  // Recorrentes e parcelados do financeiro selecionado (base da sugestão)
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])

  // Financeiros visíveis ao usuário logado (master = todos; membro = só liberados)
  const { financeiros: finsAcesso } = useAcessoFinanceiros()

  useEffect(() => {
    setFinanceiros(finsAcesso)
    if (finsAcesso.length > 0 && !selectedFinId) {
      setSelectedFinId(finsAcesso[0].id)
    }
  }, [finsAcesso, selectedFinId])

  const carregarDadosIniciais = async () => {
    try {
      setLoading(true)
      const [pls, lcs, rcs] = await Promise.all([
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getLancamentosRecorrentes(),
      ])

      setPlanos(pls)
      setLancamentos(lcs)
      setRecorrentes(rcs)
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar dados', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDadosIniciais()
  }, [])

  // Carregar Budgets do Financeiro e Mês selecionados
  const carregarBudgets = async () => {
    if (!selectedFinId || !selectedMes) return
    try {
      const bgs = await FinanceiroService.getBudgets(selectedFinId, selectedMes)
      setBudgets(bgs)
    } catch (err: any) {
      console.error(err)
    }
  }

  useEffect(() => {
    if (selectedFinId && selectedMes) {
      carregarBudgets()
    }
  }, [selectedFinId, selectedMes])

  // Plano de contas GLOBAL: todas as categorias ativas, independente do financeiro
  const planosDoFin = useMemo(() => {
    return planos.filter((p) => p.ativo)
  }, [planos])

  // Cálculo por Plano de Contas: Orçado, Realizado, Variação R$ e %
  const linhasBudget = useMemo(() => {
    return planosDoFin.map((plano) => {
      // 1. Orçado
      const bg = budgets.find((b) => b.plano_conta_id === plano.id)
      const orcado = bg ? Number(bg.valor_orcado) : 0

      // 2. Realizado no mês selecionado
      const realizado = lancamentos
        .filter((l) => {
          if (l.financeiro_id !== selectedFinId) return false
          if (l.plano_conta_id !== plano.id) return false
          if (l.status !== 'realizado') return false
          return l.data.startsWith(selectedMes)
        })
        .reduce((acc, l) => acc + Number(l.valor), 0)

      // 3. Variação R$ e %
      const variacaoR$ = orcado - realizado
      const percentual = orcado > 0 ? (realizado / orcado) * 100 : 0

      return {
        plano,
        orcado,
        realizado,
        variacaoR$,
        percentual,
      }
    })
  }, [planosDoFin, budgets, lancamentos, selectedFinId, selectedMes])

  // Sugestão de orçado: média dos últimos 6 meses realizados + recorrentes/
  // parcelas com vencimento no mês selecionado (src/lib/budgetSugestao.ts,
  // que reutiliza recorrenteOcorreEm de src/lib/recorrentes.ts).
  const sugestao = useMemo(
    () =>
      selectedFinId && selectedMes
        ? calcularSugestaoOrcado(planosDoFin, lancamentos, recorrentes, selectedFinId, selectedMes)
        : { porPlano: new Map<string, number>(), mesesConsiderados: 0 },
    [planosDoFin, lancamentos, recorrentes, selectedFinId, selectedMes],
  )

  // Linhas do diálogo: só categorias com sugestão > 0 (não inventa valor)
  const linhasSugestao = useMemo<LinhaSugestao[]>(
    () =>
      linhasBudget
        .map((linha) => ({
          plano: linha.plano,
          orcadoAtual: linha.orcado,
          sugestao: sugestao.porPlano.get(linha.plano.id) || 0,
        }))
        .filter((l) => l.sugestao > 0),
    [linhasBudget, sugestao],
  )

  // Totais Gerais
  const totalOrcado = linhasBudget.reduce((acc, cur) => acc + cur.orcado, 0)
  const totalRealizado = linhasBudget.reduce((acc, cur) => acc + cur.realizado, 0)
  const totalPercentual = totalOrcado > 0 ? (totalRealizado / totalOrcado) * 100 : 0

  // Salvar valor orçado editado na célula
  const handleSaveCell = async (planoId: string) => {
    if (!selectedFinId || !selectedMes) return
    const num = parseFloat(editValue.replace(',', '.'))
    if (isNaN(num) || num < 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe um valor numérico positivo.',
      })
      return
    }

    try {
      setSavingCell(true)
      await FinanceiroService.upsertBudget({
        financeiro_id: selectedFinId,
        plano_conta_id: planoId,
        mes_ano: selectedMes,
        valor_orcado: num,
      })

      toast({
        title: 'Budget atualizado!',
        description: `Orçamento fixado em ${formatCurrency(num)}.`,
      })

      setEditingPlanoId(null)
      await carregarBudgets()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao salvar', description: err.message })
    } finally {
      setSavingCell(false)
    }
  }

  // Aplicar a sugestão: salva os orçados pelo MESMO caminho da edição manual
  // (FinanceiroService.upsertBudget → RLS), respeitando financeiro e mês da tela.
  // "vazias" = só categorias sem valor orçado; "todas" = sobrescreve tudo.
  const handleAplicarSugestao = async (modo: ModoSugestao) => {
    if (!selectedFinId || !selectedMes) return
    const alvo =
      modo === 'todas' ? linhasSugestao : linhasSugestao.filter((l) => l.orcadoAtual <= 0)
    if (alvo.length === 0) return

    for (const l of alvo) {
      await FinanceiroService.upsertBudget({
        financeiro_id: selectedFinId,
        plano_conta_id: l.plano.id,
        mes_ano: selectedMes,
        valor_orcado: l.sugestao,
      })
    }

    await carregarBudgets()
    toast({
      title: 'Sugestão aplicada!',
      description: `${alvo.length} categoria(s) orçada(s) com a média dos últimos ${MESES_HISTORICO_SUGESTAO} meses + recorrentes do mês. Os valores continuam editáveis na célula.`,
    })
  }

  // Exporta as linhas visíveis do Budget (orçado, realizado, variação) em CSV pt-BR
  const handleExportarBudgetCSV = () => {
    if (linhasBudget.length === 0) {
      toast({ title: 'Nada para exportar: nenhuma categoria no budget.' })
      return
    }
    const fin = financeiros.find((f) => f.id === selectedFinId)
    const linhas: unknown[][] = linhasBudget
      .filter((l) => l.orcado > 0 || l.realizado > 0)
      .map((l) => [
        l.plano.codigo || '',
        l.plano.descricao,
        l.plano.tipo,
        valorCSV(l.orcado),
        valorCSV(l.realizado),
        valorCSV(l.variacaoR$),
        `${l.percentual.toFixed(1)}%`,
      ])
    if (linhas.length === 0) {
      toast({ title: 'Nada para exportar: nenhuma linha com valor orçado ou realizado.' })
      return
    }
    linhas.push(['', 'TOTAIS', '', valorCSV(totalOrcado), valorCSV(totalRealizado), '', ''])
    baixarCSV(
      `budget-${fin ? fin.nome.toLowerCase().replace(/[^a-z0-9]+/g, '-') : 'financeiro'}-${selectedMes}.csv`,
      ['Código', 'Categoria', 'Tipo', 'Orçado (R$)', 'Realizado (R$)', 'Variação (R$)', 'Execução'],
      linhas,
    )
    toast({
      title: 'Exportação concluída!',
      description: `${linhas.length - 1} categoria(s) exportada(s) em CSV (Excel pt-BR) para ${selectedMes}.`,
    })
  }

  // Cores da barra de progresso conforme especificação:
  // Verde até 90%, amarelo 90-100%, vermelho acima de 100%
  const getBarColor = (pct: number) => {
    if (pct <= 90) return 'bg-[#00D68F]'
    if (pct <= 100) return 'bg-amber-400'
    return 'bg-[#FF5C5C]'
  }

  const getTextColor = (pct: number) => {
    if (pct <= 90) return 'text-[#00D68F]'
    if (pct <= 100) return 'text-amber-400'
    return 'text-[#FF5C5C]'
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Budget vs Realizado</h1>
          <p className="text-sm text-gray-400">
            Acompanhamento orçamentário mensal por categoria com edição direta na célula
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Financeiro */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            <select
              value={selectedFinId}
              onChange={(e) => setSelectedFinId(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            >
              {financeiros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          {/* Seletor de Mês */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <input
              type="month"
              value={selectedMes}
              onChange={(e) => setSelectedMes(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            />
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={carregarBudgets}
            aria-label="Recarregar budgets"
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>

          {/* Preenchimento automático do orçado (média realizada + recorrentes) */}
          <Button
            size="sm"
            onClick={() => setDialogoSugestao(true)}
            disabled={loading || aplicandoSugestao || linhasSugestao.length === 0}
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold h-9"
          >
            <Wand2 className="w-4 h-4 mr-2" aria-hidden="true" />
            {aplicandoSugestao ? 'Aplicando…' : 'Preencher com sugestão'}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarBudgetCSV}
            disabled={linhasBudget.length === 0}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 cursor-pointer"
          >
            <Download className="w-4 h-4 mr-2" aria-hidden="true" />
            Exportar CSV
          </Button>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">Total Orçado no Mês</span>
          <div className="text-xl font-bold font-mono mt-1 text-white">
            {formatCurrency(totalOrcado)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Limite planejado</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">Total Realizado</span>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            {formatCurrency(totalRealizado)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Lançamentos consolidados no mês</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">
            Execução Orçamentária
          </span>
          <div className={`text-xl font-bold font-mono mt-1 ${getTextColor(totalPercentual)}`}>
            {totalPercentual.toFixed(1)}%
          </div>
          <div className="w-full bg-[#0B0F14] h-2 rounded-full overflow-hidden mt-2">
            <div
              className={`h-full ${getBarColor(totalPercentual)} transition-all duration-300`}
              style={{ width: `${Math.min(totalPercentual, 100)}%` }}
            />
          </div>
        </Card>
      </div>

      {/* TABELA BUDGET COM EDIÇÃO EM CÉLULA */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <PieChart className="w-4 h-4 text-[#00D68F]" />
              Categorias do Plano de Contas ({selectedMes})
            </CardTitle>
            <span className="text-xs text-gray-400">
              Clique no valor ou no ícone para editar o orçado da célula
            </span>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Descrição da Categoria</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Orçado (R$) [Editar]</th>
                  <th className="py-3 px-4 text-right">Realizado (R$)</th>
                  <th className="py-3 px-4 text-right">Variação R$</th>
                  <th className="py-3 px-4 w-48">Execução & Progresso</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {linhasBudget.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500 text-sm">
                      Nenhuma categoria de plano de contas encontrada neste financeiro.
                    </td>
                  </tr>
                ) : (
                  linhasBudget.map((linha) => {
                    const isEditing = editingPlanoId === linha.plano.id
                    const pct = linha.percentual

                    return (
                      <tr key={linha.plano.id} className="hover:bg-[#1A222D]/40 transition-colors">
                        <td className="py-3 px-4 font-mono text-xs text-gray-400">
                          {linha.plano.codigo}
                        </td>
                        <td className="py-3 px-4 font-medium text-white">
                          {linha.plano.descricao}
                        </td>
                        <td className="py-3 px-4">
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${
                              linha.plano.tipo === 'receita'
                                ? 'text-[#00D68F] border-[#00D68F]/30'
                                : 'text-[#FF5C5C] border-[#FF5C5C]/30'
                            }`}
                          >
                            {linha.plano.tipo}
                          </Badge>
                        </td>

                        {/* Célula Editável de Orçado */}
                        <td className="py-3 px-4 text-right font-mono text-xs">
                          {isEditing ? (
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                type="text"
                                autoFocus
                                aria-label="Editar valor do orçamento"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-24 h-7 text-right bg-[#0B0F14] border-[#00D68F] text-xs font-mono text-white p-1"
                              />
                              <Button
                                size="icon"
                                aria-label="Confirmar novo orçamento"
                                disabled={savingCell}
                                onClick={() => handleSaveCell(linha.plano.id)}
                                className="h-7 w-7 bg-[#00D68F] text-[#0B0F14] hover:bg-[#00B97A]"
                              >
                                {savingCell ? (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Check className="w-3 h-3" />
                                )}
                              </Button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              aria-label={`Editar valor orçado de ${linha.plano.descricao}`}
                              onClick={() => {
                                setEditingPlanoId(linha.plano.id)
                                setEditValue(String(linha.orcado || '0'))
                              }}
                              className="group flex items-center justify-end gap-1.5 w-full hover:text-[#00D68F] transition-colors cursor-pointer"
                            >
                              {' '}
                              <span className="font-semibold text-white">
                                {formatCurrency(linha.orcado)}
                              </span>
                              <Edit2 className="w-3 h-3 opacity-0 group-hover:opacity-100 text-gray-400" />
                            </button>
                          )}
                        </td>

                        {/* Realizado */}
                        <td className="py-3 px-4 text-right font-mono text-xs font-semibold text-white">
                          {formatCurrency(linha.realizado)}
                        </td>

                        {/* Variação R$ */}
                        <td
                          className={`py-3 px-4 text-right font-mono text-xs font-bold ${
                            linha.variacaoR$ >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                          }`}
                        >
                          {linha.variacaoR$ >= 0 ? '+' : ''}
                          {formatCurrency(linha.variacaoR$)}
                        </td>

                        {/* Barra de Progresso: verde <90%, amarelo 90-100%, vermelho >100% */}
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-between text-[11px] font-mono mb-1">
                            <span className={getTextColor(pct)}>{pct.toFixed(0)}%</span>
                            <span className="text-gray-500">
                              {linha.orcado > 0 ? 'do teto' : 'sem teto'}
                            </span>
                          </div>
                          <div
                            role="progressbar"
                            aria-label={`Execução orçamentária de ${linha.plano.descricao}: ${pct.toFixed(0)}%`}
                            aria-valuenow={Math.round(pct)}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            className="w-full bg-[#0B0F14] h-2 rounded-full overflow-hidden"
                          >
                            <div
                              className={`h-full ${getBarColor(pct)} transition-all duration-300`}
                              style={{ width: `${Math.min(pct, 100)}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Preencher com sugestão: aplica a média realizada + recorrentes nos orçados */}
      <DialogoSugestaoOrcado
        open={dialogoSugestao}
        onClose={() => setDialogoSugestao(false)}
        onAplicar={handleAplicarSugestao}
        linhas={linhasSugestao}
        mesesHistorico={MESES_HISTORICO_SUGESTAO}
      />
    </div>
  )
}
