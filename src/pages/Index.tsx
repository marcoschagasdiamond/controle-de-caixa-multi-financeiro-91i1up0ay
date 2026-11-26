import React, { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { FinanceiroService } from '@/services/financeiro'
import {
  Financeiro,
  ContaBancaria,
  Lancamento,
  ExtratoItem,
  ContaFixa,
  LancamentoRecorrente,
  RecebivelSemData,
} from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { CalendarClock, TrendingDown } from 'lucide-react'
import { projetarSaldo30Dias, ocorrenciasRecorrentes } from '@/lib/projecao'
import { avisoEncerramento } from '@/lib/recorrentes'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertaContasFixas } from '@/components/AlertaContasFixas'
import { PainelGraficos } from '@/components/PainelGraficos'
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
  LineChart,
  AlertTriangle,
} from 'lucide-react'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'

const MESES_PT = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  AreaChart,
  Area,
  Cell,
} from 'recharts'

export default function Index() {
  const navigate = useNavigate()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [extratoItens, setExtratoItens] = useState<ExtratoItem[]>([])
  const [contasFixas, setContasFixas] = useState<ContaFixa[]>([])
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])
  const [recebiveis, setRecebiveis] = useState<RecebivelSemData[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro de financeiro ou consolidado no Painel
  const [selectedFinId, setSelectedFinId] = useState<string>('todos')

  // Seletor de Mês/Ano do Painel (padrão: mês e ano atuais)
  const hojeData = useMemo(() => new Date(), [])
  const anoAtual = hojeData.getFullYear()
  const mesAtualNum = hojeData.getMonth() + 1
  const [mesSel, setMesSel] = useState(mesAtualNum)
  const [anoSel, setAnoSel] = useState(anoAtual)
  const anosDisponiveis = useMemo(() => {
    const arr: number[] = []
    for (let a = anoAtual - 5; a <= anoAtual; a++) arr.push(a)
    return arr
  }, [anoAtual])

  // Financeiros visíveis ao usuário logado (master = todos; membro = só liberados)
  const { financeiros: finsAcesso, loading: loadingAcesso } = useAcessoFinanceiros()

  useEffect(() => {
    setFinanceiros(finsAcesso)
    if (!loadingAcesso && finsAcesso.length === 0) setLoading(false)
  }, [finsAcesso, loadingAcesso])

  const carregarPainel = async () => {
    try {
      setLoading(true)
      const [cts, lcs, ext, cfs, recs, rcds] = await Promise.all([
        FinanceiroService.getContas(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getExtratoItens(),
        FinanceiroService.getContasFixas(),
        FinanceiroService.getLancamentosRecorrentes(),
        FinanceiroService.getRecebiveisSemData(),
      ])
      setContas(cts)
      setLancamentos(lcs)
      setExtratoItens(ext)
      setContasFixas(cfs)
      setRecorrentes(recs)
      setRecebiveis(rcds)
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

  const recorrentesFiltrados = useMemo(() => {
    if (selectedFinId === 'todos') return recorrentes
    return recorrentes.filter((r) => r.financeiro_id === selectedFinId)
  }, [recorrentes, selectedFinId])

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

  // SALDO POR CONTA BANCÁRIA (financeiro selecionado) — mesma fórmula do card da empresa
  // em Lançamentos: saldo inicial da conta + lançamentos realizados (crédito − débito) por conta_id.
  const saldosPorConta = useMemo(() => {
    return contasFiltradas.map((c) => {
      let saldo = Number(c.saldo_inicial)
      for (const l of lancamentosFiltrados) {
        if (l.conta_id !== c.id || l.status !== 'realizado') continue
        saldo += l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor)
      }
      return { id: c.id, banco: c.banco, conta: c.conta, saldo }
    })
  }, [contasFiltradas, lancamentosFiltrados])

  // Mês/Ano escolhido no seletor (YYYY-MM) e o imediatamente anterior
  const mesAnoSelecionado = `${anoSel}-${String(mesSel).padStart(2, '0')}`
  const mesAnoAtual = `${anoAtual}-${String(mesAtualNum).padStart(2, '0')}`
  const nomeMesSelecionado = `${MESES_PT[mesSel - 1]}/${anoSel}`

  const mesAnteriorSelecionado = useMemo(() => {
    const prev = new Date(anoSel, mesSel - 2, 1)
    return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`
  }, [anoSel, mesSel])

  // 2. Entradas do mês escolhido (realizados)
  const entradasDoMes = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) =>
          l.tipo === 'credito' && l.status === 'realizado' && l.data.startsWith(mesAnoSelecionado),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAnoSelecionado])

  // 3. Saídas do mês escolhido (realizados)
  const saidasDoMes = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) =>
          l.tipo === 'debito' && l.status === 'realizado' && l.data.startsWith(mesAnoSelecionado),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAnoSelecionado])

  // Mês anterior ao escolhido (YYYY-MM), base dos deltas
  const entradasMesAnterior = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) =>
          l.tipo === 'credito' &&
          l.status === 'realizado' &&
          l.data.startsWith(mesAnteriorSelecionado),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAnteriorSelecionado])

  const saidasMesAnterior = useMemo(() => {
    return lancamentosFiltrados
      .filter(
        (l) =>
          l.tipo === 'debito' &&
          l.status === 'realizado' &&
          l.data.startsWith(mesAnteriorSelecionado),
      )
      .reduce((acc, l) => acc + Number(l.valor), 0)
  }, [lancamentosFiltrados, mesAnteriorSelecionado])

  // Delta percentual vs mês anterior (null quando não há base comparável)
  const deltaPct = (atual: number, anterior: number): number | null => {
    if (anterior === 0) return atual === 0 ? null : null
    return ((atual - anterior) / Math.abs(anterior)) * 100
  }
  const deltaEntradas = deltaPct(entradasDoMes, entradasMesAnterior)
  const deltaSaidas = deltaPct(saidasDoMes, saidasMesAnterior)

  // 4. Resultado do Mês
  const resultadoDoMes = entradasDoMes - saidasDoMes

  // 5. Pendentes de Conciliação
  const pendentesConciliacaoCount = useMemo(() => {
    return extratoFiltrado.filter(
      (e) => e.status === 'pendente' || e.status === 'sem_correspondencia',
    ).length
  }, [extratoFiltrado])

  // GRÁFICO DE BARRAS: Entradas vs Saídas dos últimos 6 meses (contexto).
  // A janela termina no mês atual; se o mês escolhido é anterior à janela,
  // ela desliza para terminá-lo, garantindo que o mês escolhido apareça.
  const dadosGrafico6Meses = useMemo(() => {
    const meses: Array<{
      mesAno: string
      label: string
      entradas: number
      saidas: number
      selecionado: boolean
    }> = []

    const inicioPadrao = new Date(anoAtual, mesAtualNum - 6, 1)
    const inicioPadraoStr = `${inicioPadrao.getFullYear()}-${String(inicioPadrao.getMonth() + 1).padStart(2, '0')}`
    const fimJanela = mesAnoSelecionado < inicioPadraoStr ? mesAnoSelecionado : mesAnoAtual
    const [fimAno, fimMes] = fimJanela.split('-').map(Number)

    for (let i = 5; i >= 0; i--) {
      const d = new Date(fimAno, fimMes - 1 - i, 1)
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
        selecionado: mesAno === mesAnoSelecionado,
      })
    }

    return meses
  }, [lancamentosFiltrados, mesAnoSelecionado, mesAnoAtual, anoAtual, mesAtualNum])

  // EVOLUÇÃO DO SALDO: saldo acumulado ao fim de cada um dos últimos 6 meses
  // (saldo inicial das contas + todos os lançamentos realizados até o fim do mês)
  const evolucaoSaldo = useMemo(() => {
    if (dadosGrafico6Meses.length === 0) return []
    const inicioJanela = `${dadosGrafico6Meses[0].mesAno}-01`
    // base: saldo inicial das contas + lançamentos realizados ANTES da janela de 6 meses
    let saldoAcumulado = contasFiltradas.reduce((acc, c) => acc + Number(c.saldo_inicial), 0)
    for (const l of lancamentosFiltrados) {
      if (l.status === 'realizado' && l.data < inicioJanela) {
        saldoAcumulado += l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor)
      }
    }
    return dadosGrafico6Meses.map((m) => {
      for (const l of lancamentosFiltrados) {
        if (l.status === 'realizado' && l.data.startsWith(m.mesAno)) {
          if (l.tipo === 'credito') saldoAcumulado += Number(l.valor)
          else saldoAcumulado -= Number(l.valor)
        }
      }
      return { label: m.label, saldo: saldoAcumulado, selecionado: m.selecionado }
    })
  }, [dadosGrafico6Meses, contasFiltradas, lancamentosFiltrados])

  // DESTAQUES: os 3 lançamentos do mês escolhido que mais impactaram o resultado
  const destaquesDoMes = useMemo(() => {
    const doMes = lancamentosFiltrados
      .filter((l) => l.status === 'realizado' && l.data.startsWith(mesAnoSelecionado))
      .map((l) => ({ ...l, impacto: l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor) }))
      .sort((a, b) => Math.abs(b.impacto) - Math.abs(a.impacto))
      .slice(0, 3)
    return doMes
  }, [lancamentosFiltrados, mesAnoSelecionado])

  // PRÓXIMOS VENCIMENTOS (Lançamentos previstos + ocorrências de recorrentes)
  const proximosVencimentosCalc = useMemo(() => {
    const hoje = getTodayISODate()
    const previstos = lancamentosFiltrados
      .filter((l) => l.status === 'previsto' && l.data >= hoje)
      .map((l) => ({
        id: l.id,
        data: l.data,
        descricao: l.descricao,
        contraparte: l.contraparte || null,
        valor: Number(l.valor),
        tipo: l.tipo,
        origem: 'lancamento' as const,
      }))
    const recorrentesOcorrencias = ocorrenciasRecorrentes(
      recorrentesFiltrados,
      lancamentosFiltrados,
      undefined,
      30,
      5,
    ).map((o) => ({
      id: `rec:${o.data}:${o.descricao}`,
      data: o.data,
      descricao: o.descricao,
      contraparte: null as string | null,
      valor: o.valor,
      tipo: o.tipo,
      origem: 'recorrente' as const,
    }))
    // AVISO DE ENCERRAMENTO: recorrentes parcelados que encerram em 1 mês ou menos
    const avisos = recorrentesFiltrados
      .map((r) => ({
        r,
        aviso: avisoEncerramento(hoje, r.dia_mes, r.data_inicial, r.total_parcelas),
      }))
      .filter((x) => x.aviso !== null)
      .map(({ r, aviso }) => ({
        id: `aviso:${r.id}`,
        descricao: r.descricao,
        texto:
          aviso!.parcelasRestantes === 1
            ? `Última parcela — ${r.tipo === 'credito' ? 'o recebimento' : 'o pagamento'} encerra em ${aviso!.mesEncerramento}`
            : `Faltam ${aviso!.parcelasRestantes} parcelas — ${r.tipo === 'credito' ? 'o recebimento' : 'o pagamento'} encerra em ${aviso!.mesEncerramento}`,
      }))
    const itens = [...previstos, ...recorrentesOcorrencias]
      .sort((a, b) => a.data.localeCompare(b.data))
      .slice(0, 5)
    return { itens, avisos }
  }, [lancamentosFiltrados, recorrentesFiltrados])

  const proximosVencimentos = proximosVencimentosCalc.itens
  const avisosEncerramento = proximosVencimentosCalc.avisos

  // SALDO PROJETADO EM 30 DIAS
  const projecao = useMemo(
    () =>
      projetarSaldo30Dias(
        contasFiltradas,
        lancamentosFiltrados,
        contasFixas,
        recorrentesFiltrados,
        selectedFinId,
      ),
    [contasFiltradas, lancamentosFiltrados, contasFixas, recorrentesFiltrados, selectedFinId],
  )

  // ÚLTIMOS LANÇAMENTOS
  const ultimosLancamentos = useMemo(() => {
    return lancamentosFiltrados.slice(0, 5)
  }, [lancamentosFiltrados])

  // RECEBÍVEIS SEM DATA: pendentes do financeiro/seleção atual (fora da projeção)
  const recebiveisPendentes = useMemo(() => {
    if (selectedFinId === 'todos') return recebiveis.filter((r) => r.status === 'pendente')
    return recebiveis.filter((r) => r.status === 'pendente' && r.financeiro_id === selectedFinId)
  }, [recebiveis, selectedFinId])

  const totalAReceberDefinido = recebiveisPendentes.reduce(
    (acc, r) => acc + Number(r.valor_total),
    0,
  )

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
          {/* Seletor de Mês / Ano (período dos cards de entradas/saídas/resultado e dos gráficos por grupo) */}
          <div
            className="flex items-end gap-2"
            role="group"
            aria-label="Mês e ano de referência do painel"
          >
            <div className="flex flex-col gap-0.5">
              <label
                htmlFor="sel-mes-painel"
                className="text-[9px] font-semibold uppercase text-gray-500"
              >
                Mês
              </label>
              <select
                id="sel-mes-painel"
                value={mesSel}
                onChange={(e) => setMesSel(Number(e.target.value))}
                className="h-9 px-2 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
              >
                {(anoSel === anoAtual ? MESES_PT.slice(0, mesAtualNum) : MESES_PT).map(
                  (nome, i) => (
                    <option key={nome} value={i + 1}>
                      {nome}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label
                htmlFor="sel-ano-painel"
                className="text-[9px] font-semibold uppercase text-gray-500"
              >
                Ano
              </label>
              <select
                id="sel-ano-painel"
                value={anoSel}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="h-9 px-2 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
              >
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            {mesAnoSelecionado !== mesAnoAtual && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setMesSel(mesAtualNum)
                  setAnoSel(anoAtual)
                }}
                className="text-[10px] text-gray-400 hover:text-white h-7 cursor-pointer"
              >
                Voltar ao mês atual
              </Button>
            )}
          </div>

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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-4">
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

        {/* Card: Saldo Projetado em 30 dias */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Saldo Projetado (30 dias)
            </span>
            <TrendingDown className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              projecao.saldoProjetado < 0 ? 'text-[#FF5C5C]' : 'text-white'
            }`}
          >
            {formatCurrency(projecao.saldoProjetado)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            Caixa hoje + previsto + fixas + recorrentes
          </p>
        </Card>

        {/* Card 2: Entradas do Mês */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Entradas · {nomeMesSelecionado}
            </span>
            <ArrowUpRight className="w-4 h-4 text-[#00D68F]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            + {formatCurrency(entradasDoMes)}
          </div>
          <DeltaPct
            delta={deltaEntradas}
            label="vs. mês anterior"
            corBoa="text-[#00D68F]"
            corRuim="text-[#FF5C5C]"
          />
        </Card>

        {/* Card 3: Saídas do Mês */}
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              Saídas · {nomeMesSelecionado}
            </span>
            <ArrowDownRight className="w-4 h-4 text-[#FF5C5C]" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            - {formatCurrency(saidasDoMes)}
          </div>
          <DeltaPct
            delta={deltaSaidas}
            label="vs. mês anterior"
            corBoa="text-[#00D68F]"
            corRuim="text-[#FF5C5C]"
            inverteCor
          />
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
          <p className="text-[10px] text-gray-500 mt-1">
            Entradas - Saídas de {nomeMesSelecionado}
          </p>
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

        {/* Card 6: Recebíveis sem data (contratos a receber) — fora da projeção */}
        <Card
          role="button"
          tabIndex={0}
          onClick={() => navigate('/lancamentos#recebiveis-sem-data')}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              navigate('/lancamentos#recebiveis-sem-data')
            }
          }}
          aria-label={`A receber quando definido: ${formatCurrency(totalAReceberDefinido)} em ${recebiveisPendentes.length} contrato(s). Abrir em Lançamentos`}
          className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg cursor-pointer hover:border-amber-400/60 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">
              A Receber Quando Definido
            </span>
            <CalendarClock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-amber-400">
            {formatCurrency(totalAReceberDefinido)}
          </div>
          <p className="text-[10px] text-gray-500 mt-1">
            {recebiveisPendentes.length} contrato(s) sem data — fora da projeção. Clique para ver.
          </p>
        </Card>
      </div>

      {/* SALDO POR CONTA BANCÁRIA: cards individuais do financeiro selecionado (o geral acima permanece) */}
      {selectedFinId !== 'todos' && saldosPorConta.length > 0 && (
        <section aria-labelledby="titulo-saldo-por-conta" className="space-y-3">
          <h2 id="titulo-saldo-por-conta" className="text-xs text-gray-400 font-semibold uppercase">
            Saldo por conta bancária
          </h2>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {saldosPorConta.map((c) => (
              <li key={c.id}>
                <Card className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg h-full">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400 font-semibold uppercase truncate">
                      {c.banco}
                    </span>
                    <DollarSign className="w-4 h-4 text-[#00D68F]" />
                  </div>
                  <div
                    className={`text-xl font-bold font-mono mt-1 ${
                      c.saldo < 0 ? 'text-[#FF5C5C]' : 'text-white'
                    }`}
                  >
                    {formatCurrency(c.saldo)}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-1">
                    Conta {c.conta}
                    {c.saldo < 0 ? ' · saldo negativo' : ''}
                  </p>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ALERTA DIÁRIO: Contas fixas vencidas e vencendo nos próximos 7 dias */}
      <AlertaContasFixas
        contasFixas={contasFixas}
        financeiros={financeiros}
        lancamentos={lancamentos}
        financeiroIdFiltro={selectedFinId}
        onPagamentoRegistrado={carregarPainel}
      />

      {/* DASHBOARD DE GRÁFICOS: por grupo, orçado vs realizado e tendência de saldo */}
      <PainelGraficos
        financeiros={financeiros}
        lancamentos={lancamentosFiltrados}
        contas={contasFiltradas}
        contasFixas={contasFixas}
        recorrentes={recorrentesFiltrados}
        financeiroIdSelecionado={selectedFinId}
        saldoAtual={saldoTotal}
        mesAno={mesAnoSelecionado}
        mesLabel={nomeMesSelecionado}
      />

      {/* GRÁFICO DE 6 MESES: Entradas vs Saídas */}
      <Card className="bg-[#141A22] border-[#232B36] text-white p-6 shadow-xl">
        <CardHeader className="p-0 pb-4 flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-[#00D68F]" />
            Evolução de Entradas vs Saídas (Últimos 6 Meses)
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Valores Realizados
            {dadosGrafico6Meses.some((m) => m.selecionado) && (
              <span className="text-[#00D68F]"> · mês destacado: {nomeMesSelecionado}</span>
            )}
          </span>
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
              <Bar dataKey="entradas" name="Entradas (R$)" radius={[4, 4, 0, 0]}>
                {dadosGrafico6Meses.map((m) => (
                  <Cell
                    key={`e-${m.mesAno}`}
                    fill="#00D68F"
                    fillOpacity={m.selecionado ? 1 : 0.45}
                    stroke={m.selecionado ? '#F1F5F9' : undefined}
                    strokeWidth={m.selecionado ? 1.5 : 0}
                  />
                ))}
              </Bar>
              <Bar dataKey="saidas" name="Saídas (R$)" radius={[4, 4, 0, 0]}>
                {dadosGrafico6Meses.map((m) => (
                  <Cell
                    key={`s-${m.mesAno}`}
                    fill="#FF5C5C"
                    fillOpacity={m.selecionado ? 1 : 0.45}
                    stroke={m.selecionado ? '#F1F5F9' : undefined}
                    strokeWidth={m.selecionado ? 1.5 : 0}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* EVOLUÇÃO DO SALDO (últimos 6 meses, acumulado) */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <LineChart className="w-4 h-4 text-[#00D68F]" />
            Evolução do Saldo (Últimos 6 Meses)
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Saldo acumulado ao fim de cada mês
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {evolucaoSaldo.some((p) => p.saldo !== 0) ? (
            <>
              <div className="h-52 w-full px-4 pt-4">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={evolucaoSaldo}>
                    <defs>
                      <linearGradient id="gradSaldo" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00D68F" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#00D68F" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#232B36" />
                    <XAxis dataKey="label" stroke="#64748B" fontSize={11} />
                    <YAxis
                      stroke="#64748B"
                      fontSize={11}
                      tickFormatter={(val: number) => `R$ ${(val / 1000).toFixed(0)}k`}
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
                    <Area
                      type="monotone"
                      dataKey="saldo"
                      name="Saldo (R$)"
                      stroke="#00D68F"
                      strokeWidth={2}
                      fill="url(#gradSaldo)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {/* Mini-tabela dos valores */}
              <div className="grid grid-cols-3 sm:grid-cols-6 divide-x divide-[#232B36] border-t border-[#232B36]">
                {evolucaoSaldo.map((p) => (
                  <div
                    key={p.label}
                    className={`p-2.5 text-center rounded-sm ${p.selecionado ? 'bg-[#00D68F]/10' : ''}`}
                  >
                    <div
                      className={`text-[10px] uppercase font-semibold ${
                        p.selecionado ? 'text-[#00D68F]' : 'text-gray-500'
                      }`}
                    >
                      {p.label}
                    </div>
                    <div
                      className={`text-[11px] font-mono font-bold mt-0.5 ${
                        p.saldo < 0 ? 'text-[#FF5C5C]' : 'text-white'
                      }`}
                    >
                      {formatCurrency(p.saldo)}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-gray-500">
              Sem histórico suficiente para exibir a evolução do saldo nos últimos 6 meses.
            </div>
          )}
        </CardContent>
      </Card>

      {/* DESTAQUES: maiores impactos no resultado do mês */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-[#00D68F]" />
            Maiores Impactos · {nomeMesSelecionado}
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Top {destaquesDoMes.length || 3} lançamentos
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {destaquesDoMes.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Nenhum lançamento realizado em {nomeMesSelecionado} ainda.
            </div>
          ) : (
            <div className="divide-y divide-[#232B36]">
              {destaquesDoMes.map((l, idx) => (
                <div key={l.id} className="p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-[#0B0F14] border border-[#232B36] flex items-center justify-center text-[10px] font-bold text-gray-400 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-xs truncate">{l.descricao}</div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{formatDateBR(l.data)}</span>
                        <span>•</span>
                        <span className="truncate">{l.contraparte || 'Sem contraparte'}</span>
                      </div>
                    </div>
                  </div>
                  <span
                    className={`font-mono font-bold text-xs flex-shrink-0 ${
                      l.impacto >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                    }`}
                  >
                    {l.impacto >= 0 ? '+' : '-'} {formatCurrency(Math.abs(l.impacto))}
                  </span>
                </div>
              ))}
            </div>
          )}
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
            {avisosEncerramento.length > 0 && (
              <div className="px-3 pt-3 space-y-2">
                {avisosEncerramento.map((a) => (
                  <div
                    key={a.id}
                    className="flex items-start gap-2 rounded-md border border-amber-400/30 bg-amber-400/10 p-2.5 text-[11px] text-amber-300"
                  >
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 flex-shrink-0"
                      aria-hidden="true"
                    />
                    <span>
                      <b className="font-semibold text-amber-200">{a.descricao}:</b> {a.texto}
                    </span>
                  </div>
                ))}
              </div>
            )}
            {proximosVencimentos.length === 0 ? (
              <div className="p-8 text-center text-xs text-gray-500">
                Nenhum vencimento previsto para os próximos dias.
              </div>
            ) : (
              <div className="divide-y divide-[#232B36]">
                {proximosVencimentos.map((l) => (
                  <div key={l.id} className="p-3 flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-white flex items-center gap-1.5">
                        {l.origem === 'recorrente' && (
                          <CalendarClock className="w-3 h-3 text-amber-400 flex-shrink-0" />
                        )}
                        {l.descricao}
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                        <span className="font-mono">{formatDateBR(l.data)}</span>
                        <span>•</span>
                        <span>
                          {l.contraparte ||
                            (l.origem === 'recorrente' ? 'Recorrente mensal' : 'Sem contraparte')}
                        </span>
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

// Delta percentual com seta — corBoa/corRuim definem o significado por contexto
// (ex.: aumento de saídas é ruim → inverteCor troca verde/vermelho)
function DeltaPct({
  delta,
  label,
  corBoa,
  corRuim,
  inverteCor = false,
}: {
  delta: number | null
  label: string
  corBoa: string
  corRuim: string
  inverteCor?: boolean
}) {
  if (delta === null || !isFinite(delta)) {
    return <p className="text-[10px] text-gray-500 mt-1">Sem base de comparação no mês anterior</p>
  }
  const subiu = delta >= 0
  const positivo = inverteCor ? !subiu : subiu
  return (
    <div className="flex items-center gap-1 mt-1">
      {subiu ? (
        <ArrowUpRight className={`w-3 h-3 ${positivo ? corBoa : corRuim}`} />
      ) : (
        <ArrowDownRight className={`w-3 h-3 ${positivo ? corBoa : corRuim}`} />
      )}
      <span className={`text-[10px] font-semibold ${positivo ? corBoa : corRuim}`}>
        {subiu ? '+' : ''}
        {delta.toFixed(1)}% {label}
      </span>
    </div>
  )
}
