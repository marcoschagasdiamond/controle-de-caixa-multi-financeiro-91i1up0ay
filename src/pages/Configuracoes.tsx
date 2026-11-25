import React, { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FinanceiroService, TotalPorCategoria, PeriodoTotais } from '@/services/financeiro'
import {
  Financeiro,
  ContaBancaria,
  PlanoConta,
  PlanoGrupo,
  ContaFixa,
  LancamentoRecorrente,
} from '@/types/financeiro'
import { formatCurrency, getTodayISODate } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Building2,
  Wallet,
  BookOpen,
  FolderPlus,
  CalendarClock,
  Repeat,
  Plus,
  Trash2,
  Edit2,
  PowerOff,
  Power,
  Copy,
  Search,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
  Download,
  BarChart3,
  Users,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/hooks/use-auth'
import { useAcessoFinanceiros } from '@/hooks/use-acesso-financeiros'
import RelatorioContas from '@/components/RelatorioContas'
import AbaEquipe from '@/components/AbaEquipe'
import ArvorePlanoContas from '@/components/ArvorePlanoContas'
import FormularioGrupo, { ModoGrupo } from '@/components/FormularioGrupo'

// Chaves de persistência dos filtros no navegador
const LS_FILTRO_CONTA_FIN = 'ccmf_filtro_conta_financeiro'
const LS_FILTRO_CONTA_TIPO = 'ccmf_filtro_conta_tipo'
const LS_FILTRO_FIXA_FIN = 'ccmf_filtro_fixa_financeiro'

function lerFiltroSalvo(chave: string): string {
  try {
    return window.localStorage.getItem(chave) || 'todos'
  } catch {
    return 'todos'
  }
}

export default function ConfiguracoesPage() {
  const { toast } = useToast()
  const { user } = useAuth()
  // Apenas o master (dono) vê a aba Equipe
  const { isMaster, podeCriarEmpresas } = useAcessoFinanceiros()
  const [searchParams] = useSearchParams()
  const TABS_VALIDAS = [
    'financeiros',
    'contas',
    'plano',
    'fixas',
    'recorrentes',
    'relatorio',
    'equipe',
  ]
  const tabUrl = searchParams.get('tab') || ''
  const initialTab = TABS_VALIDAS.includes(tabUrl) ? tabUrl : 'financeiros'

  const [activeTab, setActiveTab] = useState(initialTab)
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [contasFixas, setContasFixas] = useState<ContaFixa[]>([])
  const [loading, setLoading] = useState(true)

  // Estados de formulário para cada aba
  // 1. Financeiro
  const [finNome, setFinNome] = useState('')
  const [finTipo, setFinTipo] = useState<'PF' | 'PJ'>('PJ')
  const [finCpfCnpj, setFinCpfCnpj] = useState('')
  const [finSocios, setFinSocios] = useState('')
  const [finRegime, setFinRegime] = useState('Simples Nacional')
  const [finCor, setFinCor] = useState('#00D68F')
  const [savingFin, setSavingFin] = useState(false)

  // 2. Conta Bancária
  const [ctaFinId, setCtaFinId] = useState('')
  const [ctaBanco, setCtaBanco] = useState('')
  const [ctaAgencia, setCtaAgencia] = useState('')
  const [ctaConta, setCtaConta] = useState('')
  const [ctaTipo, setCtaTipo] = useState('Corrente')
  const [ctaPix, setCtaPix] = useState('')
  const [ctaSaldoInicial, setCtaSaldoInicial] = useState('0')
  const [savingCta, setSavingCta] = useState(false)
  const [editingContaId, setEditingContaId] = useState<string | null>(null)

  // 3. Plano de Contas
  const [planoCodigo, setPlanoCodigo] = useState('')
  const [planoDesc, setPlanoDesc] = useState('')
  const [planoTipo, setPlanoTipo] = useState<'receita' | 'despesa'>('despesa')
  const [savingPlano, setSavingPlano] = useState(false)
  const [editingPlanoId, setEditingPlanoId] = useState<string | null>(null)
  const [duplicandoPlanoId, setDuplicandoPlanoId] = useState<string | null>(null)
  // ===== Hierarquia REAL do plano de contas (grupos_plano_contas) =====
  const [grupos, setGrupos] = useState<PlanoGrupo[]>([])
  const [abertos, setAbertos] = useState<Set<string>>(new Set())
  const [modoGrupo, setModoGrupo] = useState<ModoGrupo>(null)
  const [movendoPlanoId, setMovendoPlanoId] = useState<string | null>(null)
  const [planoGrupoId, setPlanoGrupoId] = useState('')
  // Busca por código ou descrição na listagem do plano
  const [planoBusca, setPlanoBusca] = useState('')
  // Total lançado por categoria (somente realizados) e período selecionado
  const [periodoTotais, setPeriodoTotais] = useState<PeriodoTotais>('ano')
  const [totaisPorCategoria, setTotaisPorCategoria] = useState<Map<string, TotalPorCategoria>>(
    new Map(),
  )

  const toggleGrupo = (id: string) =>
    setAbertos((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  // Filtros da listagem de Contas Bancárias (persistidos no navegador)
  const [filtroContaFin, setFiltroContaFin] = useState<string>(() =>
    lerFiltroSalvo(LS_FILTRO_CONTA_FIN),
  )
  const [filtroContaTipo, setFiltroContaTipo] = useState<string>(() =>
    lerFiltroSalvo(LS_FILTRO_CONTA_TIPO),
  )
  // Filtro da listagem de Contas Fixas (persistido no navegador)
  const [filtroFixaFin, setFiltroFixaFin] = useState<string>(() =>
    lerFiltroSalvo(LS_FILTRO_FIXA_FIN),
  )

  // Grava cada filtro no localStorage ao mudar
  useEffect(() => {
    try {
      window.localStorage.setItem(LS_FILTRO_CONTA_FIN, filtroContaFin)
      window.localStorage.setItem(LS_FILTRO_CONTA_TIPO, filtroContaTipo)
      window.localStorage.setItem(LS_FILTRO_FIXA_FIN, filtroFixaFin)
    } catch {
      /* localStorage indisponível: filtros seguem em memória */
    }
  }, [filtroContaFin, filtroContaTipo, filtroFixaFin])

  // 4. Conta Fixa
  const [fixaFinId, setFixaFinId] = useState('')
  const [fixaDesc, setFixaDesc] = useState('')
  const [fixaValor, setFixaValor] = useState('0')
  const [fixaDia, setFixaDia] = useState('10')
  const [fixaTipo, setFixaTipo] = useState<'receita' | 'despesa'>('despesa')
  const [savingFixa, setSavingFixa] = useState(false)

  // 5. Lançamentos Recorrentes
  const [recorrentes, setRecorrentes] = useState<LancamentoRecorrente[]>([])
  const [recFinId, setRecFinId] = useState('')
  const [recContaId, setRecContaId] = useState('')
  const [recPlanoId, setRecPlanoId] = useState('')
  const [recDesc, setRecDesc] = useState('')
  const [recValor, setRecValor] = useState('0')
  const [recDia, setRecDia] = useState('10')
  const [recTipo, setRecTipo] = useState<'credito' | 'debito'>('debito')
  const [savingRec, setSavingRec] = useState(false)
  const [editingRecId, setEditingRecId] = useState<string | null>(null)
  const [togglingRecId, setTogglingRecId] = useState<string | null>(null)
  const [recPlanoFiltrado, setRecPlanoFiltrado] = useState<PlanoConta[]>([])

  const carregarTudo = async () => {
    try {
      setLoading(true)
      const [fins, cts, pls, gps, cfs, recs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getPlanoGrupos(),
        FinanceiroService.getContasFixas(),
        FinanceiroService.getLancamentosRecorrentes(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setPlanos(pls)
      setGrupos(gps)
      // Expansão: abre tudo por padrão na primeira carga
      setAbertos((prev) => {
        if (prev.size > 0) return prev
        return new Set(gps.map((g) => g.id))
      })
      setContasFixas(cfs)
      setRecorrentes(recs)

      if (fins.length > 0) {
        if (!ctaFinId) setCtaFinId(fins[0].id)
        if (!fixaFinId) setFixaFinId(fins[0].id)
        if (!recFinId) setRecFinId(fins[0].id)
      }
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar configurações',
        description: err.message,
      })
    } finally {
      setLoading(false)
    }
  }

  // Membro que cair em ?tab=equipe volta para a primeira aba (sem acesso)
  useEffect(() => {
    if (!isMaster && activeTab === 'equipe') setActiveTab('financeiros')
  }, [isMaster, activeTab])

  useEffect(() => {
    carregarTudo()
  }, [])

  // Totais por categoria: recalculados ao trocar o período (uma consulta agrupada)
  useEffect(() => {
    let ativo = true
    FinanceiroService.getTotaisPorCategoria(periodoTotais)
      .then((t) => {
        if (ativo) setTotaisPorCategoria(t)
      })
      .catch((err: any) => {
        console.error(err)
        if (ativo) setTotaisPorCategoria(new Map())
      })
    return () => {
      ativo = false
    }
  }, [periodoTotais])

  // Handlers de Criação
  const handleCriarFinanceiro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!finNome.trim()) return
    // Proteção dupla (a UI já esconde o formulário): membro sem a
    // permissão "pode criar empresas" não cadastra.
    if (user && !isMaster && !podeCriarEmpresas) {
      toast({
        variant: 'destructive',
        title: 'Sem autorização',
        description: 'Solicite autorização ao master para cadastrar empresas.',
      })
      return
    }
    try {
      setSavingFin(true)
      await FinanceiroService.createFinanceiro({
        nome: finNome.trim(),
        tipo: finTipo,
        cpf_cnpj: finCpfCnpj.trim() || null,
        socios: finSocios.trim() || null,
        regime_tributario: finTipo === 'PJ' ? finRegime : null,
        cor: finCor,
      })
      toast({ title: 'Financeiro cadastrado com sucesso!' })
      setFinNome('')
      setFinCpfCnpj('')
      setFinSocios('')
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao cadastrar', description: err.message })
    } finally {
      setSavingFin(false)
    }
  }

  const handleExcluirFinanceiro = async (id: string) => {
    if (
      !window.confirm(
        'Atenção: Ao excluir o financeiro, lançamentos vinculados podem ser afetados. Confirmar?',
      )
    )
      return
    try {
      await FinanceiroService.deleteFinanceiro(id)
      toast({ title: 'Financeiro removido.' })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  // Listas filtradas
  const tiposConta = ['Corrente', 'Poupança', 'Aplicação']
  const contasFiltradas = contas.filter(
    (c) =>
      (filtroContaFin === 'todos' || c.financeiro_id === filtroContaFin) &&
      (filtroContaTipo === 'todos' || c.tipo === filtroContaTipo),
  )
  const contasFixasFiltradas = contasFixas.filter(
    (cf) => filtroFixaFin === 'todos' || cf.financeiro_id === filtroFixaFin,
  )
  // Busca do plano de contas: filtra em tempo real por código OU descrição
  const planosFiltrados = useMemo(() => {
    const q = planoBusca.trim().toLowerCase()
    if (!q) return planos
    const filtrados = planos.filter(
      (p) => p.codigo.toLowerCase().includes(q) || p.descricao.toLowerCase().includes(q),
    )
    // Na árvore, o grupo de uma categoria encontrada também fica visível
    const idsGrupo = new Set(filtrados.map((p) => p.grupo_id).filter(Boolean) as string[])
    return filtrados
  }, [planos, planoBusca])

  const limparFormConta = () => {
    setEditingContaId(null)
    setCtaBanco('')
    setCtaAgencia('')
    setCtaConta('')
    setCtaPix('')
    setCtaSaldoInicial('0')
  }

  const iniciarEdicaoConta = (c: ContaBancaria) => {
    setEditingContaId(c.id)
    setCtaFinId(c.financeiro_id)
    setCtaBanco(c.banco)
    setCtaAgencia(c.agencia || '')
    setCtaConta(c.conta)
    setCtaTipo(c.tipo)
    setCtaPix(c.pix || '')
    setCtaSaldoInicial(String(c.saldo_inicial ?? 0))
  }

  const handleSalvarConta = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ctaFinId || !ctaBanco.trim() || !ctaConta.trim()) return
    try {
      setSavingCta(true)
      if (editingContaId) {
        await FinanceiroService.updateConta(editingContaId, {
          financeiro_id: ctaFinId,
          banco: ctaBanco.trim(),
          agencia: ctaAgencia.trim() || null,
          conta: ctaConta.trim(),
          tipo: ctaTipo,
          pix: ctaPix.trim() || null,
          saldo_inicial: parseFloat(ctaSaldoInicial) || 0,
        })
        toast({ title: 'Conta bancária atualizada com sucesso!' })
      } else {
        await FinanceiroService.createConta({
          financeiro_id: ctaFinId,
          banco: ctaBanco.trim(),
          agencia: ctaAgencia.trim() || null,
          conta: ctaConta.trim(),
          tipo: ctaTipo,
          pix: ctaPix.trim() || null,
          saldo_inicial: parseFloat(ctaSaldoInicial) || 0,
          ativo: true,
        })
        toast({ title: 'Conta bancária cadastrada com segregação!' })
      }
      limparFormConta()
      await carregarTudo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: editingContaId ? 'Erro ao atualizar conta' : 'Erro ao criar conta',
        description: err.message,
      })
    } finally {
      setSavingCta(false)
    }
  }

  const handleExcluirConta = async (id: string) => {
    if (!window.confirm('Confirmar exclusão da conta bancária?')) return
    try {
      await FinanceiroService.deleteConta(id)
      toast({ title: 'Conta excluída.' })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  const limparFormPlano = () => {
    setEditingPlanoId(null)
    setPlanoCodigo('')
    setPlanoDesc('')
    setPlanoTipo('despesa')
    setPlanoGrupoId('')
  }

  const iniciarEdicaoPlano = (p: PlanoConta) => {
    setEditingPlanoId(p.id)
    setPlanoCodigo(p.codigo)
    setPlanoDesc(p.descricao)
    setPlanoTipo(p.tipo)
    setPlanoGrupoId(p.grupo_id || '')
  }

  const handleSalvarPlano = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planoCodigo.trim() || !planoDesc.trim()) return
    const grupoSelecionado = grupos.find((g) => g.id === planoGrupoId)
    if (!grupoSelecionado) {
      toast({
        variant: 'destructive',
        title: 'Selecione um grupo',
        description: 'Toda categoria pertence a um grupo do mesmo tipo.',
      })
      return
    }
    if (grupoSelecionado.tipo !== planoTipo) {
      toast({
        variant: 'destructive',
        title: 'Grupo de outro tipo',
        description: `A categoria é de ${planoTipo} e o grupo escolhido é de ${grupoSelecionado.tipo}.`,
      })
      return
    }
    try {
      setSavingPlano(true)
      if (editingPlanoId) {
        await FinanceiroService.updatePlanoConta(editingPlanoId, {
          codigo: planoCodigo.trim(),
          descricao: planoDesc.trim(),
          tipo: planoTipo,
          grupo_id: planoGrupoId,
        })
        toast({ title: 'Categoria atualizada com sucesso!' })
      } else {
        await FinanceiroService.createPlanoConta({
          codigo: planoCodigo.trim(),
          descricao: planoDesc.trim(),
          tipo: planoTipo,
          grupo_id: planoGrupoId,
          ativo: true,
        })
        toast({ title: 'Categoria adicionada ao Plano de Contas Global!' })
      }
      limparFormPlano()
      await carregarTudo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: editingPlanoId ? 'Erro ao atualizar categoria' : 'Erro ao criar categoria',
        description: err.message,
      })
    } finally {
      setSavingPlano(false)
    }
  }

  const handleExcluirPlano = async (id: string) => {
    if (!window.confirm('Confirmar exclusão da categoria?')) return
    try {
      await FinanceiroService.deletePlanoConta(id)
      toast({ title: 'Categoria excluída.' })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  // ===== GRUPOS: mover categoria, criar/renomear/excluir grupo =====
  const handleMoverCategoria = async (planoContaId: string, grupoId: string) => {
    try {
      setMovendoPlanoId(planoContaId)
      await FinanceiroService.moverCategoriaParaGrupo(planoContaId, grupoId)
      toast({ title: 'Categoria movida para o grupo com sucesso!' })
      await carregarTudo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao mover categoria de grupo',
        description: err?.message || 'Verifique o tipo do grupo de destino.',
      })
    } finally {
      setMovendoPlanoId(null)
    }
  }

  const handleExcluirGrupo = async (g: PlanoGrupo) => {
    const filhas = planos.filter((p) => p.grupo_id === g.id).length
    if (
      !window.confirm(
        `Excluir o grupo "${g.nome}"? As ${filhas} categoria(s) vinculadas serão EXCLUÍDAS JUNTO (exclusão em cascata).`,
      )
    )
      return
    try {
      await FinanceiroService.deletePlanoGrupo(g.id)
      toast({
        title: 'Grupo excluído.',
        description: `${filhas} categoria(s) foram removidas junto (cascata).`,
      })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir grupo', description: err.message })
    }
  }

  const handleDuplicarPlano = async (p: PlanoConta) => {
    try {
      setDuplicandoPlanoId(p.id)
      await FinanceiroService.duplicarPlanoConta(p)
      toast({ title: 'Categoria duplicada com sucesso!' })
      await Promise.all([
        carregarTudo(),
        FinanceiroService.getTotaisPorCategoria(periodoTotais).then(setTotaisPorCategoria),
      ])
    } catch (err: any) {
      const msg =
        err?.code === '23505' || /duplicate key|unique/i.test(err?.message || '')
          ? 'Não foi possível gerar um código/descrição únicos para a cópia. Renomeie a categoria original e tente novamente.'
          : err?.message
      toast({ variant: 'destructive', title: 'Erro ao duplicar categoria', description: msg })
    } finally {
      setDuplicandoPlanoId(null)
    }
  }

  const handleCriarFixa = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fixaFinId || !fixaDesc.trim()) return
    try {
      setSavingFixa(true)
      await FinanceiroService.createContaFixa({
        financeiro_id: fixaFinId,
        descricao: fixaDesc.trim(),
        valor_estimado: parseFloat(fixaValor) || 0,
        dia_vencimento: parseInt(fixaDia, 10) || 10,
        tipo: fixaTipo,
        ativo: true,
      })
      toast({ title: 'Conta fixa recorrente registrada!' })
      setFixaDesc('')
      setFixaValor('0')
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao criar conta fixa', description: err.message })
    } finally {
      setSavingFixa(false)
    }
  }

  const handleExcluirFixa = async (id: string) => {
    if (!window.confirm('Confirmar exclusão desta conta fixa?')) return
    try {
      await FinanceiroService.deleteContaFixa(id)
      toast({ title: 'Conta fixa removida.' })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  // ===== LANÇAMENTOS RECORRENTES =====
  const limparFormRecorrente = () => {
    setEditingRecId(null)
    setRecContaId('')
    setRecPlanoId('')
    setRecDesc('')
    setRecValor('0')
    setRecDia('10')
    setRecTipo('debito')
  }

  // Plano de contas é GLOBAL: o select de categorias dos recorrentes usa todas
  useEffect(() => {
    setRecPlanoFiltrado(planos)
  }, [planos])

  const iniciarEdicaoRecorrente = (r: LancamentoRecorrente) => {
    setEditingRecId(r.id)
    setRecFinId(r.financeiro_id)
    setRecContaId(r.conta_id)
    setRecPlanoId(r.plano_conta_id)
    setRecDesc(r.descricao)
    setRecValor(String(r.valor))
    setRecDia(String(r.dia_mes))
    setRecTipo(r.tipo)
  }

  const handleSalvarRecorrente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!recFinId || !recContaId || !recPlanoId || !recDesc.trim()) return
    try {
      setSavingRec(true)
      const payload = {
        financeiro_id: recFinId,
        conta_id: recContaId,
        plano_conta_id: recPlanoId,
        descricao: recDesc.trim(),
        valor: parseFloat(recValor) || 0,
        dia_mes: parseInt(recDia, 10) || 10,
        tipo: recTipo,
        status: 'previsto' as const,
      }
      if (editingRecId) {
        await FinanceiroService.updateLancamentoRecorrente(editingRecId, payload)
        toast({ title: 'Lançamento recorrente atualizado com sucesso!' })
      } else {
        await FinanceiroService.createLancamentoRecorrente({
          ...payload,
          data_inicial: getTodayISODate(),
        })
        toast({ title: 'Lançamento recorrente cadastrado com sucesso!' })
      }
      limparFormRecorrente()
      await carregarTudo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: editingRecId ? 'Erro ao atualizar recorrente' : 'Erro ao criar recorrente',
        description: err.message,
      })
    } finally {
      setSavingRec(false)
    }
  }

  const handleToggleAtivoRecorrente = async (r: LancamentoRecorrente) => {
    try {
      setTogglingRecId(r.id)
      await FinanceiroService.updateLancamentoRecorrente(r.id, { ativo: !r.ativo })
      toast({
        title: r.ativo ? 'Recorrente desativado.' : 'Recorrente ativado.',
        description: r.ativo
          ? 'Ele deixa de aparecer no saldo projetado e nos próximos vencimentos.'
          : 'Voltou a entrar na projeção de caixa.',
      })
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao alterar status', description: err.message })
    } finally {
      setTogglingRecId(null)
    }
  }

  const handleExcluirRecorrente = async (id: string) => {
    if (!window.confirm('Confirmar exclusão definitiva deste lançamento recorrente?')) return
    try {
      await FinanceiroService.deleteLancamentoRecorrente(id)
      toast({ title: 'Recorrente excluído.' })
      await carregarTudo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir recorrente',
        description: err.message,
      })
    }
  }

  // Exporta as contas visíveis (respeitando filtros) em CSV pt-BR (BOM + separador ';')
  const handleExportarContasCSV = () => {
    if (contasFiltradas.length === 0) {
      toast({ title: 'Nenhuma conta para exportar com os filtros atuais.' })
      return
    }
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? '' : String(v)
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const linhas: string[] = []
    linhas.push(
      ['Financeiro', 'Banco', 'Agência', 'Conta', 'Tipo', 'PIX', 'Saldo Inicial (R$)']
        .map(esc)
        .join(';'),
    )
    for (const c of contasFiltradas) {
      const fin = financeiros.find((f) => f.id === c.financeiro_id)
      linhas.push(
        [
          fin?.nome || '-',
          c.banco,
          c.agencia || '',
          c.conta,
          c.tipo,
          c.pix || '',
          Number(c.saldo_inicial).toFixed(2).replace('.', ','),
        ]
          .map(esc)
          .join(';'),
      )
    }
    const conteudo = '\uFEFF' + linhas.join('\r\n')
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const hoje = new Date()
    const stamp = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-${String(
      hoje.getDate(),
    ).padStart(2, '0')}`
    const a = document.createElement('a')
    a.href = url
    a.download = `contas-bancarias-${stamp}.csv`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    toast({
      title: 'Exportação concluída!',
      description: `${contasFiltradas.length} conta(s) exportada(s) em CSV (Excel pt-BR).`,
    })
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Configurações & Gestão de Cadastros
        </h1>
        <p className="text-sm text-gray-400">
          Gerencie entidades financeiras, contas bancárias segregadas, plano de contas e despesas
          fixas
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="bg-[#141A22] border border-[#232B36] p-1 flex flex-wrap gap-1 w-full justify-start">
          <TabsTrigger
            value="financeiros"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <Building2 className="w-3.5 h-3.5 mr-1.5" />
            1. Financeiros ({financeiros.length})
          </TabsTrigger>
          <TabsTrigger
            value="contas"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <Wallet className="w-3.5 h-3.5 mr-1.5" />
            2. Contas Bancárias ({contas.length})
          </TabsTrigger>
          <TabsTrigger
            value="plano"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <BookOpen className="w-3.5 h-3.5 mr-1.5" />
            3. Plano de Contas ({planos.length})
          </TabsTrigger>
          <TabsTrigger
            value="fixas"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <CalendarClock className="w-3.5 h-3.5 mr-1.5" />
            4. Contas Fixas ({contasFixas.length})
          </TabsTrigger>
          <TabsTrigger
            value="recorrentes"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <Repeat className="w-3.5 h-3.5 mr-1.5" />
            5. Recorrentes ({recorrentes.length})
          </TabsTrigger>
          <TabsTrigger
            value="relatorio"
            className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
          >
            <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
            Relatório de Contas
          </TabsTrigger>
          {user && isMaster && (
            <TabsTrigger
              value="equipe"
              className="data-[state=active]:bg-[#00D68F] data-[state=active]:text-[#0B0F14] text-xs font-semibold"
            >
              <Users className="w-3.5 h-3.5 mr-1.5" />
              Equipe
            </TabsTrigger>
          )}
        </TabsList>

        {/* TAB 1: FINANCEIROS */}
        <TabsContent value="financeiros" className="space-y-6 mt-4">
          <Card className="bg-[#141A22] border-[#232B36] text-white">
            <CardHeader className="pb-3 border-b border-[#232B36]">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Building2 className="w-4 h-4 text-[#00D68F]" />
                Cadastrar Nova Entidade Financeira
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              {/* Membro sem permissão: formulário bloqueado com aviso claro */}
              {user && !isMaster && !podeCriarEmpresas && (
                <Alert className="mb-4 bg-[#0B0F14] border-[#FFB020]/40 text-white">
                  <AlertTriangle className="w-4 h-4 text-[#FFB020]" />
                  <AlertDescription className="text-xs text-gray-300">
                    Você não tem autorização para cadastrar novas empresas.{' '}
                    <span className="font-semibold text-[#FFB020]">
                      Solicite autorização ao master.
                    </span>
                  </AlertDescription>
                </Alert>
              )}
              {(!user || isMaster || podeCriarEmpresas) && (
                <form onSubmit={handleCriarFinanceiro} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <Label className="text-xs text-gray-400">Tipo de Entidade</Label>
                      <select
                        value={finTipo}
                        onChange={(e) => setFinTipo(e.target.value as any)}
                        className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                      >
                        <option value="PJ">Pessoa Jurídica (PJ)</option>
                        <option value="PF">Pessoa Física (PF)</option>
                      </select>
                    </div>

                    <div>
                      <Label className="text-xs text-gray-400">Nome / Razão Social *</Label>
                      <Input
                        required
                        value={finNome}
                        onChange={(e) => setFinNome(e.target.value)}
                        placeholder="Ex: Minha Empresa Ltda"
                        className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-gray-400">
                        {finTipo === 'PJ' ? 'CNPJ' : 'CPF'}
                      </Label>
                      <Input
                        value={finCpfCnpj}
                        onChange={(e) => setFinCpfCnpj(e.target.value)}
                        placeholder="00.000.000/0001-00"
                        className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-gray-400">Regime Tributário / Ocupação</Label>
                      <Input
                        value={finRegime}
                        onChange={(e) => setFinRegime(e.target.value)}
                        placeholder="Simples Nacional"
                        className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-gray-400">Sócios / Quadro Societário</Label>
                      <Input
                        value={finSocios}
                        onChange={(e) => setFinSocios(e.target.value)}
                        placeholder="Sócios participantes"
                        className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                      />
                    </div>

                    <div>
                      <Label className="text-xs text-gray-400">Cor de Identificação</Label>
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="color"
                          value={finCor}
                          onChange={(e) => setFinCor(e.target.value)}
                          className="w-9 h-9 rounded border border-[#232B36] bg-transparent cursor-pointer"
                        />
                        <span className="font-mono text-xs text-gray-400">{finCor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end pt-2">
                    <Button
                      type="submit"
                      disabled={savingFin}
                      className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                    >
                      Salvar Financeiro
                    </Button>
                  </div>
                </form>
              )}
            </CardContent>
          </Card>

          {/* Lista de Financeiros */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {financeiros.map((f) => (
              <Card key={f.id} className="bg-[#141A22] border-[#232B36] text-white p-4 relative">
                <div
                  className="absolute top-0 left-0 bottom-0 w-1.5 rounded-l-lg"
                  style={{ backgroundColor: f.cor || '#00D68F' }}
                />
                <div className="pl-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm text-white">{f.nome}</span>
                    <Badge variant="outline" style={{ borderColor: f.cor, color: f.cor }}>
                      {f.tipo}
                    </Badge>
                  </div>
                  <p className="text-xs text-gray-400 mt-1">{f.cpf_cnpj || 'Sem documento'}</p>
                  {f.socios && (
                    <p className="text-[11px] text-gray-500 mt-0.5">Sócios: {f.socios}</p>
                  )}

                  <div className="mt-3 pt-3 border-t border-[#232B36] flex justify-end">
                    <button
                      onClick={() => handleExcluirFinanceiro(f.id)}
                      className="text-xs text-gray-500 hover:text-[#FF5C5C] flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remover
                    </button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 2: CONTAS BANCÁRIAS */}
        <TabsContent value="contas" className="space-y-6 mt-4">
          <Card className="bg-[#141A22] border-[#232B36] text-white">
            <CardHeader className="pb-3 border-b border-[#232B36]">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#00D68F]" />
                {editingContaId ? 'Editar Conta Bancária' : 'Adicionar Conta Bancária Segregada'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSalvarConta} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Financeiro Dono da Conta *</Label>
                    <select
                      value={ctaFinId}
                      onChange={(e) => setCtaFinId(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      {financeiros.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} ({f.tipo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Banco / Instituição *</Label>
                    <Input
                      required
                      value={ctaBanco}
                      onChange={(e) => setCtaBanco(e.target.value)}
                      placeholder="Ex: Itaú, Nubank, Bradesco"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Agência</Label>
                    <Input
                      value={ctaAgencia}
                      onChange={(e) => setCtaAgencia(e.target.value)}
                      placeholder="0001"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Número da Conta *</Label>
                    <Input
                      required
                      value={ctaConta}
                      onChange={(e) => setCtaConta(e.target.value)}
                      placeholder="12345-6"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Tipo de Conta</Label>
                    <select
                      value={ctaTipo}
                      onChange={(e) => setCtaTipo(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="Corrente">Conta Corrente</option>
                      <option value="Poupança">Conta Poupança</option>
                      <option value="Aplicação">Investimentos</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">PIX</Label>
                    <Input
                      value={ctaPix}
                      onChange={(e) => setCtaPix(e.target.value)}
                      placeholder="Chave Pix, telefone, e-mail ou aleatória"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Saldo Inicial (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={ctaSaldoInicial}
                      onChange={(e) => setCtaSaldoInicial(e.target.value)}
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {editingContaId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={limparFormConta}
                      className="border-[#232B36] text-gray-300 hover:text-white text-xs h-9 cursor-pointer"
                    >
                      Cancelar edição
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={savingCta}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                  >
                    {editingContaId ? 'Atualizar Conta Bancária' : 'Salvar Conta Bancária'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Lista de Contas */}
          <div className="overflow-x-auto bg-[#141A22] border border-[#232B36] rounded-xl">
            {/* Barra de Filtros */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border-b border-[#232B36]">
              <div>
                <Label className="text-[10px] text-gray-400 uppercase font-bold">Financeiro</Label>
                <select
                  value={filtroContaFin}
                  onChange={(e) => setFiltroContaFin(e.target.value)}
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
                  value={filtroContaTipo}
                  onChange={(e) => setFiltroContaTipo(e.target.value)}
                  className="w-full h-8 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                >
                  <option value="todos">Todos os Tipos</option>
                  {tiposConta.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleExportarContasCSV}
                  disabled={contasFiltradas.length === 0}
                  className="border-[#232B36] text-gray-300 hover:text-white text-xs h-8"
                  title="Baixar contas visíveis em CSV (Excel pt-BR)"
                >
                  <Download className="w-3.5 h-3.5 mr-1" />
                  Exportar CSV
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFiltroContaFin('todos')
                    setFiltroContaTipo('todos')
                  }}
                  className="w-full text-xs text-gray-400 hover:text-white h-8"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Banco</th>
                  <th className="py-3 px-4">Agência / Conta</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4">PIX</th>
                  <th className="py-3 px-4 text-right">Saldo Inicial</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {contasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-8 px-4 text-center text-sm text-gray-500">
                      {contas.length === 0
                        ? 'Nenhuma conta bancária cadastrada ainda.'
                        : 'Nenhuma conta encontrada com os filtros selecionados.'}
                    </td>
                  </tr>
                )}
                {contasFiltradas.map((c) => {
                  const fin = financeiros.find((f) => f.id === c.financeiro_id)
                  return (
                    <tr key={c.id} className="hover:bg-[#1A222D]/40">
                      <td className="py-3 px-4 font-semibold text-white">{fin?.nome || '-'}</td>
                      <td className="py-3 px-4 text-white font-medium">{c.banco}</td>
                      <td className="py-3 px-4 font-mono text-xs">
                        Ag: {c.agencia || 'S/A'} - C/C: {c.conta}
                      </td>
                      <td className="py-3 px-4 text-xs">{c.tipo}</td>
                      <td className="py-3 px-4 text-xs font-mono text-gray-400">{c.pix || '-'}</td>
                      <td className="py-3 px-4 text-right font-mono text-white font-bold">
                        {formatCurrency(c.saldo_inicial)}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          onClick={() => iniciarEdicaoConta(c)}
                          title="Editar conta"
                          className="p-1 text-gray-500 hover:text-[#00D68F] cursor-pointer mr-1"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleExcluirConta(c.id)}
                          className="p-1 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TAB 3: PLANO DE CONTAS */}
        <TabsContent value="plano" className="space-y-6 mt-4">
          <Card className="bg-[#141A22] border-[#232B36] text-white">
            <CardHeader className="pb-3 border-b border-[#232B36]">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-[#00D68F]" />
                {editingPlanoId
                  ? 'Editar Categoria do Plano de Contas'
                  : 'Nova Categoria no Plano de Contas'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSalvarPlano} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Código Contábil</Label>
                    <Input
                      required
                      value={planoCodigo}
                      onChange={(e) => setPlanoCodigo(e.target.value)}
                      placeholder="Ex: 2.05"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1 font-mono"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Descrição da Categoria *</Label>
                    <Input
                      required
                      value={planoDesc}
                      onChange={(e) => setPlanoDesc(e.target.value)}
                      placeholder="Ex: Marketing Digital"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Tipo</Label>
                    <select
                      value={planoTipo}
                      onChange={(e) => setPlanoTipo(e.target.value as any)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </div>

                  <div className="md:col-span-3">
                    <Label className="text-xs text-gray-400">Grupo do Plano de Contas *</Label>
                    <select
                      required
                      value={planoGrupoId}
                      onChange={(e) => setPlanoGrupoId(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1 cursor-pointer"
                    >
                      <option value="">Selecione um grupo...</option>
                      {grupos
                        .filter((g) => g.tipo === (planoTipo as string))
                        .map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.nome}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {editingPlanoId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={limparFormPlano}
                      className="border-[#232B36] text-gray-300 hover:text-white text-xs h-9 cursor-pointer"
                    >
                      Cancelar edição
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={savingPlano}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                  >
                    {editingPlanoId ? 'Atualizar Categoria' : 'Salvar Categoria'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Listagem com busca, período e totais */}
          <div className="bg-[#141A22] border border-[#232B36] rounded-xl">
            {/* Busca + seletor de período dos totais */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 p-3 border-b border-[#232B36]">
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={planoBusca}
                  onChange={(e) => setPlanoBusca(e.target.value)}
                  placeholder="Buscar por código ou descrição..."
                  aria-label="Buscar categoria por código ou descrição"
                  className="pl-9 bg-[#0B0F14] border-[#232B36] text-white text-xs"
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setModoGrupo({ modo: 'criar' })}
                  size="sm"
                  className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-8 cursor-pointer"
                >
                  <FolderPlus className="w-3.5 h-3.5 mr-1" />
                  Novo Grupo
                </Button>
                <Label className="text-[10px] text-gray-400 uppercase font-bold whitespace-nowrap">
                  Período dos totais
                </Label>
                <select
                  value={periodoTotais}
                  onChange={(e) => setPeriodoTotais(e.target.value as PeriodoTotais)}
                  aria-label="Período dos totais lançados"
                  className="h-8 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs cursor-pointer"
                >
                  <option value="mes">Mês atual</option>
                  <option value="ano">Ano atual</option>
                  <option value="tudo">Tudo</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto max-h-96">
              <ArvorePlanoContas
                grupos={grupos}
                planosFiltrados={planosFiltrados}
                planos={planos}
                totaisPorCategoria={totaisPorCategoria}
                abertos={abertos}
                onToggleGrupo={toggleGrupo}
                editarCategoria={iniciarEdicaoPlano}
                duplicarCategoria={handleDuplicarPlano}
                excluirCategoria={handleExcluirPlano}
                iniciandoMoverId={movendoPlanoId}
                onMoverCategoria={handleMoverCategoria}
                onRenomearGrupo={(g) => setModoGrupo({ modo: 'editar', grupo: g })}
                onExcluirGrupo={handleExcluirGrupo}
                semGrupos={grupos.length === 0}
              />
            </div>
          </div>

          <FormularioGrupo
            modo={modoGrupo}
            onCancelar={() => setModoGrupo(null)}
            onSalvo={async () => {
              setModoGrupo(null)
              await carregarTudo()
            }}
          />
        </TabsContent>

        {/* TAB 4: CONTAS FIXAS */}
        <TabsContent value="fixas" className="space-y-6 mt-4">
          <Card className="bg-[#141A22] border-[#232B36] text-white">
            <CardHeader className="pb-3 border-b border-[#232B36]">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-[#00D68F]" />
                Cadastrar Conta Fixa Recorrente
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCriarFixa} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Financeiro *</Label>
                    <select
                      value={fixaFinId}
                      onChange={(e) => setFixaFinId(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      {financeiros.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} ({f.tipo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Descrição *</Label>
                    <Input
                      required
                      value={fixaDesc}
                      onChange={(e) => setFixaDesc(e.target.value)}
                      placeholder="Ex: Aluguel da Sede"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Valor Estimado (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={fixaValor}
                      onChange={(e) => setFixaValor(e.target.value)}
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Dia Vencimento (1 a 31)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={fixaDia}
                      onChange={(e) => setFixaDia(e.target.value)}
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Tipo</Label>
                    <select
                      value={fixaTipo}
                      onChange={(e) => setFixaTipo(e.target.value as any)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="despesa">Despesa</option>
                      <option value="receita">Receita</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={savingFixa}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                  >
                    Salvar Conta Fixa
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Listagem */}
          <div className="overflow-x-auto bg-[#141A22] border border-[#232B36] rounded-xl">
            {/* Barra de Filtros */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 p-3 border-b border-[#232B36]">
              <div>
                <Label className="text-[10px] text-gray-400 uppercase font-bold">Financeiro</Label>
                <select
                  value={filtroFixaFin}
                  onChange={(e) => setFiltroFixaFin(e.target.value)}
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
              <div className="flex items-end">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFiltroFixaFin('todos')}
                  className="w-full text-xs text-gray-400 hover:text-white h-8"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4 text-center">Dia Vencimento</th>
                  <th className="py-3 px-4 text-right">Valor Estimado</th>
                  <th className="py-3 px-4 text-center">Tipo</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {contasFixasFiltradas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-8 px-4 text-center text-sm text-gray-500">
                      {contasFixas.length === 0
                        ? 'Nenhuma conta fixa cadastrada ainda.'
                        : 'Nenhuma conta fixa encontrada com os filtros selecionados.'}
                    </td>
                  </tr>
                )}
                {contasFixasFiltradas.map((cf) => {
                  const fin = financeiros.find((f) => f.id === cf.financeiro_id)
                  return (
                    <tr key={cf.id} className="hover:bg-[#1A222D]/40">
                      <td className="py-2.5 px-4 font-semibold text-white">{fin?.nome || '-'}</td>
                      <td className="py-2.5 px-4 text-white font-medium">{cf.descricao}</td>
                      <td className="py-2.5 px-4 text-center font-mono text-xs text-amber-400">
                        Dia {cf.dia_vencimento}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(cf.valor_estimado)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            cf.tipo === 'receita'
                              ? 'text-[#00D68F] border-[#00D68F]/30'
                              : 'text-[#FF5C5C] border-[#FF5C5C]/30'
                          }`}
                        >
                          {cf.tipo}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => handleExcluirFixa(cf.id)}
                          className="p-1 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TAB 5: LANÇAMENTOS RECORRENTES */}
        <TabsContent value="recorrentes" className="space-y-6 mt-4">
          <Card className="bg-[#141A22] border-[#232B36] text-white">
            <CardHeader className="pb-3 border-b border-[#232B36]">
              <CardTitle className="text-base text-white flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#00D68F]" />
                {editingRecId
                  ? 'Editar Lançamento Recorrente'
                  : 'Cadastrar Lançamento Recorrente Mensal'}
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleSalvarRecorrente} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Financeiro *</Label>
                    <select
                      value={recFinId}
                      onChange={(e) => {
                        setRecFinId(e.target.value)
                        setRecContaId('')
                        setRecPlanoId('')
                      }}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      {financeiros.map((f) => (
                        <option key={f.id} value={f.id}>
                          {f.nome} ({f.tipo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Conta Bancária *</Label>
                    <select
                      value={recContaId}
                      onChange={(e) => setRecContaId(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="">Selecione uma conta</option>
                      {contas
                        .filter((c) => c.financeiro_id === recFinId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.banco} - {c.conta}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Plano de Contas *</Label>
                    <select
                      value={recPlanoId}
                      onChange={(e) => setRecPlanoId(e.target.value)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="">Selecione uma categoria</option>
                      {recPlanoFiltrado.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigo} - {p.descricao} ({p.tipo})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Descrição *</Label>
                    <Input
                      required
                      value={recDesc}
                      onChange={(e) => setRecDesc(e.target.value)}
                      placeholder="Ex: Salário, Aluguel, Internet"
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Valor (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={recValor}
                      onChange={(e) => setRecValor(e.target.value)}
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Dia do Mês (1 a 31)</Label>
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      value={recDia}
                      onChange={(e) => setRecDia(e.target.value)}
                      className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Tipo</Label>
                    <select
                      value={recTipo}
                      onChange={(e) => setRecTipo(e.target.value as any)}
                      className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                    >
                      <option value="debito">Débito (saída)</option>
                      <option value="credito">Crédito (entrada)</option>
                    </select>
                  </div>
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  {editingRecId && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={limparFormRecorrente}
                      className="border-[#232B36] text-gray-300 hover:text-white text-xs h-9 cursor-pointer"
                    >
                      Cancelar edição
                    </Button>
                  )}
                  <Button
                    type="submit"
                    disabled={savingRec}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                  >
                    {editingRecId ? 'Atualizar Recorrente' : 'Salvar Recorrente'}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Listagem */}
          <div className="overflow-x-auto bg-[#141A22] border border-[#232B36] rounded-xl">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Conta / Categoria</th>
                  <th className="py-3 px-4 text-center">Dia</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Tipo</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {recorrentes.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-8 px-4 text-center text-sm text-gray-500">
                      Nenhum lançamento recorrente cadastrado ainda.
                    </td>
                  </tr>
                )}
                {recorrentes.map((r) => {
                  const fin = financeiros.find((f) => f.id === r.financeiro_id)
                  const conta = contas.find((c) => c.id === r.conta_id)
                  const plano = planos.find((p) => p.id === r.plano_conta_id)
                  return (
                    <tr
                      key={r.id}
                      className={`hover:bg-[#1A222D]/40 ${!r.ativo ? 'opacity-50' : ''}`}
                    >
                      <td className="py-2.5 px-4 font-semibold text-white">{fin?.nome || '-'}</td>
                      <td className="py-2.5 px-4 text-white font-medium">{r.descricao}</td>
                      <td className="py-2.5 px-4 text-xs">
                        <div>{conta ? `${conta.banco} - ${conta.conta}` : '-'}</div>
                        <div className="text-[11px] text-gray-500">
                          {plano ? `${plano.codigo} - ${plano.descricao}` : 'Sem categoria'}
                        </div>
                      </td>
                      <td className="py-2.5 px-4 text-center font-mono text-xs text-amber-400">
                        Dia {r.dia_mes}
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-white">
                        {formatCurrency(r.valor)}
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            r.tipo === 'credito'
                              ? 'text-[#00D68F] border-[#00D68F]/30'
                              : 'text-[#FF5C5C] border-[#FF5C5C]/30'
                          }`}
                        >
                          {r.tipo === 'credito' ? 'Crédito' : 'Débito'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            r.ativo
                              ? 'text-[#00D68F] border-[#00D68F]/30'
                              : 'text-gray-400 border-[#232B36]'
                          }`}
                        >
                          {r.ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => iniciarEdicaoRecorrente(r)}
                          title="Editar recorrente"
                          className="p-1 text-gray-500 hover:text-[#00D68F] cursor-pointer mr-1"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleToggleAtivoRecorrente(r)}
                          disabled={togglingRecId === r.id}
                          title={r.ativo ? 'Desativar recorrente' : 'Ativar recorrente'}
                          className="p-1 text-gray-500 hover:text-amber-400 cursor-pointer mr-1 disabled:opacity-40"
                        >
                          {togglingRecId === r.id ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : r.ativo ? (
                            <PowerOff className="w-4 h-4" />
                          ) : (
                            <Power className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => handleExcluirRecorrente(r.id)}
                          title="Excluir recorrente"
                          className="p-1 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TAB RELATÓRIO: CONSOLIDAÇÃO DE CONTAS */}
        <TabsContent value="relatorio" className="space-y-6 mt-4">
          <RelatorioContas
            financeiros={financeiros}
            contas={contas}
            loading={loading}
            erro={null}
            onRecarregar={carregarTudo}
          />
        </TabsContent>

        {/* TAB EQUIPE: convite de usuários e permissão por financeiro (só master) */}
        {user && isMaster && (
          <TabsContent value="equipe" className="space-y-6 mt-4">
            <AbaEquipe financeiros={financeiros} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
