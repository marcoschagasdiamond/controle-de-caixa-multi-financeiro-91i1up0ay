import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, PlanoConta, RecebivelSemData } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { DialogoConverterRecebivel } from '@/components/DialogoConverterRecebivel'
import { DialogoImportarRecebiveis } from '@/components/DialogoImportarRecebiveis'
import { exportarRecebiveisCSV } from '@/lib/csvRecebiveis'
import {
  Inbox,
  PlusCircle,
  Pencil,
  Trash2,
  X,
  CalendarClock,
  Hourglass,
  FileSignature,
  MoreHorizontal,
  Loader2,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react'

// Rótulos do "status do gatilho" (sem data definida)
export const GATILHOS: Array<{ valor: RecebivelSemData['status_gatilho']; label: string }> = [
  { valor: 'aguardando_despacho', label: 'Aguardando despacho' },
  { valor: 'aguardando_termino', label: 'Aguardando término do contrato' },
  { valor: 'outro', label: 'Outro' },
]

export const labelGatilho = (r: RecebivelSemData) =>
  r.status_gatilho === 'outro'
    ? r.gatilho_outro || 'Outro'
    : GATILHOS.find((g) => g.valor === r.status_gatilho)?.label || 'Outro'

export const iconeGatilho = (r: RecebivelSemData) =>
  r.status_gatilho === 'aguardando_despacho' ? (
    <Hourglass className="w-3 h-3 text-amber-400 flex-shrink-0" aria-hidden="true" />
  ) : r.status_gatilho === 'aguardando_termino' ? (
    <FileSignature className="w-3 h-3 text-amber-400 flex-shrink-0" aria-hidden="true" />
  ) : (
    <MoreHorizontal className="w-3 h-3 text-amber-400 flex-shrink-0" aria-hidden="true" />
  )

interface Props {
  financeiros: Financeiro[]
  planos: PlanoConta[]
  // Financeiro padrão para linhas sem coluna de financeiro (filtro da tela)
  financeiroPadraoId?: string
  // Id do recebível a abrir em edição (clique num item do card Alertas de vencimento)
  editarRecebivelId?: string | null
}

// Seção "Recebíveis sem Data (Contratos a Receber)" dentro de Lançamentos.
// Cadastro opcionalmente com data prevista (alimenta os Alertas de vencimento
// do Painel enquanto pendente) e observação; fica fora da projeção de caixa.
export function RecebiveisSemData({
  financeiros,
  planos,
  financeiroPadraoId,
  editarRecebivelId,
}: Props) {
  const { toast } = useToast()

  const [recebiveis, setRecebiveis] = useState<RecebivelSemData[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Formulário de cadastro
  const [descricao, setDescricao] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [numParcelas, setNumParcelas] = useState('')
  const [contratante, setContratante] = useState('')
  const [selectedFinId, setSelectedFinId] = useState('')
  const [statusGatilho, setStatusGatilho] =
    useState<RecebivelSemData['status_gatilho']>('aguardando_despacho')
  const [gatilhoOutro, setGatilhoOutro] = useState('')
  const [observacao, setObservacao] = useState('')
  const [dataPrevista, setDataPrevista] = useState('')
  const [selectedPlanoId, setSelectedPlanoId] = useState('')
  // Modo edição: id do recebível sendo editado (lápis no card de Pendentes)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const formularioRef = useRef<HTMLDivElement>(null)

  // Conversão
  const [convertendo, setConvertendo] = useState<RecebivelSemData | null>(null)

  // Importação CSV
  const [importOpen, setImportOpen] = useState(false)
  // Pré-seleciona o primeiro financeiro acessível
  useEffect(() => {
    if (financeiros.length > 0 && !selectedFinId) setSelectedFinId(financeiros[0].id)
  }, [financeiros, selectedFinId])

  const carregar = async () => {
    try {
      setLoading(true)
      setRecebiveis(await FinanceiroService.getRecebiveisSemData())
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar recebíveis sem data',
        description: err.message,
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Vindo do card Alertas de vencimento do Painel: abre o recebível em edição
  // quando a lista já tiver carregado (e uma única vez por id recebido).
  const editadoViaAlerta = useRef<string | null>(null)
  useEffect(() => {
    if (!editarRecebivelId || loading) return
    if (editadoViaAlerta.current === editarRecebivelId) return
    const alvo = recebiveis.find((r) => r.id === editarRecebivelId)
    if (!alvo) return
    editadoViaAlerta.current = editarRecebivelId
    iniciarEdicao(alvo)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarRecebivelId, recebiveis, loading])

  const valorNum = parseFloat(valorTotal.replace(',', '.'))
  const nParcelasCadastro = numParcelas ? parseInt(numParcelas, 10) : 0
  const valorParcelaCadastro =
    nParcelasCadastro > 1 && !isNaN(valorNum) ? valorNum / nParcelasCadastro : valorNum

  const limparFormulario = () => {
    setDescricao('')
    setValorTotal('')
    setNumParcelas('')
    setContratante('')
    setObservacao('')
    setDataPrevista('')
    setGatilhoOutro('')
    setStatusGatilho('aguardando_despacho')
    setSelectedPlanoId('')
    setEditandoId(null)
  }

  // Inicia a edição: carrega o recebível no formulário e rola até ele
  const iniciarEdicao = (r: RecebivelSemData) => {
    setEditandoId(r.id)
    setSelectedFinId(r.financeiro_id)
    setDescricao(r.descricao)
    setValorTotal(String(r.valor_total))
    setNumParcelas(r.total_parcelas ? String(r.total_parcelas) : '')
    setContratante(r.contratante || '')
    setStatusGatilho(r.status_gatilho)
    setGatilhoOutro(r.gatilho_outro || '')
    setObservacao(r.observacao || '')
    setDataPrevista(r.data_prevista || '')
    setSelectedPlanoId(r.plano_conta_id || '')
    setFormError(null)
    // O contêiner de rolagem é o <main> do Layout: scrollIntoView rola os
    // ancestrais roláveis até o formulário (reduzido se preferência ativa).
    const reduzirMovimento = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    formularioRef.current?.scrollIntoView({
      behavior: reduzirMovimento ? 'auto' : 'smooth',
      block: 'start',
    })
  }

  const cancelarEdicao = () => {
    limparFormulario()
    setFormError(null)
  }

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!selectedFinId) {
      setFormError('Selecione o financeiro dono do recebível.')
      return
    }
    if (!descricao.trim()) {
      setFormError('Informe a descrição do contrato/recebível.')
      return
    }
    const v = parseFloat(valorTotal.replace(',', '.'))
    if (isNaN(v) || v <= 0) {
      setFormError('Informe um valor total positivo (ex.: 150000,00).')
      return
    }
    if (statusGatilho === 'outro' && !gatilhoOutro.trim()) {
      setFormError('Descreva o gatilho que definirá a data de recebimento.')
      return
    }
    if (numParcelas && (isNaN(nParcelasCadastro) || nParcelasCadastro < 2)) {
      setFormError('Se informar parcelas, use um número ≥ 2. Deixe vazio para pagamento único.')
      return
    }

    try {
      setSaving(true)
      if (editandoId) {
        // MODO EDIÇÃO: atualiza o registro existente (sem duplicar)
        await FinanceiroService.updateRecebivelSemData(editandoId, {
          financeiro_id: selectedFinId,
          descricao: descricao.trim(),
          data_prevista: dataPrevista || null,
          valor_total: v,
          total_parcelas: nParcelasCadastro > 1 ? nParcelasCadastro : null,
          contratante: contratante.trim() || null,
          status_gatilho: statusGatilho,
          gatilho_outro: statusGatilho === 'outro' ? gatilhoOutro.trim() : null,
          observacao: observacao.trim() || null,
          plano_conta_id: selectedPlanoId || null,
        })
        toast({
          title: 'Recebível atualizado!',
          description: `${descricao.trim()} — alterações salvas com sucesso.`,
        })
        limparFormulario()
        await carregar()
        return
      }
      await FinanceiroService.createRecebivelSemData({
        financeiro_id: selectedFinId,
        descricao: descricao.trim(),
        data_prevista: dataPrevista || null,
        valor_total: v,
        total_parcelas: nParcelasCadastro > 1 ? nParcelasCadastro : null,
        contratante: contratante.trim() || null,
        status_gatilho: statusGatilho,
        gatilho_outro: statusGatilho === 'outro' ? gatilhoOutro.trim() : null,
        observacao: observacao.trim() || null,
        plano_conta_id: selectedPlanoId || null,
      })
      toast({
        title: 'Recebível sem data registrado!',
        description: `${descricao.trim()} — ${formatCurrency(v)} fora da projeção até você definir a data.`,
      })
      limparFormulario()
      await carregar()
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar recebível.')
    } finally {
      setSaving(false)
    }
  }

  const handleExcluir = async (id: string, desc: string) => {
    if (!window.confirm(`Excluir o recebível "${desc}"? Esta ação não pode ser desfeita.`)) return
    try {
      await FinanceiroService.deleteRecebivelSemData(id)
      setRecebiveis((prev) => prev.filter((x) => x.id !== id))
      toast({ title: 'Recebível excluído' })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: err.message,
      })
    }
  }

  // SEGREGAÇÃO PATRIMONIAL (Passo 1 de Lançamentos): as listas e os totais mostram
  // somente os recebíveis da empresa selecionada; com "todos" (ou sem seleção),
  // mostram todas as empresas — o badge de empresa por item identifica a origem.
  const passaFiltroFinanceiro = (financeiroId: string) =>
    !financeiroPadraoId || financeiroPadraoId === 'todos' || financeiroId === financeiroPadraoId
  const recebiveisPendentes = useMemo(
    () =>
      recebiveis.filter((r) => r.status === 'pendente' && passaFiltroFinanceiro(r.financeiro_id)),
    [recebiveis, financeiroPadraoId],
  )
  const recebiveisConvertidos = useMemo(
    () =>
      recebiveis.filter((r) => r.status === 'convertido' && passaFiltroFinanceiro(r.financeiro_id)),
    [recebiveis, financeiroPadraoId],
  )
  const totalPendente = recebiveisPendentes.reduce((acc, r) => acc + Number(r.valor_total), 0)
  const financeiroFiltro =
    financeiroPadraoId && financeiroPadraoId !== 'todos'
      ? financeiros.find((f) => f.id === financeiroPadraoId)
      : undefined

  const finPadrao =
    financeiroPadraoId && financeiroPadraoId !== 'todos'
      ? financeiroPadraoId
      : selectedFinId || (financeiros[0]?.id ?? '')

  return (
    <div id="recebiveis-sem-data" className="space-y-6 scroll-mt-24">
      {/* CADASTRO — borda âmbar e título "Editando: …" no modo edição */}
      <div ref={formularioRef} className="scroll-mt-24">
        <Card
          className={`bg-[#141A22] text-white shadow-2xl transition-colors ${
            editandoId ? 'border-2 border-[#FFB020] ring-4 ring-[#FFB020]/20' : 'border-[#232B36]'
          }`}
        >
          <CardHeader className="pb-4 border-b border-[#232B36]">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-white">
                <Inbox className="w-5 h-5 text-amber-400" aria-hidden="true" />
                {editandoId
                  ? `Editando: ${
                      recebiveis.find((r) => r.id === editandoId)?.descricao || 'recebível'
                    }`
                  : 'Recebíveis sem Data (Contratos a Receber)'}
              </CardTitle>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-gray-500 uppercase tracking-wide font-semibold">
                  Fora da projeção de caixa
                </span>
                {editandoId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelarEdicao}
                    className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                    Cancelar edição
                  </Button>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        exportarRecebiveisCSV(
                          [...recebiveisPendentes, ...recebiveisConvertidos],
                          financeiros,
                        )
                      }
                      className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Exportar CSV
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setImportOpen(true)}
                      className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Importar CSV
                    </Button>
                  </>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {formError && (
              <Alert className="mb-4 bg-[#FF5C5C]/15 border-[#FF5C5C]/50 text-[#FF5C5C]">
                <AlertTriangle className="w-4 h-4 mr-2" />
                <AlertDescription className="font-medium">{formError}</AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSalvar} className="space-y-4" noValidate>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="rec-desc" className="text-xs text-gray-300 font-semibold">
                    Descrição do contrato <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="rec-desc"
                    name="descricao"
                    value={descricao}
                    onChange={(e) => setDescricao(e.target.value)}
                    placeholder="Ex.: Serviço de consultoria — Contrato 2026/001"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                    autoComplete="off"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-contratante" className="text-xs text-gray-300 font-semibold">
                    Contratante
                  </Label>
                  <Input
                    id="rec-contratante"
                    name="contratante"
                    value={contratante}
                    onChange={(e) => setContratante(e.target.value)}
                    placeholder="Ex.: Prefeitura Municipal"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                    autoComplete="off"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-valor" className="text-xs text-gray-300 font-semibold">
                    Valor total (R$) <span aria-hidden="true">*</span>
                  </Label>
                  <Input
                    id="rec-valor"
                    name="valor"
                    value={valorTotal}
                    onChange={(e) => setValorTotal(e.target.value)}
                    inputMode="decimal"
                    placeholder="0,00"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-parcelas" className="text-xs text-gray-300 font-semibold">
                    Nº de parcelas (opcional)
                  </Label>
                  <Input
                    id="rec-parcelas"
                    name="parcelas"
                    value={numParcelas}
                    onChange={(e) => setNumParcelas(e.target.value)}
                    inputMode="numeric"
                    placeholder="Vazio = pagamento único"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                  />
                  {nParcelasCadastro > 1 && !isNaN(valorNum) && valorNum > 0 && (
                    <p className="text-[11px] text-gray-500">
                      {nParcelasCadastro}x de {formatCurrency(valorParcelaCadastro)}
                    </p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-fin" className="text-xs text-gray-300 font-semibold">
                    Financeiro (dono do recebível) <span aria-hidden="true">*</span>
                  </Label>
                  <select
                    id="rec-fin"
                    value={selectedFinId}
                    onChange={(e) => setSelectedFinId(e.target.value)}
                    className="h-10 w-full px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
                    required
                  >
                    <option value="">Selecione…</option>
                    {financeiros.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.nome} ({f.tipo})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-gatilho" className="text-xs text-gray-300 font-semibold">
                    Status do gatilho <span aria-hidden="true">*</span>
                  </Label>
                  <select
                    id="rec-gatilho"
                    value={statusGatilho}
                    onChange={(e) =>
                      setStatusGatilho(e.target.value as RecebivelSemData['status_gatilho'])
                    }
                    className="h-10 w-full px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
                  >
                    {GATILHOS.map((g) => (
                      <option key={g.valor} value={g.valor}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </div>
                {statusGatilho === 'outro' && (
                  <div className="space-y-1.5 md:col-span-2">
                    <Label
                      htmlFor="rec-gatilho-outro"
                      className="text-xs text-gray-300 font-semibold"
                    >
                      Descreva o gatilho <span aria-hidden="true">*</span>
                    </Label>
                    <Input
                      id="rec-gatilho-outro"
                      name="gatilho_outro"
                      value={gatilhoOutro}
                      onChange={(e) => setGatilhoOutro(e.target.value)}
                      placeholder="Ex.: Aguardando publicação no diário oficial"
                      className="bg-[#0B0F14] border-[#232B36] text-white"
                      autoComplete="off"
                      required
                    />
                  </div>
                )}
                <div className="space-y-1.5">
                  <Label htmlFor="rec-plano" className="text-xs text-gray-300 font-semibold">
                    Categoria (opcional)
                  </Label>
                  <select
                    id="rec-plano"
                    value={selectedPlanoId}
                    onChange={(e) => setSelectedPlanoId(e.target.value)}
                    className="h-10 w-full px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
                  >
                    <option value="">Definir na conversão</option>
                    {planos
                      .filter((p) => p.tipo === 'receita')
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.codigo ? `${p.codigo} - ` : ''}
                          {p.descricao}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-prevista" className="text-xs text-gray-300 font-semibold">
                    Data prevista de recebimento (opcional)
                  </Label>
                  <Input
                    id="rec-prevista"
                    name="data_prevista"
                    type="date"
                    value={dataPrevista}
                    onChange={(e) => setDataPrevista(e.target.value)}
                    className="bg-[#0B0F14] border-[#232B36] text-white [color-scheme:dark]"
                  />
                  <p className="text-[11px] text-gray-500">
                    Informada: entra nos Alertas de vencimento do Painel.
                  </p>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label htmlFor="rec-obs" className="text-xs text-gray-300 font-semibold">
                    Observação
                  </Label>
                  <Textarea
                    id="rec-obs"
                    name="observacao"
                    value={observacao}
                    onChange={(e) => setObservacao(e.target.value)}
                    placeholder="Detalhes do contrato, processo, protocolo…"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                <Button
                  type="submit"
                  aria-disabled={saving}
                  onClick={(e) => saving && e.preventDefault()}
                  className="bg-amber-400 hover:bg-amber-300 text-[#0B0F14] font-bold cursor-pointer"
                >
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                  ) : editandoId ? (
                    <Pencil className="w-4 h-4 mr-2" aria-hidden="true" />
                  ) : (
                    <PlusCircle className="w-4 h-4 mr-2" aria-hidden="true" />
                  )}
                  {saving
                    ? 'Salvando…'
                    : editandoId
                      ? 'Salvar Alterações'
                      : 'Registrar Recebível sem Data'}
                </Button>
                <p className="text-[11px] text-gray-500">
                  Sem data exigida. Fica fora do caixa projetado até você definir a data.
                </p>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* LISTA DE PENDENTES */}
      <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
        <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
          <CardTitle className="text-base font-bold text-white flex items-center gap-2">
            <Hourglass className="w-4 h-4 text-amber-400" aria-hidden="true" />
            Pendentes ({recebiveisPendentes.length})
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Total: {formatCurrency(totalPendente)}
            {financeiroFiltro && (
              <span className="text-gray-500 font-sans"> · {financeiroFiltro.nome}</span>
            )}
          </span>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Carregando…
            </div>
          ) : recebiveisPendentes.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Nenhum recebível sem data pendente. Contratos a receber aparecem aqui.
            </div>
          ) : (
            <div className="divide-y divide-[#232B36]">
              {recebiveisPendentes.map((r) => {
                const fin = financeiros.find((f) => f.id === r.financeiro_id)
                return (
                  <div
                    key={r.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-sm flex items-center gap-1.5 flex-wrap">
                        {iconeGatilho(r)}
                        {r.descricao}
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>{labelGatilho(r)}</span>
                        {r.data_prevista && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span className="text-gray-300">
                              Previsto: {formatDateBR(r.data_prevista)}
                            </span>
                          </>
                        )}
                        {r.contratante && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span>{r.contratante}</span>
                          </>
                        )}
                        {fin && (
                          <>
                            <span aria-hidden="true">•</span>
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-mono"
                              style={{ borderColor: fin.cor, color: fin.cor }}
                            >
                              {fin.nome}
                            </Badge>
                          </>
                        )}
                        {r.total_parcelas ? (
                          <>
                            <span aria-hidden="true">•</span>
                            <span>{r.total_parcelas}x</span>
                          </>
                        ) : null}
                      </div>
                      {r.observacao && (
                        <div
                          className="text-[11px] text-gray-500 mt-1 max-w-xl truncate"
                          title={r.observacao}
                        >
                          {r.observacao}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono font-bold text-[#00D68F] text-sm">
                        {formatCurrency(Number(r.valor_total))}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Editar recebível ${r.descricao}`}
                        onClick={() => iniciarEdicao(r)}
                        className="text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 h-8 w-8 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => setConvertendo(r)}
                        className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        Definir data
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Excluir recebível ${r.descricao}`}
                        onClick={() => handleExcluir(r.id, r.descricao)}
                        className="text-gray-500 hover:text-[#FF5C5C] h-8 w-8 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CONVERTIDOS (HISTÓRICO MANTIDO) */}
      {recebiveisConvertidos.length > 0 && (
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
          <CardHeader className="pb-3 border-b border-[#232B36]">
            <CardTitle className="text-base font-bold text-white flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-[#00D68F]" aria-hidden="true" />
              Convertidos em Lançamento ({recebiveisConvertidos.length})
              {financeiroFiltro && (
                <span className="text-[11px] font-normal text-gray-500 font-sans">
                  · {financeiroFiltro.nome}
                </span>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-[#232B36]">
              {recebiveisConvertidos.map((r) => {
                const fin = financeiros.find((f) => f.id === r.financeiro_id)
                return (
                  <div key={r.id} className="p-3 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-white">{r.descricao}</div>
                        <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5">
                          <span>{labelGatilho(r)}</span>
                          {r.data_prevista && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span>Previsto: {formatDateBR(r.data_prevista)}</span>
                            </>
                          )}
                          {fin && (
                            <>
                              <span aria-hidden="true">•</span>
                              <span>{fin.nome}</span>
                            </>
                          )}
                        </div>
                      </div>
                      <span className="font-mono font-bold text-gray-400 flex-shrink-0">
                        {formatCurrency(Number(r.valor_total))}
                      </span>
                    </div>
                    {r.observacao && (
                      <div
                        className="text-[11px] text-gray-500 mt-1 max-w-xl truncate"
                        title={r.observacao}
                      >
                        {r.observacao}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* DIÁLOGO DE CONVERSÃO */}
      <DialogoConverterRecebivel
        recebivel={convertendo}
        planos={planos}
        onClose={() => setConvertendo(null)}
        onConvertido={carregar}
      />

      {/* DIÁLOGO DE IMPORTAÇÃO CSV */}
      <DialogoImportarRecebiveis
        open={importOpen}
        onClose={() => setImportOpen(false)}
        financeiros={financeiros}
        planos={planos}
        financeiroPadraoId={finPadrao}
        onImportado={carregar}
      />
    </div>
  )
}
