import React, { useState, useEffect, useMemo } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaBancaria, Mutuo } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Building2,
  ArrowRightLeft,
  PlusCircle,
  AlertTriangle,
  Scale,
  Percent,
  CheckCircle2,
  Clock,
  Trash2,
  Loader2,
  ShieldAlert,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function MutuosPage() {
  const { toast } = useToast()
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [mutuos, setMutuos] = useState<Mutuo[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Formulário de Mútuo
  const [origemFinId, setOrigemFinId] = useState('')
  const [origemContaId, setOrigemContaId] = useState('')
  const [destinoFinId, setDestinoFinId] = useState('')
  const [destinoContaId, setDestinoContaId] = useState('')
  const [dataMutuo, setDataMutuo] = useState(getTodayISODate())
  const [valor, setValor] = useState('')
  const [tipo, setTipo] = useState<'adiantamento' | 'reembolso' | 'emprestimo'>('emprestimo')
  const [taxaJuros, setTaxaJuros] = useState('0')
  const [documento, setDocumento] = useState('')
  const [observacao, setObservacao] = useState('')
  const [status, setStatus] = useState<'aberto' | 'quitado' | 'parcial'>('aberto')

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [fins, cts, mts] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getMutuos(),
      ])
      setFinanceiros(fins)
      setContas(cts)
      setMutuos(mts)

      if (fins.length >= 2) {
        setOrigemFinId(fins[0].id)
        setDestinoFinId(fins[1].id)
      }
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao carregar mútuos', description: err.message })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Contas da Origem (apenas do financeiro de origem)
  const contasOrigem = useMemo(() => {
    return contas.filter((c) => c.financeiro_id === origemFinId)
  }, [contas, origemFinId])

  // Contas do Destino (apenas do financeiro de destino)
  const contasDestino = useMemo(() => {
    return contas.filter((c) => c.financeiro_id === destinoFinId)
  }, [contas, destinoFinId])

  useEffect(() => {
    if (contasOrigem.length > 0) setOrigemContaId(contasOrigem[0].id)
    else setOrigemContaId('')
  }, [contasOrigem])

  useEffect(() => {
    if (contasDestino.length > 0) setDestinoContaId(contasDestino[0].id)
    else setDestinoContaId('')
  }, [contasDestino])

  // Salvar Mútuo
  const handleSalvarMutuo = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (origemFinId === destinoFinId) {
      setFormError(
        'REGRA DE SEGREGAÇÃO: O financeiro de origem e destino devem ser diferentes. Mútuo é exclusivo entre partes relacionadas distintas.',
      )
      return
    }
    if (!origemContaId || !destinoContaId) {
      setFormError('Selecione as contas bancárias de origem e destino.')
      return
    }

    const valorNum = parseFloat(valor.replace(',', '.'))
    if (isNaN(valorNum) || valorNum <= 0) {
      setFormError('Informe um valor monetário válido e positivo.')
      return
    }

    try {
      setSaving(true)
      await FinanceiroService.createMutuo({
        origem_financeiro_id: origemFinId,
        origem_conta_id: origemContaId,
        destino_financeiro_id: destinoFinId,
        destino_conta_id: destinoContaId,
        data: dataMutuo,
        valor: valorNum,
        tipo,
        taxa_juros: parseFloat(taxaJuros) || 0,
        documento: documento.trim() || null,
        observacao: observacao.trim() || null,
        status,
      })

      toast({
        title: 'Mútuo Registrado com Sucesso!',
        description: `Operação de ${tipo.toUpperCase()} de ${formatCurrency(valorNum)} formalizada entre entidades.`,
      })

      setValor('')
      setDocumento('')
      setObservacao('')
      const novos = await FinanceiroService.getMutuos()
      setMutuos(novos)
    } catch (err: any) {
      setFormError(err.message || 'Erro ao registrar mútuo.')
    } finally {
      setSaving(false)
    }
  }

  const handleExcluirMutuo = async (id: string) => {
    if (!window.confirm('Deseja excluir este registro de mútuo?')) return
    try {
      await FinanceiroService.deleteMutuo(id)
      setMutuos((prev) => prev.filter((m) => m.id !== id))
      toast({ title: 'Mútuo excluído.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: err.message })
    }
  }

  // REGRA: Exibir saldo de mútuo aberto por par de financeiros
  const saldosPorPar = useMemo(() => {
    const pares: {
      [key: string]: { origem: Financeiro; destino: Financeiro; totalAberto: number; count: number }
    } = {}

    for (const m of mutuos) {
      if (m.status === 'aberto' || m.status === 'parcial') {
        const key = `${m.origem_financeiro_id}->${m.destino_financeiro_id}`
        const finOrigem = financeiros.find((f) => f.id === m.origem_financeiro_id)
        const finDestino = financeiros.find((f) => f.id === m.destino_financeiro_id)

        if (finOrigem && finDestino) {
          if (!pares[key]) {
            pares[key] = {
              origem: finOrigem,
              destino: finDestino,
              totalAberto: 0,
              count: 0,
            }
          }
          pares[key].totalAberto += Number(m.valor)
          pares[key].count += 1
        }
      }
    }

    return Object.values(pares)
  }, [mutuos, financeiros])

  if (financeiros.length < 2) {
    return (
      <div className="text-center py-16 bg-[#141A22] border border-[#232B36] rounded-xl p-8 max-w-2xl mx-auto">
        <Building2 className="w-12 h-12 text-[#00D68F] mx-auto mb-4" />
        <h2 className="text-xl font-bold text-white mb-2">Mínimo de 2 Financeiros Necessários</h2>
        <p className="text-gray-400 text-sm mb-6">
          Operações de mútuo (empréstimos, adiantamentos e reembolsos entre partes relacionadas)
          exigem pelo menos duas entidades distintas cadastradas para manter a segregação contábil.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">
          Mútuos & Partes Relacionadas
        </h1>
        <p className="text-sm text-gray-400">
          Transferências entre empresas e PF formalizadas exclusivamente via contrato de mútuo,
          nunca como despesa comum
        </p>
      </div>

      {/* SALDO DE MÚTUO ABERTO POR PAR DE FINANCEIROS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {saldosPorPar.length === 0 ? (
          <Card className="bg-[#141A22] border-[#232B36] p-4 text-white col-span-full">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <CheckCircle2 className="w-4 h-4 text-[#00D68F]" />
              Nenhum saldo de mútuo em aberto entre as entidades cadastradas.
            </div>
          </Card>
        ) : (
          saldosPorPar.map((par, idx) => (
            <Card key={idx} className="bg-[#141A22] border-[#232B36] p-4 text-white shadow-lg">
              <div className="flex items-center justify-between text-xs text-gray-400 font-semibold mb-2">
                <span>Partes Relacionadas</span>
                <Badge variant="outline" className="border-[#00D68F]/30 text-[#00D68F] text-[10px]">
                  {par.count} aberto(s)
                </Badge>
              </div>

              <div className="flex items-center gap-2 text-sm font-bold text-white mb-3">
                <span style={{ color: par.origem.cor || '#00D68F' }}>{par.origem.nome}</span>
                <ArrowRightLeft className="w-4 h-4 text-gray-500 shrink-0" />
                <span style={{ color: par.destino.cor || '#00D68F' }}>{par.destino.nome}</span>
              </div>

              <div className="text-2xl font-black font-mono text-[#00D68F]">
                {formatCurrency(par.totalAberto)}
              </div>
              <p className="text-[11px] text-gray-500 mt-1">
                Saldo a liquidar/devolver para {par.origem.nome}
              </p>
            </Card>
          ))
        )}
      </div>

      {/* FORMULÁRIO DE NOVO MÚTUO */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-4 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-[#00D68F]" />
            Registrar Novo Mútuo entre Financeiros
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {formError && (
            <Alert className="bg-[#FF5C5C]/15 border-[#FF5C5C]/40 text-[#FF5C5C]">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSalvarMutuo} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Origem */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">
                  Financeiro Cedente (Origem) *
                </Label>
                <select
                  value={origemFinId}
                  onChange={(e) => setOrigemFinId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {financeiros.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} ({f.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Conta de Origem *</Label>
                <select
                  value={origemContaId}
                  onChange={(e) => setOrigemContaId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {contasOrigem.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco} ({c.conta})
                    </option>
                  ))}
                </select>
              </div>

              {/* Destino */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">
                  Financeiro Beneficiário (Destino) *
                </Label>
                <select
                  value={destinoFinId}
                  onChange={(e) => setDestinoFinId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {financeiros.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.nome} ({f.tipo})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Conta de Destino *</Label>
                <select
                  value={destinoContaId}
                  onChange={(e) => setDestinoContaId(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  {contasDestino.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.banco} ({c.conta})
                    </option>
                  ))}
                </select>
              </div>

              {/* Data, Valor, Tipo e Taxa */}
              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Data da Operação *</Label>
                <Input
                  type="date"
                  required
                  value={dataMutuo}
                  onChange={(e) => setDataMutuo(e.target.value)}
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Valor (R$) *</Label>
                <Input
                  type="text"
                  required
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  placeholder="0,00"
                  className="bg-[#0B0F14] border-[#232B36] text-white font-mono font-bold"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Tipo do Mútuo</Label>
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  <option value="emprestimo">Empréstimo Financeiro</option>
                  <option value="adiantamento">Adiantamento de Caixa</option>
                  <option value="reembolso">Reembolso de Despesas</option>
                </select>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">
                  Taxa de Juros (% a.m.)
                </Label>
                <Input
                  type="number"
                  step="0.01"
                  value={taxaJuros}
                  onChange={(e) => setTaxaJuros(e.target.value)}
                  placeholder="0.00"
                  className="bg-[#0B0F14] border-[#232B36] text-white font-mono"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Contrato / Documento</Label>
                <Input
                  value={documento}
                  onChange={(e) => setDocumento(e.target.value)}
                  placeholder="Contrato nº 01/2026"
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-gray-300 font-semibold">Status</Label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
                >
                  <option value="aberto">Em Aberto</option>
                  <option value="parcial">Liquidado Parcialmente</option>
                  <option value="quitado">Quitado / Liquidado</option>
                </select>
              </div>

              <div className="space-y-1 md:col-span-2">
                <Label className="text-xs text-gray-300 font-semibold">Observações</Label>
                <Input
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  placeholder="Motivo do suporte financeiro intercompany..."
                  className="bg-[#0B0F14] border-[#232B36] text-white"
                />
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <Button
                type="submit"
                disabled={saving}
                className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold px-6 cursor-pointer"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Registrando...
                  </>
                ) : (
                  <>
                    <Scale className="w-4 h-4 mr-2" />
                    Formalizar Mútuo
                  </>
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* LISTAGEM DE MÚTUOS */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36]">
          <CardTitle className="text-base font-bold text-white">Histórico de Mútuos</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-300">
              <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Origem (Cedente)</th>
                  <th className="py-3 px-4">Destino (Beneficiário)</th>
                  <th className="py-3 px-4">Tipo</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4 text-center">Juros</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232B36]">
                {mutuos.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-gray-500 text-sm">
                      Nenhum mútuo registrado entre as entidades.
                    </td>
                  </tr>
                ) : (
                  mutuos.map((m) => {
                    const finOrigem = financeiros.find((f) => f.id === m.origem_financeiro_id)
                    const finDestino = financeiros.find((f) => f.id === m.destino_financeiro_id)

                    return (
                      <tr key={m.id} className="hover:bg-[#1A222D]/40">
                        <td className="py-3 px-4 font-mono text-xs text-gray-400">
                          {formatDateBR(m.data)}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-white">{finOrigem?.nome}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">
                            {finOrigem?.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-white">{finDestino?.nome}</span>
                          <span className="text-[10px] text-gray-400 block font-mono">
                            {finDestino?.tipo}
                          </span>
                        </td>
                        <td className="py-3 px-4 capitalize text-xs text-gray-300">{m.tipo}</td>
                        <td className="py-3 px-4 text-right font-mono font-bold text-sm text-white">
                          {formatCurrency(m.valor)}
                        </td>
                        <td className="py-3 px-4 text-center font-mono text-xs text-gray-400">
                          {m.taxa_juros}% a.m.
                        </td>
                        <td className="py-3 px-4 text-center">
                          {m.status === 'quitado' ? (
                            <Badge className="bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 text-[10px]">
                              QUITADO
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-400/20 text-amber-400 border-amber-400/40 text-[10px]">
                              ABERTO
                            </Badge>
                          )}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleExcluirMutuo(m.id)}
                            className="p-1.5 text-gray-500 hover:text-[#FF5C5C] cursor-pointer"
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
