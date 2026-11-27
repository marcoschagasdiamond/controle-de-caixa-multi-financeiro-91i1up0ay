import { useEffect, useMemo, useRef, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, PlanoConta, RecebivelOcorrencia, RecebivelSemData } from '@/types/financeiro'
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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  exportarRecebiveisCSV,
  exportarRecebiveisConsolidadoCSV,
  removerAcentos,
} from '@/lib/csvRecebiveis'
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
  // Ocorrência mensal clicada no alerta: abre a conversão daquele mês específico
  editarOcorrenciaId?: string | null
}

// Seção "Recebíveis sem Data (Contratos a Receber)" dentro de Lançamentos.
// Cadastro opcionalmente com data prevista (alimenta os Alertas de vencimento
// do Painel enquanto pendente) e observação; fica fora da projeção de caixa.
export function RecebiveisSemData({
  financeiros,
  planos,
  financeiroPadraoId,
  editarRecebivelId,
  editarOcorrenciaId,
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
  const [recorrenciaMeses, setRecorrenciaMeses] = useState('')
  const [selectedPlanoId, setSelectedPlanoId] = useState('')

  // FILTROS DA LISTA (estado local, sem persistência)
  const [filtroTexto, setFiltroTexto] = useState('')
  const [filtroValorMin, setFiltroValorMin] = useState('')
  const [filtroValorMax, setFiltroValorMax] = useState('')
  const [filtroDataDe, setFiltroDataDe] = useState('')
  const [filtroDataAte, setFiltroDataAte] = useState('')
  // Modo edição: id do recebível sendo editado (lápis no card de Pendentes)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const formularioRef = useRef<HTMLDivElement>(null)

  // Conversão
  const [convertendo, setConvertendo] = useState<RecebivelSemData | null>(null)
  const [convertendoOcorrenciaId, setConvertendoOcorrenciaId] = useState<string | null>(null)
  const [carregandoOcorrencias, setCarregandoOcorrencias] = useState(false)
  const [ocorrenciasCarregadas, setOcorrenciasCarregadas] = useState<RecebivelOcorrencia[]>([])

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

  // Ocorrências mensais dos recorrentes: alimentam a lista de pendentes
  const carregarOcorrencias = async () => {
    try {
      setOcorrenciasCarregadas(await FinanceiroService.getRecebivelOcorrencias())
    } catch {
      // Lista funciona sem as ocorrências (só deixa de mostrar as parcelas)
    }
  }
  useEffect(() => {
    carregarOcorrencias()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Vindo do card Alertas de vencimento do Painel: abre o recebível em edição
  // quando a lista já tiver carregado (e uma única vez por id recebido).
  // Com ocorrência clicada, abre o diálogo de conversão daquele mês específico.
  const editadoViaAlerta = useRef<string | null>(null)
  useEffect(() => {
    if (!editarRecebivelId || loading) return
    if (editadoViaAlerta.current === editarRecebivelId) return
    const alvo = recebiveis.find((r) => r.id === editarRecebivelId)
    if (!alvo) return
    editadoViaAlerta.current = editarRecebivelId
    if (editarOcorrenciaId) {
      const oc = ocorrenciasCarregadas.find((o) => o.id === editarOcorrenciaId)
      if (oc && oc.status === 'pendente') {
        setConvertendoOcorrenciaId(oc.id)
        setConvertendo(alvo)
      } else {
        iniciarEdicao(alvo)
      }
    } else {
      iniciarEdicao(alvo)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editarRecebivelId, editarOcorrenciaId, recebiveis, ocorrenciasCarregadas, loading])

  const valorNum = parseFloat(valorTotal.replace(',', '.'))
  const nParcelasCadastro = numParcelas ? parseInt(numParcelas, 10) : 0
  const valorParcelaCadastro =
    nParcelasCadastro > 1 && !isNaN(valorNum) ? valorNum / nParcelasCadastro : valorNum
  // Nº de vezes da recorrência mensal (escopo do componente: usado na dica do JSX)
  const nRecorrenciaCadastro = recorrenciaMeses ? parseInt(recorrenciaMeses, 10) : 0

  const limparFormulario = () => {
    setDescricao('')
    setValorTotal('')
    setNumParcelas('')
    setContratante('')
    setObservacao('')
    setDataPrevista('')
    setRecorrenciaMeses('')
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
    setRecorrenciaMeses(r.recorrencia_meses ? String(r.recorrencia_meses) : '')
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
    const nRecorrencia = recorrenciaMeses ? parseInt(recorrenciaMeses, 10) : 0
    if (recorrenciaMeses && (isNaN(nRecorrencia) || nRecorrencia < 2 || nRecorrencia > 120)) {
      setFormError(
        'Se informar recorrência, use um número de vezes entre 2 e 120. Deixe vazio para não repetir.',
      )
      return
    }
    if (nRecorrencia >= 2 && !dataPrevista) {
      setFormError(
        'Recorrência mensal exige a data prevista da 1ª ocorrência: informe-a para gerar as seguintes (+1 mês).',
      )
      return
    }

    // +1 mês por ocorrência (mesmo dia). Dia 29/30/31 cai no último dia do mês
    // quando o mês seguinte não o tem (Date normaliza o excedente).
    const somarMes = (iso: string, n: number) => {
      const [a, m, d] = iso.split('-').map(Number)
      const dt = new Date(Date.UTC(a, m - 1 + n, d))
      return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`
    }

    try {
      setSaving(true)
      if (editandoId) {
        // MODO EDIÇÃO: atualiza o registro existente (sem duplicar)
        const anterior = recebiveis.find((r) => r.id === editandoId)
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
          recorrencia_meses: nRecorrencia >= 2 ? nRecorrencia : null,
        })

        // Sincroniza as ocorrências futuras com a nova data prevista/recorrência
        const nAnterior = anterior?.recorrencia_meses ? anterior.recorrencia_meses : 1
        if (nRecorrencia >= 2 && dataPrevista) {
          const atuais = await FinanceiroService.getRecebivelOcorrencias(editandoId)
          // Recria do zero (menos a 1ª, que é o próprio registro): simples e sólido
          if (atuais.length > 0) {
            await FinanceiroService.deleteRecebivelOcorrenciasFuturas(editandoId, 2)
          }
          const novas = [] as Array<
            Parameters<typeof FinanceiroService.createRecebivelOcorrencias>[0][number]
          >
          for (let i = 2; i <= nRecorrencia; i++) {
            novas.push({
              recebivel_pai_id: editandoId,
              financeiro_id: selectedFinId,
              numero: i,
              data_prevista: somarMes(dataPrevista, i - 1),
              status: 'pendente',
              lancamento_id: null,
            })
          }
          await FinanceiroService.createRecebivelOcorrencias(novas)
        } else if (nRecorrencia < 2 && nAnterior >= 2) {
          // Recorrência removida na edição: apaga as ocorrências futuras
          await FinanceiroService.deleteRecebivelOcorrenciasFuturas(editandoId, 2)
        }
        toast({
          title: 'Recebível atualizado!',
          description:
            nRecorrencia >= 2
              ? `${descricao.trim()} — salvo; ${nRecorrencia - 1} ocorrência(s) mensal(is) atualizada(s).`
              : `${descricao.trim()} — alterações salvas com sucesso.`,
        })
        limparFormulario()
        await carregar()
        return
      }
      const criado = await FinanceiroService.createRecebivelSemData({
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
        recorrencia_meses: nRecorrencia >= 2 ? nRecorrencia : null,
      })
      // Ocorrências 2..N (+1 mês cada); a 1ª é o próprio registro
      if (nRecorrencia >= 2 && dataPrevista) {
        const novas = [] as Array<
          Parameters<typeof FinanceiroService.createRecebivelOcorrencias>[0][number]
        >
        for (let i = 2; i <= nRecorrencia; i++) {
          novas.push({
            recebivel_pai_id: criado.id,
            financeiro_id: selectedFinId,
            numero: i,
            data_prevista: somarMes(dataPrevista, i - 1),
            status: 'pendente',
            lancamento_id: null,
          })
        }
        await FinanceiroService.createRecebivelOcorrencias(novas)
      }
      toast({
        title: 'Recebível sem data registrado!',
        description:
          nRecorrencia >= 2
            ? `${descricao.trim()} — ${formatCurrency(v)} em ${nRecorrencia} ocorrências mensais, fora da projeção até você definir a data.`
            : `${descricao.trim()} — ${formatCurrency(v)} fora da projeção até você definir a data.`,
      })
      limparFormulario()
      await carregar()
    } catch (err: any) {
      setFormError(err.message || 'Erro ao salvar recebível.')
    } finally {
      setSaving(false)
    }
  }

  // Alcance da exclusão/edição num recebível com recorrência:
  // 'so-esta' = só o registro clicado (o pai/1ª ocorrência);
  // 'esta-e-futuras' = registro + ocorrências 2..N (comportamento antigo).
  type AlcanceExclusao = 'so-esta' | 'esta-e-futuras'

  const [exclusao, setExclusao] = useState<{
    id: string
    desc: string
    recorrente: boolean
  } | null>(null)

  const handleExcluir = (id: string, desc: string) => {
    const r = recebiveis.find((x) => x.id === id)
    const recorrente = Boolean(r?.recorrencia_meses && r.recorrencia_meses >= 2)
    // Sem recorrência (ou 1ª sozinha): confirmação direta, como antes
    if (!recorrente) setExclusao({ id, desc, recorrente: false })
    else setExclusao({ id, desc, recorrente: true })
  }

  const confirmarExclusao = async (alcance: AlcanceExclusao) => {
    if (!exclusao) return
    const { id, desc } = exclusao
    try {
      if (alcance === 'so-esta') {
        // "Só esta": apaga apenas as ocorrências filhas e transforma o pai em
        // recebível simples (sem recorrência) — o histórico permanece.
        await FinanceiroService.deleteRecebivelOcorrenciasFuturas(id, 2)
        await FinanceiroService.updateRecebivelSemData(id, { recorrencia_meses: null })
      } else {
        // "Esta e todas as futuras": exclui o pai; as ocorrências apagam em cascata
        await FinanceiroService.deleteRecebivelSemData(id)
        setRecebiveis((prev) => prev.filter((x) => x.id !== id))
      }
      toast({ title: 'Recebível excluído' })
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: err.message,
      })
    } finally {
      setExclusao(null)
      carregarOcorrencias()
    }
  }

  // SEGREGAÇÃO PATRIMONIAL (Passo 1 de Lançamentos): as listas e os totais mostram
  // somente os recebíveis da empresa selecionada; com "todos" (ou sem seleção),
  // mostram todas as empresas — o badge de empresa por item identifica a origem.
  const passaFiltroFinanceiro = (financeiroId: string) =>
    !financeiroPadraoId || financeiroPadraoId === 'todos' || financeiroId === financeiroPadraoId
  // Filtros de estado local (texto, valor, período) aplicados ao financeiro do Passo 1
  const passaFiltrosLocais = (r: RecebivelSemData) => {
    if (filtroTexto) {
      const t = removerAcentos(filtroTexto.toLowerCase())
      const alvo = removerAcentos(
        `${r.descricao} ${r.observacao || ''} ${r.contratante || ''}`.toLowerCase(),
      )
      if (!alvo.includes(t)) return false
    }
    const valor = Number(r.valor_total)
    if (filtroValorMin && !isNaN(Number(filtroValorMin)) && valor < Number(filtroValorMin))
      return false
    if (filtroValorMax && !isNaN(Number(filtroValorMax)) && valor > Number(filtroValorMax))
      return false
    if (filtroDataDe && (!r.data_prevista || r.data_prevista < filtroDataDe)) return false
    if (filtroDataAte && (!r.data_prevista || r.data_prevista > filtroDataAte)) return false
    return true
  }
  // Recebíveis pendentes (registros pai). Recorrentes seguem aqui: cada um
  // aparece como "1/…N" e as parcelas seguintes entram como itens próprios.
  const recebiveisPendentes = useMemo(
    () =>
      recebiveis.filter(
        (r) =>
          r.status === 'pendente' &&
          passaFiltroFinanceiro(r.financeiro_id) &&
          passaFiltrosLocais(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      recebiveis,
      financeiroPadraoId,
      filtroTexto,
      filtroValorMin,
      filtroValorMax,
      filtroDataDe,
      filtroDataAte,
    ],
  )
  // Itens listáveis de pendentes: registro pai (+ ocorrências 2..N pendentes,
  // com data própria e fração n/N), todos passando pelos mesmos filtros.
  const itensPendentes = useMemo(() => {
    const itens: Array<{ recebivel: RecebivelSemData; ocorrencia?: RecebivelOcorrencia }> = []
    for (const r of recebiveisPendentes) {
      itens.push({ recebivel: r })
      if (!(r.recorrencia_meses && r.recorrencia_meses >= 2)) continue
      const ocs = ocorrenciasCarregadas
        .filter(
          (o) =>
            o.recebivel_pai_id === r.id &&
            o.status === 'pendente' &&
            passaFiltroFinanceiro(o.financeiro_id),
        )
        .sort((a, b) => a.numero - b.numero)
      for (const o of ocs) {
        const dataOc = o.data_prevista || null
        const passaPeriodo =
          (!filtroDataDe || (dataOc !== null && dataOc >= filtroDataDe)) &&
          (!filtroDataAte || (dataOc !== null && dataOc <= filtroDataAte))
        if (!passaPeriodo) continue
        itens.push({ recebivel: r, ocorrencia: o })
      }
    }
    return itens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recebiveisPendentes, ocorrenciasCarregadas, financeiroPadraoId, filtroDataDe, filtroDataAte])
  const recebiveisConvertidos = useMemo(
    () =>
      recebiveis.filter(
        (r) =>
          r.status === 'convertido' &&
          passaFiltroFinanceiro(r.financeiro_id) &&
          passaFiltrosLocais(r),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      recebiveis,
      financeiroPadraoId,
      filtroTexto,
      filtroValorMin,
      filtroValorMax,
      filtroDataDe,
      filtroDataAte,
    ],
  )
  const totalPendente = itensPendentes.reduce(
    (acc, it) => acc + Number(it.recebivel.valor_total),
    0,
  )
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
                          [...itensPendentes.map((it) => it.recebivel), ...recebiveisConvertidos],
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
                      onClick={() =>
                        exportarRecebiveisConsolidadoCSV(
                          [...itensPendentes.map((it) => it.recebivel), ...recebiveisConvertidos],
                          financeiros,
                        )
                      }
                      className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
                    >
                      <FileSpreadsheet className="w-3.5 h-3.5 mr-2" aria-hidden="true" />
                      Exportar consolidado
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
                  <Label htmlFor="rec-meses" className="text-xs text-gray-300 font-semibold">
                    Repetir mensalmente por (vezes)
                  </Label>
                  <Input
                    id="rec-meses"
                    name="recorrencia_meses"
                    value={recorrenciaMeses}
                    onChange={(e) => setRecorrenciaMeses(e.target.value)}
                    inputMode="numeric"
                    placeholder="Ex.: 12 — vazio = não repetir"
                    className="bg-[#0B0F14] border-[#232B36] text-white"
                  />
                  {nRecorrenciaCadastro >= 2 &&
                    dataPrevista &&
                    !isNaN(valorNum) &&
                    valorNum > 0 && (
                      <p className="text-[11px] text-gray-500">
                        {nRecorrenciaCadastro} ocorrências mensais de {formatCurrency(valorNum)} — a
                        1ª em {formatDateBR(dataPrevista)}, as seguintes +1 mês. Cada uma alimenta
                        os Alertas de vencimento e é recebida separadamente.
                      </p>
                    )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="rec-prevista" className="text-xs text-gray-300 font-semibold">
                    Data prevista da 1ª ocorrência (opcional)
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
            Pendentes ({itensPendentes.length})
          </CardTitle>
          <span className="text-xs text-gray-400 font-mono">
            Total: {formatCurrency(totalPendente)}
            {financeiroFiltro && (
              <span className="text-gray-500 font-sans"> · {financeiroFiltro.nome}</span>
            )}
          </span>
        </CardHeader>
        {/* FILTROS — texto, faixa de valor e período; total do card acompanha */}
        <div className="px-6 pt-4 pb-2 border-b border-[#232B36]/60">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="col-span-2 space-y-1">
              <Label htmlFor="filtro-rec-texto" className="text-[11px] text-gray-400 font-semibold">
                Buscar (descrição, observação, contratante)
              </Label>
              <Input
                id="filtro-rec-texto"
                value={filtroTexto}
                onChange={(e) => setFiltroTexto(e.target.value)}
                placeholder="Ex.: contrato, prefeitura…"
                className="h-9 bg-[#0B0F14] border-[#232B36] text-white"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-rec-vmin" className="text-[11px] text-gray-400 font-semibold">
                Valor mínimo (R$)
              </Label>
              <Input
                id="filtro-rec-vmin"
                value={filtroValorMin}
                onChange={(e) => setFiltroValorMin(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className="h-9 bg-[#0B0F14] border-[#232B36] text-white"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-rec-vmax" className="text-[11px] text-gray-400 font-semibold">
                Valor máximo (R$)
              </Label>
              <Input
                id="filtro-rec-vmax"
                value={filtroValorMax}
                onChange={(e) => setFiltroValorMax(e.target.value)}
                inputMode="decimal"
                placeholder="∞"
                className="h-9 bg-[#0B0F14] border-[#232B36] text-white"
                autoComplete="off"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-rec-de" className="text-[11px] text-gray-400 font-semibold">
                Previsto de
              </Label>
              <Input
                id="filtro-rec-de"
                type="date"
                value={filtroDataDe}
                onChange={(e) => setFiltroDataDe(e.target.value)}
                className="h-9 bg-[#0B0F14] border-[#232B36] text-white [color-scheme:dark]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="filtro-rec-ate" className="text-[11px] text-gray-400 font-semibold">
                Previsto até
              </Label>
              <Input
                id="filtro-rec-ate"
                type="date"
                value={filtroDataAte}
                onChange={(e) => setFiltroDataAte(e.target.value)}
                className="h-9 bg-[#0B0F14] border-[#232B36] text-white [color-scheme:dark]"
              />
            </div>
          </div>
          {(filtroTexto || filtroValorMin || filtroValorMax || filtroDataDe || filtroDataAte) && (
            <button
              type="button"
              onClick={() => {
                setFiltroTexto('')
                setFiltroValorMin('')
                setFiltroValorMax('')
                setFiltroDataDe('')
                setFiltroDataAte('')
              }}
              className="mt-2 text-[11px] text-amber-400 hover:text-amber-300 underline cursor-pointer"
            >
              Limpar filtros
            </button>
          )}
        </div>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-xs text-gray-500 flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
              Carregando…
            </div>
          ) : itensPendentes.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-500">
              Nenhum recebível sem data pendente. Contratos a receber aparecem aqui.
            </div>
          ) : (
            <div className="divide-y divide-[#232B36]">
              {itensPendentes.map(({ recebivel: r, ocorrencia }) => {
                const fin = financeiros.find((f) => f.id === r.financeiro_id)
                return (
                  <div
                    key={ocorrencia ? `oc-${ocorrencia.id}` : r.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-white text-sm flex items-center gap-1.5 flex-wrap">
                        {iconeGatilho(r)}
                        {r.descricao}
                        {ocorrencia && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 font-mono border-amber-400/60 text-amber-400"
                          >
                            parcela {ocorrencia.numero}/{r.recorrencia_meses ?? '?'}
                          </Badge>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 flex items-center gap-2 mt-0.5 flex-wrap">
                        <span>{labelGatilho(r)}</span>
                        {(ocorrencia?.data_prevista || r.data_prevista) && (
                          <>
                            <span aria-hidden="true">•</span>
                            <span className="text-gray-300">
                              Previsto:{' '}
                              {formatDateBR(
                                ocorrencia?.data_prevista || (r.data_prevista as string),
                              )}
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
                        {r.recorrencia_meses && r.recorrencia_meses >= 2 && !ocorrencia ? (
                          <>
                            <span aria-hidden="true">•</span>
                            <Badge
                              variant="outline"
                              className="text-[9px] py-0 px-1 font-mono border-amber-400/60 text-amber-400"
                            >
                              {r.recorrencia_meses} ocorrências mensais
                            </Badge>
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
                        aria-label={
                          ocorrencia
                            ? `Editar ocorrência ${ocorrencia.numero} de ${r.descricao}`
                            : `Editar recebível ${r.descricao}`
                        }
                        onClick={() => iniciarEdicao(r)}
                        className="text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 h-8 w-8 cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => {
                          setConvertendoOcorrenciaId(ocorrencia?.id ?? null)
                          setConvertendo(r)
                        }}
                        className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs cursor-pointer"
                      >
                        <CalendarClock className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        {ocorrencia ? 'Definir data (parcela)' : 'Definir data'}
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
        ocorrenciaId={convertendoOcorrenciaId}
        onClose={() => {
          setConvertendo(null)
          setConvertendoOcorrenciaId(null)
        }}
        onConvertido={() => {
          carregar()
          carregarOcorrencias()
        }}
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
