import { useEffect, useMemo, useState } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { ContaBancaria, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { baixarCSV } from '@/lib/csv'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'
import {
  PeriodoRelatorio,
  TipoPagamento,
  agruparPorEmpresa,
  filtrarRelatorio,
  montarCSVPorEmpresa,
  montarCSVRelatorio,
  montarLinhasRelatorio,
  calcularTotais,
  rotuloStatus,
  rotuloTipo,
  sugerirContrapartes,
} from '@/lib/relatorioPessoa'
import { ExtratoPorEmpresa } from '@/components/ExtratoPorEmpresa'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Building2, Calendar, Download, RefreshCw, Search, Users, X } from 'lucide-react'

const PERIODOS: Array<{ id: PeriodoRelatorio; rotulo: string }> = [
  { id: 'mes', rotulo: 'Mês atual' },
  { id: 'ano', rotulo: 'Ano atual' },
  { id: 'tudo', rotulo: 'Tudo' },
]

const TIPOS: Array<{ id: TipoPagamento; rotulo: string }> = [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'pago', rotulo: 'Pago' },
  { id: 'recebido', rotulo: 'Recebido' },
]

type VisaoExtrato = 'detalhado' | 'empresa'

const VISOES: Array<{ id: VisaoExtrato; rotulo: string }> = [
  { id: 'detalhado', rotulo: 'Detalhado' },
  { id: 'empresa', rotulo: 'Por Empresa' },
]

export default function RelatorioPessoaPage() {
  const { financeiros, loading: loadingAcesso } = useAcessoFinanceiros()

  const [termo, setTermo] = useState('')
  const [pessoa, setPessoa] = useState<string | null>(null)
  const [periodo, setPeriodo] = useState<PeriodoRelatorio>('ano')
  const [tipo, setTipo] = useState<TipoPagamento>('todos')
  const [financeiroId, setFinanceiroId] = useState<string | null>(null)
  const [visao, setVisao] = useState<VisaoExtrato>('detalhado')

  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const hoje = getTodayISODate()

  useEffect(() => {
    document.title = 'Extrato por Favorecido | Multi-Financeiro'
  }, [])

  // Carrega TODOS os lançamentos (qualquer status) e contas acessíveis pelo RLS
  const carregarDados = async () => {
    try {
      setLoading(true)
      setErro(null)
      const [lcs, cts] = await Promise.all([
        FinanceiroService.getLancamentos({ status: 'todos' }),
        FinanceiroService.getContas(),
      ])
      setLancamentos(lcs)
      setContas(cts)
    } catch (e) {
      console.error(e)
      setErro('Não foi possível carregar os lançamentos do relatório.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  const nomesEmpresa = useMemo(() => new Map(financeiros.map((f) => [f.id, f.nome])), [financeiros])
  const nomesConta = useMemo(
    () => new Map(contas.map((c) => [c.id, `${c.banco} · ${c.conta}`])),
    [contas],
  )

  const sugestoes = useMemo(
    () => (pessoa ? [] : sugerirContrapartes(lancamentos, termo)),
    [lancamentos, termo, pessoa],
  )

  const linhas = useMemo(() => {
    const filtrados = filtrarRelatorio(lancamentos, {
      termo,
      pessoa,
      periodo,
      tipo,
      hoje,
      financeiroId,
    })
    return montarLinhasRelatorio(filtrados, nomesEmpresa, nomesConta)
  }, [lancamentos, termo, pessoa, periodo, tipo, hoje, financeiroId, nomesEmpresa, nomesConta])

  const totais = useMemo(() => calcularTotais(linhas), [linhas])

  const grupos = useMemo(() => agruparPorEmpresa(linhas), [linhas])

  const temBusca = Boolean(pessoa) || termo.trim().length > 0

  // Empresas presentes no resultado da busca (sem aplicar o filtro de empresa),
  // para as opções do select não encolherem depois de escolher uma delas
  const opcoesEmpresa = useMemo(() => {
    const base = filtrarRelatorio(lancamentos, { termo, pessoa, periodo, tipo, hoje })
    const empresas = new Map<string, string>()
    for (const l of base) {
      if (!empresas.has(l.financeiro_id)) {
        empresas.set(l.financeiro_id, nomesEmpresa.get(l.financeiro_id) ?? '—')
      }
    }
    return Array.from(empresas, ([id, nome]) => ({ id, nome })).sort((a, b) =>
      a.nome.localeCompare(b.nome, 'pt-BR'),
    )
  }, [lancamentos, termo, pessoa, periodo, tipo, hoje, nomesEmpresa])

  // Se a empresa selecionada sair das opções (busca limpa/trocada), volta para "Todas"
  useEffect(() => {
    if (financeiroId && !opcoesEmpresa.some((o) => o.id === financeiroId)) {
      setFinanceiroId(null)
    }
  }, [financeiroId, opcoesEmpresa])

  const exportarCSV = () => {
    const nome = (pessoa ?? termo.trim()).replace(/[^\p{L}\p{N}]+/gu, '_') || 'pessoa'
    const { cabecalho, linhas: corpo } =
      visao === 'empresa' ? montarCSVPorEmpresa(grupos, totais) : montarCSVRelatorio(linhas, totais)
    const sufixo = visao === 'empresa' ? '_por_empresa' : ''
    baixarCSV(`extrato_favorecido${sufixo}_${nome}_${hoje}.csv`, cabecalho, corpo)
  }

  if (loadingAcesso || loading) {
    return (
      <div className="flex items-center justify-center p-10 text-gray-400 text-sm gap-2">
        <RefreshCw className="w-4 h-4 animate-spin" />
        Carregando relatório...
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
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Extrato por Favorecido</h1>
        <p className="text-sm text-gray-400">
          Pagamentos e recebimentos de uma contraparte, cruzando todas as empresas e contas.
        </p>
      </div>

      {/* Busca por pessoa */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardContent className="p-4 space-y-3">
          <div className="space-y-1.5 max-w-xl">
            <Label htmlFor="busca-pessoa" className="text-xs text-gray-400 font-semibold uppercase">
              Pessoa (contraparte / fornecedor / cliente)
            </Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <Input
                id="busca-pessoa"
                type="text"
                autoComplete="off"
                placeholder="Digite parte do nome, ex.: joão"
                value={termo}
                onChange={(e) => {
                  setTermo(e.target.value)
                  setPessoa(null)
                }}
                className="pl-9 pr-9 bg-[#0B0F14] border-[#232B36] text-white"
              />
              {temBusca && (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setTermo('')
                    setPessoa(null)
                  }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F]"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            {sugestoes.length > 0 && (
              <ul
                aria-label="Sugestões de pessoas"
                className="rounded-md border border-[#232B36] bg-[#0B0F14] divide-y divide-[#232B36] max-h-56 overflow-y-auto"
              >
                {sugestoes.map((nome) => (
                  <li key={nome}>
                    <button
                      type="button"
                      onClick={() => {
                        setPessoa(nome)
                        setTermo(nome)
                      }}
                      className="w-full text-left px-3 py-2 text-sm text-gray-200 hover:bg-[#1A222D] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#00D68F]"
                    >
                      {nome}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Filtro de empresa + filtros de período e tipo + exportação */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#00D68F]" />
              <select
                aria-label="Filtrar por empresa"
                value={financeiroId ?? ''}
                onChange={(e) => setFinanceiroId(e.target.value || null)}
                style={{ colorScheme: 'dark' }}
                className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold [&>option]:bg-[#141A22] [&>option]:text-white"
              >
                <option value="">Todas as empresas</option>
                {opcoesEmpresa.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-[#00D68F]" />
              <select
                aria-label="Selecionar período"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value as PeriodoRelatorio)}
                style={{ colorScheme: 'dark' }}
                className="h-9 px-3 rounded-md bg-[#141A22] border border-[#232B36] text-white text-xs font-semibold [&>option]:bg-[#141A22] [&>option]:text-white"
              >
                {PERIODOS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div
              role="group"
              aria-label="Filtrar por tipo"
              className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]"
            >
              {TIPOS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-pressed={tipo === t.id}
                  onClick={() => setTipo(t.id)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F] ${
                    tipo === t.id ? 'bg-[#00D68F] text-[#0B0F14]' : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {t.rotulo}
                </button>
              ))}
            </div>

            <Button
              variant="outline"
              size="sm"
              onClick={exportarCSV}
              disabled={linhas.length === 0}
              className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9"
            >
              <Download className="w-3.5 h-3.5 mr-2" />
              Exportar CSV
            </Button>

            <Button
              variant="outline"
              size="icon"
              onClick={carregarDados}
              aria-label="Recarregar dados"
              className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] h-9 w-9"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {!temBusca ? (
        <div className="bg-[#141A22] border border-[#232B36] rounded-xl p-10 text-center text-sm text-gray-400">
          <Users className="w-6 h-6 mx-auto mb-2 text-[#00D68F]" />
          Digite o nome de uma pessoa para ver todos os pagamentos e recebimentos dela.
        </div>
      ) : (
        <>
          {/* Totais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
              <span className="text-xs text-gray-400 font-semibold uppercase">Total pago</span>
              <div className="text-xl font-bold font-mono mt-1 text-[#FF5C5C]">
                {formatCurrency(totais.totalPago)}
              </div>
            </Card>
            <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
              <span className="text-xs text-gray-400 font-semibold uppercase">Total recebido</span>
              <div className="text-xl font-bold font-mono mt-1 text-[#00D68F]">
                {formatCurrency(totais.totalRecebido)}
              </div>
            </Card>
            <Card className="bg-[#141A22] border-[#232B36] p-4 text-white">
              <span className="text-xs text-gray-400 font-semibold uppercase">Lançamentos</span>
              <div className="text-xl font-bold font-mono mt-1 text-white">
                {totais.quantidade}
                {totais.previstos > 0 && (
                  <span className="text-xs font-normal ml-2 text-gray-400">
                    ({totais.previstos} previsto(s) fora do total)
                  </span>
                )}
              </div>
            </Card>
          </div>

          {/* Alternador de visão */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h2 className="text-base font-bold text-white">
              {pessoa ?? `Resultados para “${termo.trim()}”`}
            </h2>
            <div
              role="group"
              aria-label="Escolher visão do extrato"
              className="flex rounded-lg border border-[#232B36] p-0.5 bg-[#141A22]"
            >
              {VISOES.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  aria-pressed={visao === v.id}
                  onClick={() => setVisao(v.id)}
                  className={`px-3 py-1 rounded text-xs font-bold transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F] ${
                    visao === v.id
                      ? 'bg-[#00D68F] text-[#0B0F14]'
                      : 'text-gray-400 hover:text-white'
                  }`}
                >
                  {v.rotulo}
                </button>
              ))}
            </div>
          </div>

          {visao === 'empresa' ? (
            <ExtratoPorEmpresa grupos={grupos} />
          ) : (
            /* Tabela */
            <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableCaption className="sr-only">
                      Lançamentos da pessoa pesquisada, conforme empresa e filtros selecionados
                    </TableCaption>
                    <TableHeader>
                      <TableRow className="border-[#232B36] hover:bg-transparent">
                        <TableHead className="text-gray-400">Data</TableHead>
                        <TableHead className="text-right text-gray-400">Valor</TableHead>
                        <TableHead className="text-gray-400">Descrição</TableHead>
                        <TableHead className="text-gray-400">Empresa</TableHead>
                        <TableHead className="text-gray-400">Conta bancária</TableHead>
                        <TableHead className="text-gray-400">Tipo</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody className="divide-y divide-[#232B36]">
                      {linhas.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-sm text-gray-500 py-8">
                            Nenhum lançamento encontrado para esta busca e filtros.
                          </TableCell>
                        </TableRow>
                      )}
                      {linhas.map((l) => (
                        <TableRow key={l.id} className="border-[#232B36] hover:bg-[#1A222D]/40">
                          <TableCell className="text-xs font-mono text-gray-300 whitespace-nowrap">
                            {formatDateBR(l.data)}
                          </TableCell>
                          <TableCell
                            className={`text-right font-mono text-xs font-semibold whitespace-nowrap ${
                              l.tipo === 'debito' ? 'text-[#FF5C5C]' : 'text-[#00D68F]'
                            }`}
                          >
                            {formatCurrency(l.valor)}
                          </TableCell>
                          <TableCell className="text-sm text-white">
                            {l.descricao}
                            {l.status === 'previsto' && (
                              <Badge variant="outline" className="ml-2 text-[9px] py-0 px-1.5">
                                Previsto
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-gray-300">{l.empresa}</TableCell>
                          <TableCell className="text-sm text-gray-300">{l.conta}</TableCell>
                          <TableCell className="text-xs text-gray-400">
                            {rotuloTipo(l.tipo)}
                            <span className="sr-only"> ({rotuloStatus(l.status)})</span>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
