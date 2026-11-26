import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Financeiro, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { diasAtraso, diasEntre } from '@/lib/vencimento'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertTriangle, Clock, CheckCircle2 } from 'lucide-react'

// Janela de "vencendo" (dias) e limite de itens resolvidos exibidos
const DIAS_VENCENDO = 7
const LIMITE_RESOLVIDOS = 10

interface AlertasVencimentoProps {
  lancamentos: Lancamento[]
  financeiros: Financeiro[] // financeiros acessíveis ao usuário logado
  /** Financeiro selecionado no Painel ('todos' = consolidado) */
  financeiroIdSelecionado: string
}

interface ItemAlerta {
  lancamento: Lancamento
  nomeFinanceiro: string
  vencimento: string
  dias: number
}

// Lançamento previsto: vence em data_vencimento (ou, se ausente, na própria data)
const vencimentoDe = (l: Lancamento) => l.data_vencimento || l.data

/** Card "Alertas de vencimento": atrasados, vencendo em 7 dias e resolvidos em atraso. */
export function AlertasVencimento({
  lancamentos,
  financeiros,
  financeiroIdSelecionado,
}: AlertasVencimentoProps) {
  const navigate = useNavigate()
  const hoje = getTodayISODate()

  const { atrasados, vencendo, resolvidos } = useMemo(() => {
    // Defesa extra além do RLS: só financeiros que o usuário pode acessar
    const acessiveis = new Map(financeiros.map((f) => [f.id, f.nome]))
    const visiveis = lancamentos
      .filter((l) => acessiveis.has(l.financeiro_id))
      .filter(
        (l) => financeiroIdSelecionado === 'todos' || l.financeiro_id === financeiroIdSelecionado,
      )
    const nomeDe = (l: Lancamento) => acessiveis.get(l.financeiro_id) || ''

    const atrasados: ItemAlerta[] = []
    const vencendo: ItemAlerta[] = []
    const resolvidos: ItemAlerta[] = []

    for (const l of visiveis) {
      if (l.status === 'previsto') {
        const venc = vencimentoDe(l)
        // diasEntre(hoje, venc): positivo = vence no futuro; negativo = já passou
        const faltam = diasEntre(hoje, venc)
        if (faltam < 0) {
          atrasados.push({
            lancamento: l,
            nomeFinanceiro: nomeDe(l),
            vencimento: venc,
            dias: -faltam,
          })
        } else if (faltam <= DIAS_VENCENDO) {
          vencendo.push({
            lancamento: l,
            nomeFinanceiro: nomeDe(l),
            vencimento: venc,
            dias: faltam,
          })
        }
      } else if (l.data_vencimento && diasAtraso(l.data, l.data_vencimento) > 0) {
        resolvidos.push({
          lancamento: l,
          nomeFinanceiro: nomeDe(l),
          vencimento: l.data_vencimento,
          dias: diasAtraso(l.data, l.data_vencimento),
        })
      }
    }

    atrasados.sort((a, b) => b.dias - a.dias)
    vencendo.sort((a, b) => a.dias - b.dias)
    resolvidos.sort((a, b) => b.lancamento.data.localeCompare(a.lancamento.data))
    return { atrasados, vencendo, resolvidos: resolvidos.slice(0, LIMITE_RESOLVIDOS) }
  }, [lancamentos, financeiros, financeiroIdSelecionado, hoje])

  const abrirLancamento = (l: Lancamento) =>
    navigate('/lancamentos', { state: { editarLancamentoId: l.id } })

  const textoDias = (dias: number, passado: boolean) => {
    if (passado) return dias === 1 ? 'venceu há 1 dia' : `venceu há ${dias} dias`
    if (dias === 0) return 'vence hoje'
    return dias === 1 ? 'vence em 1 dia' : `vence em ${dias} dias`
  }

  const renderItem = (item: ItemAlerta, tom: 'vermelho' | 'amarelo' | 'cinza') => {
    const cor =
      tom === 'vermelho' ? 'text-[#FF5C5C]' : tom === 'amarelo' ? 'text-[#FACC15]' : 'text-gray-400'
    const l = item.lancamento
    return (
      <li key={l.id}>
        <button
          type="button"
          onClick={() => abrirLancamento(l)}
          aria-label={`Abrir lançamento ${l.descricao || 'sem descrição'}, vencimento ${formatDateBR(item.vencimento)}`}
          className="w-full text-left flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-[#0B0F14] border border-[#232B36] hover:border-[#00D68F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F]"
        >
          <span className="min-w-0">
            <span className="block text-sm text-white truncate">
              {l.descricao || 'Sem descrição'}
              {financeiroIdSelecionado === 'todos' && (
                <span className="text-gray-500"> · {item.nomeFinanceiro}</span>
              )}
            </span>
            <span className={`block text-xs font-medium ${cor}`}>
              {tom === 'cinza'
                ? `pago em ${formatDateBR(l.data)} · vencimento ${formatDateBR(item.vencimento)} · ${item.dias} ${item.dias === 1 ? 'dia' : 'dias'} de atraso`
                : `${textoDias(item.dias, tom === 'vermelho')} · vencimento ${formatDateBR(item.vencimento)}`}
            </span>
          </span>
          <span
            className={`shrink-0 font-mono text-sm font-bold ${l.tipo === 'credito' ? 'text-[#00D68F]' : 'text-white'}`}
          >
            {formatCurrency(Number(l.valor))}
          </span>
        </button>
      </li>
    )
  }

  const vazio = atrasados.length === 0 && vencendo.length === 0 && resolvidos.length === 0

  return (
    <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
      <CardHeader className="pb-3 border-b border-[#232B36]">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-[#FF5C5C]" />
          Alertas de vencimento
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4 space-y-5">
        {vazio && <p className="text-sm text-gray-400">Nenhum alerta de vencimento no momento.</p>}

        {atrasados.length > 0 && (
          <section aria-labelledby="alerta-atrasados">
            <h3
              id="alerta-atrasados"
              className="text-xs font-bold uppercase text-[#FF5C5C] flex items-center gap-1 mb-2"
            >
              <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
              Atrasados ({atrasados.length})
            </h3>
            <ul className="space-y-2">{atrasados.map((i) => renderItem(i, 'vermelho'))}</ul>
          </section>
        )}

        {vencendo.length > 0 && (
          <section aria-labelledby="alerta-vencendo">
            <h3
              id="alerta-vencendo"
              className="text-xs font-bold uppercase text-[#FACC15] flex items-center gap-1 mb-2"
            >
              <Clock className="w-3.5 h-3.5" aria-hidden="true" />
              Vencendo nos próximos {DIAS_VENCENDO} dias ({vencendo.length})
            </h3>
            <ul className="space-y-2">{vencendo.map((i) => renderItem(i, 'amarelo'))}</ul>
          </section>
        )}

        {resolvidos.length > 0 && (
          <section aria-labelledby="alerta-resolvidos">
            <h3
              id="alerta-resolvidos"
              className="text-xs font-bold uppercase text-gray-400 flex items-center gap-1 mb-2"
            >
              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
              Resolvidos em atraso, para conferência
            </h3>
            <ul className="space-y-2">{resolvidos.map((i) => renderItem(i, 'cinza'))}</ul>
          </section>
        )}
      </CardContent>
    </Card>
  )
}
