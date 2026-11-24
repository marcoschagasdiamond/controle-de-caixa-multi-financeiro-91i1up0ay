import React, { useMemo, useState } from 'react'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, ContaFixa, Lancamento } from '@/types/financeiro'
import { formatCurrency, formatDateBR, getTodayISODate, addDays } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, CalendarClock, Check, Loader2, Wallet } from 'lucide-react'

export interface ContaFixaAlerta {
  contaFixa: ContaFixa
  dataVencimento: string // YYYY-MM-DD
  diasRestantes: number // negativo = vencida
  vencida: boolean
  financeiro?: Financeiro
}

/**
 * Calcula os vencimentos do ciclo atual de cada conta fixa (dia_vencimento é 1..31),
 * a partir de hoje: vencidas (antes de hoje) e vencendo nos próximos 7 dias.
 * O cálculo é "diário" — refeito a cada carregamento do Painel.
 */
export function calcularAlertasContasFixas(
  contasFixas: ContaFixa[],
  financeiros: Financeiro[],
  lancamentos: Lancamento[],
  financeiroIdFiltro?: string,
): ContaFixaAlerta[] {
  const hojeStr = getTodayISODate()
  const limiteStr = addDays(hojeStr, 7)

  const [ha, ma, da] = hojeStr.split('-').map(Number)
  const hoje = new Date(ha, ma - 1, da)

  const alertas: ContaFixaAlerta[] = []
  for (const cf of contasFixas) {
    if (!cf.ativo || cf.tipo !== 'despesa') continue
    if (
      financeiroIdFiltro &&
      financeiroIdFiltro !== 'todos' &&
      cf.financeiro_id !== financeiroIdFiltro
    ) {
      continue
    }

    const dia = Math.min(Math.max(Number(cf.dia_vencimento) || 1, 1), 31)
    // Vencimento do ciclo corrente; se o dia já passou neste mês (e não é hoje), recua para o ciclo do mês anterior
    let anoCiclo = hoje.getFullYear()
    let mesCiclo = hoje.getMonth()
    if (dia < hoje.getDate()) {
      mesCiclo -= 1
      if (mesCiclo < 0) {
        mesCiclo = 11
        anoCiclo -= 1
      }
    }
    const ultimoDiaMesCiclo = new Date(anoCiclo, mesCiclo + 1, 0).getDate()
    const diaAjustado = Math.min(dia, ultimoDiaMesCiclo)
    const venc = new Date(anoCiclo, mesCiclo, diaAjustado)
    const vencStr = `${venc.getFullYear()}-${String(venc.getMonth() + 1).padStart(2, '0')}-${String(
      venc.getDate(),
    ).padStart(2, '0')}`

    if (vencStr > limiteStr || vencStr < hojeStr) continue

    // Já paga neste ciclo? (lançamento débito realizado com a marcação do alerta)
    const ciclo = vencStr.slice(0, 7)
    const jaPaga = lancamentos.some(
      (l) =>
        l.tipo === 'debito' &&
        l.status === 'realizado' &&
        l.financeiro_id === cf.financeiro_id &&
        (l.observacao === `conta_fixa:${cf.id}:${ciclo}` ||
          l.descricao === `${cf.descricao} - pagamento via alerta`),
    )
    if (jaPaga) continue

    const diasRestantes = Math.round((venc.getTime() - hoje.getTime()) / 86400000)

    alertas.push({
      contaFixa: cf,
      dataVencimento: vencStr,
      diasRestantes,
      vencida: vencStr < hojeStr,
      financeiro: financeiros.find((f) => f.id === cf.financeiro_id),
    })
  }

  // Vencidas primeiro (mais antigas), depois as mais próximas
  return alertas.sort((a, b) => a.dataVencimento.localeCompare(b.dataVencimento))
}

interface Props {
  contasFixas: ContaFixa[]
  financeiros: Financeiro[]
  lancamentos: Lancamento[]
  financeiroIdFiltro?: string
  onPagamentoRegistrado?: () => void
}

export function AlertaContasFixas({
  contasFixas,
  financeiros,
  lancamentos,
  financeiroIdFiltro,
  onPagamentoRegistrado,
}: Props) {
  const { toast } = useToast()
  const [pagando, setPagando] = useState<string | null>(null)

  const alertas = useMemo(
    () => calcularAlertasContasFixas(contasFixas, financeiros, lancamentos, financeiroIdFiltro),
    [contasFixas, financeiros, lancamentos, financeiroIdFiltro],
  )

  const handleMarcarComoPaga = async (alerta: ContaFixaAlerta) => {
    const cf = alerta.contaFixa
    const ciclo = alerta.dataVencimento.slice(0, 7)

    // conta padrão: a associada à conta fixa ou a primeira conta ativa do financeiro
    const contasDoFin = await FinanceiroService.getContas(cf.financeiro_id)
    const conta = cf.conta_id
      ? contasDoFin.find((c) => c.id === cf.conta_id) || contasDoFin.find((c) => c.ativo)
      : contasDoFin.find((c) => c.ativo)
    if (!conta) {
      toast({
        variant: 'destructive',
        title: 'Conta bancária não configurada',
        description:
          'Cadastre uma conta bancária ativa para este financeiro em Configurações antes de registrar o pagamento.',
      })
      return
    }

    // plano de contas GLOBAL: o associado à conta fixa ou o primeiro de despesa ativo
    const planos = await FinanceiroService.getPlanoContas()
    const plano = cf.plano_conta_id
      ? planos.find((p) => p.id === cf.plano_conta_id) ||
        planos.find((p) => p.tipo === 'despesa' && p.ativo)
      : planos.find((p) => p.tipo === 'despesa' && p.ativo)
    if (!plano) {
      toast({
        variant: 'destructive',
        title: 'Plano de contas não configurado',
        description:
          'Cadastre uma categoria de despesa no Plano de Contas (global) em Configurações antes de registrar o pagamento.',
      })
      return
    }

    setPagando(cf.id)
    try {
      await FinanceiroService.createLancamento({
        financeiro_id: cf.financeiro_id,
        conta_id: conta.id,
        plano_conta_id: plano.id,
        tipo: 'debito',
        valor: Number(cf.valor_estimado) || 0,
        data: getTodayISODate(),
        descricao: `${cf.descricao} - pagamento via alerta`,
        status: 'realizado',
        contraparte: cf.descricao,
        observacao: `conta_fixa:${cf.id}:${ciclo}`,
        conciliado: false,
      })

      const vencidoTxt =
        alerta.diasRestantes < 0
          ? `${Math.abs(alerta.diasRestantes)} dia(s) em atraso`
          : alerta.diasRestantes === 0
            ? 'vence hoje'
            : `vence em ${alerta.diasRestantes} dia(s)`
      toast({
        title: 'Pagamento registrado!',
        description: `${cf.descricao} (${formatCurrency(cf.valor_estimado)}) — débito lançado em ${formatDateBR(
          getTodayISODate(),
        )} na conta ${conta.banco}. ${vencidoTxt}.`,
      })
      onPagamentoRegistrado?.()
    } catch (err: any) {
      console.error('Erro ao registrar pagamento via alerta:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar pagamento',
        description: err?.message || 'Tente novamente.',
      })
    } finally {
      setPagando(null)
    }
  }

  if (alertas.length === 0) return null

  const vencidasCount = alertas.filter((a) => a.vencida).length
  const vencendoCount = alertas.length - vencidasCount

  return (
    <Card
      className={`bg-[#141A22] border shadow-xl ${
        vencidasCount > 0 ? 'border-[#FF5C5C]/50' : 'border-[#FFB020]/50'
      }`}
    >
      <CardContent className="p-4 sm:p-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                vencidasCount > 0
                  ? 'bg-[#FF5C5C]/10 border border-[#FF5C5C]/30'
                  : 'bg-[#FFB020]/10 border border-[#FFB020]/30'
              }`}
            >
              <AlertTriangle
                className={`w-5 h-5 ${vencidasCount > 0 ? 'text-[#FF5C5C]' : 'text-[#FFB020]'}`}
              />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white leading-tight">
                Contas Fixas — Vencidas e Vencendo nos Próximos 7 Dias
              </h3>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {vencidasCount > 0 && vencendoCount > 0
                  ? `${vencidasCount} vencida(s) e ${vencendoCount} vencendo em breve`
                  : vencidasCount > 0
                    ? `${vencidasCount} conta(s) vencida(s)`
                    : `${vencendoCount} conta(s) vencendo nos próximos 7 dias`}
                {' · '}total{' '}
                {formatCurrency(
                  alertas.reduce((acc, a) => acc + Number(a.contaFixa.valor_estimado || 0), 0),
                )}
              </p>
            </div>
          </div>
          <CalendarClock
            className={`w-5 h-5 shrink-0 ${vencidasCount > 0 ? 'text-[#FF5C5C]' : 'text-[#FFB020]'}`}
          />
        </div>

        <div className="divide-y divide-[#232B36] rounded-lg border border-[#232B36] bg-[#0B0F14]">
          {alertas.map((a) => {
            const cor = a.vencida ? '#FF5C5C' : '#FFB020'
            const statusTxt = a.vencida
              ? `Vencida em ${formatDateBR(a.dataVencimento)} (${Math.abs(a.diasRestantes)}d em atraso)`
              : a.diasRestantes === 0
                ? `Vence hoje · ${formatDateBR(a.dataVencimento)}`
                : `Vence em ${a.diasRestantes} dia(s) · ${formatDateBR(a.dataVencimento)}`
            return (
              <div
                key={a.contaFixa.id}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className="inline-block w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: cor }}
                    />
                    <span className="text-sm font-semibold text-white truncate">
                      {a.contaFixa.descricao}
                    </span>
                    {a.financeiro && (
                      <Badge
                        variant="outline"
                        className="text-[9px] py-0 px-1.5 font-mono shrink-0"
                        style={{ borderColor: a.financeiro.cor, color: a.financeiro.cor }}
                      >
                        {a.financeiro.nome}
                      </Badge>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 pl-4 flex items-center gap-1.5">
                    <CalendarClock className="w-3 h-3" style={{ color: cor }} />
                    <span style={{ color: cor }} className="font-medium">
                      {statusTxt}
                    </span>
                  </div>
                </div>
                <div className="flex items-center justify-between sm:justify-end gap-3 pl-4 sm:pl-0">
                  <span className="font-mono text-sm font-bold text-white sm:text-right">
                    {formatCurrency(a.contaFixa.valor_estimado)}
                  </span>
                  <Button
                    size="sm"
                    disabled={pagando === a.contaFixa.id}
                    onClick={() => handleMarcarComoPaga(a)}
                    className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-[11px] h-7 px-2.5 cursor-pointer disabled:opacity-60"
                  >
                    {pagando === a.contaFixa.id ? (
                      <Loader2 className="w-3 h-3 animate-spin mr-1" />
                    ) : (
                      <Check className="w-3 h-3 mr-1" />
                    )}
                    Marcar como paga
                  </Button>
                </div>
              </div>
            )
          })}
        </div>

        <p className="text-[10px] text-gray-500 flex items-center gap-1.5">
          <Wallet className="w-3 h-3" />
          Ao marcar como paga, um débito é lançado automaticamente na conta padrão do financeiro.
        </p>
      </CardContent>
    </Card>
  )
}
