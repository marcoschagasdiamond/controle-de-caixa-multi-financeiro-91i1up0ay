import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, PlanoConta, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  ArrowDownCircle,
  ArrowUpCircle,
  PlusCircle,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  AlertTriangle,
  Building2,
  Calendar,
  Wallet,
  BookOpen,
  Loader2,
  RefreshCw,
  Download,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'

export default function LancamentosPage() {
  const { toast } = useToast()
  const navigate = useNavigate()

  // Estados dos dados mestres
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Formulário em 3 Passos
  // Passo 1: Escolha do Financeiro
  const [selectedFinId, setSelectedFinId] = useState<string>('')
  // Passo 2: Escolha de Tipo (Débito ou Crédito)
  const [tipoLancamento, setTipoLancamento] = useState<'debito' | 'credito'>('debito')
  // Passo 3: Campos do Formulário
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [dataLancamento, setDataLancamento] = useState(getTodayISODate())
  const [selectedContaId, setSelectedContaId] = useState('')
  const [selectedPlanoId, setSelectedPlanoId] = useState('')
  const [statusLancamento, setStatusLancamento] = useState<'previsto' | 'realizado'>('realizado')
  const [contraparte, setContraparte] = useState('')
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')

  // Mensagens de erro com destaque especial para violação de segregação
  const [formError, setFormError] = useState<string | null>(null)

  // Filtros da Listagem
  const [filtroFin, setFiltroFin] = useState<string>('todos')
  const [filtroConta, setFiltroConta] = useState<string>('todas')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'credito' | 'debito'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'previsto' | 'realizado'>('todos')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')

  // Financeiros visíveis ao usuário logado (master = todos; membro = só liberados)
  const { financeiros: finsAcesso } = useAcessoFinanceiros()

  // Pré-selecionar o primeiro financeiro acessível caso não haja seleção
  useEffect(() => {
    setFinanceiros(finsAcesso)
    if (finsAcesso.length > 0 && !selectedFinId) {
      setSelectedFinId(finsAcesso[0].id)
    }
  }, [finsAcesso, selectedFinId])

  // Carregar dados iniciais
  const carregarDados = async () => {
    try {
      setLoading(true)
      const [cts, pls, lcs] = await Promise.all([
        FinanceiroService.getContas(),
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getLancamentos(),
      ])

      setContas(cts)
      setPlanos(pls)
      setLancamentos(lcs)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados',
        description: err.message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // SEGREGAÇÃO PATRIMONIAL: as contas mostram SOMENTE as do financeiro selecionado.
  // O plano de contas é GLOBAL: todas as categorias aparecem, independente do financeiro.
  const contasDoFinanceiro = useMemo(() => {
    if (!selectedFinId) return []
    return contas.filter((c) => c.financeiro_id === selectedFinId)
  }, [contas, selectedFinId])

  const planosDoFinanceiro = useMemo(() => {
    return planos.filter((p) => p.tipo === (tipoLancamento === 'credito' ? 'receita' : 'despesa'))
  }, [planos, tipoLancamento])

  // Todas as categorias globais, de qualquer tipo (receita/despesa).
  // Usado para detectar o caso "plano de contas vazio".
  const planosDoFinanceiroQualquerTipo = useMemo(() => planos, [planos])

  const semPlanoContas = !!selectedFinId && planosDoFinanceiroQualquerTipo.length === 0

  // Atualiza selects padrão ao trocar financeiro ou tipo
  useEffect(() => {
    if (contasDoFinanceiro.length > 0) {
      setSelectedContaId(contasDoFinanceiro[0].id)
    } else {
      setSelectedContaId('')
    }
  }, [selectedFinId, contasDoFinanceiro])

  useEffect(() => {
    if (planosDoFinanceiro.length > 0) {
      setSelectedPlanoId(planosDoFinanceiro[0].id)
    } else {
      setSelectedPlanoId('')
    }
  }, [selectedFinId, tipoLancamento, planosDoFinanceiro])

  // Salvar lançamento
  const handleSalvarLancamento = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!selectedFinId) {
      setFormError('Selecione uma entidade financeira.')
      return
    }
    if (!selectedContaId) {
      setFormError('Selecione uma conta bancária do financeiro.')
      return
    }
    if (!selectedPlanoId) {
      setFormError('Selecione uma categoria do plano de contas.')
      return
    }

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError('Informe um valor monetário positivo válido.')
      return
    }

    try {
      setSaving(true)
      await FinanceiroService.createLancamento({
        financeiro_id: selectedFinId,
        conta_id: selectedContaId,
        plano_conta_id: selectedPlanoId,
        tipo: tipoLancamento,
        valor: valorNum,
        data: dataLancamento,
        descricao: descricao.trim(),
        status: statusLancamento,
        contraparte: contraparte.trim() || null,
        documento: documento.trim() || null,
        observacao: observacao.trim() || null,
        conciliado: false,
      })

      // REGRA: Toast e MANTER o financeiro para lançar em sequência
      toast({
        title: 'Lançamento salvo com sucesso!',
        description: `${tipoLancamento === 'credito' ? 'Entrada' : 'Saída'} de ${formatCurrency(
          valorNum,
        )} registrada em ${financeiros.find((f) => f.id === selectedFinId)?.nome}.`,
      })

      // Limpar campos de formulário, mas manter selectedFinId para sequência rápida
      setDescricao('')
      setValor('')
      setContraparte('')
      setDocumento('')
      setObservacao('')
      setDataLancamento(getTodayISODate())

      // Recarrega listagem
      const novosLcs = await FinanceiroService.getLancamentos()
      setLancamentos(novosLcs)
    } catch (err: any) {
      // Exibe erro de violação de segregação patrimonial com destaque claro
      setFormError(err.message || 'Erro ao registrar lançamento.')
    } finally {
      setSaving(false)
    }
  }

  const handleExcluirLancamento = async (id: string) => {
    if (!window.confirm('Deseja realmente excluir este lançamento?')) return
    try {
      await FinanceiroService.deleteLancamento(id)
      setLancamentos((prev) => prev.filter((l) => l.id !== id))
      toast({
        title: 'Lançamento excluído',
        description: 'Registro removido com sucesso.',
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: err.message,
      })
    }
  }

  // Filtragem local para exibição rápida
  const lancamentosFiltrados = useMemo(() => {
    return lancamentos.filter((l) => {
      if (filtroFin !== 'todos' && l.financeiro_id !== filtroFin) return false
      if (filtroConta !== 'todas' && l.conta_id !== filtroConta) return false
      if (filtroTipo !== 'todos' && l.tipo !== filtroTipo) return false
      if (filtroStatus !== 'todos' && l.status !== filtroStatus) return false
      if (filtroDataInicio && l.data < filtroDataInicio) return false
      if (filtroDataFim && l.data > filtroDataFim) return false
      if (filtroBusca) {
        const query = filtroBusca.toLowerCase()
        const desc = l.descricao.toLowerCase()
        const contra = (l.contraparte || '').toLowerCase()
        const doc = (l.documento || '').toLowerCase()
        if (!desc.includes(query) && !contra.includes(query) && !doc.includes(query)) {
          return false
        }
      }
      return true
    })
  }, [
    lancamentos,
    filtroFin,
    filtroConta,
    filtroTipo,
    filtroStatus,
    filtroDataInicio,
    filtroDataFim,
    filtroBusca,
  ])

  // Exporta exatamente a listagem filtrada atual em CSV (formato BR)
  const handleExportarCSV = () => {
    if (lancamentosFiltrados.length === 0) {
      toast({
        variant: 'destructive',
        title: 'Nada para exportar',
        description: 'Nenhum lançamento corresponde aos filtros atuais.',
      })
      return
    }
    const linhas = lancamentosFiltrados.map((item) => {
      const fin = financeiros.find((f) => f.id === item.financeiro_id)
      const conta = contas.find((c) => c.id === item.conta_id)
      const plano = planos.find((p) => p.id === item.plano_conta_id)
      return [
        formatDateBR(item.data),
        item.descricao,
        fin ? `${fin.nome} (${fin.tipo})` : '',
        conta ? `${conta.banco} (${conta.conta})` : '',
        plano ? `${plano.codigo} - ${plano.descricao}` : '',
        item.tipo === 'credito' ? 'Crédito (Entrada)' : 'Débito (Saída)',
        valorCSV(item.valor),
        item.status === 'realizado' ? 'Realizado' : 'Previsto',
        item.contraparte || '',
        item.documento || '',
      ]
    })
    // Nome do arquivo pelo período filtrado (ou mês atual, se não houver período)
    const base = filtroDataInicio ? filtroDataInicio.slice(0, 7) : getTodayISODate().slice(0, 7)
    baixarCSV(
      `lancamentos-${base}.csv`,
      [
        'Data',
        'Descrição',
        'Financeiro',
        'Conta',
        'Plano de Contas',
        'Tipo',
        'Valor (R$)',
        'Status',
        'Contraparte',
        'Documento',
      ],
      linhas,
    )
  }

  // Se não houver nenhum financeiro, orienta para o Onboarding
  if (!loading && financeiros.length === 0) {
    return (
      <div className="text-center py-16 bg-[#141A22] border border-[#232B36] rounded-xl p-8 max-w-2xl mx-auto">
        <Building2 className="w-12 h-12 text-[#00D68F] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Nenhum Financeiro Cadastrado</h2>
        <p className="text-gray-400 text-sm mb-6">
          Para realizar lançamentos mantendo a segregação patrimonial entre PF e PJ, realize o
          cadastro guiado.
        </p>
        <Button
          onClick={() => navigate('/onboarding')}
          className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
        >
          Iniciar Onboarding em 4 Passos
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Lançamentos de Caixa</h1>
          <p className="text-sm text-gray-400">
            Registro rigoroso por financeiro com isolamento patrimonial imediato
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={carregarDados}
            disabled={loading}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633]"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {/* FORMULÁRIO EM 3 PASSOS */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-2xl">
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-[#00D68F]" />
              Novo Lançamento em 3 Passos
            </CardTitle>
            <span className="text-xs text-gray-400 uppercase font-semibold">
              Lançamento em Sequência Ativo
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {formError && (
            <Alert className="bg-[#FF5C5C]/15 border-[#FF5C5C]/50 text-[#FF5C5C]">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <AlertDescription className="font-medium">{formError}</AlertDescription>
            </Alert>
          )}

          {/* PASSO 1: ESCOLHER FINANCEIRO (Cards coloridos com saldo/tipo) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-[#00D68F] text-[#0B0F14] text-xs flex items-center justify-center font-black">
                  1
                </span>
                Passo 1: Selecione a Entidade Financeira (PF / PJ)
              </Label>
              <span className="text-xs text-gray-500">
                A segregação impede lançamentos entre entidades diferentes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
              {financeiros.map((f) => {
                const isSelected = selectedFinId === f.id
                // Contas e saldo total deste financeiro
                const finContas = contas.filter((c) => c.financeiro_id === f.id)
                const saldoContas = finContas.reduce(
                  (acc, cur) => acc + Number(cur.saldo_inicial),
                  0,
                )

                return (
                  <button
                    key={f.id}
                    type="button"
                    aria-label={`Selecionar financeiro ${f.nome}`}
                    onClick={() => {
                      setSelectedFinId(f.id)
                      setFormError(null)
                    }}
                    className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer relative overflow-hidden ${
                      isSelected
                        ? 'bg-[#1E2633] shadow-lg scale-[1.02]'
                        : 'bg-[#0B0F14] hover:bg-[#161D27] opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      borderColor: isSelected ? f.cor || '#00D68F' : '#232B36',
                      boxShadow: isSelected ? `0 0 15px ${f.cor || '#00D68F'}33` : 'none',
                    }}
                  >
                    <div
                      className="absolute top-0 left-0 bottom-0 w-1.5"
                      style={{ backgroundColor: f.cor || '#00D68F' }}
                    />
                    <div className="pl-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white truncate max-w-[140px]">
                          {f.nome}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] px-1.5 py-0 font-mono font-bold"
                          style={{
                            borderColor: f.cor || '#00D68F',
                            color: f.cor || '#00D68F',
                          }}
                        >
                          {f.tipo}
                        </Badge>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-1 truncate">
                        {finContas.length} conta(s) bancária(s)
                      </p>
                      <div className="mt-2 text-xs font-mono font-semibold text-gray-300">
                        Base: {formatCurrency(saldoContas)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* PASSO 2: ESCOLHER DÉBITO OU CRÉDITO */}
          <div className="space-y-2 pt-2">
            <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold flex items-center gap-2">
              <span className="w-5 h-5 rounded-full bg-[#00D68F] text-[#0B0F14] text-xs flex items-center justify-center font-black">
                2
              </span>
              Passo 2: Escolha o Tipo de Movimentação
            </Label>
            <div className="grid grid-cols-2 gap-4 max-w-md">
              <button
                type="button"
                onClick={() => setTipoLancamento('debito')}
                className={`p-3 rounded-lg border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                  tipoLancamento === 'debito'
                    ? 'bg-[#FF5C5C]/20 border-[#FF5C5C] text-[#FF5C5C] shadow-lg shadow-[#FF5C5C]/10'
                    : 'bg-[#0B0F14] border-[#232B36] text-gray-400 hover:text-white'
                }`}
              >
                <ArrowDownCircle className="w-5 h-5 text-[#FF5C5C]" />
                DÉBITO (Saída)
              </button>
              <button
                type="button"
                onClick={() => setTipoLancamento('credito')}
                className={`p-3 rounded-lg border flex items-center justify-center gap-2 font-bold text-sm transition-all cursor-pointer ${
                  tipoLancamento === 'credito'
                    ? 'bg-[#00D68F]/20 border-[#00D68F] text-[#00D68F] shadow-lg shadow-[#00D68F]/10'
                    : 'bg-[#0B0F14] border-[#232B36] text-gray-400 hover:text-white'
                }`}
              >
                <ArrowUpCircle className="w-5 h-5 text-[#00D68F]" />
                CRÉDITO (Entrada)
              </button>
            </div>
          </div>

          {/* PASSO 3: FORMULÁRIO COMPLETO */}
          <form onSubmit={handleSalvarLancamento} className="space-y-4 pt-2">
            <div className="flex items-center gap-2 pb-1">
              <span className="w-5 h-5 rounded-full bg-[#00D68F] text-[#0B0F14] text-xs flex items-center justify-center font-black">
                3
              </span>
              <span className="text-xs uppercase tracking-wider text-gray-300 font-bold">
                Passo 3: Detalhes do Lançamento
              </span>
            </div>

            {/* AVISO: financeiro sem NENHUMA categoria no plano de contas */}
            {semPlanoContas && (
              <div className="bg-[#FFB020]/10 border border-[#FFB020]/30 rounded-lg p-4 flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-[#FFB020]/10 border border-[#FFB020]/30">
                  <AlertTriangle className="w-5 h-5 text-[#FFB020]" />
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-white leading-tight">
                    Este financeiro ainda não tem plano de contas
                  </h4>
                  <p className="text-xs text-gray-400 mt-1">
                    Cadastre uma categoria em Configurações (aba Plano de Contas) para poder
                    registrar lançamentos de{' '}
                    {tipoLancamento === 'credito' ? 'entrada (crédito)' : 'saída (débito)'} neste
                    financeiro.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => navigate('/configuracoes?tab=plano')}
                    className="mt-2.5 bg-[#FFB020] hover:bg-[#FFB020]/85 text-[#0B0F14] font-bold text-xs h-8 px-3 cursor-pointer"
                  >
                    <BookOpen className="w-3.5 h-3.5 mr-1.5" />
                    Cadastrar Categoria em Configurações
                  </Button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {/* Descrição */}
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-gray-400 font-medium">Descrição *</Label>
                <Input
                  required
                  value={descricao}
                  onChange={(e) => setDescricao(e.target.value)}
                  placeholder="Ex: Pagamento Fornecedor XYZ, Recebimento Cliente ABC"
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              {/* Valor */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium">Valor (R$) *</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-500 font-mono">
                    R$
                  </span>
                  <Input
                    required
                    type="text"
                    value={valor}
                    onChange={(e) => setValor(e.target.value)}
                    placeholder="0,00"
                    className="pl-9 bg-[#0B0F14] border-[#232B36] text-white font-mono text-base font-bold"
                  />
                </div>
              </div>

              {/* Data (padrão hoje) */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium">Data *</Label>
                <Input
                  type="date"
                  required
                  value={dataLancamento}
                  onChange={(e) => setDataLancamento(e.target.value)}
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              {/* Conta Bancária (SOMENTE do financeiro selecionado) */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-[#00D68F]" />
                  Conta Bancária (Segregada) *
                </Label>
                <select
                  required
                  value={selectedContaId}
                  onChange={(e) => setSelectedContaId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {contasDoFinanceiro.length === 0 ? (
                    <option value="">Nenhuma conta neste financeiro</option>
                  ) : (
                    contasDoFinanceiro.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.banco} — C/C: {c.conta}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Plano de Contas (SOMENTE do financeiro selecionado) */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#00D68F]" />
                  Categoria (Plano de Contas) *
                </Label>
                <select
                  required
                  value={selectedPlanoId}
                  onChange={(e) => setSelectedPlanoId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {planosDoFinanceiro.length === 0 ? (
                    <option value="">Nenhuma categoria encontrada</option>
                  ) : (
                    planosDoFinanceiro.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.codigo} - {p.descricao}
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Status (Previsto / Realizado) */}
              <div className="space-y-1">
                <Label htmlFor="statusSelect" className="text-xs text-gray-400 font-medium">
                  Status
                </Label>
                <select
                  id="statusSelect"
                  aria-label="Status do lançamento"
                  value={statusLancamento}
                  onChange={(e) => setStatusLancamento(e.target.value as 'previsto' | 'realizado')}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  <option value="realizado">Realizado (Efetivado)</option>
                  <option value="previsto">Previsto (A vencer/receber)</option>
                </select>
              </div>

              {/* Contraparte */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium">
                  Contraparte / Fornecedor / Cliente
                </Label>
                <Input
                  value={contraparte}
                  onChange={(e) => setContraparte(e.target.value)}
                  placeholder="Nome do favorecido/pagador"
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              {/* Documento */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium">
                  Nº Documento / NF / Comprovante
                </Label>
                <Input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="NF 12345, TED 99"
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              {/* Observação */}
              <div className="md:col-span-2 space-y-1">
                <Label className="text-xs text-gray-400 font-medium">Observações</Label>
                <Input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Detalhes adicionais..."
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>
            </div>

            <div className="flex flex-col items-end gap-2 pt-4 border-t border-[#232B36]">
              <div className="flex items-center gap-3">
                <Button
                  type="submit"
                  disabled={
                    saving || !selectedFinId || contasDoFinanceiro.length === 0 || semPlanoContas
                  }
                  className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold px-6 h-11 text-sm shadow-lg shadow-[#00D68F]/20 cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Gravando com Isolamento...
                    </>
                  ) : (
                    <>
                      <PlusCircle className="w-4 h-4 mr-2" />
                      Salvar e Lançar Próximo
                    </>
                  )}
                </Button>
              </div>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* LISTAGEM DE LANÇAMENTOS COM FILTROS */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg font-bold text-white">Extrato de Lançamentos</CardTitle>
              <Badge variant="outline" className="border-[#232B36] text-gray-400 text-xs">
                {lancamentosFiltrados.length} registros
              </Badge>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportarCSV}
                className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] shrink-0"
              >
                <Download className="w-3.5 h-3.5 mr-2" />
                Exportar CSV
              </Button>
              {/* Busca Rápida */}
              <div className="relative w-full md:w-72">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={filtroBusca}
                  onChange={(e) => setFiltroBusca(e.target.value)}
                  placeholder="Buscar por descrição, NF, favorecido..."
                  className="pl-9 bg-[#0B0F14] border-[#232B36] text-white text-xs"
                />
              </div>
            </div>
          </div>

          {/* Barra de Filtros */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 pt-3">
            <div>
              <Label className="text-[10px] text-gray-400 uppercase font-bold">Financeiro</Label>
              <select
                value={filtroFin}
                onChange={(e) => setFiltroFin(e.target.value)}
                className="w-full h-8 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
              >
                <option value="todos">Todos os Financeiros</option>
                {financeiros.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nome} ({f.tipo})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <Label className="text-[10px] text-gray-400 uppercase font-bold">Tipo</Label>
              <select
                value={filtroTipo}
                onChange={(e) => setFiltroTipo(e.target.value as any)}
                className="w-full h-8 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
              >
                <option value="todos">Todos os Tipos</option>
                <option value="credito">Créditos (+)</option>
                <option value="debito">Débitos (-)</option>
              </select>
            </div>

            <div>
              <Label className="text-[10px] text-gray-400 uppercase font-bold">Status</Label>
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value as any)}
                className="w-full h-8 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
              >
                <option value="todos">Todos os Status</option>
                <option value="realizado">Realizados</option>
                <option value="previsto">Previstos</option>
              </select>
            </div>

            <div>
              <Label className="text-[10px] text-gray-400 uppercase font-bold">Data Início</Label>
              <Input
                type="date"
                value={filtroDataInicio}
                onChange={(e) => setFiltroDataInicio(e.target.value)}
                className="h-8 bg-[#0B0F14] border-[#232B36] text-white text-xs mt-1"
              />
            </div>

            <div>
              <Label className="text-[10px] text-gray-400 uppercase font-bold">Data Fim</Label>
              <Input
                type="date"
                value={filtroDataFim}
                onChange={(e) => setFiltroDataFim(e.target.value)}
                className="h-8 bg-[#0B0F14] border-[#232B36] text-white text-xs mt-1"
              />
            </div>

            <div className="flex items-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFiltroFin('todos')
                  setFiltroConta('todas')
                  setFiltroTipo('todos')
                  setFiltroStatus('todos')
                  setFiltroBusca('')
                  setFiltroDataInicio('')
                  setFiltroDataFim('')
                }}
                className="w-full text-xs text-gray-400 hover:text-white h-8"
              >
                Limpar Filtros
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Conta</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {lancamentosFiltrados.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-12 text-center text-gray-500 text-sm">
                      Nenhum lançamento encontrado para os filtros selecionados.
                    </td>
                  </tr>
                ) : (
                  lancamentosFiltrados.map((item) => {
                    const fin = financeiros.find((f) => f.id === item.financeiro_id)
                    const conta = contas.find((c) => c.id === item.conta_id)
                    const plano = planos.find((p) => p.id === item.plano_conta_id)
                    const isCredito = item.tipo === 'credito'

                    return (
                      <tr key={item.id} className="hover:bg-[#1A222D]/50 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap font-mono text-xs text-gray-400">
                          {formatDateBR(item.data)}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          {fin ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold border"
                              style={{
                                borderColor: `${fin.cor}66`,
                                color: fin.cor,
                                backgroundColor: `${fin.cor}15`,
                              }}
                            >
                              {fin.nome} ({fin.tipo})
                            </Badge>
                          ) : (
                            <span className="text-xs text-gray-500">-</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-white">{item.descricao}</div>
                          {item.contraparte && (
                            <div className="text-[11px] text-gray-400">
                              Favorecido: {item.contraparte}
                            </div>
                          )}
                          {item.documento && (
                            <div className="text-[11px] text-gray-500 font-mono">
                              Doc: {item.documento}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-xs">
                          <div className="text-gray-300">
                            {plano ? `${plano.codigo} - ${plano.descricao}` : 'Sem plano'}
                          </div>
                          <div className="text-[11px] text-gray-500">
                            {conta ? `${conta.banco} (${conta.conta})` : 'Sem conta'}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          {item.status === 'realizado' ? (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#00D68F] bg-[#00D68F]/10 px-2 py-0.5 rounded-full border border-[#00D68F]/20">
                              <CheckCircle2 className="w-3 h-3" />
                              Realizado
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full border border-amber-400/20">
                              <Clock className="w-3 h-3" />
                              Previsto
                            </span>
                          )}
                        </td>
                        <td
                          className={`py-3 px-4 text-right whitespace-nowrap font-mono font-bold text-sm ${
                            isCredito ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                          }`}
                        >
                          {isCredito ? '+' : '-'} {formatCurrency(item.valor)}
                        </td>
                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <button
                            onClick={() => handleExcluirLancamento(item.id)}
                            title="Excluir Lançamento"
                            className="p-1.5 text-gray-500 hover:text-[#FF5C5C] hover:bg-[#FF5C5C]/10 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
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
    </div>
  )
}
