import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react'
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useToast } from '@/hooks/use-toast'
import { useNavigate } from 'react-router-dom'
import { baixarCSV, valorCSV } from '@/lib/csv'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'
import { useAuth } from '@/hooks/use-auth'
import { dataUltimaParcela, mesPorExtenso } from '@/lib/recorrentes'
import { CalendarClock, Repeat, Pencil, X } from 'lucide-react'
import TabelaAnualRecorrentes from '@/components/TabelaAnualRecorrentes'
import { RecebiveisSemData } from '@/components/RecebiveisSemData'
import { LancamentoRecorrente } from '@/types/financeiro'

export default function LancamentosPage() {
  const { toast } = useToast()
  const navigate = useNavigate()

  // Estados dos dados mestres
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  // Edição: id do lançamento sendo editado (null = modo criação)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  // Edição de RECORRENTE (vindo da Projeção Anual): id do recorrente em edição
  const [editandoRecorrenteId, setEditandoRecorrenteId] = useState<string | null>(null)
  // Recorrente aguardando confirmação de exclusão (AlertDialog da Projeção Anual)
  const [recorrenteParaExcluir, setRecorrenteParaExcluir] = useState<LancamentoRecorrente | null>(
    null,
  )
  const [formTitle, setFormTitle] = useState('Novo Lançamento em 3 Passos')
  // Cartão do formulário: alvo rolável ao entrar em edição (o scroll real é o <main> do Layout)
  const formularioRef = useRef<HTMLDivElement>(null)

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
  // Combobox de categoria (autocomplete): texto digitado + popover aberto
  const [buscaCategoria, setBuscaCategoria] = useState('')
  const [comboCategoriaAberto, setComboCategoriaAberto] = useState(false)
  const [contraparte, setContraparte] = useState('')
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')
  // Recorrência (passo 3): nenhuma (padrão) / mensal contínua / parcelada em N parcelas
  const [tipoRecorrencia, setTipoRecorrencia] = useState<'nenhuma' | 'continua' | 'parcelada'>(
    'nenhuma',
  )
  const [totalParcelas, setTotalParcelas] = useState('')

  // Valor numérico de UMA parcela (o valor do campo) e o total geral do parcelamento
  const valorParcela = useMemo(() => {
    const v = parseFloat(valor.replace(',', '.'))
    return isNaN(v) ? 0 : v
  }, [valor])

  const parcelaInfo = useMemo(() => {
    if (tipoRecorrencia !== 'parcelada') return null
    const n = parseInt(totalParcelas, 10)
    if (isNaN(n) || n < 2) return null
    const diaMes = Math.max(1, Math.min(Number(dataLancamento.slice(8, 10)) || 1, 31))
    const ultima = dataUltimaParcela(diaMes, dataLancamento, n)
    return {
      n,
      mesUltima: mesPorExtenso(ultima),
      totalGeral: valorParcela * n,
    }
  }, [tipoRecorrencia, totalParcelas, dataLancamento, valorParcela])

  // Mensagens de erro com destaque especial para violação de segregação
  const [formError, setFormError] = useState<string | null>(null)
  const [erroContraparte, setErroContraparte] = useState<string | null>(null)

  // Filtros da Listagem (o filtro de FINANCEIRO saiu daqui: a lista é sempre
  // filtrada pela empresa escolhida no card do Passo 1)
  const [filtroConta, setFiltroConta] = useState<string>('todas')
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'credito' | 'debito'>('todos')
  const [filtroStatus, setFiltroStatus] = useState<'todos' | 'previsto' | 'realizado'>('todos')
  const [filtroBusca, setFiltroBusca] = useState('')
  const [filtroDataInicio, setFiltroDataInicio] = useState('')
  const [filtroDataFim, setFiltroDataFim] = useState('')

  // Financeiros visíveis ao usuário logado (master = todos; membro = só liberados)
  const { financeiros: finsAcesso } = useAcessoFinanceiros()
  const { user } = useAuth()

  // Mesma regra do RLS (auth_all_lancamentos_recorrentes): pode alterar quem é
  // dono do registro (user_id = auth.uid()) OU tem acesso ao financeiro
  // (master vê todas; membro vê as liberadas via equipe_membros + as suas).
  const podeGerenciarRecorrente = useCallback(
    (r: LancamentoRecorrente) =>
      r.user_id === user?.id || finsAcesso.some((f) => f.id === r.financeiro_id),
    [user, finsAcesso],
  )

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
      const [cts, pls, lcs, rcs] = await Promise.all([
        FinanceiroService.getContas(),
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getLancamentos(),
        FinanceiroService.getLancamentosRecorrentes(),
      ])

      setContas(cts)
      setPlanos(pls)
      setLancamentos(lcs)
      setRecorrentes(rcs)
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
    // Em edição não filtramos pelo tipo do passo 2: garante que a categoria carregada
    // do lançamento apareça no combobox mesmo que o usuário troque o tipo.
    // Vale também na edição de recorrente (categoria carregada deve aparecer).
    if (editandoId || editandoRecorrenteId) return planos
    return planos.filter((p) => p.tipo === (tipoLancamento === 'credito' ? 'receita' : 'despesa'))
  }, [planos, tipoLancamento, editandoId, editandoRecorrenteId])

  // Categoria escolhida no combobox (exibida no botão)
  const planoSelecionado = useMemo(
    () => planosDoFinanceiro.find((p) => p.id === selectedPlanoId),
    [planosDoFinanceiro, selectedPlanoId],
  )

  // Todas as categorias globais, de qualquer tipo (receita/despesa).
  // Usado para detectar o caso "plano de contas vazio".
  const planosDoFinanceiroQualquerTipo = useMemo(() => planos, [planos])

  // Saldo ATUAL por financeiro = saldos iniciais das contas + lançamentos realizados
  // (crédito − débito). Mesma fórmula do Painel (Index) — previsto NÃO altera o saldo.
  const saldosPorFinanceiro = useMemo(() => {
    const saldos: Record<string, number> = {}
    for (const f of financeiros) saldos[f.id] = 0
    for (const c of contas) {
      if (saldos[c.financeiro_id] === undefined) continue
      saldos[c.financeiro_id] += Number(c.saldo_inicial)
    }
    for (const l of lancamentos) {
      if (l.status !== 'realizado') continue
      if (saldos[l.financeiro_id] === undefined) continue
      saldos[l.financeiro_id] += l.tipo === 'credito' ? Number(l.valor) : -Number(l.valor)
    }
    return saldos
  }, [financeiros, contas, lancamentos])

  const semPlanoContas = !!selectedFinId && planosDoFinanceiroQualquerTipo.length === 0

  // Atualiza selects padrão ao trocar financeiro ou tipo — exceto quando está editando
  // (a conta e a categoria carregadas do lançamento devem permanecer).
  useEffect(() => {
    if (editandoId || editandoRecorrenteId) return
    if (contasDoFinanceiro.length > 0) {
      setSelectedContaId(contasDoFinanceiro[0].id)
    } else {
      setSelectedContaId('')
    }
  }, [selectedFinId, contasDoFinanceiro, editandoId, editandoRecorrenteId])

  useEffect(() => {
    if (editandoId || editandoRecorrenteId) return
    if (planosDoFinanceiro.length > 0) {
      setSelectedPlanoId(planosDoFinanceiro[0].id)
    } else {
      setSelectedPlanoId('')
    }
  }, [selectedFinId, tipoLancamento, planosDoFinanceiro, editandoId, editandoRecorrenteId])

  // Inicia a edição: carrega o lançamento no formulário e rola até ele
  const iniciarEdicao = (l: Lancamento) => {
    setEditandoId(l.id)
    setEditandoRecorrenteId(null)
    setSelectedFinId(l.financeiro_id)
    setTipoLancamento(l.tipo)
    setDescricao(l.descricao)
    setValor(String(l.valor).includes('.') ? String(l.valor) : String(l.valor))
    setDataLancamento(l.data)
    setStatusLancamento(l.status)
    setContraparte(l.contraparte || '')
    setDocumento(l.documento || '')
    setObservacao(l.observacao || '')
    // categoria e conta são fixados pelo usuário via selects (efeitos abaixo não sobrescrevem em edição)
    setSelectedContaId(l.conta_id)
    setSelectedPlanoId(l.plano_conta_id)
    setTipoRecorrencia('nenhuma')
    setTotalParcelas('')
    setFormTitle(`Editando: ${l.descricao || 'lançamento'}`)
    setFormError(null)
    setErroContraparte(null)
    // window.scrollTo não rola: o contêiner de rolagem é o <main> do Layout.
    // scrollIntoView rola todos os ancestrais roláveis até o formulário.
    const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formularioRef.current?.scrollIntoView({
      behavior: reduzirMovimento ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  // Cancela a edição e volta ao modo de criação
  const cancelarEdicao = () => {
    setEditandoId(null)
    setEditandoRecorrenteId(null)
    setFormTitle('Novo Lançamento em 3 Passos')
    setDescricao('')
    setValor('')
    setContraparte('')
    setDocumento('')
    setObservacao('')
    setDataLancamento(getTodayISODate())
    setStatusLancamento('realizado')
    setTipoRecorrencia('nenhuma')
    setTotalParcelas('')
    setFormError(null)
    setErroContraparte(null)
  }

  // Inicia a edição de um RECORRENTE (vindo da Projeção Anual de Recorrentes):
  // carrega os dados no formulário em 3 passos, com destaque âmbar e rolagem.
  const iniciarEdicaoRecorrente = (r: LancamentoRecorrente) => {
    setEditandoId(null)
    setEditandoRecorrenteId(r.id)
    setSelectedFinId(r.financeiro_id)
    setTipoLancamento(r.tipo)
    setDescricao(r.descricao)
    setValor(String(r.valor))
    setDataLancamento(r.data_inicial)
    setStatusLancamento('previsto')
    setSelectedContaId(r.conta_id)
    setSelectedPlanoId(r.plano_conta_id)
    setTipoRecorrencia(r.total_parcelas && r.total_parcelas > 0 ? 'parcelada' : 'continua')
    setTotalParcelas(r.total_parcelas ? String(r.total_parcelas) : '')
    setFormTitle(`Editando: ${r.descricao || 'recorrente'}`)
    setFormError(null)
    setErroContraparte(null)
    // window.scrollTo não rola: o contêiner de rolagem é o <main> do Layout.
    // scrollIntoView rola todos os ancestrais roláveis até o formulário.
    const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formularioRef.current?.scrollIntoView({
      behavior: reduzirMovimento ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  // Salvar lançamento (criação ou edição do registro existente)
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
    // Recorrente não tem contraparte (o campo não existe na tabela de recorrentes)
    if (!editandoRecorrenteId && !contraparte.trim()) {
      setFormError('Informe a Contraparte (fornecedor/cliente) do lançamento.')
      setErroContraparte('Obrigatório: informe o favorecido/pagador.')
      return
    }

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError('Informe um valor monetário positivo válido.')
      return
    }

    // Validação da recorrência parcelada
    const nParcelas = tipoRecorrencia === 'parcelada' ? parseInt(totalParcelas, 10) : 0
    if (tipoRecorrencia === 'parcelada' && (isNaN(nParcelas) || nParcelas < 2)) {
      setFormError('Informe o total de parcelas (mínimo 2) para o parcelamento.')
      return
    }

    try {
      setSaving(true)

      // MODO EDIÇÃO DE RECORRENTE: atualiza a programação (sem criar lançamento).
      // dia_mes vem do dia da data informada; em modo contínuo limpa total_parcelas.
      if (editandoRecorrenteId) {
        await FinanceiroService.updateLancamentoRecorrente(editandoRecorrenteId, {
          financeiro_id: selectedFinId,
          conta_id: selectedContaId,
          plano_conta_id: selectedPlanoId,
          tipo: tipoLancamento,
          valor: valorNum,
          descricao: descricao.trim(),
          dia_mes: Math.max(1, Math.min(Number(dataLancamento.slice(8, 10)) || 1, 31)),
          data_inicial: dataLancamento,
          ...(tipoRecorrencia === 'parcelada'
            ? { total_parcelas: nParcelas }
            : { total_parcelas: null }),
        })
        toast({
          title: 'Recorrente atualizado com sucesso!',
          description: `"${descricao.trim()}" atualizado — a projeção anual e o Fluxo de Caixa passam a usar os novos dados.`,
        })
        cancelarEdicao()
        // Recarrega a projeção (recorrentes) com os dados atualizados
        const rcs = await FinanceiroService.getLancamentosRecorrentes()
        setRecorrentes(rcs)
        return
      }

      // MODO EDIÇÃO: atualiza o registro existente (sem duplicar)
      if (editandoId) {
        const original = lancamentos.find((l) => l.id === editandoId)
        await FinanceiroService.updateLancamento(editandoId, {
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
          conciliado: original ? original.conciliado : false,
          extrato_item_id: original ? (original.extrato_item_id ?? null) : null,
        })
        toast({
          title: 'Lançamento atualizado com sucesso!',
          description: `${tipoLancamento === 'credito' ? 'Entrada' : 'Saída'} de ${formatCurrency(
            valorNum,
          )} alterada em ${financeiros.find((f) => f.id === selectedFinId)?.nome}.`,
        })
        cancelarEdicao()
        // Recarrega listagem
        const novosLcs = await FinanceiroService.getLancamentos()
        setLancamentos(novosLcs)
        return
      }

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

      // RECORRÊNCIA: cria a programação (mensal contínua ou parcelada) além do lançamento atual.
      // O lançamento salvo acima é a 1ª ocorrência; as futuras aparecem no Fluxo de Caixa
      // e nos Próximos Vencimentos via ocorrências geradas em recorrentes.ts/projecao.ts.
      if (tipoRecorrencia !== 'nenhuma') {
        try {
          await FinanceiroService.createLancamentoRecorrente({
            financeiro_id: selectedFinId,
            conta_id: selectedContaId,
            plano_conta_id: selectedPlanoId,
            tipo: tipoLancamento,
            valor: valorNum,
            status: 'previsto',
            dia_mes: Number(dataLancamento.slice(8, 10)),
            data_inicial: dataLancamento,
            descricao: descricao.trim(),
            ...(tipoRecorrencia === 'parcelada' ? { total_parcelas: nParcelas } : {}),
          })
        } catch (errRec: any) {
          console.error(errRec)
          toast({
            variant: 'destructive',
            title: 'Lançamento salvo, mas a recorrência não foi criada',
            description: errRec.message,
          })
        }
      }

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
      setErroContraparte(null)
      setDocumento('')
      setObservacao('')
      setDataLancamento(getTodayISODate())
      setTipoRecorrencia('nenhuma')
      setTotalParcelas('')

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

  // Exclui um RECORRENTE (após confirmação no AlertDialog da Projeção Anual):
  // remove a programação; as ocorrências futuras saem da projeção e do Fluxo
  // de Caixa (os lançamentos já realizados NÃO são apagados).
  const handleExcluirRecorrente = async (r: LancamentoRecorrente) => {
    try {
      await FinanceiroService.deleteLancamentoRecorrente(r.id)
      setRecorrentes((prev) => prev.filter((x) => x.id !== r.id))
      if (editandoRecorrenteId === r.id) cancelarEdicao()
      toast({
        title: 'Recorrente excluído',
        description: `"${r.descricao}" removido — as ocorrências futuras saem da projeção.`,
      })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir recorrente',
        description: err.message,
      })
    }
  }

  // Filtragem local para exibição rápida
  const lancamentosFiltrados = useMemo(() => {
    return lancamentos.filter((l) => {
      // A lista vem sempre filtrada pela empresa selecionada no card do Passo 1
      if (selectedFinId && l.financeiro_id !== selectedFinId) return false
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
    selectedFinId,
    filtroConta,
    filtroTipo,
    filtroStatus,
    filtroDataInicio,
    filtroDataFim,
    filtroBusca,
  ])

  // Linhas de SALDO INICIAL no topo do extrato: uma por conta do financeiro
  // selecionado (respeitando o filtro de conta, se ativo). Apenas exibição.
  const contasParaLinhasSaldo = useMemo(
    () => contasDoFinanceiro.filter((c) => filtroConta === 'todas' || c.id === filtroConta),
    [contasDoFinanceiro, filtroConta],
  )

  const saldoInicialTotal = useMemo(
    () => contasParaLinhasSaldo.reduce((s, c) => s + Number(c.saldo_inicial), 0),
    [contasParaLinhasSaldo],
  )

  // Totais do extrato: apenas lançamentos REALIZADOS entram (previsto não altera o
  // saldo — mesma regra do card do Passo 1 e do Painel). O saldo inicial entra nos
  // créditos para a conta fechar: inicial + créditos − débitos = saldo atual.
  const totaisExtrato = useMemo(() => {
    let creditos = 0
    let debitos = 0
    for (const l of lancamentosFiltrados) {
      if (l.status !== 'realizado') continue
      if (l.tipo === 'credito') creditos += Number(l.valor)
      else debitos += Number(l.valor)
    }
    return {
      creditos: saldoInicialTotal + creditos,
      debitos,
      saldoAtual: saldoInicialTotal + creditos - debitos,
    }
  }, [lancamentosFiltrados, saldoInicialTotal])

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

      {/* PASSO 1 — CARD FIXO (sticky): o seletor de empresa e o saldo ficam sempre
          visíveis no topo ao rolar a página. O contêiner de rolagem é o <main> do
          Layout, então o sticky funciona dentro dele (sem position:fixed). */}
      <div className="md:sticky md:top-0 md:z-30 -mx-4 px-4 md:-mx-8 md:px-8 py-2 bg-[#0B0F14]">
        <Card className="bg-[#141A22] text-white border-[#232B36] shadow-xl">
          <CardContent className="py-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold flex items-center gap-2 whitespace-nowrap">
                <span className="w-5 h-5 rounded-full bg-[#00D68F] text-[#0B0F14] text-xs flex items-center justify-center font-black">
                  1
                </span>
                Passo 1: Selecione a Entidade Financeira (PF / PJ)
              </Label>
              <span className="hidden lg:inline text-xs text-gray-500">
                A segregação impede lançamentos entre entidades diferentes
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {financeiros.map((f) => {
                const isSelected = selectedFinId === f.id
                // Contas e saldo ATUAL deste financeiro (base + lançamentos realizados)
                const finContas = contas.filter((c) => c.financeiro_id === f.id)
                const saldoContas = saldosPorFinanceiro[f.id] ?? 0

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
                      <div
                        className={`mt-2 text-xs font-mono font-semibold ${
                          saldoContas < 0 ? 'text-[#FF5C5C]' : 'text-gray-300'
                        }`}
                      >
                        Saldo: {formatCurrency(saldoContas)}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* FORMULÁRIO EM 3 PASSOS (Passos 2 e 3 — o Passo 1 ficou no card fixo acima).
          scroll-mt compensa a altura do card sticky para o scrollIntoView da edição
          não deixar o topo do formulário escondido atrás dele. */}
      <Card
        ref={formularioRef}
        className={`bg-[#141A22] text-white shadow-2xl scroll-mt-4 md:scroll-mt-[280px] lg:scroll-mt-[180px] transition-colors ${
          editandoId || editandoRecorrenteId
            ? 'border-2 border-[#FFB020] ring-4 ring-[#FFB020]/20'
            : 'border-[#232B36]'
        }`}
      >
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
              <PlusCircle className="w-5 h-5 text-[#00D68F]" />
              {formTitle}
            </CardTitle>
            {editandoId || editandoRecorrenteId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={cancelarEdicao}
                className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633]"
              >
                <X className="w-3.5 h-3.5 mr-1.5" />
                Cancelar edição
              </Button>
            ) : (
              <span className="text-xs text-gray-400 uppercase font-semibold">
                Lançamento em Sequência Ativo
              </span>
            )}
          </div>
        </CardHeader>
        <CardContent className="pt-6 space-y-6">
          {formError && (
            <Alert className="bg-[#FF5C5C]/15 border-[#FF5C5C]/50 text-[#FF5C5C]">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <AlertDescription className="font-medium">{formError}</AlertDescription>
            </Alert>
          )}

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

              {/* Plano de Contas — combobox com autocomplete (globais, filtradas por tipo) */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-400 font-medium flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5 text-[#00D68F]" />
                  Categoria (Plano de Contas) *
                </Label>
                <Popover
                  open={comboCategoriaAberto}
                  onOpenChange={(aberto) => {
                    setComboCategoriaAberto(aberto)
                    if (aberto) setBuscaCategoria('')
                  }}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      role="combobox"
                      aria-expanded={comboCategoriaAberto}
                      aria-controls="lista-categorias"
                      aria-label="Selecionar categoria do plano de contas"
                      className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm flex items-center justify-between gap-2 cursor-pointer"
                    >
                      <span
                        className={cn('truncate text-left', !selectedPlanoId && 'text-gray-500')}
                      >
                        {planoSelecionado
                          ? `${planoSelecionado.codigo} - ${planoSelecionado.descricao}`
                          : 'Selecione a categoria...'}
                      </span>
                      <ChevronsUpDown className="w-4 h-4 shrink-0 opacity-50" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent
                    align="start"
                    className="w-[--radix-popover-trigger-width] p-0 bg-[#141A22] border-[#232B36]"
                  >
                    <Command
                      filter={(value, search) =>
                        value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0
                      }
                    >
                      <CommandInput
                        placeholder="Buscar categoria por código ou descrição..."
                        value={buscaCategoria}
                        onValueChange={setBuscaCategoria}
                        className="text-white placeholder:text-gray-500"
                      />
                      <CommandList id="lista-categorias">
                        <CommandEmpty className="py-4 text-center text-xs text-gray-500">
                          Nenhuma categoria encontrada.
                        </CommandEmpty>
                        <CommandGroup>
                          {planosDoFinanceiro.map((p) => (
                            <CommandItem
                              key={p.id}
                              value={`${p.codigo} - ${p.descricao}${
                                p.descricao_complementar ? ` - ${p.descricao_complementar}` : ''
                              }`}
                              onSelect={() => {
                                setSelectedPlanoId(p.id)
                                setComboCategoriaAberto(false)
                              }}
                              className="text-gray-200 aria-selected:bg-[#1E2633] aria-selected:text-[#00D68F] cursor-pointer"
                            >
                              <Check
                                className={cn(
                                  'mr-2 h-4 w-4',
                                  selectedPlanoId === p.id ? 'opacity-100' : 'opacity-0',
                                )}
                              />
                              <span className="font-mono text-xs text-gray-400">{p.codigo}</span>
                              <span className="truncate">
                                — {p.descricao}
                                {p.descricao_complementar && (
                                  <span className="block text-[11px] text-gray-500 leading-snug">
                                    {p.descricao_complementar}
                                  </span>
                                )}
                              </span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
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
                <Label htmlFor="contraparte" className="text-xs text-gray-400 font-medium">
                  Contraparte / Fornecedor / Cliente *
                </Label>
                <Input
                  id="contraparte"
                  value={contraparte}
                  onChange={(e) => {
                    setContraparte(e.target.value)
                    if (erroContraparte) setErroContraparte(null)
                  }}
                  placeholder="Nome do favorecido/pagador"
                  aria-invalid={!!erroContraparte}
                  className={`bg-[#0B0F14] text-white ${
                    erroContraparte ? 'border-[#FF5C5C]' : 'border-[#232B36]'
                  }`}
                />
                {erroContraparte && (
                  <p role="alert" className="text-[11px] text-[#FF5C5C] font-medium">
                    {erroContraparte}
                  </p>
                )}
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

            {/* RECORRÊNCIA: vale para crédito e débito (mesmo formulário) */}
            <div className="rounded-lg border border-[#232B36] bg-[#0B0F14] p-4 space-y-3">
              <div className="flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#00D68F]" />
                <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold">
                  Recorrência
                </Label>
                <span className="text-[11px] text-gray-500">
                  (crédito ou débito — as parcelas futuras entram no Fluxo de Caixa)
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setTipoRecorrencia('nenhuma')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    tipoRecorrencia === 'nenhuma'
                      ? 'bg-[#1E2633] border-[#00D68F] text-white'
                      : 'bg-[#0B0F14] border-[#232B36] text-gray-400 hover:text-white'
                  }`}
                >
                  Sem recorrência
                </button>
                <button
                  type="button"
                  onClick={() => setTipoRecorrencia('continua')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    tipoRecorrencia === 'continua'
                      ? 'bg-[#1E2633] border-[#00D68F] text-white'
                      : 'bg-[#0B0F14] border-[#232B36] text-gray-400 hover:text-white'
                  }`}
                >
                  Mensal contínua
                </button>
                <button
                  type="button"
                  onClick={() => setTipoRecorrencia('parcelada')}
                  className={`p-2.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
                    tipoRecorrencia === 'parcelada'
                      ? 'bg-[#1E2633] border-[#00D68F] text-white'
                      : 'bg-[#0B0F14] border-[#232B36] text-gray-400 hover:text-white'
                  }`}
                >
                  Parcelado em N parcelas
                </button>
              </div>
              {tipoRecorrencia === 'parcelada' && (
                <div className="space-y-2">
                  <div className="flex items-end gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="totalParcelas" className="text-xs text-gray-400 font-medium">
                        Total de parcelas *
                      </Label>
                      <Input
                        id="totalParcelas"
                        type="number"
                        inputMode="numeric"
                        min={2}
                        max={360}
                        step={1}
                        value={totalParcelas}
                        onChange={(e) => setTotalParcelas(e.target.value)}
                        placeholder="Ex: 12"
                        className="w-32 bg-[#141A22] border-[#232B36] text-white font-mono"
                      />
                    </div>
                    <p className="text-[11px] text-gray-500 pb-2.5">
                      Valor informado = valor de CADA parcela, no dia {formatDateBR(dataLancamento)}{' '}
                      e nos meses seguintes.
                    </p>
                  </div>
                  {parcelaInfo && (
                    <div className="flex items-start gap-2 rounded-md bg-[#00D68F]/10 border border-[#00D68F]/30 p-2.5">
                      <CalendarClock className="w-3.5 h-3.5 text-[#00D68F] mt-0.5 shrink-0" />
                      <p className="text-[11px] text-gray-300">
                        {parcelaInfo.n} parcelas de {formatCurrency(valorParcela)} — total{' '}
                        {formatCurrency(parcelaInfo.totalGeral)}; última em{' '}
                        <b className="text-white">{parcelaInfo.mesUltima}</b>. O sistema avisa 1 mês
                        antes do encerramento.
                      </p>
                    </div>
                  )}
                </div>
              )}
              {tipoRecorrencia === 'continua' && (
                <p className="text-[11px] text-gray-500">
                  Repete todo mês no mesmo dia, até você desativar em Configurações → Recorrentes.
                </p>
              )}
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
                  ) : editandoId || editandoRecorrenteId ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Salvar Alterações
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
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 pt-3">
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
                {/* Linhas de SALDO INICIAL: exibição apenas — não são lançamentos,
                    não têm ações (sem lápis nem lixeira) e entram nos créditos do
                    extrato para a matemática do saldo fechar. */}
                {contasParaLinhasSaldo.map((c) => {
                  const fin = financeiros.find((f) => f.id === c.financeiro_id)
                  return (
                    <tr key={`saldo-inicial-${c.id}`} className="bg-[#0E141D]">
                      <td className="py-3 px-4 text-xs text-gray-600 font-mono italic">—</td>
                      <td className="py-3 px-4 text-xs text-gray-600 italic">
                        {fin ? fin.nome : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <div className="text-sm text-gray-400 italic">
                          Saldo inicial — {c.banco}
                        </div>
                        <div className="text-[11px] text-gray-500 italic">Conta {c.conta}</div>
                      </td>
                      <td className="py-3 px-4 text-xs text-gray-500 italic">
                        Saldo de abertura da conta
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center text-[11px] italic text-gray-500 border border-[#232B36] px-2 py-0.5 rounded-full">
                          Abertura
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono font-semibold text-sm text-[#00D68F]/70 italic">
                        + {formatCurrency(Number(c.saldo_inicial))}
                      </td>
                      <td className="py-3 px-4 text-center text-xs text-gray-600 italic">—</td>
                    </tr>
                  )
                })}
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
                            onClick={() => iniciarEdicao(item)}
                            title="Editar Lançamento"
                            aria-label={`Editar lançamento ${item.descricao || item.data}`}
                            className="p-1.5 text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 rounded transition-colors cursor-pointer mr-1"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExcluirLancamento(item.id)}
                            title="Excluir Lançamento"
                            aria-label={`Excluir lançamento ${item.descricao || item.data}`}
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
              <tfoot className="border-t-2 border-[#232B36] bg-[#0B0F14] text-sm">
                <tr>
                  <td
                    colSpan={5}
                    className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-400 font-semibold"
                  >
                    Total de Créditos{' '}
                    <span className="normal-case font-normal">
                      (saldos iniciais + entradas realizadas)
                    </span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-[#00D68F] whitespace-nowrap">
                    + {formatCurrency(totaisExtrato.creditos)}
                  </td>
                  <td aria-hidden="true" />
                </tr>
                <tr>
                  <td
                    colSpan={5}
                    className="py-2.5 px-4 text-right text-xs uppercase tracking-wide text-gray-400 font-semibold"
                  >
                    Total de Débitos{' '}
                    <span className="normal-case font-normal">(saídas realizadas)</span>
                  </td>
                  <td className="py-2.5 px-4 text-right font-mono font-bold text-[#FF5C5C] whitespace-nowrap">
                    − {formatCurrency(totaisExtrato.debitos)}
                  </td>
                  <td aria-hidden="true" />
                </tr>
                <tr className="border-t border-[#232B36]">
                  <td colSpan={5} className="py-3 px-4 text-right text-white font-bold text-sm">
                    Saldo Atual{' '}
                    <span className="font-normal text-xs text-gray-400">
                      (= saldos iniciais + créditos − débitos realizados; previsto não entra)
                    </span>
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-mono font-bold whitespace-nowrap ${
                      totaisExtrato.saldoAtual < 0 ? 'text-[#FF5C5C]' : 'text-white'
                    }`}
                  >
                    {formatCurrency(totaisExtrato.saldoAtual)}
                  </td>
                  <td aria-hidden="true" />
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* TABELA ANUAL: recorrentes e parcelados, jan–dez do ano corrente.
          Segue a segregação patrimonial do Passo 1: com um financeiro selecionado,
          mostra só os recorrentes dele; sem seleção, mostra todas as empresas. */}
      <TabelaAnualRecorrentes
        recorrentes={recorrentes}
        lancamentos={lancamentos}
        financeiros={financeiros}
        financeiroIdFiltro={selectedFinId || null}
        podeGerenciar={podeGerenciarRecorrente}
        onEditar={iniciarEdicaoRecorrente}
        onExcluir={(r) => setRecorrenteParaExcluir(r)}
      />

      {/* RECEBÍVEIS SEM DATA: contratos a receber sem data definida, fora da projeção */}
      <RecebiveisSemData
        financeiros={financeiros}
        planos={planos}
        financeiroPadraoId={selectedFinId || undefined}
      />

      {/* Confirmação de exclusão de recorrente (Projeção Anual) */}
      <AlertDialog
        open={!!recorrenteParaExcluir}
        onOpenChange={(aberto) => {
          if (!aberto) setRecorrenteParaExcluir(null)
        }}
      >
        <AlertDialogContent className="bg-[#141A22] border-[#232B36] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento recorrente?</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              {recorrenteParaExcluir && (
                <>
                  “{recorrenteParaExcluir.descricao}” deixará de ser gerado a partir do próximo mês
                  e sairá da Projeção Anual e do Fluxo de Caixa. Lançamentos já realizados não são
                  apagados.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-[#0B0F14] border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer">
              Manter recorrente
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (recorrenteParaExcluir) {
                  handleExcluirRecorrente(recorrenteParaExcluir)
                }
                setRecorrenteParaExcluir(null)
              }}
              className="bg-[#FF5C5C] hover:bg-[#FF5C5C]/85 text-[#0B0F14] font-bold cursor-pointer"
            >
              Sim, excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
