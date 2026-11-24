import React, { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, PlanoConta, ContaFixa } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
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
  CalendarClock,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  ShieldCheck,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function ConfiguracoesPage() {
  const { toast } = useToast()
  const [searchParams] = useSearchParams()
  const initialTab = searchParams.get('tab') || 'financeiros'

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
  const [planoFinId, setPlanoFinId] = useState('')
  const [planoCodigo, setPlanoCodigo] = useState('')
  const [planoDesc, setPlanoDesc] = useState('')
  const [planoTipo, setPlanoTipo] = useState<'receita' | 'despesa'>('despesa')
  const [savingPlano, setSavingPlano] = useState(false)

  // Filtros da listagem de Contas Bancárias
  const [filtroContaFin, setFiltroContaFin] = useState<string>('todos')
  const [filtroContaTipo, setFiltroContaTipo] = useState<string>('todos')
  // Filtro da listagem de Contas Fixas
  const [filtroFixaFin, setFiltroFixaFin] = useState<string>('todos')

  // 4. Conta Fixa
  const [fixaFinId, setFixaFinId] = useState('')
  const [fixaDesc, setFixaDesc] = useState('')
  const [fixaValor, setFixaValor] = useState('0')
  const [fixaDia, setFixaDia] = useState('10')
  const [fixaTipo, setFixaTipo] = useState<'receita' | 'despesa'>('despesa')
  const [savingFixa, setSavingFixa] = useState(false)

  const carregarTudo = async () => {
    try {
      setLoading(true)
      const [fins, cts, pls, cfs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getContasFixas(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setPlanos(pls)
      setContasFixas(cfs)

      if (fins.length > 0) {
        if (!ctaFinId) setCtaFinId(fins[0].id)
        if (!planoFinId) setPlanoFinId(fins[0].id)
        if (!fixaFinId) setFixaFinId(fins[0].id)
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

  useEffect(() => {
    carregarTudo()
  }, [])

  // Handlers de Criação
  const handleCriarFinanceiro = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!finNome.trim()) return
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

  const handleCriarPlano = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!planoFinId || !planoCodigo.trim() || !planoDesc.trim()) return
    try {
      setSavingPlano(true)
      await FinanceiroService.createPlanoConta({
        financeiro_id: planoFinId,
        codigo: planoCodigo.trim(),
        descricao: planoDesc.trim(),
        tipo: planoTipo,
        ativo: true,
      })
      toast({ title: 'Categoria adicionada ao Plano de Contas!' })
      setPlanoCodigo('')
      setPlanoDesc('')
      await carregarTudo()
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao criar categoria', description: err.message })
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
                Nova Categoria no Plano de Contas
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4">
              <form onSubmit={handleCriarPlano} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Financeiro *</Label>
                    <select
                      value={planoFinId}
                      onChange={(e) => setPlanoFinId(e.target.value)}
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
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    disabled={savingPlano}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
                  >
                    Salvar Categoria
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Listagem */}
          <div className="overflow-x-auto bg-[#141A22] border border-[#232B36] rounded-xl max-h-96">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold sticky top-0">
                <tr>
                  <th className="py-3 px-4">Financeiro</th>
                  <th className="py-3 px-4">Código</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {planos.map((p) => {
                  const fin = financeiros.find((f) => f.id === p.financeiro_id)
                  return (
                    <tr key={p.id} className="hover:bg-[#1A222D]/40">
                      <td className="py-2.5 px-4 font-semibold text-white">{fin?.nome || '-'}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-gray-400">{p.codigo}</td>
                      <td className="py-2.5 px-4 text-white font-medium">{p.descricao}</td>
                      <td className="py-2.5 px-4">
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            p.tipo === 'receita'
                              ? 'text-[#00D68F] border-[#00D68F]/30'
                              : 'text-[#FF5C5C] border-[#FF5C5C]/30'
                          }`}
                        >
                          {p.tipo}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <button
                          onClick={() => handleExcluirPlano(p.id)}
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
      </Tabs>
    </div>
  )
}
