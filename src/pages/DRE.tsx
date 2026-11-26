// DRE simples por categoria: receitas e despesas REALIZADAS do período,
// agrupadas pelos GRUPOS do plano de contas (tabela grupos_plano_contas —
// plano GLOBAL, compartilhado entre financeiros). Modo mês ou "Ano completo"
// com colunas dos 12 meses + Total Ano. Previstos NÃO entram (a não ser com
// o interruptor de projeção no modo Ano completo). COMPARAÇÃO COM O ORÇADO:
// orçado (tabela budgets, por categoria e mês) vs realizado, com variação em
// R$ e % — src/lib/dreOrcado.ts + src/components/DreTabela.tsx.
// Impressão/PDF pela impressão do navegador (mesma abordagem do Fechamento).

import { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import {
  Financeiro,
  PlanoConta,
  PlanoGrupo,
  Lancamento,
  LancamentoRecorrente,
  Budget,
} from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { calcularProjecaoPorPlano } from '@/lib/dreProjetado'
import {
  calcularComp,
  sinalComp,
  percentualComp,
  classeComp,
  orcadoPorPlano,
} from '@/lib/dreOrcado'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import BlocoTabelaDRE from '@/components/DreTabela'
import {
  Building2,
  Calendar,
  Download,
  Printer,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Scale,
  BarChart3,
} from 'lucide-react'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'

const MESES_CURTOS = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const

const MESES_LONGOS = [
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

interface LinhaCategoria {
  plano: PlanoConta
  valores: number[] // realizado, 12 posições (0 = jan)
  orcado: number[] // orçado do mês por categoria (0 = sem budget)
  projetado: boolean[] // posição tem componente projetado (com projeção ativa)
}

interface GrupoDRE {
  grupo: PlanoGrupo | null
  linhas: LinhaCategoria[]
  subtotal: number[]
  subtotalOrcado: number[] // orçado somado das categorias do grupo
  temProjecaoMes: boolean[] // algum valor do grupo tem componente projetado (por mês)
}

export interface BlocoDRE {
  grupos: GrupoDRE[]
  total: number[]
  totalOrcado: number[] // orçado somado de todo o bloco
  temProjecao: boolean // algum valor com componente projetado (para a legenda)
  temProjecaoMes: boolean[] // algum valor do BLOCO tem componente projetado (por mês)
}

const zero12 = () => Array.from({ length: 12 }, () => 0)
const falso12 = () => Array.from({ length: 12 }, () => false)

// Monta um bloco (receitas ou despesas): soma os lançamentos realizados por
// categoria/mês e agrupa pelas categorias pertencentes a cada grupo do plano.
// Categorias sem movimento no período não aparecem, EXCETO as orçadas no
// período (entram com realizado zero, para a comparação fechar) e as que só
// têm projeção no modo Ano completo com o toggle ativo. Categorias sem grupo
// caem no bucket "Sem grupo" (último).
// projecao (opcional, modo Ano completo com toggle): plano_conta_id → valores
// projetados por mês. Somada ao realizado da coluna; a ocorrência de recorrente
// já dedupada contra lançamento realizado equivalente não entra de novo
// (dedupe feito em calcularProjecaoPorPlano, src/lib/dreProjetado.ts).
// orcados: plano_conta_id → orçado por mês (Map de src/lib/dreOrcado.ts).
function montarBloco(
  tipo: 'receita' | 'despesa',
  prefixoPeriodo: string, // "YYYY-MM" ou "YYYY"
  planos: PlanoConta[],
  grupos: PlanoGrupo[],
  lancamentos: Lancamento[],
  finId: string,
  projecao?: Map<string, number[]>,
  orcados?: Map<string, number[]>,
): BlocoDRE {
  const tipoLanc = tipo === 'receita' ? 'credito' : 'debito'
  const mapa = new Map<string, number[]>()
  const marcasProj = new Map<string, boolean[]>()

  // Guardas defensivas: nenhum argumento de lista pode ser undefined em
  // nenhum momento do carregamento (crash histórico no preview:
  // "undefined is not an object (evaluating 'l of lancamentos')").
  planos = Array.isArray(planos) ? planos : []
  grupos = Array.isArray(grupos) ? grupos : []
  lancamentos = Array.isArray(lancamentos) ? lancamentos : []
  projecao = projecao instanceof Map ? projecao : new Map()
  orcados = orcados instanceof Map ? orcados : new Map()
  if (!finId) return blocoVazio()

  for (const l of lancamentos) {
    if (l.status !== 'realizado') continue
    if (l.financeiro_id !== finId) continue
    if (l.tipo !== tipoLanc) continue
    if (!l.data.startsWith(prefixoPeriodo)) continue
    const m = Number(l.data.slice(5, 7)) - 1
    if (!(m >= 0 && m <= 11)) continue
    let arr = mapa.get(l.plano_conta_id)
    if (!arr) {
      arr = zero12()
      mapa.set(l.plano_conta_id, arr)
    }
    arr[m] += Math.abs(Number(l.valor) || 0)
  }

  // Projeção: soma as ocorrências de recorrentes/parcelas ao realizado do mês.
  for (const [planoId, projArr] of projecao) {
    if (!projArr.some((v) => v !== 0)) continue
    // Ignora projeção de categoria de bloco oposto (recorrente de crédito nunca
    // soma na coluna de despesa e vice-versa) — casando o tipo do plano.
    const plano = planos.find((p) => p.id === planoId)
    if (!plano || plano.tipo !== tipo) continue
    if (!plano.ativo) continue
    let arr = mapa.get(planoId)
    if (!arr) {
      arr = zero12()
      mapa.set(planoId, arr)
      marcasProj.set(planoId, falso12())
    }
    const marcas = marcasProj.get(planoId)
    projArr.forEach((v, m) => {
      if (v === 0) return
      arr![m] += v
      if (marcas) marcas[m] = true
    })
  }

  // Categorias orçadas mas sem movimento realizado TAMBÉM entram (realizado zero)
  for (const [planoId, orcadoArr] of orcados) {
    if (!orcadoArr.some((v) => v !== 0)) continue
    if (mapa.has(planoId)) continue
    const plano = planos.find((p) => p.id === planoId)
    if (!plano || plano.tipo !== tipo) continue
    mapa.set(planoId, zero12())
  }

  // Grupos deste tipo, na ordem de cadastro (ordem/nome), + "Sem grupo" no fim
  const gruposDoTipo = grupos.filter((g) => g.tipo === tipo)
  const porGrupo = new Map<string | null, LinhaCategoria[]>()
  for (const g of gruposDoTipo) porGrupo.set(g.id, [])

  for (const [planoId, valores] of mapa) {
    if (!valores.some((v) => v !== 0) && !orcados.get(planoId)?.some((v) => v !== 0)) continue
    const plano = planos.find((p) => p.id === planoId)
    const linha: LinhaCategoria = {
      plano: plano ?? {
        id: planoId,
        user_id: '',
        codigo: '',
        descricao: 'Sem categoria',
        tipo,
        ativo: true,
      },
      valores,
      orcado: orcados?.get(planoId) || zero12(),
      projetado: marcasProj.get(planoId) || falso12(),
    }
    const gid = plano?.grupo_id ?? null
    const lista = porGrupo.get(gid)
    if (lista) lista.push(linha)
    else porGrupo.set(gid, [linha])
  }

  const saidaGrupos: GrupoDRE[] = []
  const total = zero12()
  const totalOrcado = zero12()
  let temProjecao = false
  for (const g of gruposDoTipo) {
    const linhas = porGrupo.get(g.id) || []
    if (linhas.length === 0) continue
    linhas.sort((a, b) => (a.plano.codigo || '').localeCompare(b.plano.codigo || ''))
    const subtotal = linhas.reduce((acc, l) => acc.map((v, i) => v + l.valores[i]), zero12())
    const subtotalOrcado = linhas.reduce((acc, l) => acc.map((v, i) => v + l.orcado[i]), zero12())
    const temProjecaoMes = Array.from({ length: 12 }, (_, i) => linhas.some((l) => l.projetado[i]))
    for (let i = 0; i < 12; i++) {
      total[i] += subtotal[i]
      totalOrcado[i] += subtotalOrcado[i]
    }
    if (temProjecaoMes.some(Boolean)) temProjecao = true
    saidaGrupos.push({ grupo: g, linhas, subtotal, subtotalOrcado, temProjecaoMes })
  }
  const semGrupo = porGrupo.get(null) || []
  if (semGrupo.length > 0) {
    semGrupo.sort((a, b) => (a.plano.codigo || '').localeCompare(b.plano.codigo || ''))
    const subtotal = semGrupo.reduce((acc, l) => acc.map((v, i) => v + l.valores[i]), zero12())
    const subtotalOrcado = semGrupo.reduce((acc, l) => acc.map((v, i) => v + l.orcado[i]), zero12())
    const temProjecaoMes = Array.from({ length: 12 }, (_, i) =>
      semGrupo.some((l) => l.projetado[i]),
    )
    for (let i = 0; i < 12; i++) {
      total[i] += subtotal[i]
      totalOrcado[i] += subtotalOrcado[i]
    }
    if (temProjecaoMes.some(Boolean)) temProjecao = true
    saidaGrupos.push({ grupo: null, linhas: semGrupo, subtotal, subtotalOrcado, temProjecaoMes })
  }

  const temProjecaoMes = Array.from({ length: 12 }, (_, i) =>
    saidaGrupos.some((g) => g.temProjecaoMes[i]),
  )
  return { grupos: saidaGrupos, total, totalOrcado, temProjecao, temProjecaoMes }
}

const somaPeriodo = (valores: number[]) => valores.reduce((a, b) => a + b, 0)

const blocoVazio = (): BlocoDRE => ({
  grupos: [],
  total: zero12(),
  totalOrcado: zero12(),
  temProjecao: false,
  temProjecaoMes: falso12(),
})

export default function DREPage() {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [grupos, setGrupos] = useState<PlanoGrupo[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])
  const [budgets, setBudgets] = useState<Budget[]>([])
  const [loading, setLoading] = useState(true)

  // Toggle "Incluir projeção (recorrentes + parcelas)" — só no modo Ano completo
  const [incluirProjecao, setIncluirProjecao] = useState(false)

  // Seletores: financeiro + período (mês ou ano completo)
  const hojeMemo = useMemo(() => new Date(), [])
  const anoAtual = hojeMemo.getFullYear()
  const [selectedFinId, setSelectedFinId] = useState('')
  const [modoAno, setModoAno] = useState(false)
  const [selectedMes, setSelectedMes] = useState(
    `${anoAtual}-${String(hojeMemo.getMonth() + 1).padStart(2, '0')}`,
  )
  const [anoSel, setAnoSel] = useState(anoAtual)

  // Financeiros visíveis ao usuário logado (master = todos; membro = só liberados)
  const { financeiros: finsAcesso } = useAcessoFinanceiros()

  useEffect(() => {
    setFinanceiros(finsAcesso)
    if (finsAcesso.length > 0) setSelectedFinId((prev) => prev || finsAcesso[0].id)
  }, [finsAcesso])

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [pls, gps, lcs, rcs, bgs] = await Promise.all([
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getPlanoGrupos(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getLancamentosRecorrentes(),
        // Orçado: ano inteiro no modo Ano completo; só o mês selecionado no modo
        // mês (que pode estar em um ano diferente do anoSel — não usar o mapa do
        // ano para preencher o mês, os budgets são por "YYYY-MM" exato)
        modoAno
          ? FinanceiroService.getBudgetsAno(selectedFinId, anoSel)
          : FinanceiroService.getBudgets(selectedFinId, selectedMes),
      ])
      setPlanos(pls)
      setGrupos(gps)
      setLancamentos(lcs)
      setRecorrentes(rcs)
      setBudgets(bgs)
    } catch (err) {
      console.error('Erro ao carregar DRE:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFinId, anoSel, selectedMes, modoAno])

  // Anos do seletor: base atual ±5, estendida pelos anos presentes nos lançamentos
  const anosDisponiveis = useMemo(() => {
    let min = anoAtual - 5
    let max = anoAtual + 5
    const expandir = (a: number) => {
      if (Number.isFinite(a) && a > 1900) {
        if (a < min) min = a
        if (a > max) max = a
      }
    }
    for (const l of lancamentos) {
      const a = Number(l.data.slice(0, 4))
      expandir(a)
    }
    // Anos com ocorrência de recorrentes/parcelas (para a projeção anual do modo
    // Ano completo: um parcelamento pode terminar em ano sem lançamentos)
    for (const r of recorrentes) {
      expandir(Number(r.data_inicial?.slice(0, 4)))
      if (r.total_parcelas && r.total_parcelas > 0) {
        const aIni = Number(r.data_inicial?.slice(0, 4))
        if (Number.isFinite(aIni) && aIni > 1900) {
          expandir(aIni + Math.floor((r.total_parcelas - 1) / 12))
        }
      }
    }
    const arr: number[] = []
    for (let a = min; a <= max; a++) arr.push(a)
    return arr
  }, [anoAtual, lancamentos, recorrentes])

  const prefixoPeriodo = modoAno ? `${anoSel}-` : selectedMes

  // Orçado por categoria e mês (Map plano_conta_id → 12 posições) a partir dos
  // budgets do financeiro, filtrados pelo período exibido: no modo mês só a
  // posição do mês escolhido é preenchida; no modo ano, as 12 posições.
  const orcadosPorPlano = useMemo(
    () => orcadoPorPlano(budgets, selectedFinId, prefixoPeriodo),
    [budgets, selectedFinId, prefixoPeriodo],
  )

  // Projeção anual por categoria (só no modo Ano completo com o toggle ativo):
  // ocorrências de recorrentes/parcelas do financeiro no ano selecionado.
  const projecaoPorPlano = useMemo(
    () =>
      modoAno && incluirProjecao && selectedFinId
        ? calcularProjecaoPorPlano(anoSel, recorrentes, lancamentos, selectedFinId)
        : new Map<string, number[]>(),
    [modoAno, incluirProjecao, selectedFinId, anoSel, recorrentes, lancamentos],
  )

  const receitas = useMemo(
    () =>
      selectedFinId
        ? montarBloco(
            'receita',
            prefixoPeriodo,
            planos,
            grupos,
            lancamentos,
            selectedFinId,
            modoAno && incluirProjecao ? projecaoPorPlano : undefined,
            orcadosPorPlano,
          )
        : blocoVazio(),
    [
      prefixoPeriodo,
      planos,
      grupos,
      lancamentos,
      selectedFinId,
      modoAno,
      incluirProjecao,
      projecaoPorPlano,
      orcadosPorPlano,
    ],
  )

  const despesas = useMemo(
    () =>
      selectedFinId
        ? montarBloco(
            'despesa',
            prefixoPeriodo,
            planos,
            grupos,
            lancamentos,
            selectedFinId,
            modoAno && incluirProjecao ? projecaoPorPlano : undefined,
            orcadosPorPlano,
          )
        : blocoVazio(),
    [
      prefixoPeriodo,
      planos,
      grupos,
      lancamentos,
      selectedFinId,
      modoAno,
      incluirProjecao,
      projecaoPorPlano,
      orcadosPorPlano,
    ],
  )

  const totalReceitas = somaPeriodo(receitas.total)
  const totalDespesas = somaPeriodo(despesas.total)
  const resultado = totalReceitas - totalDespesas

  // Orçados e variações dos totais do período (cards e RESULTADO)
  const mesIdx = Number(selectedMes.slice(5, 7)) - 1
  const compReceitas = calcularComp(receitas.totalOrcado, receitas.total, modoAno, mesIdx)
  const compDespesas = calcularComp(despesas.totalOrcado, despesas.total, modoAno, mesIdx)
  const orcadoResultado = compReceitas.orcado - compDespesas.orcado
  const variacaoResultado = compReceitas.variacaoR$ - compDespesas.variacaoR$
  const percentualResultado = orcadoResultado > 0 ? (resultado / orcadoResultado) * 100 : 0
  const temBudgetPeriodo = compReceitas.orcado > 0 || compDespesas.orcado > 0

  const finSel = financeiros.find((f) => f.id === selectedFinId)
  const rotuloPeriodo = modoAno
    ? `Ano completo ${anoSel}`
    : `${MESES_LONGOS[mesIdx]}/${selectedMes.slice(0, 4)}`
  // Rótulo dos cards de resumo: a projeção muda o que os totais representam
  const rotuloRebuilt = modoAno
    ? incluirProjecao
      ? `Realizado + projeção · ${anoSel}`
      : `Realizado · Ano completo ${anoSel}`
    : `Realizado · ${rotuloPeriodo}`
  // Rótulo da comparação no modo ano com projeção (o que está sendo comparado)
  const rotuloComp = modoAno
    ? incluirProjecao
      ? 'orçado do ano vs realizado + projetado'
      : 'orçado do ano vs realizado'
    : 'orçado do mês vs realizado'

  // Exportar CSV: linhas do DRE (categorias, subtotais por grupo, totais e
  // resultado) COM as colunas de orçado e variação quando há budget no período.
  const handleExportarCSV = () => {
    const finNome = finSel?.nome || 'financeiro'
    const slug = finNome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const modo = modoAno ? `ano-${anoSel}${incluirProjecao ? '-com-projecao' : ''}` : selectedMes
    const cabecalho = ['Bloco', 'Grupo', 'Categoria']
    if (modoAno) {
      if (temBudgetPeriodo) {
        // Intercala realizado e orçado de cada mês (mesma leitura da tabela)
        MESES_CURTOS.forEach((m) => cabecalho.push(`${m.toUpperCase()} (R$)`, `Orç. ${m} (R$)`))
      } else {
        cabecalho.push(...MESES_CURTOS.map((m) => `${m.toUpperCase()} (R$)`))
      }
      cabecalho.push('Total Ano (R$)')
    } else {
      cabecalho.push('Valor (R$)')
    }
    if (temBudgetPeriodo) {
      cabecalho.push(
        modoAno ? 'Orçado Ano (R$)' : 'Orçado (R$)',
        'Var. R$ (orçado − realizado)',
        'Var. %',
      )
    }

    const linhas: unknown[][] = []
    // Realizado do período (mês ou soma do ano) + orçado e variação da linha
    const linhaDe = (
      bloco: string,
      grupo: string,
      cat: string,
      valores: number[],
      orcado: number[],
    ) => {
      const comp = calcularComp(orcado, valores, modoAno, mesIdx)
      const tipo: 'receita' | 'despesa' = bloco === 'RECEITAS' ? 'receita' : 'despesa'
      const reg: unknown[] = [bloco, grupo, cat]
      if (modoAno) {
        if (temBudgetPeriodo) {
          for (let m = 0; m < 12; m++) {
            reg.push(valorCSV(valores[m]), valorCSV(orcado[m]))
          }
        } else {
          reg.push(...valores.map(valorCSV))
        }
        reg.push(valorCSV(somaPeriodo(valores)))
      } else {
        reg.push(valorCSV(valores[mesIdx]))
      }
      if (temBudgetPeriodo) {
        reg.push(
          valorCSV(comp.orcado),
          comp.orcado === 0 ? '' : `${sinalComp(comp, tipo)}${valorCSV(Math.abs(comp.variacaoR$))}`,
          comp.orcado === 0 ? '' : `${sinalComp(comp, tipo)}${percentualComp(comp)}`,
        )
      }
      linhas.push(reg)
    }

    for (const [nomeBloco, bloco] of [
      ['RECEITAS', receitas],
      ['DESPESAS', despesas],
    ] as const) {
      const tipo = nomeBloco === 'RECEITAS' ? 'receita' : 'despesa'
      for (const g of bloco.grupos) {
        const nomeGrupo = g.grupo?.nome || 'Sem grupo'
        for (const l of g.linhas) {
          linhaDe(
            nomeBloco,
            nomeGrupo,
            `${l.plano.codigo} ${l.plano.descricao}`.trim(),
            l.valores,
            l.orcado,
          )
        }
        linhaDe(nomeBloco, nomeGrupo, `Subtotal ${nomeGrupo}`, g.subtotal, g.subtotalOrcado)
      }
      linhaDe(
        nomeBloco,
        '',
        `Total de ${nomeBloco.charAt(0)}${nomeBloco.slice(1).toLowerCase()}`,
        bloco.total,
        bloco.totalOrcado,
      )
    }

    // RESULTADO: orçado de receitas − orçado de despesas; variação = quanto o
    // resultado ficou do planejado (positivo = melhor que o planejado)
    const res: unknown[] = ['RESULTADO', '', 'Total de Receitas − Total de Despesas']
    const resValores = receitas.total.map((v, i) => v - despesas.total[i])
    if (modoAno) {
      res.push(...resValores.map(valorCSV), valorCSV(resultado))
    } else {
      res.push(valorCSV(resultado))
    }
    if (temBudgetPeriodo) {
      const melhor = variacaoResultado >= 0
      res.push(
        valorCSV(orcadoResultado),
        `${melhor ? '+' : '−'}${valorCSV(Math.abs(variacaoResultado))}`,
        `${melhor ? '+' : '−'}${percentualResultado.toFixed(1)}%`,
      )
    }
    linhas.push(res)

    baixarCSV(`dre-${slug}-${modo}.csv`, cabecalho, linhas)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-[#00D68F]" />
      </div>
    )
  }

  if (financeiros.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-sm">
          Nenhum financeiro disponível para o seu acesso. Peça liberação ao administrador.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho exibido apenas na impressão */}
      <div className="hidden print:block text-black">
        <h1 className="text-xl font-bold">DRE Simples por Categoria</h1>
        <p className="text-sm">Financeiro: {finSel?.nome}</p>
        <p className="text-sm">
          Período: {rotuloPeriodo}
          {modoAno && incluirProjecao
            ? ' (realizado + projeção de recorrentes e parcelas)'
            : ' (somente realizado)'}
        </p>
        {temBudgetPeriodo ? <p className="text-sm">Comparação: {rotuloComp}</p> : null}
        <p className="text-sm">Gerado em: {new Date().toLocaleString('pt-BR')}</p>
      </div>

      {/* Cabeçalho com seletores */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">DRE por Categoria</h1>
          <p className="text-sm text-gray-400">
            Demonstrativo de resultado do período realizado, agrupado pelos grupos do plano de
            contas
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Seletor de Financeiro */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" aria-hidden="true" />
            <select
              aria-label="Financeiro do DRE"
              value={selectedFinId}
              onChange={(e) => setSelectedFinId(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold cursor-pointer"
            >
              {financeiros.map((f) => (
                <option key={f.id} value={f.id} className="bg-[#0B0F14] text-white">
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          {/* Modo: Mês ou Ano completo */}
          <div
            className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]"
            role="group"
            aria-label="Modo do período"
          >
            <button
              type="button"
              aria-pressed={!modoAno}
              onClick={() => setModoAno(false)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                !modoAno ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Mês
            </button>
            <button
              type="button"
              aria-pressed={modoAno}
              onClick={() => setModoAno(true)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                modoAno ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
              }`}
            >
              Ano completo
            </button>
          </div>

          {/* Período: mês (YYYY-MM) ou ano */}
          {!modoAno ? (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                type="month"
                aria-label="Mês do DRE"
                value={selectedMes}
                onChange={(e) => e.target.value && setSelectedMes(e.target.value)}
                className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" aria-hidden="true" />
              <select
                aria-label="Ano do DRE"
                value={anoSel}
                onChange={(e) => setAnoSel(Number(e.target.value))}
                className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold cursor-pointer"
              >
                {anosDisponiveis.map((a) => (
                  <option key={a} value={a} className="bg-[#0B0F14] text-white">
                    {a}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Toggle: incluir projeção de recorrentes/parcelas (só no modo Ano completo) */}
          {modoAno ? (
            <label
              htmlFor="dre-incluir-projecao"
              className="flex items-center gap-2 text-xs font-semibold text-gray-300 cursor-pointer select-none"
            >
              <Switch
                id="dre-incluir-projecao"
                checked={incluirProjecao}
                onCheckedChange={setIncluirProjecao}
                className="data-[state=checked]:bg-[#00D68F]"
              />
              Incluir projeção (recorrentes + parcelas)
            </label>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={handleExportarCSV}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
          >
            <Download className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            Exportar CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
          >
            <Printer className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
            Imprimir / PDF
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={carregarDados}
            aria-label="Recarregar DRE"
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Cards de resumo (tela) — os totais também fecham as tabelas na impressão */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Total de Receitas</span>
            <TrendingUp className="w-4 h-4 text-[#00D68F]" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
            {formatCurrency(totalReceitas)}
          </div>
          {temBudgetPeriodo ? (
            <LinhaCompCard comp={compReceitas} tipo="receita" />
          ) : (
            <p className="text-[11px] text-gray-500 mt-1">{rotuloRebuilt}</p>
          )}
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Total de Despesas</span>
            <TrendingDown className="w-4 h-4 text-[#FF5C5C]" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            {formatCurrency(totalDespesas)}
          </div>
          {temBudgetPeriodo ? (
            <LinhaCompCard comp={compDespesas} tipo="despesa" />
          ) : (
            <p className="text-[11px] text-gray-500 mt-1">{rotuloRebuilt}</p>
          )}
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Resultado</span>
            <Scale className="w-4 h-4 text-gray-400" aria-hidden="true" />
          </div>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              resultado >= 0 ? 'text-[#00D68F] dre-keep dre-pos' : 'text-[#FF5C5C] dre-keep dre-neg'
            }`}
          >
            {formatCurrency(resultado)}
          </div>
          {temBudgetPeriodo ? (
            <div className="text-[11px] mt-1">
              <span className="text-gray-500">Orçado: </span>
              <span className="text-gray-300 font-mono">{formatCurrency(orcadoResultado)}</span>
              {orcadoResultado !== 0 ? (
                <>
                  {' · '}
                  <span
                    className={`font-mono font-semibold ${
                      variacaoResultado >= 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                    }`}
                  >
                    {variacaoResultado >= 0 ? '+' : '−'}
                    {formatCurrency(Math.abs(variacaoResultado)).replace('R$', '').trim()} (
                    {percentualResultado.toFixed(1)}% do previsto)
                  </span>
                </>
              ) : null}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 mt-1">
              {resultado >= 0 ? 'Superávit no período' : 'Déficit no período'}
            </p>
          )}
        </Card>
      </div>

      {/* Legenda da projeção: modo Ano completo com toggle ativo */}
      {modoAno && incluirProjecao ? (
        <div className="bg-[#141A22] border border-[#232B36] rounded-xl px-4 py-3 text-xs text-gray-400 print:text-black">
          <span className="font-semibold text-gray-300 print:text-black">
            Como ler os números:{' '}
          </span>
          valores em <span className="text-gray-200 font-semibold">branco</span> são{' '}
          <span className="text-gray-200 font-semibold">realizados</span> — dinheiro que já entrou
          ou saiu de verdade. Valores em{' '}
          <span className="italic text-gray-500">itálico cinza com asterisco (*)</span> são{' '}
          <span className="italic text-gray-400 font-semibold">projeções</span> — previsão dos
          recorrentes e parcelas ainda não pagos naquele mês. Quando os dois se misturam na mesma
          célula, o valor mostrado junta o realizado com a previsão (marcado com *).
        </div>
      ) : null}

      {/* Legenda da comparação com o orçado */}
      {temBudgetPeriodo ? (
        <div className="bg-[#141A22] border border-[#232B36] rounded-xl px-4 py-3 text-xs text-gray-400 print:text-black">
          <span className="font-semibold text-gray-300 print:text-black">
            Comparação com o orçado ({rotuloComp}):{' '}
          </span>
          <span className="text-[#00D68F]">verde</span> = dentro do planejado (despesa ≤90% do
          orçado, receita ≥100%), <span className="text-amber-400">amarelo</span> = atenção
          (90–100%), <span className="text-[#FF5C5C]">vermelho</span> = fora do planejado.
          Categorias orçadas sem movimento aparecem com realizado zero.
          {modoAno
            ? ' No modo Ano completo, cada célula mensal mostra abaixo do realizado o orçado daquele mês (prefixo "orc.").'
            : ''}
        </div>
      ) : null}

      {/* Relatório DRE */}
      <div className="dre-print-area space-y-6">
        <div className="hidden print:flex items-center gap-2 justify-center pb-2">
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {finSel?.nome} — {rotuloPeriodo}
          </span>
        </div>

        <BlocoTabelaDRE
          titulo="Receitas"
          bloco={receitas}
          tipo="receita"
          modoAno={modoAno}
          mesIdx={mesIdx}
          exibirProjecao={modoAno && incluirProjecao}
          temBudget={temBudgetPeriodo}
        />
        <BlocoTabelaDRE
          titulo="Despesas"
          bloco={despesas}
          tipo="despesa"
          modoAno={modoAno}
          mesIdx={mesIdx}
          exibirProjecao={modoAno && incluirProjecao}
          temBudget={temBudgetPeriodo}
        />

        {/* RESULTADO: Receitas − Despesas (com orçado e variação quando há budget) */}
        <div className="border border-[#232B36] rounded-xl bg-[#0B0F14] px-4 py-4 flex flex-wrap items-center justify-between gap-3">
          <span className="text-base font-bold text-white uppercase tracking-wider">
            Resultado do Período
          </span>
          <div className="flex items-center gap-6">
            {temBudgetPeriodo ? (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
                  Orçado
                </p>
                <p className="text-sm font-mono text-gray-300">{formatCurrency(orcadoResultado)}</p>
              </div>
            ) : null}
            <span
              className={`text-lg font-bold font-mono ${
                resultado >= 0
                  ? 'text-[#00D68F] dre-keep dre-pos'
                  : 'text-[#FF5C5C] dre-keep dre-neg'
              }`}
            >
              {formatCurrency(resultado)}
            </span>
            {temBudgetPeriodo && orcadoResultado !== 0 ? (
              <span
                className={`text-sm font-mono font-semibold ${
                  variacaoResultado >= 0
                    ? 'text-[#00D68F] dre-keep dre-pos'
                    : 'text-[#FF5C5C] dre-keep dre-neg'
                }`}
              >
                {variacaoResultado >= 0 ? '+' : '−'}
                {formatCurrency(Math.abs(variacaoResultado)).replace('R$', '').trim()} (
                {percentualResultado.toFixed(1)}%)
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  )
}

// Linha de variação sob o valor dos cards de resumo (orçado + variação colorida)
function LinhaCompCard({
  comp,
  tipo,
}: {
  comp: ReturnType<typeof calcularComp>
  tipo: 'receita' | 'despesa'
}) {
  const cor = classeComp(comp, tipo)
  const sinal = sinalComp(comp, tipo)
  return (
    <div className="text-[11px] mt-1">
      <span className="text-gray-500">Orçado: </span>
      <span className="text-gray-300 font-mono">{formatCurrency(comp.orcado)}</span>
      {comp.orcado > 0 ? (
        <>
          {' · '}
          <span className={`font-mono font-semibold ${cor}`}>
            {sinal}
            {formatCurrency(Math.abs(comp.variacaoR$)).replace('R$', '').trim()} (
            {comp.percentual.toFixed(1)}%)
          </span>
        </>
      ) : null}
    </div>
  )
}
