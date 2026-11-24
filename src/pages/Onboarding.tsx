import React, { useState, useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, PlanoConta, ContaFixa } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Building2,
  Wallet,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  Plus,
  Trash2,
  Sparkles,
  ShieldCheck,
  AlertCircle,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function Onboarding() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const context = useOutletContext<{ reloadFinanceiros?: () => void }>()

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1)
  const [existingFinanceiros, setExistingFinanceiros] = useState<Financeiro[]>([])
  const [loading, setLoading] = useState(false)
  const [savingStep, setSavingStep] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Passo 1: Financeiro
  const [financeiroId, setFinanceiroId] = useState<string | null>(null)
  const [finNome, setFinNome] = useState('')
  const [finTipo, setFinTipo] = useState<'PF' | 'PJ'>('PJ')
  const [finCpfCnpj, setFinCpfCnpj] = useState('')
  const [finSocios, setFinSocios] = useState('')
  const [finRegime, setFinRegime] = useState('Simples Nacional')
  const [finCor, setFinCor] = useState('#00D68F')

  // Passo 2: Contas Bancárias
  const [contas, setContas] = useState<
    Array<Omit<ContaBancaria, 'id' | 'user_id' | 'created_at' | 'updated_at'>>
  >([
    {
      financeiro_id: '',
      banco: 'Banco Itaú',
      agencia: '1234',
      conta: '98765-4',
      tipo: 'Corrente',
      pix: '',
      saldo_inicial: 1000.0,
      ativo: true,
    },
  ])

  // Passo 3: Plano de Contas — GLOBAL (categorias sem vínculo de empresa)
  const [planos, setPlanos] = useState<Array<Omit<PlanoConta, 'id' | 'user_id' | 'created_at'>>>([
    { codigo: '1.01', descricao: 'Vendas de Mercadorias / Produtos', tipo: 'receita', ativo: true },
    { codigo: '1.02', descricao: 'Prestação de Serviços', tipo: 'receita', ativo: true },
    { codigo: '1.03', descricao: 'Rendimentos Financeiros', tipo: 'receita', ativo: true },
    { codigo: '2.01', descricao: 'Fornecedores e Matéria-Prima', tipo: 'despesa', ativo: true },
    { codigo: '2.02', descricao: 'Salários e Encargos', tipo: 'despesa', ativo: true },
    { codigo: '2.03', descricao: 'Impostos e Taxas', tipo: 'despesa', ativo: true },
    { codigo: '2.04', descricao: 'Aluguel, Condomínio e IPTU', tipo: 'despesa', ativo: true },
    { codigo: '2.05', descricao: 'Despesas Bancárias e Tarifas', tipo: 'despesa', ativo: true },
  ])

  // Passo 4: Contas Fixas
  const [contasFixas, setContasFixas] = useState<
    Array<Omit<ContaFixa, 'id' | 'user_id' | 'created_at'>>
  >([
    {
      financeiro_id: '',
      descricao: 'Aluguel do Imóvel',
      valor_estimado: 2500,
      dia_vencimento: 10,
      tipo: 'despesa',
      ativo: true,
    },
    {
      financeiro_id: '',
      descricao: 'Energia Elétrica',
      valor_estimado: 350,
      dia_vencimento: 15,
      tipo: 'despesa',
      ativo: true,
    },
    {
      financeiro_id: '',
      descricao: 'Internet e Telefonia',
      valor_estimado: 180,
      dia_vencimento: 20,
      tipo: 'despesa',
      ativo: true,
    },
  ])

  useEffect(() => {
    loadExisting()
  }, [])

  const loadExisting = async () => {
    try {
      setLoading(true)
      const fins = await FinanceiroService.getFinanceiros()
      setExistingFinanceiros(fins)
    } catch (e: any) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  // Salvar Passo 1
  const handleSaveStep1 = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    if (!finNome.trim()) {
      setErrorMsg('Informe o nome do financeiro (empresa ou pessoa física).')
      return
    }

    try {
      setSavingStep(true)
      const created = await FinanceiroService.createFinanceiro({
        nome: finNome.trim(),
        tipo: finTipo,
        cpf_cnpj: finCpfCnpj.trim() || null,
        socios: finSocios.trim() || null,
        regime_tributario: finTipo === 'PJ' ? finRegime : null,
        cor: finCor,
      })

      setFinanceiroId(created.id)
      // Atualiza arrays dependentes com o novo id
      setContas((prev) => prev.map((c) => ({ ...c, financeiro_id: created.id })))
      setContasFixas((prev) => prev.map((cf) => ({ ...cf, financeiro_id: created.id })))

      context?.reloadFinanceiros?.()
      toast({
        title: 'Financeiro cadastrado!',
        description: `${created.nome} (${created.tipo}) criado com segregação garantida.`,
      })
      setStep(2)
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar financeiro.')
    } finally {
      setSavingStep(false)
    }
  }

  // Salvar Passo 2
  const handleSaveStep2 = async () => {
    setErrorMsg(null)
    if (!financeiroId) {
      setErrorMsg('Financeiro não identificado.')
      return
    }
    const contasValidas = contas.filter((c) => c.banco.trim() && c.conta.trim())
    if (contasValidas.length === 0) {
      setErrorMsg('Adicione pelo menos uma conta bancária com banco e número da conta.')
      return
    }

    try {
      setSavingStep(true)
      for (const c of contasValidas) {
        await FinanceiroService.createConta({
          ...c,
          financeiro_id: financeiroId,
          saldo_inicial: Number(c.saldo_inicial) || 0,
        })
      }
      toast({
        title: 'Contas bancárias salvas!',
        description: `${contasValidas.length} conta(s) vinculada(s) exclusivamente a este financeiro.`,
      })
      setStep(3)
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar contas.')
    } finally {
      setSavingStep(false)
    }
  }

  // Salvar Passo 3
  const handleSaveStep3 = async () => {
    setErrorMsg(null)
    if (!financeiroId) return

    try {
      setSavingStep(true)
      const planosValidos = planos.filter((p) => p.descricao.trim())
      for (const p of planosValidos) {
        await FinanceiroService.createPlanoConta(p)
      }
      toast({
        title: 'Plano de contas configurado!',
        description: `${planosValidos.length} categorias cadastradas (plano global — visível em todos os financeiros).`,
      })
      setStep(4)
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao configurar plano de contas.')
    } finally {
      setSavingStep(false)
    }
  }

  // Salvar Passo 4
  const handleSaveStep4 = async () => {
    setErrorMsg(null)
    if (!financeiroId) return

    try {
      setSavingStep(true)
      const fixasValidas = contasFixas.filter((cf) => cf.descricao.trim())
      for (const cf of fixasValidas) {
        await FinanceiroService.createContaFixa({
          ...cf,
          financeiro_id: financeiroId,
          valor_estimado: Number(cf.valor_estimado) || 0,
          dia_vencimento: Number(cf.dia_vencimento) || 10,
        })
      }
      context?.reloadFinanceiros?.()
      toast({
        title: 'Onboarding concluído com sucesso!',
        description: 'Seu caixa segregado está pronto para lançamentos.',
      })
      navigate('/lancamentos')
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao salvar contas fixas.')
    } finally {
      setSavingStep(false)
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header com Stepper */}
      <div className="bg-[#141A22] border border-[#232B36] rounded-xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#00D68F]/10 border border-[#00D68F]/30 text-[#00D68F] text-xs font-semibold mb-2">
              <Sparkles className="w-3.5 h-3.5" />
              Configuração Inicial Guiada
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Onboarding Multi-Financeiro
            </h1>
            <p className="text-sm text-gray-400">
              Configure sua entidade financeira com segregação de patrimônio rigorosa
            </p>
          </div>
          <div className="text-right">
            <span className="text-xs uppercase tracking-wider text-gray-400 font-bold">Passo</span>
            <div className="text-2xl font-black text-[#00D68F]">{step} de 4</div>
          </div>
        </div>

        {/* Stepper Progress */}
        <div className="grid grid-cols-4 gap-2 pt-2">
          {[
            { s: 1, label: '1. Financeiro', icon: Building2 },
            { s: 2, label: '2. Contas', icon: Wallet },
            { s: 3, label: '3. Plano de Contas', icon: BookOpen },
            { s: 4, label: '4. Contas Fixas', icon: CalendarClock },
          ].map((item) => {
            const Icon = item.icon
            const isCompleted = step > item.s
            const isCurrent = step === item.s
            return (
              <div
                key={item.s}
                className={`p-3 rounded-lg border flex flex-col gap-1 transition-all ${
                  isCurrent
                    ? 'bg-[#00D68F]/10 border-[#00D68F] text-white shadow-sm'
                    : isCompleted
                      ? 'bg-[#1E2633] border-[#2E3B4D] text-[#00D68F]'
                      : 'bg-[#0E131A] border-[#232B36] text-gray-500 opacity-60'
                }`}
              >
                <div className="flex items-center gap-2">
                  {isCompleted ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00D68F]" />
                  ) : (
                    <Icon className="w-4 h-4" />
                  )}
                  <span className="text-xs font-semibold truncate">{item.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {errorMsg && (
        <Alert className="bg-[#FF5C5C]/10 border-[#FF5C5C]/40 text-[#FF5C5C]">
          <AlertCircle className="w-4 h-4 mr-2" />
          <AlertDescription>{errorMsg}</AlertDescription>
        </Alert>
      )}

      {/* PASSO 1: CADASTRAR FINANCEIRO */}
      {step === 1 && (
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <form onSubmit={handleSaveStep1}>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-white">
                <Building2 className="w-5 h-5 text-[#00D68F]" />
                Passo 1: Dados do Financeiro (Pessoa Física ou Jurídica)
              </CardTitle>
              <CardDescription className="text-gray-400">
                Cada financeiro é uma entidade jurídica ou física totalmente isolada no caixa.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs uppercase text-gray-300 font-semibold">
                    Tipo de Entidade
                  </Label>
                  <div className="flex gap-4">
                    <button
                      type="button"
                      onClick={() => setFinTipo('PJ')}
                      className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        finTipo === 'PJ'
                          ? 'bg-[#00D68F] text-[#0B0F14] border-[#00D68F]'
                          : 'bg-[#0B0F14] text-gray-300 border-[#232B36] hover:bg-[#1E2633]'
                      }`}
                    >
                      <Building2 className="w-4 h-4" />
                      Pessoa Jurídica (PJ)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFinTipo('PF')}
                      className={`flex-1 py-2.5 px-4 rounded-lg font-semibold text-sm border flex items-center justify-center gap-2 transition-all cursor-pointer ${
                        finTipo === 'PF'
                          ? 'bg-[#00D68F] text-[#0B0F14] border-[#00D68F]'
                          : 'bg-[#0B0F14] text-gray-300 border-[#232B36] hover:bg-[#1E2633]'
                      }`}
                    >
                      Pessoa Física (PF)
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="finNome"
                    className="text-xs uppercase text-gray-300 font-semibold"
                  >
                    Nome da Entidade / Razão Social *
                  </Label>
                  <Input
                    id="finNome"
                    required
                    value={finNome}
                    onChange={(e) => setFinNome(e.target.value)}
                    placeholder={
                      finTipo === 'PJ' ? 'Ex: Alfa Tecnologia Ltda' : 'Ex: João da Silva (Pessoal)'
                    }
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                  />
                </div>

                <div className="space-y-2">
                  <Label
                    htmlFor="cpfCnpj"
                    className="text-xs uppercase text-gray-300 font-semibold"
                  >
                    {finTipo === 'PJ' ? 'CNPJ' : 'CPF'}
                  </Label>
                  <Input
                    id="cpfCnpj"
                    value={finCpfCnpj}
                    onChange={(e) => setFinCpfCnpj(e.target.value)}
                    placeholder={finTipo === 'PJ' ? '00.000.000/0001-00' : '000.000.000-00'}
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                  />
                </div>

                {finTipo === 'PJ' ? (
                  <div className="space-y-2">
                    <Label
                      htmlFor="regime"
                      className="text-xs uppercase text-gray-300 font-semibold"
                    >
                      Regime Tributário
                    </Label>
                    <select
                      id="regime"
                      value={finRegime}
                      onChange={(e) => setFinRegime(e.target.value)}
                      className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                    >
                      <option value="Simples Nacional">Simples Nacional</option>
                      <option value="Lucro Presumido">Lucro Presumido</option>
                      <option value="Lucro Real">Lucro Real</option>
                      <option value="MEI">MEI (Microempreendedor Individual)</option>
                    </select>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Label
                      htmlFor="socios"
                      className="text-xs uppercase text-gray-300 font-semibold"
                    >
                      Identificação / Ocupação
                    </Label>
                    <Input
                      id="socios"
                      value={finSocios}
                      onChange={(e) => setFinSocios(e.target.value)}
                      placeholder="Ex: Titular / Sócio Majoritário"
                      className="bg-[#0B0F14] border-[#232B36] text-white"
                    />
                  </div>
                )}

                {finTipo === 'PJ' && (
                  <div className="space-y-2 md:col-span-2">
                    <Label
                      htmlFor="sociosPj"
                      className="text-xs uppercase text-gray-300 font-semibold"
                    >
                      Sócios / Quadro Societário
                    </Label>
                    <Input
                      id="sociosPj"
                      value={finSocios}
                      onChange={(e) => setFinSocios(e.target.value)}
                      placeholder="Ex: João Silva (50%), Maria Santos (50%)"
                      className="bg-[#0B0F14] border-[#232B36] text-white"
                    />
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs uppercase text-gray-300 font-semibold">
                    Cor de Identificação no Sistema
                  </Label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={finCor}
                      onChange={(e) => setFinCor(e.target.value)}
                      className="w-10 h-10 rounded border border-[#232B36] bg-transparent cursor-pointer"
                    />
                    <div className="flex gap-2">
                      {['#00D68F', '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981'].map(
                        (c) => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setFinCor(c)}
                            className="w-6 h-6 rounded-full border border-white/20 transition-transform hover:scale-110 cursor-pointer"
                            style={{ backgroundColor: c }}
                          />
                        ),
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-end border-t border-[#232B36] pt-4">
              <Button
                type="submit"
                disabled={savingStep}
                className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
              >
                {savingStep ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    Avançar para Contas Bancárias
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </>
                )}
              </Button>
            </CardFooter>
          </form>
        </Card>
      )}

      {/* PASSO 2: CONTAS BANCÁRIAS */}
      {step === 2 && (
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <Wallet className="w-5 h-5 text-[#00D68F]" />
              Passo 2: Contas Bancárias de {finNome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Cada conta bancária pertence EXCLUSIVAMENTE a este financeiro.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {contas.map((c, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg bg-[#0B0F14] border border-[#232B36] space-y-3 relative"
              >
                <div className="flex items-center justify-between pb-2 border-b border-[#232B36]">
                  <span className="text-xs font-bold text-[#00D68F] uppercase tracking-wider">
                    Conta Bancária #{idx + 1}
                  </span>
                  {contas.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setContas(contas.filter((_, i) => i !== idx))}
                      className="text-[#FF5C5C] hover:text-red-400 p-1 cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <Label className="text-xs text-gray-400">Banco / Instituição *</Label>
                    <Input
                      value={c.banco}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].banco = e.target.value
                        setContas(next)
                      }}
                      placeholder="Ex: Itaú, Nubank, Bradesco"
                      className="bg-[#141A22] border-[#2E3B4D] text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Agência</Label>
                    <Input
                      value={c.agencia || ''}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].agencia = e.target.value
                        setContas(next)
                      }}
                      placeholder="0001"
                      className="bg-[#141A22] border-[#2E3B4D] text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Número da Conta *</Label>
                    <Input
                      value={c.conta}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].conta = e.target.value
                        setContas(next)
                      }}
                      placeholder="123456-7"
                      className="bg-[#141A22] border-[#2E3B4D] text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Tipo da Conta</Label>
                    <select
                      value={c.tipo}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].tipo = e.target.value
                        setContas(next)
                      }}
                      className="w-full h-10 px-3 rounded-md bg-[#141A22] border border-[#2E3B4D] text-white text-sm mt-1"
                    >
                      <option value="Corrente">Conta Corrente</option>
                      <option value="Poupança">Conta Poupança</option>
                      <option value="Aplicação">Investimento / Aplicação</option>
                      <option value="Caixa Físico">Caixa Físico</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Chave PIX (opcional)</Label>
                    <Input
                      value={c.pix || ''}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].pix = e.target.value
                        setContas(next)
                      }}
                      placeholder="CNPJ, E-mail ou Celular"
                      className="bg-[#141A22] border-[#2E3B4D] text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-xs text-gray-400">Saldo Inicial (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={c.saldo_inicial}
                      onChange={(e) => {
                        const next = [...contas]
                        next[idx].saldo_inicial = parseFloat(e.target.value) || 0
                        setContas(next)
                      }}
                      placeholder="0.00"
                      className="bg-[#141A22] border-[#2E3B4D] text-white mt-1"
                    />
                  </div>
                </div>
              </div>
            ))}

            <Button
              type="button"
              variant="outline"
              onClick={() =>
                setContas([
                  ...contas,
                  {
                    financeiro_id: financeiroId || '',
                    banco: '',
                    agencia: '',
                    conta: '',
                    tipo: 'Corrente',
                    pix: '',
                    saldo_inicial: 0,
                    ativo: true,
                  },
                ])
              }
              className="w-full border-dashed border-[#2E3B4D] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-2" />
              Adicionar Outra Conta Bancária
            </Button>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-[#232B36] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(1)}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button
              type="button"
              disabled={savingStep}
              onClick={handleSaveStep2}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
            >
              {savingStep ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando Contas...
                </>
              ) : (
                <>
                  Avançar para Plano de Contas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* PASSO 3: PLANO DE CONTAS */}
      {step === 3 && (
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <BookOpen className="w-5 h-5 text-[#00D68F]" />
              Passo 3: Plano de Contas
            </CardTitle>
            <CardDescription className="text-gray-400">
              Categorias globais — servem para todos os financeiros (empresas). Ajuste o modelo
              padrão ou adicione as suas. O plano é compartilhado: o que você criar aqui já aparece
              na escolha de categoria de qualquer empresa.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs text-gray-400 uppercase font-semibold px-2">
                <span className="w-20">Código</span>
                <span className="flex-1 px-3">Descrição da Categoria</span>
                <span className="w-28 text-center">Tipo</span>
                <span className="w-10">
                  <span className="sr-only">Ações</span>
                </span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {planos.map((p, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 p-2 rounded-lg bg-[#0B0F14] border border-[#232B36]"
                  >
                    <Input
                      value={p.codigo}
                      onChange={(e) => {
                        const next = [...planos]
                        next[idx].codigo = e.target.value
                        setPlanos(next)
                      }}
                      className="w-20 bg-[#141A22] border-[#2E3B4D] text-xs font-mono text-white"
                    />
                    <Input
                      value={p.descricao}
                      onChange={(e) => {
                        const next = [...planos]
                        next[idx].descricao = e.target.value
                        setPlanos(next)
                      }}
                      className="flex-1 bg-[#141A22] border-[#2E3B4D] text-sm text-white"
                    />
                    <select
                      value={p.tipo}
                      onChange={(e) => {
                        const next = [...planos]
                        next[idx].tipo = e.target.value as 'receita' | 'despesa'
                        setPlanos(next)
                      }}
                      className={`w-28 h-9 px-2 rounded bg-[#141A22] border border-[#2E3B4D] text-xs font-semibold ${
                        p.tipo === 'receita' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                      }`}
                    >
                      <option value="receita">Receita</option>
                      <option value="despesa">Despesa</option>
                    </select>
                    <button
                      type="button"
                      aria-label="Excluir categoria"
                      onClick={() => setPlanos(planos.filter((_, i) => i !== idx))}
                      className="p-1.5 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setPlanos([
                    ...planos,
                    {
                      financeiro_id: financeiroId || '',
                      codigo: `2.0${planos.length + 1}`,
                      descricao: '',
                      tipo: 'despesa',
                      ativo: true,
                    },
                  ])
                }
                className="border-dashed border-[#2E3B4D] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nova Categoria
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-[#232B36] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(2)}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button
              type="button"
              disabled={savingStep}
              onClick={handleSaveStep3}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
            >
              {savingStep ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Salvando Plano...
                </>
              ) : (
                <>
                  Avançar para Contas Fixas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* PASSO 4: CONTAS FIXAS */}
      {step === 4 && (
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2 text-white">
              <CalendarClock className="w-5 h-5 text-[#00D68F]" />
              Passo 4: Contas Fixas Recorrentes de {finNome}
            </CardTitle>
            <CardDescription className="text-gray-400">
              Despesas e receitas que vencem todo mês (aluguel, água, energia, diarista, etc). Elas
              alimentam o Fluxo de Caixa previsto mesmo antes de serem lançadas.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-400 uppercase font-semibold px-2">
                <span className="col-span-5">Descrição</span>
                <span className="col-span-3">Valor Estimado (R$)</span>
                <span className="col-span-3">Dia Vencimento</span>
                <span className="col-span-1"></span>
              </div>

              <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                {contasFixas.map((cf, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-center p-2 rounded-lg bg-[#0B0F14] border border-[#232B36]"
                  >
                    <Input
                      value={cf.descricao}
                      onChange={(e) => {
                        const next = [...contasFixas]
                        next[idx].descricao = e.target.value
                        setContasFixas(next)
                      }}
                      placeholder="Ex: Aluguel"
                      className="col-span-5 bg-[#141A22] border-[#2E3B4D] text-sm text-white"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      value={cf.valor_estimado}
                      onChange={(e) => {
                        const next = [...contasFixas]
                        next[idx].valor_estimado = parseFloat(e.target.value) || 0
                        setContasFixas(next)
                      }}
                      className="col-span-3 bg-[#141A22] border-[#2E3B4D] text-sm text-white"
                    />
                    <div className="col-span-3 flex items-center gap-1">
                      <Input
                        type="number"
                        min="1"
                        max="31"
                        value={cf.dia_vencimento}
                        onChange={(e) => {
                          const next = [...contasFixas]
                          next[idx].dia_vencimento = parseInt(e.target.value, 10) || 1
                          setContasFixas(next)
                        }}
                        className="bg-[#141A22] border-[#2E3B4D] text-sm text-white"
                      />
                      <span className="text-xs text-gray-500">/mês</span>
                    </div>
                    <div className="col-span-1 flex justify-center">
                      <button
                        type="button"
                        onClick={() => setContasFixas(contasFixas.filter((_, i) => i !== idx))}
                        className="p-1.5 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setContasFixas([
                    ...contasFixas,
                    {
                      financeiro_id: financeiroId || '',
                      descricao: '',
                      valor_estimado: 0,
                      dia_vencimento: 5,
                      tipo: 'despesa',
                      ativo: true,
                    },
                  ])
                }
                className="border-dashed border-[#2E3B4D] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-2" />
                Adicionar Conta Fixa
              </Button>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between border-t border-[#232B36] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setStep(3)}
              className="text-gray-400 hover:text-white"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Voltar
            </Button>
            <Button
              type="button"
              disabled={savingStep}
              onClick={handleSaveStep4}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
            >
              {savingStep ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Concluindo...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Concluir Onboarding & Ir para Lançamentos
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}
    </div>
  )
}
