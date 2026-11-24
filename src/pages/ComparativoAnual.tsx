import { useEffect, useMemo, useState } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { PlanoConta, PlanoGrupo, Lancamento } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Download,
  FolderTree,
  ListTree,
  RefreshCw,
  Scale,
} from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  ReferenceLine,
} from 'recharts'

// Uma linha do comparativo anual (categoria OU grupo)
interface LinhaComparativo {
  chave: string
  nome: string
  tipo: 'receita' | 'despesa'
  grupoNome: string | null // só na visão por categoria
  atual: number
  anterior: number
}

type Ordenacao = 'variacao_abs' | 'variacao_pct' | 'atual_desc' | 'anterior_desc' | 'nome_asc'

// Eixo em R$ milhares (igual aos gráficos do Painel)
const fmtK = (val: number) => `R$ ${(val / 1000).toFixed(0)}k`

const ORDENACOES: Array<{ id: Ordenacao; rotulo: string }> = [
  { id: 'variacao_abs', rotulo: 'Maiores variações (R$)' },
  { id: 'variacao_pct', rotulo: 'Maiores variações (%)' },
  { id: 'atual_desc', rotulo: 'Maior valor no ano atual' },
  { id: 'anterior_desc', rotulo: 'Maior valor no ano anterior' },
  { id: 'nome_asc', rotulo: 'Nome (A–Z)' },
]

export default function ComparativoAnualPage() {
  const { financeiros, loading: loadingAcesso } = useAcessoFinanceiros()

  const [financeiroId, setFinanceiroId] = useState<string>('todos')
  const [anoBase, setAnoBase] = useState<number>(new Date().getFullYear())
  const [visao, setVisao] = useState<'categoria' | 'grupo'>('categoria')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | 'receita' | 'despesa'>('todos')
  const [ordenacao, setOrdenacao] = useState<Ordenacao>('variacao_abs')

  const [categorias, setCategorias] = useState<PlanoConta[]>([])
  const [grupos, setGrupos] = useState<PlanoGrupo[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  // Ano anterior ao selecionado
  const anoAnterior = anoBase - 1

  // Título da página
  useEffect(() => {
    document.title = 'Comparativo Anual | Multi-Financeiro'
  }, [])

  const carregarDados = async () => {
    try {
      setLoading(true)
      setErro(null)
      const [cats, gps, lcs] = await Promise.all([
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getPlanoGrupos(),
        FinanceiroService.getLancamentos({ status: 'realizado' }),
      ])
      setCategorias(cats)
      setGrupos(gps)
      setLancamentos(lcs)
    } catch (e) {
      console.error(e)
      setErro('Não foi possível carregar os dados do comparativo.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Anos disponíveis no seletor: os que têm lançamento realizado + ano atual
  const anosDisponiveis = useMemo(() => {
    const anos = new Set<number>()
    for (const l of lancamentos) {
      anos.add(parseInt(l.data.slice(0, 4), 10))
    }
    const atual = new Date().getFullYear()
    anos.add(atual)
    if (anos.size <= 1) anos.add(atual - 1)
    return Array.from(anos).sort((a, b) => b - a)
  }, [lancamentos])

  // Agrega lançamentos REALIZADOS do financeiro escolhido nos dois anos,
  // por categoria (visão "categoria") ou por grupo (visão "grupo").
  const { linhas, totalAtual, totalAnterior } = useMemo(() => {
    const ini = `${anoAnterior}-01-01`
    const fim = `${anoBase}-12-31`

    const lancs = lancamentos.filter((l) => {
      if (financeiroId !== 'todos' && l.financeiro_id !== financeiroId) return false
      return l.data >= ini && l.data <= fim
    })

    const catPorId = new Map(categorias.map((c) => [c.id, c]))
    const grupoPorId = new Map(grupos.map((g) => [g.id, g]))

    const usarGrupo = visao === 'grupo'
    const chaves = new Map<
      string,
      {
        nome: string
        tipo: 'receita' | 'despesa'
        grupoNome: string | null
        atual: number
        anterior: number
      }
    >()

    for (const l of lancs) {
      const cat = l.plano_conta_id ? catPorId.get(l.plano_conta_id) : undefined
      if (!cat) continue

      let chave: string
      let nome: string
      let grupoNome: string | null = null
      if (usarGrupo) {
        const g = cat.grupo_id ? grupoPorId.get(cat.grupo_id) : undefined
        if (!g) continue // visão por grupo: só categorias que têm grupo
        chave = g.id
        nome = g.nome
      } else {
        chave = cat.id
        nome = cat.descricao
        const g = cat.grupo_id ? grupoPorId.get(cat.grupo_id) : undefined
        grupoNome = g ? g.nome : null
      }

      const entrada = chaves.get(chave) || {
        nome,
        tipo: cat.tipo,
        grupoNome,
        atual: 0,
        anterior: 0,
      }
      const valor = Number(l.valor) || 0
      const anoLanc = parseInt(l.data.slice(0, 4), 10)
      if (anoLanc === anoBase) entrada.atual += valor
      else if (anoLanc === anoAnterior) entrada.anterior += valor
      chaves.set(chave, entrada)
    }

    const lista: LinhaComparativo[] = Array.from(chaves.entries()).map(([chave, e]) => ({
      chave,
      nome: e.nome,
      tipo: e.tipo,
      grupoNome: e.grupoNome,
      atual: e.atual,
      anterior: e.anterior,
    }))

    // Sinal: despesa crescente piora o caixa. Para o filtro por tipo não muda nada.
    const filtradas = tipoFiltro === 'todos' ? lista : lista.filter((l) => l.tipo === tipoFiltro)

    return {
      linhas: filtradas,
      totalAtual: filtradas.reduce((acc, l) => acc + l.atual, 0),
      totalAnterior: filtradas.reduce((acc, l) => acc + l.anterior, 0),
    }
  }, [lancamentos, categorias, grupos, financeiroId, visao, tipoFiltro, anoBase, anoAnterior])

  // Variação em R$ e % por linha
  const calcularVariacao = (l: LinhaComparativo) => {
    const varAbs = l.atual - l.anterior
    const varPct = l.anterior !== 0 ? (varAbs / Math.abs(l.anterior)) * 100 : null
    return { varAbs, varPct }
  }

  // Ordenação (maiores variações primeiro, por padrão)
  const linhasOrdenadas = useMemo(() => {
    const lista = [...linhas]
    lista.sort((a, b) => {
      switch (ordenacao) {
        case 'variacao_abs': {
          const va = Math.abs(a.atual - a.anterior)
          const vb = Math.abs(b.atual - b.anterior)
          return vb - va
        }
        case 'variacao_pct': {
          const pa = calcularVariacao(a).varPct
          const pb = calcularVariacao(b).varPct
          const na = pa === null ? -Infinity : Math.abs(pa)
          const nb = pb === null ? -Infinity : Math.abs(pb)
          return nb - na
        }
        case 'atual_desc':
          return b.atual - a.atual
        case 'anterior_desc':
          return b.anterior - a.anterior
        case 'nome_asc':
          return a.nome.localeCompare(b.nome, 'pt-BR')
      }
    })
    return lista
  }, [linhas, ordenacao])

  // Dados do gráfico de variação: linha com varAbs preenchida
  const dadosGraficoVar = useMemo(
    () =>
      linhasOrdenadas.slice(0, 15).map((l) => ({
        ...l,
        varAbs: l.atual - l.anterior,
      })),
    [linhasOrdenadas],
  )

  const nomeFinanceiro =
    financeiroId === 'todos'
      ? 'todos'
      : (financeiros.find((f) => f.id === financeiroId)?.nome ?? 'financeiro')

  const slugFinanceiro =
    nomeFinanceiro
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'todos'

  const exportarCSV = () => {
    baixarCSV(
      `comparativo-anual-${slugFinanceiro}-${anoAnterior}-${anoBase}-${visao}.csv`,
      visao === 'grupo'
        ? [
            'Grupo',
            'Tipo',
            `${anoAnterior} (R$)`,
            `${anoBase} (R$)`,
            'Variação (R$)',
            'Variação (%)',
          ]
        : [
            'Categoria',
            'Grupo',
            'Tipo',
            `${anoAnterior} (R$)`,
            `${anoBase} (R$)`,
            'Variação (R$)',
            'Variação (%)',
          ],
      linhasOrdenadas.map((l) => {
        const { varAbs, varPct } = calcularVariacao(l)
        const base =
          visao === 'grupo'
            ? [l.nome, l.tipo === 'receita' ? 'Receita' : 'Despesa']
            : [l.nome, l.grupoNome || 'Sem grupo', l.tipo === 'receita' ? 'Receita' : 'Despesa']
        return [
          ...base,
          valorCSV(l.anterior),
          valorCSV(l.atual),
          valorCSV(varAbs),
          varPct === null ? 'novo' : valorCSV(varPct) + '%',
        ]
      }),
    )
    setStatus(`Comparativo exportado em CSV (${linhasOrdenadas.length} linhas)`)
  }

  if (loadingAcesso || loading) {
    return (
      <div className="flex items-center justify-center p-10 text-gray-400 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Carregando comparativo...
      </div>
    )
  }

  if (erro) {
    return (
      <div className="bg-[#141A22] border border-[#FF5C5C]/40 rounded-xl p-8 text-center">
        <p className="text-sm text-[#FF5C5C] font-semibold mb-4">{erro}</p>
        <Button variant="outline" size="sm" onClick={carregarDados}>
          <RefreshCw className="w-3.5 h-3.5 mr-2" />
          Tentar novamente
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho e seletores */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Comparativo Anual</h1>
          <p className="text-sm text-gray-400">
            {anoBase} vs {anoAnterior} — lançamentos realizados, com variação em R$ e %
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Financeiro */}
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-[#00D68F]" />
            <select
              aria-label="Selecionar financeiro"
              value={financeiroId}
              onChange={(e) => setFinanceiroId(e.target.value)}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            >
              <option value="todos">Todos os financeiros</option>
              {financeiros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          {/* Ano base (comparado com o anterior) */}
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#00D68F]" />
            <select
              aria-label="Selecionar ano de comparação"
              value={anoBase}
              onChange={(e) => setAnoBase(parseInt(e.target.value, 10))}
              className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
            >
              {anosDisponiveis.map((a) => (
                <option key={a} value={a}>
                  {a} vs {a - 1}
                </option>
              ))}
            </select>
          </div>

          {/* Visão categoria/grupo */}
          <div className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]">
            <button
              onClick={() => setVisao('categoria')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                visao === 'categoria'
                  ? 'bg-[#00D68F] text-[#0B0F14]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              Categoria
            </button>
            <button
              onClick={() => setVisao('grupo')}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                visao === 'grupo' ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              Grupo
            </button>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={carregarDados}
            aria-label="Recarregar dados"
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {/* Resumo geral */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">Total {anoAnterior}</span>
          <div className="text-xl font-bold font-mono mt-1 text-white">
            {formatCurrency(totalAnterior)}
          </div>
        </Card>
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">Total {anoBase}</span>
          <div className="text-xl font-bold font-mono mt-1 text-white">
            {formatCurrency(totalAtual)}
          </div>
        </Card>
        <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
          <span className="text-xs text-gray-400 font-semibold uppercase">Variação Total</span>
          <div
            className={`text-xl font-bold font-mono mt-1 ${
              totalAtual - totalAnterior > 0 ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
            }`}
          >
            {formatCurrency(totalAtual - totalAnterior)}
            {totalAnterior !== 0 && (
              <span className="text-xs font-normal ml-2 text-gray-400">
                ({(((totalAtual - totalAnterior) / Math.abs(totalAnterior)) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        </Card>
      </div>

      {/* Ordenação + filtro de tipo + exportação */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2">
          <Scale className="w-4 h-4 text-[#00D68F]" />
          <select
            aria-label="Ordenar relatório"
            value={ordenacao}
            onChange={(e) => setOrdenacao(e.target.value as Ordenacao)}
            className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold"
          >
            {ORDENACOES.map((o) => (
              <option key={o.id} value={o.id}>
                {o.rotulo}
              </option>
            ))}
          </select>
        </div>

        <div className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]">
          {(['todos', 'receita', 'despesa'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipoFiltro(t)}
              className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer ${
                tipoFiltro === t ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
              }`}
            >
              {t === 'todos' ? 'Todos' : t === 'receita' ? 'Receitas' : 'Despesas'}
            </button>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={exportarCSV}
          disabled={linhasOrdenadas.length === 0}
          className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
        >
          <Download className="w-3.5 h-3.5 mr-2" />
          Exportar CSV
        </Button>

        <span className="text-xs text-gray-500 ml-auto">{linhasOrdenadas.length} linha(s)</span>
      </div>

      {/* Tabela do comparativo */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            {visao === 'grupo' ? (
              <>
                <FolderTree className="w-4 h-4 text-[#00D68F]" />
                Por Grupo do Plano de Contas
              </>
            ) : (
              <>
                <ListTree className="w-4 h-4 text-[#00D68F]" />
                Por Categoria do Plano de Contas
              </>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableCaption className="sr-only">
                Comparativo anual {anoBase} vs {anoAnterior} — lançamentos realizados
              </TableCaption>
              <TableHeader>
                <TableRow className="border-[#232B36] hover:bg-transparent">
                  <TableHead className="text-gray-400">
                    {visao === 'grupo' ? 'Grupo' : 'Categoria'}
                  </TableHead>
                  <TableHead className="text-right text-gray-400">{anoAnterior}</TableHead>
                  <TableHead className="text-right text-gray-400">{anoBase}</TableHead>
                  <TableHead className="text-right text-gray-400">Variação (R$)</TableHead>
                  <TableHead className="text-right text-gray-400">Variação (%)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="divide-y divide-[#232B36]">
                {linhasOrdenadas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-sm text-gray-500 py-8">
                      Nenhum lançamento realizado no período para a visão escolhida.
                    </TableCell>
                  </TableRow>
                )}
                {linhasOrdenadas.map((l) => {
                  const { varAbs, varPct } = calcularVariacao(l)
                  const subiu = varAbs > 0
                  const corVar =
                    varAbs > 0 ? 'text-[#00D68F]' : varAbs < 0 ? 'text-[#FF5C5C]' : 'text-gray-400'
                  return (
                    <TableRow key={l.chave} className="border-[#232B36] hover:bg-[#1A222D]/40">
                      <TableCell className="text-sm">
                        <div className="font-semibold text-white">{l.nome}</div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1.5 border-[#2E3B4D]"
                          >
                            {l.tipo === 'receita' ? 'Receita' : 'Despesa'}
                          </Badge>
                          {visao === 'categoria' && l.grupoNome && (
                            <span className="text-gray-600">{l.grupoNome}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-gray-400">
                        {formatCurrency(l.anterior)}
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs text-white font-semibold">
                        {formatCurrency(l.atual)}
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs font-semibold ${corVar}`}>
                        <span className="inline-flex items-center gap-1 justify-end">
                          {subiu ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {formatCurrency(varAbs)}
                        </span>
                      </TableCell>
                      <TableCell className={`text-right font-mono text-xs font-semibold ${corVar}`}>
                        {varPct === null ? (
                          <span className="text-gray-600">novo</span>
                        ) : (
                          `${varPct > 0 ? '+' : ''}${varPct.toFixed(1)}%`
                        )}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* GRÁFICO: variação ano vs ano por categoria/grupo (barras divergentes) */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ArrowUpRight className="w-4 h-4 text-[#00D68F]" />
            Variação {anoBase} vs {anoAnterior}
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            {visao === 'grupo' ? 'por grupo' : 'por categoria'}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {linhasOrdenadas.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Nada para plotar: sem lançamentos no período.
            </div>
          ) : (
            <div className="h-72 w-full px-2 pt-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dadosGraficoVar} layout="vertical" margin={{ left: 8, right: 24 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#232B36" horizontal={false} />
                  <XAxis type="number" stroke="#64748B" fontSize={10} tickFormatter={fmtK} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    stroke="#64748B"
                    fontSize={10}
                    width={120}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0B0F14',
                      borderColor: '#232B36',
                      borderRadius: '8px',
                      color: '#F1F5F9',
                    }}
                    formatter={(value: any, _n: any, item: any) => {
                      const l = item?.payload
                      const tipoTxt =
                        l?.tipo === 'receita'
                          ? l.atual >= l.anterior
                            ? 'receita cresceu'
                            : 'receita caiu'
                          : l?.atual >= l.anterior
                            ? 'despesa subiu'
                            : 'despesa caiu'
                      return [formatCurrency(Number(value)), `Variação (${tipoTxt})`]
                    }}
                  />
                  <ReferenceLine x={0} stroke="#475569" />
                  <Bar dataKey="varAbs" radius={[3, 3, 3, 3]} barSize={16} maxBarSize={16}>
                    {dadosGraficoVar.map((l) => {
                      const varAbs = l.atual - l.anterior
                      const bom = l.tipo === 'receita' ? varAbs >= 0 : varAbs <= 0
                      return (
                        <Cell
                          key={l.chave}
                          fill={bom ? '#00D68F' : '#FF5C5C'}
                          opacity={varAbs === 0 ? 0.4 : 0.9}
                        />
                      )
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Região de status p/ leitores de tela */}
      <p role="status" className="sr-only">
        {status}
      </p>
    </div>
  )
}
