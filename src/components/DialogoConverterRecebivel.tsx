import { useEffect, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { PlanoConta, RecebivelSemData } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { CalendarClock, Loader2, AlertTriangle } from 'lucide-react'

interface ContaResumo {
  id: string
  financeiro_id: string
  banco: string
  conta: string
}

interface Props {
  recebivel: RecebivelSemData | null
  planos: PlanoConta[]
  onClose: () => void
  onConvertido: () => void
}

// Diálogo "Definir data": escolhe data (e parcelas), cria lançamento(s)
// previsto(s) pelo serviço existente e marca o recebível como convertido.
export function DialogoConverterRecebivel({ recebivel, planos, onClose, onConvertido }: Props) {
  const { toast } = useToast()

  const [convData, setConvData] = useState('')
  const [convParcelas, setConvParcelas] = useState('')
  const [convContaId, setConvContaId] = useState('')
  const [convPlanoId, setConvPlanoId] = useState('')
  const [convError, setConvError] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [contas, setContas] = useState<ContaResumo[]>([])

  useEffect(() => {
    if (!recebivel) return
    setConvData('')
    setConvParcelas(recebivel.total_parcelas ? String(recebivel.total_parcelas) : '')
    setConvPlanoId(recebivel.plano_conta_id || '')
    setConvContaId('')
    setConvError(null)
    // Contas do financeiro dono do recebível
    FinanceiroService.getContas()
      .then((cts) => setContas(cts.filter((c) => c.financeiro_id === recebivel.financeiro_id)))
      .catch(() => setContas([]))
  }, [recebivel])

  if (!recebivel) return null
  const r = recebivel

  const nParcelas = convParcelas ? parseInt(convParcelas, 10) : 1
  const valorTotal = Number(r.valor_total)
  const valorParcela = valorTotal / (isNaN(nParcelas) || nParcelas < 1 ? 1 : nParcelas)
  const diaVenc = convData ? Number(convData.slice(8, 10)) : null

  const handleConfirmar = async () => {
    if (!convData) {
      setConvError('Informe a data do recebimento/da 1ª parcela.')
      return
    }
    if (!convContaId) {
      setConvError('Selecione a conta bancária de recebimento.')
      return
    }
    if (!convPlanoId) {
      setConvError('Selecione a categoria do plano de contas.')
      return
    }
    if (isNaN(nParcelas) || nParcelas < 1) {
      setConvError('Informe um número de parcelas válido (vazio = pagamento único).')
      return
    }

    try {
      setSalvando(true)
      const contrato = r.contratante ? `${r.descricao} — ${r.contratante}` : r.descricao

      // Reusa o serviço existente: 1º lançamento + (se parcelado) recorrência
      const lanc = await FinanceiroService.createLancamento({
        financeiro_id: r.financeiro_id,
        conta_id: convContaId,
        plano_conta_id: convPlanoId,
        tipo: 'credito',
        valor: valorParcela,
        data: convData,
        descricao: nParcelas > 1 ? `${contrato} (1/${nParcelas})` : contrato,
        status: 'previsto',
        contraparte: r.contratante || null,
        observacao: r.observacao || null,
        conciliado: false,
      })

      if (nParcelas > 1) {
        await FinanceiroService.createLancamentoRecorrente({
          financeiro_id: r.financeiro_id,
          conta_id: convContaId,
          plano_conta_id: convPlanoId,
          tipo: 'credito',
          valor: valorParcela,
          status: 'previsto',
          dia_mes: Number(convData.slice(8, 10)),
          data_inicial: convData,
          total_parcelas: nParcelas,
          descricao: contrato,
        })
      }

      // Marca como convertido, mantendo histórico/vínculo (não apaga).
      // COM RECORRÊNCIA: as ocorrências seguintes (2..N) permanecem pendentes —
      // cada uma alimenta os Alertas e é recebida separadamente.
      await FinanceiroService.updateRecebivelSemData(r.id, {
        status: 'convertido',
        lancamento_id: lanc.id,
        total_parcelas: nParcelas > 1 ? nParcelas : null,
        plano_conta_id: convPlanoId,
      })

      toast({
        title: 'Recebível convertido em lançamento previsto!',
        description:
          nParcelas > 1
            ? `${contrato} — ${formatCurrency(valorTotal)} em ${nParcelas}x de ${formatCurrency(valorParcela)}. Agora entra na projeção.`
            : `${contrato} — ${formatCurrency(valorTotal)} previsto. Agora entra na projeção.`,
      })
      onConvertido()
      onClose()
    } catch (err: any) {
      setConvError(err.message || 'Erro ao converter recebível em lançamento.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <CalendarClock className="w-4 h-4 text-[#00D68F]" aria-hidden="true" />
            Definir data do recebimento
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="rounded-md bg-[#0B0F14] border border-[#232B36] p-3 text-xs text-gray-300">
            <div className="font-semibold text-white text-sm">{r.descricao}</div>
            <div className="mt-1">
              {formatCurrency(valorTotal)}
              {r.total_parcelas ? ` em ${r.total_parcelas}x` : ''}
              {r.contratante ? ` • ${r.contratante}` : ''}
            </div>
          </div>

          {convError && (
            <Alert className="bg-[#FF5C5C]/15 border-[#FF5C5C]/50 text-[#FF5C5C]">
              <AlertTriangle className="w-4 h-4 mr-2" />
              <AlertDescription className="font-medium text-xs">{convError}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="conv-data" className="text-xs text-gray-300 font-semibold">
              Data do recebimento / 1ª parcela *
            </Label>
            <Input
              id="conv-data"
              type="date"
              value={convData}
              onChange={(e) => setConvData(e.target.value)}
              className="bg-[#0B0F14] border-[#232B36] text-white"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="conv-parcelas" className="text-xs text-gray-300 font-semibold">
                Nº de parcelas
              </Label>
              <Input
                id="conv-parcelas"
                value={convParcelas}
                onChange={(e) => setConvParcelas(e.target.value)}
                inputMode="numeric"
                placeholder="Vazio = pagamento único"
                className="bg-[#0B0F14] border-[#232B36] text-white"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="conv-dia" className="text-xs text-gray-300 font-semibold">
                Dia do vencimento
              </Label>
              <Input
                id="conv-dia"
                value={diaVenc ? String(diaVenc) : '—'}
                readOnly
                tabIndex={-1}
                className="bg-[#0B0F14] border-[#232B36] text-gray-400"
                aria-readonly="true"
              />
            </div>
          </div>
          {!isNaN(nParcelas) && nParcelas > 1 && (
            <p className="text-[11px] text-gray-500">
              Serão criados 1 lançamento previsto + recorrência parcelada: {nParcelas}x de{' '}
              {formatCurrency(valorParcela)} no dia {diaVenc ?? '—'} de cada mês.
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="conv-conta" className="text-xs text-gray-300 font-semibold">
              Conta bancária de recebimento *
            </Label>
            <select
              id="conv-conta"
              value={convContaId}
              onChange={(e) => setConvContaId(e.target.value)}
              className="h-10 w-full px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
            >
              <option value="">Selecione…</option>
              {contas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.banco} ({c.conta})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="conv-plano" className="text-xs text-gray-300 font-semibold">
              Categoria (receita) *
            </Label>
            <select
              id="conv-plano"
              value={convPlanoId}
              onChange={(e) => setConvPlanoId(e.target.value)}
              className="h-10 w-full px-3 rounded-md bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
            >
              <option value="">Selecione…</option>
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
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleConfirmar}
            disabled={salvando}
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
          >
            {salvando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <CalendarClock className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            {salvando ? 'Convertendo…' : 'Converter em Lançamento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
