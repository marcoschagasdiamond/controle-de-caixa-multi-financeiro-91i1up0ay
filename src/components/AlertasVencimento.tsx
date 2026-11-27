import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Financeiro, Lancamento, RecebivelOcorrencia, RecebivelSemData } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate } from '@/lib/formatters'
import { diasAtraso, diasEntre } from '@/lib/vencimento'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { AlertTriangle, Clock, CheckCircle2, Inbox } from 'lucide-react'

// Janela de "vencendo" (dias) e limite de itens resolvidos exibidos
const DIAS_VENCENDO = 7
const LIMITE_RESOLVIDOS = 10

interface AlertasVencimentoProps {
  lancamentos: Lancamento[]
  /** Recebíveis sem data pendentes; só entram os com data_prevista */
  recebiveisPendentes?: RecebivelSemData[]
  /** Ocorrências mensais pendentes de recebíveis recorrentes (cada uma é um item) */
  ocorrenciasPendentes?: RecebivelOcorrencia[]
  financeiros: Financeiro[] // financeiros acessíveis ao usuário logado
  /** Financeiro selecionado no Painel ('todos' = consolidado) */
  financeiroIdSelecionado: string
}

interface ItemAlerta {
  lancamento?: Lancamento
  recebivel?: RecebivelSemData
  /** Ocorrência mensal (n/N) de um recebível recorrente */
  ocorrencia?: RecebivelOcorrencia
  nomeFinanceiro: string
  vencimento: string
  dias: number
}

// Lançamento previsto: vence em data_vencimento (ou, se ausente, na própria data)
const vencimentoDe = (l: Lancamento) => l.data_vencimento || l.data

/** Card "Alertas de vencimento": atrasados, vencendo em 7 dias e resolvidos em atraso. */
export function AlertasVencimento({
  lancamentos,
  recebiveisPendentes = [],
  ocorrenciasPendentes = [],
  financeiros,
  financeiroIdSelecionado,
}: AlertasVencimentoProps) {
  const navigate = useNavigate()
  const hoje = getTodayISODate()

  const { atrasados, vencendo, resolvidos } = useMemo(() => {
    // Defesa extra além do RLS: só financeiros que o usuário pode acessar
    const acessiveis = new Map(financeiros.map((f) => [f.id, f.nome]))
    const permitido = (financeiroId: string) => acessiveis.has(financeiroId)
    const passaFiltro = (financeiroId: string) =>
      financeiroIdSelecionado === 'todos' || financeiroId === financeiroIdSelecionado
    const nomeDe = (financeiroId: string) => acessiveis.get(financeiroId) || ''

    const atrasados: ItemAlerta[] = []
    const vencendo: ItemAlerta[] = []
    const resolvidos: ItemAlerta[] = []

    const classificar = (
      financeiroId: string,
      venc: string,
      montar: (dias: number) => ItemAlerta,
    ) => {
      // diasEntre(hoje, venc): positivo = vence no futuro; negativo = já passou
      const faltam = diasEntre(hoje, venc)
      if (faltam < 0) atrasados.push(montar(-faltam))
      else if (faltam <= DIAS_VENCENDO) vencendo.push(montar(faltam))
    }

    for (const l of lancamentos) {
      if (!permitido(l.financeiro_id) || !passaFiltro(l.financeiro_id)) continue
      if (l.status === 'previsto') {
        const venc = vencimentoDe(l)
        classificar(l.financeiro_id, venc, (dias) => ({
          lancamento: l,
          nomeFinanceiro: nomeDe(l.financeiro_id),
          vencimento: venc,
          dias,
        }))
      } else if (l.data_vencimento && diasAtraso(l.data, l.data_vencimento) > 0) {
        resolvidos.push({
          lancamento: l,
          nomeFinanceiro: nomeDe(l.financeiro_id),
          vencimento: l.data_vencimento,
          dias: diasAtraso(l.data, l.data_vencimento),
        })
      }
    }

    // Recebíveis pendentes com data prevista entram nas mesmas faixas
    for (const r of recebiveisPendentes) {
      if (!r.data_prevista) continue
      // Recorrente: a 1ª ocorrência é exibida via ocorrência (abaixo) para
      // mostrar a fração n/N; aqui entra só o não recorrente.
      if (r.recorrencia_meses && r.recorrencia_meses >= 2) continue
      if (!permitido(r.financeiro_id) || !passaFiltro(r.financeiro_id)) continue
      const montar = (dias: number): ItemAlerta => ({
        recebivel: r,
        nomeFinanceiro: nomeDe(r.financeiro_id),
        vencimento: r.data_prevista as string,
        dias,
      })
      classificar(r.financeiro_id, r.data_prevista, montar)
    }

    // Ocorrências mensais pendentes (recebíveis recorrentes): cada uma é um
    // item próprio, com data prevista própria e fração n/N no rótulo.
    for (const o of ocorrenciasPendentes) {
      if (o.status !== 'pendente' || !o.data_prevista) continue
      if (!permitido(o.financeiro_id) || !passaFiltro(o.financeiro_id)) continue
      const pai = recebiveisPendentes.find((r) => r.id === o.recebivel_pai_id)
      if (!pai) continue
      const montar = (dias: number): ItemAlerta => ({
        recebivel: pai,
        ocorrencia: o,
        nomeFinanceiro: nomeDe(o.financeiro_id),
        vencimento: o.data_prevista as string,
        dias,
      })
      classificar(o.financeiro_id, o.data_prevista, montar)
    }

    atrasados.sort((a, b) => b.dias - a.dias)
    vencendo.sort((a, b) => a.dias - b.dias)
    resolvidos.sort((a, b) => (b.lancamento?.data || '').localeCompare(a.lancamento?.data || ''))
    return { atrasados, vencendo, resolvidos: resolvidos.slice(0, LIMITE_RESOLVIDOS) }
  }, [
    lancamentos,
    recebiveisPendentes,
    ocorrenciasPendentes,
    financeiros,
    financeiroIdSelecionado,
    hoje,
  ])

  const abrirItem = (item: ItemAlerta) => {
    if (item.recebivel) {
      // Recebível (ou ocorrência): abre a seção em modo edição do registro pai;
      // com ocorrência, leva o id dela para converter só aquele mês.
      navigate('/lancamentos', {
        state: {
          editarRecebivelId: item.recebivel.id,
          editarOcorrenciaId: item.ocorrencia?.id ?? null,
        },
      })
    } else if (item.lancamento) {
      navigate('/lancamentos', { state: { editarLancamentoId: item.lancamento.id } })
    }
  }

  const textoDias = (dias: number, passado: boolean) => {
    if (passado) return dias === 1 ? 'venceu há 1 dia' : `venceu há ${dias} dias`
    if (dias === 0) return 'vence hoje'
    return dias === 1 ? 'vence em 1 dia' : `vence em ${dias} dias`
  }

  const renderItem = (item: ItemAlerta, tom: 'vermelho' | 'amarelo' | 'cinza') => {
    const cor =
      tom === 'vermelho' ? 'text-[#FF5C5C]' : tom === 'amarelo' ? 'text-[#FACC15]' : 'text-gray-400'
    const l = item.lancamento
    const r = item.recebivel
    const key = r
      ? item.ocorrencia
        ? `rec-oc-${item.ocorrencia.id}`
        : `rec-${r.id}`
      : `lan-${l?.id}`
    const ehRecebivel = Boolean(r)

    // Faixas de texto: recebível usa "recebimento previsto/atrasado"
    const textoFaixa = () => {
      if (tom === 'cinza' && l) {
        return `pago em ${formatDateBR(l.data)} · vencimento ${formatDateBR(item.vencimento)} · ${item.dias} ${item.dias === 1 ? 'dia' : 'dias'} de atraso`
      }
      if (ehRecebivel) {
        if (tom === 'vermelho')
          return item.dias === 1
            ? 'recebimento atrasado há 1 dia'
            : `recebimento atrasado há ${item.dias} dias`
        return item.dias === 0
          ? 'recebimento previsto para hoje'
          : item.dias === 1
            ? 'recebimento previsto em 1 dia'
            : `recebimento previsto em ${item.dias} dias`
      }
      return `${textoDias(item.dias, tom === 'vermelho')} · vencimento ${formatDateBR(item.vencimento)}`
    }

    const arialLabel = r
      ? `Abrir recebível ${r.descricao}, data prevista ${formatDateBR(item.vencimento)}`
      : `Abrir lançamento ${l?.descricao || 'sem descrição'}, vencimento ${formatDateBR(item.vencimento)}`
    const descricao = r
      ? item.ocorrencia
        ? `${r.descricao} (parcela ${item.ocorrencia.numero}/${r.recorrencia_meses ?? '?'})`
        : r.descricao
      : l?.descricao || 'Sem descrição'
    const valor = r ? Number(r.valor_total) : Number(l?.valor ?? 0)

    return (
      <li key={key}>
        <button
          type="button"
          onClick={() => abrirItem(item)}
          aria-label={arialLabel}
          className="w-full text-left flex items-center justify-between gap-3 rounded-md px-3 py-2 bg-[#0B0F14] border border-[#232B36] hover:border-[#00D68F] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00D68F]"
        >
          <span className="min-w-0">
            <span className="block text-sm text-white truncate">
              {ehRecebivel && (
                <Inbox
                  className="w-3.5 h-3.5 text-amber-400 inline mr-1.5 -mt-0.5"
                  aria-hidden="true"
                />
              )}
              {descricao}
              {financeiroIdSelecionado === 'todos' && (
                <span className="text-gray-500"> · {item.nomeFinanceiro}</span>
              )}
            </span>
            <span className={`block text-xs font-medium ${cor}`}>
              {tom === 'cinza'
                ? textoFaixa()
                : `${textoFaixa()} · ${ehRecebivel ? 'previsto' : 'vencimento'} ${formatDateBR(item.vencimento)}`}
            </span>
          </span>
          <span
            className={`shrink-0 font-mono text-sm font-bold ${ehRecebivel || l?.tipo === 'credito' ? 'text-[#00D68F]' : 'text-white'}`}
          >
            {formatCurrency(valor)}
          </span>
        </button>
      </li>
    )
  }

  const vazio = atrasados.length === 0 && vencendo.length === 0 && resolvidos.length === 0

  return (
    <Card className="bg-[#141A22] border-[#232B36] text-white shadow-xl">
      <CardHeader className="pb-3 border-b border-[#232B36]">
        <CardTitle className="text-base font-bold text-white flex items-center gap-2 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-[#FF5C5C]" aria-hidden="true" />
          Alertas de vencimento
          {(atrasados.length > 0 || vencendo.length > 0) && (
            <span className="text-xs font-mono font-semibold text-gray-400">
              {atrasados.length} atrasados · {vencendo.length} vencendo
            </span>
          )}
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
