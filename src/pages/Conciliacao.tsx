import React, { useState, useEffect, useMemo, useRef } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import {
  Financeiro,
  ContaBancaria,
  Lancamento,
  ExtratoItem,
  RegraConciliacao,
  PlanoConta,
} from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { parseCSV, normalizeDate, normalizeCurrency } from '@/lib/sheetParser'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  UploadCloud,
  CheckCheck,
  AlertTriangle,
  FileSpreadsheet,
  Layers,
  ArrowRight,
  ShieldCheck,
  Sparkles,
  Link2,
  EyeOff,
  Filter,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Loader2,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

export default function ConciliacaoPage() {
  const { toast } = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Estados Mestres
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [contas, setContas] = useState<ContaBancaria[]>([])
  const [planos, setPlanos] = useState<PlanoConta[]>([])
  const [regras, setRegras] = useState<RegraConciliacao[]>([])
  const [extratoItens, setExtratoItens] = useState<ExtratoItem[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)

  // Seleção Pré-Importação obrigatória: Escolher Financeiro e Conta ANTES de importar
  const [selectedFinId, setSelectedFinId] = useState<string>('')
  const [selectedContaId, setSelectedContaId] = useState<string>('')

  // Modal de Mapeamento de Colunas
  const [mappingOpen, setMappingOpen] = useState(false)
  const [rawHeaders, setRawHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [colData, setColData] = useState<string>('')
  const [colDesc, setColDesc] = useState<string>('')
  const [colValor, setColValor] = useState<string>('')
  const [colDoc, setColDoc] = useState<string>('')
  const [colTipo, setColTipo] = useState<string>('') // ou detecção por sinal
  const [importing, setImporting] = useState(false)

  // Modal para criar regra a partir da conciliação manual
  const [ruleModalOpen, setRuleModalOpen] = useState(false)
  const [pendingConciliation, setPendingConciliation] = useState<{
    extratoItem: ExtratoItem
    lancamento: Lancamento
  } | null>(null)
  const [padraoTextoRegra, setPadraoTextoRegra] = useState('')

  // Carregar dados
  const carregarDados = async () => {
    try {
      setLoading(true)
      const [fins, cts, pls, rgs] = await Promise.all([
        FinanceiroService.getFinanceiros(),
        FinanceiroService.getContas(),
        FinanceiroService.getPlanoContas(),
        FinanceiroService.getRegrasConciliacao(),
      ])

      setFinanceiros(fins)
      setContas(cts)
      setPlanos(pls)
      setRegras(rgs)

      if (fins.length > 0 && !selectedFinId) {
        setSelectedFinId(fins[0].id)
      }
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

  // Contas do Financeiro Selecionado
  const contasDoFin = useMemo(() => {
    if (!selectedFinId) return []
    return contas.filter((c) => c.financeiro_id === selectedFinId)
  }, [contas, selectedFinId])

  useEffect(() => {
    if (contasDoFin.length > 0) {
      setSelectedContaId(contasDoFin[0].id)
    } else {
      setSelectedContaId('')
    }
  }, [selectedFinId, contasDoFin])

  // Carregar Extrato e Lançamentos para a conta selecionada
  const carregarItensDaConta = async () => {
    if (!selectedFinId || !selectedContaId) return
    try {
      const [itens, lcs] = await Promise.all([
        FinanceiroService.getExtratoItens(selectedFinId, selectedContaId),
        FinanceiroService.getLancamentos({
          financeiroId: selectedFinId,
          contaId: selectedContaId,
        }),
      ])
      setExtratoItens(itens)
      setLancamentos(lcs)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar itens da conta',
        description: err.message,
      })
    }
  }

  useEffect(() => {
    if (selectedFinId && selectedContaId) {
      carregarItensDaConta()
    }
  }, [selectedFinId, selectedContaId])

  // Manipular upload de arquivo
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!selectedFinId || !selectedContaId) {
      toast({
        variant: 'destructive',
        title: 'Seleção Obrigatória',
        description: 'Selecione o financeiro e a conta bancária antes de importar o extrato.',
      })
      return
    }

    setFileName(file.name)
    const reader = new FileReader()
    reader.onload = (event) => {
      const text = event.target?.result as string
      const { headers, rows } = parseCSV(text)

      if (headers.length === 0 || rows.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Arquivo Vazio ou Inválido',
          description: 'Não foram encontrados dados no arquivo informado.',
        })
        return
      }

      setRawHeaders(headers)
      setRawRows(rows)

      // Auto-mapeamento inteligente por termos comuns em extratos brasileiros
      const lowerHeaders = headers.map((h) => h.toLowerCase().trim())
      const idxData = lowerHeaders.findIndex(
        (h) => h.includes('data') || h.includes('dt') || h.includes('date'),
      )
      const idxDesc = lowerHeaders.findIndex(
        (h) =>
          h.includes('desc') ||
          h.includes('historico') ||
          h.includes('histórico') ||
          h.includes('memo'),
      )
      const idxValor = lowerHeaders.findIndex(
        (h) =>
          h.includes('valor') ||
          h.includes('montante') ||
          h.includes('amount') ||
          h.includes('lançamento'),
      )
      const idxDoc = lowerHeaders.findIndex(
        (h) => h.includes('doc') || h.includes('num') || h.includes('numero'),
      )
      const idxTipo = lowerHeaders.findIndex(
        (h) => h.includes('tipo') || h.includes('deb') || h.includes('cred'),
      )

      if (idxData !== -1) setColData(headers[idxData])
      if (idxDesc !== -1) setColDesc(headers[idxDesc])
      if (idxValor !== -1) setColValor(headers[idxValor])
      if (idxDoc !== -1) setColDoc(headers[idxDoc])
      if (idxTipo !== -1) setColTipo(headers[idxTipo])

      setMappingOpen(true)
    }
    reader.readAsText(file)

    // Limpa input
    e.target.value = ''
  }

  // Confirmar Importação com o Mapeamento
  const handleConfirmMapping = async () => {
    if (!colData || !colDesc || !colValor) {
      toast({
        variant: 'destructive',
        title: 'Campos Obrigatórios',
        description: 'Mapeie ao menos as colunas de Data, Descrição e Valor.',
      })
      return
    }

    try {
      setImporting(true)
      const dataIdx = rawHeaders.indexOf(colData)
      const descIdx = rawHeaders.indexOf(colDesc)
      const valIdx = rawHeaders.indexOf(colValor)
      const docIdx = colDoc ? rawHeaders.indexOf(colDoc) : -1
      const tipoIdx = colTipo ? rawHeaders.indexOf(colTipo) : -1

      const itensValidos: Array<{
        data: string
        descricao: string
        documento?: string
        valor: number
        tipo: 'credito' | 'debito'
      }> = []

      for (const row of rawRows) {
        const rawDate = row[dataIdx]
        const rawDesc = row[descIdx]
        const rawVal = row[valIdx]
        const rawDoc = docIdx !== -1 ? row[docIdx] : undefined
        const rawTipoStr = tipoIdx !== -1 ? (row[tipoIdx] || '').toLowerCase() : ''

        const normDate = normalizeDate(rawDate)
        if (!normDate || !rawDesc) continue

        const numVal = normalizeCurrency(rawVal)
        if (numVal === 0) continue

        // Determina se é crédito ou débito pelo sinal ou coluna de tipo
        let tipo: 'credito' | 'debito' = numVal < 0 ? 'debito' : 'credito'
        if (
          rawTipoStr.includes('d') ||
          rawTipoStr.includes('deb') ||
          rawTipoStr.includes('saida')
        ) {
          tipo = 'debito'
        } else if (
          rawTipoStr.includes('c') ||
          rawTipoStr.includes('cred') ||
          rawTipoStr.includes('entrada')
        ) {
          tipo = 'credito'
        }

        itensValidos.push({
          data: normDate,
          descricao: rawDesc.trim(),
          documento: rawDoc ? rawDoc.trim() : undefined,
          valor: Math.abs(numVal),
          tipo,
        })
      }

      if (itensValidos.length === 0) {
        toast({
          variant: 'destructive',
          title: 'Nenhum item válido',
          description: 'Verifique se as colunas selecionadas contêm datas e valores válidos.',
        })
        return
      }

      // Salva importação e extrato_itens no Supabase
      const { total } = await FinanceiroService.createImportacao({
        financeiro_id: selectedFinId,
        conta_id: selectedContaId,
        nome_arquivo: fileName,
        itens: itensValidos,
      })

      toast({
        title: 'Extrato Importado com Sucesso!',
        description: `${total} linhas importadas para a conta selecionada.`,
      })

      setMappingOpen(false)
      await carregarItensDaConta()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na Importação',
        description: err.message,
      })
    } finally {
      setImporting(false)
    }
  }

  // MOTOR DE CONCILIAÇÃO EM 3 CAMADAS (Automático)
  // Camada 1: Exata (valor idêntico + data idêntica)
  // Camada 2: Tolerante (valor idêntico + data ± 3 dias)
  // Camada 3: Regra de texto (padrão de texto em regras_conciliacao)
  const executarConciliacaoAutomatica = async () => {
    try {
      setLoading(true)
      let conciliadosCount = 0

      const pendentes = extratoItens.filter((item) => item.status === 'pendente')
      const lancsNaoConciliados = lancamentos.filter((l) => !l.conciliado)

      for (const item of pendentes) {
        let match: Lancamento | undefined = undefined

        // Camada 1: Exata
        match = lancsNaoConciliados.find(
          (l) =>
            !l.conciliado &&
            l.tipo === item.tipo &&
            Math.abs(Number(l.valor) - Number(item.valor)) < 0.01 &&
            l.data === item.data,
        )

        // Camada 2: Tolerante (±3 dias)
        if (!match) {
          match = lancsNaoConciliados.find((l) => {
            if (l.conciliado || l.tipo !== item.tipo) return false
            if (Math.abs(Number(l.valor) - Number(item.valor)) >= 0.01) return false
            const diffDias =
              Math.abs(new Date(l.data).getTime() - new Date(item.data).getTime()) /
              (1000 * 60 * 60 * 24)
            return diffDias <= 3
          })
        }

        // Camada 3: Regras cadastradas por padrão de texto
        if (!match && regras.length > 0) {
          const regraAplicavel = regras.find((r) =>
            item.descricao.toLowerCase().includes(r.padrao_texto.toLowerCase()),
          )
          if (regraAplicavel) {
            match = lancsNaoConciliados.find(
              (l) =>
                !l.conciliado &&
                l.tipo === item.tipo &&
                Math.abs(Number(l.valor) - Number(item.valor)) < 0.01 &&
                (!regraAplicavel.plano_conta_id ||
                  l.plano_conta_id === regraAplicavel.plano_conta_id),
            )
          }
        }

        if (match) {
          // Atualiza o item do extrato e o lançamento
          await FinanceiroService.updateExtratoItem(item.id, {
            status: 'conciliado',
            lancamento_id: match.id,
          })
          await FinanceiroService.updateLancamento(match.id, {
            conciliado: true,
            extrato_item_id: item.id,
          })
          match.conciliado = true
          conciliadosCount++
        } else {
          // Se não encontrou, marca como sem_correspondencia
          await FinanceiroService.updateExtratoItem(item.id, {
            status: 'sem_correspondencia',
          })
        }
      }

      toast({
        title: 'Conciliação em 3 Camadas Executada!',
        description: `${conciliadosCount} itens correspondidos automaticamente.`,
      })

      await carregarItensDaConta()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na Conciliação Automática',
        description: err.message,
      })
    } finally {
      setLoading(false)
    }
  }

  // Conciliação Manual entre um item do extrato e um lançamento
  const handleConciliarManual = (item: ExtratoItem, lanc: Lancamento) => {
    setPendingConciliation({ extratoItem: item, lancamento: lanc })
    setPadraoTextoRegra(item.descricao.slice(0, 30))
    setRuleModalOpen(true)
  }

  const handleConfirmManualConciliation = async (criarRegra: boolean) => {
    if (!pendingConciliation) return
    try {
      const { extratoItem, lancamento } = pendingConciliation

      await FinanceiroService.updateExtratoItem(extratoItem.id, {
        status: 'conciliado',
        lancamento_id: lancamento.id,
      })

      await FinanceiroService.updateLancamento(lancamento.id, {
        conciliado: true,
        extrato_item_id: extratoItem.id,
      })

      if (criarRegra && padraoTextoRegra.trim()) {
        await FinanceiroService.createRegraConciliacao({
          financeiro_id: selectedFinId,
          padrao_texto: padraoTextoRegra.trim(),
          plano_conta_id: lancamento.plano_conta_id,
          tipo: lancamento.tipo,
        })
        toast({
          title: 'Regra salva!',
          description: `Padrão "${padraoTextoRegra.trim()}" memorizado para próximas conciliações.`,
        })
        // Atualiza regras
        const novasRegras = await FinanceiroService.getRegrasConciliacao()
        setRegras(novasRegras)
      }

      toast({
        title: 'Conciliação Efetivada',
        description: 'Vínculo registrado com sucesso.',
      })

      setRuleModalOpen(false)
      setPendingConciliation(null)
      await carregarItensDaConta()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao conciliar',
        description: err.message,
      })
    }
  }

  // Ignorar item do extrato
  const handleIgnorarItem = async (id: string) => {
    try {
      await FinanceiroService.updateExtratoItem(id, { status: 'ignorado' })
      await carregarItensDaConta()
      toast({ title: 'Item marcado como ignorado.' })
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Erro', description: err.message })
    }
  }

  // Alerta de duplicidade detectado no extrato:
  // Mesmo valor + mesma conta + descrição similar em datas próximas (± 2 dias)
  const duplicidadesDetectadas = useMemo(() => {
    const list: Array<{ item1: ExtratoItem; item2: ExtratoItem }> = []
    for (let i = 0; i < extratoItens.length; i++) {
      for (let j = i + 1; j < extratoItens.length; j++) {
        const a = extratoItens[i]
        const b = extratoItens[j]
        if (Math.abs(Number(a.valor) - Number(b.valor)) < 0.01 && a.tipo === b.tipo) {
          const diffDias =
            Math.abs(new Date(a.data).getTime() - new Date(b.data).getTime()) /
            (1000 * 60 * 60 * 24)
          if (diffDias <= 2) {
            list.push({ item1: a, item2: b })
          }
        }
      }
    }
    return list
  }, [extratoItens])

  // Status visual dos itens do extrato
  const getStatusBadge = (status: ExtratoItem['status']) => {
    switch (status) {
      case 'conciliado':
        return (
          <Badge className="bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 hover:bg-[#00D68F]/30 text-[10px]">
            CONCILIADO
          </Badge>
        )
      case 'pendente':
        return (
          <Badge className="bg-amber-400/20 text-amber-400 border-amber-400/40 hover:bg-amber-400/30 text-[10px]">
            PENDENTE
          </Badge>
        )
      case 'sem_correspondencia':
        return (
          <Badge className="bg-[#FF5C5C]/20 text-[#FF5C5C] border-[#FF5C5C]/40 hover:bg-[#FF5C5C]/30 text-[10px]">
            SEM CORRESPONDÊNCIA
          </Badge>
        )
      case 'ignorado':
        return (
          <Badge className="bg-gray-600/20 text-gray-400 border-gray-600/40 hover:bg-gray-600/30 text-[10px]">
            IGNORADO
          </Badge>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Conciliação Bancária</h1>
          <p className="text-sm text-gray-400">
            Importe extratos (.xlsx, .xls, .csv), confira o mapeamento e concilie em 3 camadas
          </p>
        </div>

        <div className="flex items-center gap-3">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv, .xlsx, .xls, text/csv"
            onChange={handleFileChange}
            className="hidden"
          />
          <Button
            onClick={() => fileInputRef.current?.click()}
            disabled={!selectedFinId || !selectedContaId}
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer shadow-lg shadow-[#00D68F]/20"
          >
            <UploadCloud className="w-4 h-4 mr-2" />
            Importar Extrato (CSV/Excel)
          </Button>

          <Button
            variant="outline"
            onClick={executarConciliacaoAutomatica}
            disabled={extratoItens.length === 0 || loading}
            className="border-[#00D68F]/40 text-[#00D68F] hover:bg-[#00D68F]/10 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 mr-2" />
            Conciliar em 3 Camadas
          </Button>
        </div>
      </div>

      {/* SELEÇÃO PRÉ-IMPORTAÇÃO OBRIGATÓRIA (Financeiro e Conta) */}
      <Card className="bg-[#141A22] border-[#232B36] text-white p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold mb-1.5 block">
              1. Financeiro da Conciliação *
            </Label>
            <select
              value={selectedFinId}
              onChange={(e) => setSelectedFinId(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
            >
              {financeiros.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome} ({f.tipo})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider text-gray-300 font-bold mb-1.5 block">
              2. Conta Bancária *
            </Label>
            <select
              value={selectedContaId}
              onChange={(e) => setSelectedContaId(e.target.value)}
              className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm"
            >
              {contasDoFin.length === 0 ? (
                <option value="">Nenhuma conta cadastrada neste financeiro</option>
              ) : (
                contasDoFin.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.banco} - Ag: {c.agencia || 'N/A'} - C/C: {c.conta} ({c.tipo})
                  </option>
                ))
              )}
            </select>
          </div>
        </div>
      </Card>

      {/* ALERTA DE DUPLICIDADE */}
      {duplicidadesDetectadas.length > 0 && (
        <Alert className="bg-amber-500/10 border-amber-500/30 text-amber-300">
          <AlertTriangle className="w-4 h-4 mr-2 text-amber-400" />
          <AlertDescription className="text-xs">
            <span className="font-bold">Alerta de Possível Duplicidade no Extrato:</span> Foram
            detectadas {duplicidadesDetectadas.length} transações com mesmo valor e datas muito
            próximas no extrato importado. Revise os lançamentos para evitar lançamentos repetidos.
          </AlertDescription>
        </Alert>
      )}

      {/* DUAS COLUNAS LADO A LADO: EXTRATO (ESQUERDA) x LANÇAMENTOS (DIREITA) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* COLUNA ESQUERDA: EXTRATO BANCÁRIO */}
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl flex flex-col">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-[#00D68F]" />
                Extrato Importado
              </CardTitle>
              <p className="text-xs text-gray-400">Itens trazidos do extrato da conta</p>
            </div>
            <Badge variant="outline" className="border-[#232B36] text-xs">
              {extratoItens.length} itens
            </Badge>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[600px]">
            {extratoItens.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">
                Nenhum extrato importado para esta conta bancária.
              </div>
            ) : (
              <div className="divide-y divide-[#232B36]">
                {extratoItens.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 hover:bg-[#1A222D]/40 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-400">
                          {formatDateBR(item.data)}
                        </span>
                        {getStatusBadge(item.status)}
                      </div>
                      <span
                        className={`font-mono text-sm font-bold ${
                          item.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                        }`}
                      >
                        {item.tipo === 'credito' ? '+' : '-'} {formatCurrency(item.valor)}
                      </span>
                    </div>

                    <div className="text-xs text-white font-medium truncate">{item.descricao}</div>
                    {item.documento && (
                      <div className="text-[10px] text-gray-500 font-mono">
                        Doc: {item.documento}
                      </div>
                    )}

                    {/* Ações do item */}
                    {item.status !== 'conciliado' && (
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleIgnorarItem(item.id)}
                          className="text-[11px] text-gray-500 hover:text-gray-300 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <EyeOff className="w-3 h-3" />
                          Ignorar
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* COLUNA DIREITA: LANÇAMENTOS DO SISTEMA */}
        <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl flex flex-col">
          <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold text-white flex items-center gap-2">
                <CheckCheck className="w-4 h-4 text-[#00D68F]" />
                Lançamentos do Caixa
              </CardTitle>
              <p className="text-xs text-gray-400">Registros na conta para correspondência</p>
            </div>
            <Badge variant="outline" className="border-[#232B36] text-xs">
              {lancamentos.length} registros
            </Badge>
          </CardHeader>

          <CardContent className="p-0 flex-1 overflow-y-auto max-h-[600px]">
            {lancamentos.length === 0 ? (
              <div className="py-16 text-center text-gray-500 text-sm">
                Nenhum lançamento registrado nesta conta.
              </div>
            ) : (
              <div className="divide-y divide-[#232B36]">
                {lancamentos.map((lanc) => {
                  const plano = planos.find((p) => p.id === lanc.plano_conta_id)
                  return (
                    <div
                      key={lanc.id}
                      className="p-3 hover:bg-[#1A222D]/40 transition-colors space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-gray-400">
                            {formatDateBR(lanc.data)}
                          </span>
                          {lanc.conciliado ? (
                            <Badge className="bg-[#00D68F]/20 text-[#00D68F] border-[#00D68F]/40 text-[10px]">
                              CONCILIADO
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-400/10 text-amber-400 border-amber-400/20 text-[10px]">
                              NÃO CONCILIADO
                            </Badge>
                          )}
                        </div>
                        <span
                          className={`font-mono text-sm font-bold ${
                            lanc.tipo === 'credito' ? 'text-[#00D68F]' : 'text-[#FF5C5C]'
                          }`}
                        >
                          {lanc.tipo === 'credito' ? '+' : '-'} {formatCurrency(lanc.valor)}
                        </span>
                      </div>

                      <div className="text-xs text-white font-medium">{lanc.descricao}</div>
                      <div className="text-[11px] text-gray-400">
                        {plano ? `${plano.codigo} - ${plano.descricao}` : 'Sem plano'}
                      </div>

                      {/* Botão de correspondência manual se houver item do extrato pendente similar */}
                      {!lanc.conciliado && (
                        <div className="pt-1 flex items-center justify-end">
                          {/* Procura itens pendentes do extrato com mesmo valor para sugestão */}
                          {extratoItens
                            .filter(
                              (ei) =>
                                ei.status !== 'conciliado' &&
                                ei.tipo === lanc.tipo &&
                                Math.abs(Number(ei.valor) - Number(lanc.valor)) < 0.01,
                            )
                            .slice(0, 1)
                            .map((cand) => (
                              <Button
                                key={cand.id}
                                size="sm"
                                variant="outline"
                                onClick={() => handleConciliarManual(cand, lanc)}
                                className="h-7 text-xs border-[#00D68F]/40 text-[#00D68F] hover:bg-[#00D68F]/15 cursor-pointer"
                              >
                                <Link2 className="w-3 h-3 mr-1" />
                                Conciliar com extrato #{cand.data}
                              </Button>
                            ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* MODAL: MAPEAMENTO AUTOMÁTICO DE COLUNAS COM AJUSTE MANUAL */}
      <Dialog open={mappingOpen} onOpenChange={setMappingOpen}>
        <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-xl">
          <DialogHeader>
            <DialogTitle className="text-lg text-white flex items-center gap-2">
              <Layers className="w-5 h-5 text-[#00D68F]" />
              Mapeamento de Colunas do Extrato
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs">
              Arquivo: <span className="text-white font-semibold">{fileName}</span> (
              {rawRows.length} linhas encontradas). Associe as colunas da planilha aos campos do
              sistema:
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-gray-300 font-semibold">Coluna de Data *</Label>
                <select
                  value={colData}
                  onChange={(e) => setColData(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm mt-1"
                >
                  <option value="">Selecione...</option>
                  {rawHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-gray-300 font-semibold">Coluna de Descrição *</Label>
                <select
                  value={colDesc}
                  onChange={(e) => setColDesc(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm mt-1"
                >
                  <option value="">Selecione...</option>
                  {rawHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-gray-300 font-semibold">Coluna de Valor *</Label>
                <select
                  value={colValor}
                  onChange={(e) => setColValor(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm mt-1"
                >
                  <option value="">Selecione...</option>
                  {rawHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs text-gray-300 font-semibold">
                  Coluna de Documento / NF (opcional)
                </Label>
                <select
                  value={colDoc}
                  onChange={(e) => setColDoc(e.target.value)}
                  className="w-full h-10 px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm mt-1"
                >
                  <option value="">Nenhuma / Gerar automático</option>
                  {rawHeaders.map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Prévia da 1ª Linha */}
            {rawRows.length > 0 && (
              <div className="p-3 bg-[#0B0F14] rounded-lg border border-[#232B36] text-xs">
                <span className="text-gray-400 font-semibold block mb-1">
                  Prévia da primeira linha:
                </span>
                <div className="flex flex-wrap gap-2 font-mono text-gray-300">
                  {rawHeaders.map((h, i) => (
                    <span
                      key={h}
                      className="bg-[#141A22] px-2 py-0.5 rounded border border-[#232B36]"
                    >
                      <b className="text-gray-500">{h}:</b> {rawRows[0][i] || '-'}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between border-t border-[#232B36] pt-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMappingOpen(false)}
              className="text-gray-400 hover:text-white"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={importing || !colData || !colDesc || !colValor}
              onClick={handleConfirmMapping}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
            >
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importando...
                </>
              ) : (
                <>
                  Confirmar e Importar Linhas
                  <ArrowRight className="w-4 h-4 ml-2" />
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL: CRIAR REGRA A PARTIR DESTA CONCILIAÇÃO */}
      <Dialog open={ruleModalOpen} onOpenChange={setRuleModalOpen}>
        <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-base text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-[#00D68F]" />
              Criar Regra de Conciliação Automática?
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-xs">
              Deseja salvar um padrão de texto para conciliar automaticamente lançamentos futuros
              com descrição semelhante?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <Label className="text-xs text-gray-300">Padrão de texto a memorizar:</Label>
              <Input
                value={padraoTextoRegra}
                onChange={(e) => setPadraoTextoRegra(e.target.value)}
                placeholder="Ex: TARIFA BANCARIA, PIX ENVIADO"
                className="bg-[#0B0F14] border-[#232B36] text-white mt-1 text-sm"
              />
            </div>
            <p className="text-[11px] text-gray-400">
              Sempre que uma linha do extrato contiver este texto, ela será sugerida para a mesma
              categoria do lançamento atual.
            </p>
          </div>

          <DialogFooter className="flex justify-between items-center sm:justify-between border-t border-[#232B36] pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleConfirmManualConciliation(false)}
              className="border-[#232B36] text-gray-300 hover:text-white"
            >
              Apenas Conciliar
            </Button>
            <Button
              type="button"
              onClick={() => handleConfirmManualConciliation(true)}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-semibold cursor-pointer"
            >
              Salvar Regra e Conciliar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
