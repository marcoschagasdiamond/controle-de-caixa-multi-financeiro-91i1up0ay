import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { Financeiro, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { diasEntre } from '@/lib/vencimento'
import { FinanceiroService } from '@/services/financeiro'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CheckCircle2, FileText } from 'lucide-react'

interface ContasPendentesProps {
  lancamentos: Lancamento[]
  financeiros: Financeiro[]
  financeiroIdSelecionado: string
  /** Recarrega os dados do Painel após marcar pago/recebido */
  onAtualizado: () => void
}

interface ItemConta {
  lancamento: Lancamento
  nomeFinanceiro: string
  vencimento: string
  /** dias até o vencimento; negativo = já venceu */
  faltam: number
}

/** Vencimento exibido: data_vencimento quando existir; senão a data do lançamento. */
export const vencimentoDe = (l: Lancamento) => l.data_vencimento || l.data

/**
 * Tabela "Contas a Pagar e a Receber" do Painel: lançamentos previstos,
 * ordenados por vencimento mais próximo; vencidos no topo em vermelho.
 * Ação "marcar pago/recebido" torna o lançamento realizado com a data de hoje,
 * preservando a data_vencimento original (histórico de atraso dos alertas).
 */
export function ContasPendentes({
  lancamentos,
  financeiros,
  financeiroIdSelecionado,
  onAtualizado,
}: ContasPendentesProps) {
  const navigate = useNavigate()
  const { toast } = useToast()
  const hoje = getTodayISODate()
  const [itemConfirmar, setItemConfirmar] = useState<ItemConta | null>(null)
  const [marcando, setMarcando] = useState(false)

  const nomeFinanceiros = useMemo(
    () => new Map(financeiros.map((f) => [f.id, f.nome])),
    [financeiros],
  )

  const itens = useMemo<ItemConta[]>(() => {
    // Defesa extra além do RLS: só financeiros que o usuário pode acessar
    const lista = lancamentos
      .filter((l) => l.status === 'previsto' && nomeFinanceiros.has(l.financeiro_id))
      .filter(
        (l) => financeiroIdSelecionado === 'todos' || l.financeiro_id === financeiroIdSelecionado,
      )
      .map((l) => {
        const venc = vencimentoDe(l)
        return {
          lancamento: l,
          nomeFinanceiro: nomeFinanceiros.get(l.financeiro_id) || '',
          vencimento: venc,
          faltam: diasEntre(hoje, venc),
        }
      })
    // Vencidos primeiro (mais antigos no topo), depois os futuros pelo mais próximo
    lista.sort((a, b) => a.vencimento.localeCompare(b.vencimento))
    return lista
  }, [lancamentos, nomeFinanceiros, financeiroIdSelecionado, hoje])

  const totalPagar = itens
    .filter((i) => i.lancamento.tipo === 'debito')
    .reduce((acc, i) => acc + Number(i.lancamento.valor), 0)
  const totalReceber = itens
    .filter((i) => i.lancamento.tipo === 'credito')
    .reduce((acc, i) => acc + Number(i.lancamento.valor), 0)

  const confirmarMarcacao = async () => {
    if (!itemConfirmar) return
    setMarcando(true)
    try {
      // Data de hoje como pagamento/recebimento; data_vencimento original PRESERVADA
      await FinanceiroService.updateLancamento(itemConfirmar.lancamento.id, {
        status: 'realizado',
        data: hoje,
      })
      toast({
        title:
          itemConfirmar.lancamento.tipo === 'credito'
            ? 'Recebimento registrado'
            : 'Pagamento registrado',
        description: `${itemConfirmar.lancamento.descricao || 'Lançamento'} — vencimento ${formatDateBR(itemConfirmar.vencimento)} preservado no histórico.`,
      })
      setItemConfirmar(null)
      onAtualizado()
    } catch (err) {
      console.error('Erro ao marcar pago/recebido:', err)
      toast({
        title: 'Erro ao registrar',
        description: 'Não foi possível atualizar o lançamento. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setMarcando(false)
    }
  }

  const abrirLancamento = (l: Lancamento) =>
    navigate('/lancamentos', { state: { editarLancamentoId: l.id } })

  return (
    <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
      <CardHeader className="pb-3 border-b border-[#232B36] flex flex-row items-center justify-between">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-[#00D68F]" />
          Contas a Pagar e a Receber
        </CardTitle>
        <span className="text-xs text-gray-400 font-mono text-right">
          A pagar <span className="text-[#FF5C5C] font-bold">{formatCurrency(totalPagar)}</span>
          {' · '}
          A receber <span className="text-[#00D68F] font-bold">{formatCurrency(totalReceber)}</span>
        </span>
      </CardHeader>
      <CardContent className="p-0">
        {itens.length === 0 ? (
          <p className="p-8 text-center text-xs text-gray-500">Nenhuma conta prevista pendente.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <caption className="sr-only">
                Lançamentos previstos a pagar e a receber, ordenados por vencimento
              </caption>
              <thead>
                <tr className="border-b border-[#232B36] text-left text-[10px] uppercase text-gray-500">
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Vencimento
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Descrição
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Valor
                  </th>
                  <th scope="col" className="px-3 py-2 font-semibold">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody>
                {itens.map(({ lancamento: l, nomeFinanceiro, vencimento, faltam }) => {
                  const vencido = faltam < 0
                  return (
                    <tr
                      key={l.id}
                      className={`border-b border-[#232B36]/60 ${
                        vencido ? 'bg-[#FF5C5C]/10 text-[#FF5C5C]' : 'text-gray-300'
                      }`}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={vencido ? 'text-[#FF5C5C] font-semibold' : ''}>
                          {formatDateBR(vencimento)}
                        </span>
                        <span
                          className={`block text-[10px] ${
                            vencido ? 'text-[#FF5C5C]' : 'text-gray-500'
                          }`}
                        >
                          {vencido
                            ? faltam === -1
                              ? 'venceu há 1 dia'
                              : `venceu há ${-faltam} dias`
                            : faltam === 0
                              ? 'vence hoje'
                              : `vence em ${faltam} ${faltam === 1 ? 'dia' : 'dias'}`}
                        </span>
                      </td>
                      <td className="px-3 py-2 min-w-0">
                        <button
                          type="button"
                          onClick={() => abrirLancamento(l)}
                          aria-label={`Abrir lançamento ${l.descricao || 'sem descrição'}`}
                          className="text-left font-semibold text-white hover:text-[#00D68F] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F] rounded-sm max-w-full truncate block cursor-pointer"
                        >
                          {l.descricao || 'Sem descrição'}
                        </button>
                        {financeiroIdSelecionado === 'todos' && nomeFinanceiro && (
                          <span className="block text-[10px] text-gray-500 truncate">
                            {nomeFinanceiro}
                          </span>
                        )}
                      </td>
                      <td
                        className={`px-3 py-2 whitespace-nowrap font-mono font-bold ${
                          l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-white'
                        }`}
                      >
                        {l.tipo === 'credito' ? '+' : '-'} {formatCurrency(Number(l.valor))}
                      </td>
                      <td className="px-3 py-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={marcando}
                          onClick={() =>
                            setItemConfirmar({ lancamento: l, nomeFinanceiro, vencimento, faltam })
                          }
                          aria-label={
                            l.tipo === 'credito'
                              ? `Marcar como recebido: ${l.descricao || 'lançamento'}`
                              : `Marcar como pago: ${l.descricao || 'lançamento'}`
                          }
                          className="h-7 px-2 text-[10px] border-[#00D68F]/40 text-[#00D68F] hover:bg-[#00D68F]/10 hover:text-[#00D68F] cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                          {l.tipo === 'credito' ? 'Recebido' : 'Pago'}
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      <Dialog
        open={itemConfirmar !== null}
        onOpenChange={(open) => {
          if (!open) setItemConfirmar(null)
        }}
      >
        <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">
              {itemConfirmar?.lancamento.tipo === 'credito'
                ? 'Confirmar recebimento'
                : 'Confirmar pagamento'}
            </DialogTitle>
            <DialogDescription className="text-gray-400 text-sm">
              {itemConfirmar && (
                <>
                  Marcar{' '}
                  <b className="text-white">
                    {itemConfirmar.lancamento.descricao || 'sem descrição'}
                  </b>{' '}
                  ({formatCurrency(Number(itemConfirmar.lancamento.valor))}) como{' '}
                  {itemConfirmar.lancamento.tipo === 'credito' ? 'recebido' : 'pago'} hoje (
                  {formatDateBR(hoje)})?
                  {itemConfirmar.faltam < 0 && (
                    <span className="block mt-2 text-[#FACC15] text-xs">
                      Este lançamento está vencido há {-itemConfirmar.faltam} dia(s) — o vencimento
                      original ({formatDateBR(itemConfirmar.vencimento)}) será preservado no
                      histórico de atraso.
                    </span>
                  )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setItemConfirmar(null)}
              className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmarMarcacao}
              disabled={marcando}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
            >
              {marcando
                ? 'Registrando...'
                : itemConfirmar?.lancamento.tipo === 'credito'
                  ? 'Confirmar recebimento'
                  : 'Confirmar pagamento'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
