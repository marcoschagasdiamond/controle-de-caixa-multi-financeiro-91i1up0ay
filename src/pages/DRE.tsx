// DRE simples por categoria: receitas e despesas REALIZADAS do período,
// agrupadas pelos GRUPOS do plano de contas (tabela grupos_plano_contas —
// plano GLOBAL, compartilhado entre financeiros). Modo mês ou "Ano completo"
// com colunas dos 12 meses + Total Ano. Previstos NÃO entram.
// Impressão/PDF pela impressão do navegador (mesma abordagem do Fechamento).

import { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, PlanoConta, PlanoGrupo, Lancamento } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
  valores: number[] // 12 posições (0 = jan)
}

interface GrupoDRE {
  grupo: PlanoGrupo | null
  linhas: LinhaCategoria[]
  subtotal: number[]
}

interface BlocoDRE {
  grupos: GrupoDRE[]
  total: number[]
}

// Monta um bloco (receitas ou despesas): soma os lançamentos realizados por
// categoria/mês e agrupa pelas categorias pertencentes a cada grupo do plano.
// Categorias sem movimento no período não aparecem. Categorias sem grupo caem
// no bucket "Sem grupo" (último).
function montarBloco(
  tipo: 'receita' | 'despesa',
  prefixoPeriodo: string, // "YYYY-MM" ou "YYYY"
  planos: PlanoConta[],
  grupos: PlanoGrupo[],
  lancamentos: Lancamento[],
  finId: string,
): BlocoDRE {
  const tipoLanc = tipo === 'receita' ? 'credito' : 'debito'
  const mapa = new Map<string, number[]>()

  for (const l of lancamentos) {
    if (l.status !== 'realizado') continue
    if (l.financeiro_id !== finId) continue
    if (l.tipo !== tipoLanc) continue
    if (!l.data.startsWith(prefixoPeriodo)) continue
    const m = Number(l.data.slice(5, 7)) - 1
    if (!(m >= 0 && m <= 11)) continue
    let arr = mapa.get(l.plano_conta_id)
    if (!arr) {
      arr = Array.from({ length: 12 }, () => 0)
      mapa.set(l.plano_conta_id, arr)
    }
    arr[m] += Math.abs(Number(l.valor) || 0)
  }

  // Grupos deste tipo, na ordem de cadastro (ordem/nome), + "Sem grupo" no fim
  const gruposDoTipo = grupos.filter((g) => g.tipo === tipo)
  const porGrupo = new Map<string | null, LinhaCategoria[]>()
  for (const g of gruposDoTipo) porGrupo.set(g.id, [])

  for (const [planoId, valores] of mapa) {
    if (!valores.some((v) => v !== 0)) continue
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
    }
    const gid = plano?.grupo_id ?? null
    const lista = porGrupo.get(gid)
    if (lista) lista.push(linha)
    else porGrupo.set(gid, [linha])
  }

  const saidaGrupos: GrupoDRE[] = []
  let total = Array.from({ length: 12 }, () => 0)
  for (const g of gruposDoTipo) {
    const linhas = porGrupo.get(g.id) || []
    if (linhas.length === 0) continue
    linhas.sort((a, b) => (a.plano.codigo || '').localeCompare(b.plano.codigo || ''))
    const subtotal = linhas.reduce(
      (acc, l) => acc.map((v, i) => v + l.valores[i]),
      Array.from({ length: 12 }, () => 0),
    )
    total = total.map((v, i) => v + subtotal[i])
    saidaGrupos.push({ grupo: g, linhas, subtotal })
  }
  const semGrupo = porGrupo.get(null) || []
  if (semGrupo.length > 0) {
    semGrupo.sort((a, b) => (a.plano.codigo || '').localeCompare(b.plano.codigo || ''))
    const subtotal = semGrupo.reduce(
      (acc, l) => acc.map((v, i) => v + l.valores[i]),
      Array.from({ length: 12 }, () => 0),
    )
    total = total.map((v, i) => v + subtotal[i])
    saidaGrupos.push({ grupo: null, linhas: semGrupo, subtotal })
  }

  return { grupos: saidaGrupos, total }
}

const somaPeriodo = (valores: number[]) => valores.reduce((a, b) => a + b, 0)

export default function DREPage() {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [grupos, setGrupos] = useState<PlanoGrupo[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

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
      const [pls, gps, lcs] = await Promise.all([
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getPlanoGrupos(),
        FinanceiroService.getLancamentos(),
      ])
      setPlanos(pls)
      setGrupos(gps)
      setLancamentos(lcs)
    } catch (err) {
      console.error('Erro ao carregar DRE:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Anos do seletor: base atual ±5, estendida pelos anos presentes nos lançamentos
  const anosDisponiveis = useMemo(() => {
    let min = anoAtual - 5
    let max = anoAtual + 5
    for (const l of lancamentos) {
      const a = Number(l.data.slice(0, 4))
      if (Number.isFinite(a) && a > 1900) {
        if (a < min) min = a
        if (a > max) max = a
      }
    }
    const arr: number[] = []
    for (let a = min; a <= max; a++) arr.push(a)
    return arr
  }, [anoAtual, lancamentos])

  const prefixoPeriodo = modoAno ? `${anoSel}-` : selectedMes

  const receitas = useMemo(
    () =>
      selectedFinId
        ? montarBloco('receita', prefixoPeriodo, planos, grupos, lancamentos, selectedFinId)
        : { grupos: [], total: Array.from({ length: 12 }, () => 0) },
    [prefixoPeriodo, planos, grupos, lancamentos, selectedFinId],
  )

  const despesas = useMemo(
    () =>
      selectedFinId
        ? montarBloco('despesa', prefixoPeriodo, planos, grupos, lancamentos, selectedFinId)
        : { grupos: [], total: Array.from({ length: 12 }, () => 0) },
    [prefixoPeriodo, planos, grupos, lancamentos, selectedFinId],
  )

  const totalReceitas = somaPeriodo(receitas.total)
  const totalDespesas = somaPeriodo(despesas.total)
  const resultado = totalReceitas - totalDespesas

  const finSel = financeiros.find((f) => f.id === selectedFinId)
  const rotuloPeriodo = modoAno
    ? `Ano completo ${anoSel}`
    : `${MESES_LONGOS[Number(selectedMes.slice(5, 7)) - 1]}/${selectedMes.slice(0, 4)}`

  const colSpan = modoAno ? 14 : 2

  // Exportar CSV: linhas do DRE (categorias, subtotais por grupo, totais e resultado)
  const handleExportarCSV = () => {
    const finNome = finSel?.nome || 'financeiro'
    const slug = finNome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
    const modo = modoAno ? `ano-${anoSel}` : selectedMes
    const cabecalho = ['Bloco', 'Grupo', 'Categoria']
    if (modoAno) {
      cabecalho.push(...MESES_CURTOS.map((m) => m.toUpperCase()), 'Total Ano (R$)')
    } else {
      cabecalho.push('Valor (R$)')
    }

    const linhas: unknown[][] = []
    const linhaDe = (bloco: string, grupo: string, cat: string, valores: number[]) => {
      const reg: unknown[] = [bloco, grupo, cat]
      if (modoAno) {
        reg.push(...valores.map(valorCSV), valorCSV(somaPeriodo(valores)))
      } else {
        const m = Number(selectedMes.slice(5, 7)) - 1
        reg.push(valorCSV(valores[m]))
      }
      linhas.push(reg)
    }

    for (const [nomeBloco, bloco] of [
      ['RECEITAS', receitas],
      ['DESPESAS', despesas],
    ] as const) {
      for (const g of bloco.grupos) {
        const nomeGrupo = g.grupo?.nome || 'Sem grupo'
        for (const l of g.linhas) {
          linhaDe(nomeBloco, nomeGrupo, `${l.plano.codigo} ${l.plano.descricao}`.trim(), l.valores)
        }
        linhaDe(nomeBloco, nomeGrupo, `Subtotal ${nomeGrupo}`, g.subtotal)
      }
      linhaDe(
        nomeBloco,
        '',
        `Total de ${nomeBloco.charAt(0)}${nomeBloco.slice(1).toLowerCase()}`,
        bloco.total,
      )
    }
    const res: unknown[] = ['RESULTADO', '', 'Total de Receitas − Total de Despesas']
    const resValores = receitas.total.map((v, i) => v - despesas.total[i])
    if (modoAno) {
      res.push(...resValores.map(valorCSV), valorCSV(resultado))
    } else {
      res.push(valorCSV(resultado))
    }
    linhas.push(res)

    baixarCSV(`dre-${slug}-${modo}.csv`, cabecalho, linhas)
  }

  // Tabela de um bloco (receitas ou despesas) nos dois modos
  const BlocoTabela = ({
    titulo,
    bloco,
    corClasse,
    printPos,
  }: {
    titulo: string
    bloco: BlocoDRE
    corClasse: string // cor dos totais na tela escura
    printPos: 'dre-pos' | 'dre-neg' // cor preservada na impressão
  }) => {
    const totalPeriodo = somaPeriodo(bloco.total)
    return (
      <div className="border border-[#232B36] rounded-xl overflow-hidden">
        <div className="bg-[#0B0F14] border-b border-[#232B36] px-4 py-2.5 flex items-center gap-2">
          <h3 className="text-sm font-bold uppercase tracking-wider text-white">{titulo}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-300">
            <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-2.5 px-4 min-w-[220px]" scope="col">
                  Categoria
                </th>
                {modoAno
                  ? MESES_CURTOS.map((m) => (
                      <th key={m} className="py-2.5 px-2 text-center" scope="col">
                        {m}
                      </th>
                    ))
                  : null}
                <th className="py-2.5 px-4 text-right" scope="col">
                  {modoAno ? 'Total Ano' : 'Valor'}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#232B36]">
              {bloco.grupos.length === 0 ? (
                <tr>
                  <td colSpan={colSpan} className="py-8 text-center text-gray-500 text-sm">
                    Sem movimento realizado de {titulo.toLowerCase()} no período.
                  </td>
                </tr>
              ) : (
                bloco.grupos.map((g, gi) => (
                  <CategoriaGrupoLinhas
                    key={g.grupo?.id || `sem-${gi}`}
                    grupoDre={g}
                    modoAno={modoAno}
                    mesIdx={Number(selectedMes.slice(5, 7)) - 1}
                  />
                ))
              )}
            </tbody>
            <tfoot className="border-t border-[#232B36] bg-[#0B0F14]">
              <tr>
                <td className="py-2.5 px-4 text-sm font-bold text-white">Total de {titulo}</td>
                {modoAno &&
                  bloco.total.map((v, m) => (
                    <td
                      key={m}
                      className="py-2.5 px-2 text-center font-mono text-[11px] text-white"
                    >
                      {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
                    </td>
                  ))}
                <td
                  className={`py-2.5 px-4 text-right font-mono text-sm font-bold ${corClasse} ${printPos}`}
                >
                  {formatCurrency(totalPeriodo)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    )
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
        <p className="text-sm">Período: {rotuloPeriodo} (somente realizado)</p>
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
          <p className="text-[11px] text-gray-500 mt-1">Realizado · {rotuloPeriodo}</p>
        </Card>

        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400 font-semibold uppercase">Total de Despesas</span>
            <TrendingDown className="w-4 h-4 text-[#FF5C5C]" aria-hidden="true" />
          </div>
          <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
            {formatCurrency(totalDespesas)}
          </div>
          <p className="text-[11px] text-gray-500 mt-1">Realizado · {rotuloPeriodo}</p>
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
          <p className="text-[11px] text-gray-500 mt-1">
            {resultado >= 0 ? 'Superávit no período' : 'Déficit no período'}
          </p>
        </Card>
      </div>

      {/* Relatório DRE */}
      <div className="dre-print-area space-y-6">
        <div className="hidden print:flex items-center gap-2 justify-center pb-2">
          <BarChart3 className="w-4 h-4" aria-hidden="true" />
          <span className="text-sm font-semibold">
            {finSel?.nome} — {rotuloPeriodo}
          </span>
        </div>

        <BlocoTabela
          titulo="Receitas"
          bloco={receitas}
          corClasse="text-[#00D68F]"
          printPos="dre-pos"
        />
        <BlocoTabela
          titulo="Despesas"
          bloco={despesas}
          corClasse="text-[#FF5C5C]"
          printPos="dre-neg"
        />

        {/* RESULTADO: Receitas − Despesas */}
        <div className="border border-[#232B36] rounded-xl bg-[#0B0F14] px-4 py-4 flex items-center justify-between">
          <span className="text-base font-bold text-white uppercase tracking-wider">
            Resultado do Período
          </span>
          <span
            className={`text-lg font-bold font-mono ${
              resultado >= 0 ? 'text-[#00D68F] dre-keep dre-pos' : 'text-[#FF5C5C] dre-keep dre-neg'
            }`}
          >
            {formatCurrency(resultado)}
          </span>
        </div>
      </div>
    </div>
  )
}

// Linhas de um grupo do plano de contas: cabeçalho do grupo, linhas de categoria
// e subtotal do grupo (mesmo padrão visual da Projeção Anual de Recorrentes).
function CategoriaGrupoLinhas({
  grupoDre,
  modoAno,
  mesIdx,
}: {
  grupoDre: GrupoDRE
  modoAno: boolean
  mesIdx: number
}) {
  const g = grupoDre
  return (
    <>
      <tr className="bg-[#0B0F14]/60">
        <th
          colSpan={modoAno ? 14 : 2}
          scope="colgroup"
          className="py-2 px-4 text-left text-xs font-bold uppercase tracking-wider text-[#00D68F]/90"
        >
          {g.grupo?.nome || 'Sem grupo'}
        </th>
      </tr>
      {g.linhas.map((l) => (
        <tr key={l.plano.id} className="hover:bg-[#1A222D]/50 transition-colors">
          <td className="py-2.5 px-4">
            <span className="font-mono text-[11px] text-gray-500 mr-2">{l.plano.codigo}</span>
            <span className="font-medium text-white text-sm">{l.plano.descricao}</span>
          </td>
          {modoAno &&
            l.valores.map((v, m) => (
              <td
                key={m}
                className={`py-2.5 px-2 text-center font-mono text-[11px] whitespace-nowrap ${
                  v === 0 ? 'text-gray-700' : 'text-gray-200'
                }`}
              >
                {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
              </td>
            ))}
          <td className="py-2.5 px-4 text-right font-mono text-xs font-semibold text-white whitespace-nowrap">
            {formatCurrency(modoAno ? somaPeriodo(l.valores) : l.valores[mesIdx])}
          </td>
        </tr>
      ))}
      <tr className="bg-[#1A222D]/40">
        <td className="py-2 px-4 text-xs font-bold text-gray-300">
          Subtotal {g.grupo?.nome || 'Sem grupo'}
        </td>
        {modoAno &&
          g.subtotal.map((v, m) => (
            <td key={m} className="py-2 px-2 text-center font-mono text-[11px] text-gray-200">
              {v === 0 ? '—' : formatCurrency(v).replace('R$', '').trim()}
            </td>
          ))}
        <td className="py-2 px-4 text-right font-mono text-xs font-bold text-white whitespace-nowrap">
          {formatCurrency(modoAno ? somaPeriodo(g.subtotal) : g.subtotal[mesIdx])}
        </td>
      </tr>
    </>
  )
}
