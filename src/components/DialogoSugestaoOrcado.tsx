import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { PlanoConta } from '@/types/financeiro'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Loader2, Wand2 } from 'lucide-react'

export type ModoSugestao = 'vazias' | 'todas'

export interface LinhaSugestao {
  plano: PlanoConta
  orcadoAtual: number
  sugestao: number
  // true = categoria sem histórico realizado e sem recorrente/parcela no mês:
  // sugerida como R$ 0,00, para o usuário preencher manualmente na célula.
  semBase?: boolean
}

interface Props {
  open: boolean
  onClose: () => void
  onAplicar: (modo: ModoSugestao, incluirSemBase: boolean) => Promise<void>
  linhas: LinhaSugestao[]
  mesesHistorico: number
}

const fmt = (v: number) => (v > 0 ? formatCurrency(v) : '—')
const fmtZero = (v: number) => (v > 0 ? formatCurrency(v) : formatCurrency(0))

// Diálogo do botão "Preencher com sugestão": mostra a sugestão calculada
// (média dos meses realizados + recorrentes/parcelas do mês) por categoria,
// lista também as categorias SEM base (R$ 0,00) e escolhe se aplica somente
// nas células vazias ou em todas (sobrescreve).
export function DialogoSugestaoOrcado({ open, onClose, onAplicar, linhas, mesesHistorico }: Props) {
  const [modo, setModo] = useState<ModoSugestao>('vazias')
  const [incluirSemBase, setIncluirSemBase] = useState(false)
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const comSugestao = useMemo(() => linhas.filter((l) => l.sugestao > 0 || !!l.semBase), [linhas])
  const comValor = useMemo(() => linhas.filter((l) => l.sugestao > 0), [linhas])
  const semBase = useMemo(() => linhas.filter((l) => !!l.semBase), [linhas])
  const totalSugestao = useMemo(() => comValor.reduce((acc, l) => acc + l.sugestao, 0), [comValor])

  const alvo = modo === 'todas' ? comSugestao : comSugestao.filter((l) => l.orcadoAtual <= 0)
  const alvoEfetivo = incluirSemBase ? alvo : alvo.filter((l) => !l.semBase)

  const handleAplicar = async () => {
    setErro(null)
    setAplicando(true)
    try {
      await onAplicar(modo, incluirSemBase)
      onClose()
    } catch (e: any) {
      setErro(e?.message || 'Erro ao salvar os orçamentos sugeridos.')
    } finally {
      setAplicando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-white">
            <Wand2 className="w-4 h-4 text-[#00D68F]" aria-hidden="true" />
            Preencher com sugestão
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-xs">
            Média dos lançamentos realizados na janela de {mesesHistorico} meses terminando no mês
            selecionado + recorrentes/parcelas com vencimento no mês. Revise e ajuste na célula onde
            precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {comSugestao.length === 0 ? (
            <p className="text-sm text-gray-400 bg-[#0B0F14] border border-[#232B36] rounded-md p-3">
              Nenhuma categoria no plano de contas para sugerir.
            </p>
          ) : (
            <>
              <div className="max-h-56 overflow-y-auto rounded-md border border-[#232B36] bg-[#0B0F14]">
                <table className="w-full text-xs">
                  <caption className="sr-only">
                    Sugestão de valor orçado por categoria do plano de contas
                  </caption>
                  <thead>
                    <tr className="text-gray-400 uppercase tracking-wider text-[10px] border-b border-[#232B36]">
                      <th scope="col" className="py-2 px-3 text-left font-semibold">
                        Categoria
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-semibold">
                        Orçado atual
                      </th>
                      <th scope="col" className="py-2 px-3 text-right font-semibold">
                        Sugestão
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232B36]">
                    {comSugestao.map((l) => (
                      <tr key={l.plano.id} className={l.semBase ? 'opacity-60' : undefined}>
                        <th
                          scope="row"
                          className="py-1.5 px-3 text-left font-medium text-white normal-case"
                        >
                          {l.semBase && (
                            <span className="inline-block align-middle mr-1.5 px-1.5 py-0.5 rounded-full border border-amber-400/40 text-amber-400 text-[9px] uppercase tracking-wide bg-amber-400/10">
                              sem base
                            </span>
                          )}
                          {l.plano.codigo ? `${l.plano.codigo} — ` : ''}
                          {l.plano.descricao}
                        </th>
                        <td className="py-1.5 px-3 text-right font-mono text-gray-400">
                          {fmt(l.orcadoAtual)}
                        </td>
                        <td
                          className={`py-1.5 px-3 text-right font-mono font-semibold ${
                            l.semBase ? 'text-gray-500' : 'text-[#00D68F]'
                          }`}
                        >
                          {l.semBase ? fmtZero(0) : fmt(l.sugestao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-500">
                {comValor.length > 0
                  ? `${comValor.length} categoria(s) com sugestão — total ${formatCurrency(totalSugestao)}`
                  : 'Nenhuma categoria com sugestão calculada'}
                {semBase.length > 0 && ` · ${semBase.length} sem base (R$ 0,00)`}
              </p>

              <fieldset>
                <legend className="text-xs text-gray-300 font-semibold mb-2">
                  Onde aplicar a sugestão
                </legend>
                <RadioGroup
                  value={modo}
                  onValueChange={(v) => setModo(v as ModoSugestao)}
                  className="gap-2"
                  aria-label="Onde aplicar a sugestão"
                >
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="vazias" id="sug-vazias" />
                    <Label
                      htmlFor="sug-vazias"
                      className="text-sm text-white font-normal cursor-pointer"
                    >
                      Somente nas células vazias ({alvo.length} categoria(s))
                    </Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <RadioGroupItem value="todas" id="sug-todas" />
                    <Label
                      htmlFor="sug-todas"
                      className="text-sm text-white font-normal cursor-pointer"
                    >
                      Em todas as categorias com sugestão (sobrescreve valores digitados)
                    </Label>
                  </div>
                </RadioGroup>
              </fieldset>

              {semBase.length > 0 && (
                <div className="flex items-start gap-2">
                  <Checkbox
                    id="sug-sem-base"
                    checked={incluirSemBase}
                    onCheckedChange={(c) => setIncluirSemBase(c === true)}
                  />
                  <Label
                    htmlFor="sug-sem-base"
                    className="text-sm text-white font-normal cursor-pointer"
                  >
                    Incluir também as {semBase.length} categoria(s) sem base, gravando R$ 0,00 como
                    orçado
                  </Label>
                </div>
              )}

              {modo === 'vazias' && alvo.length === 0 && (
                <p className="text-xs text-amber-400">
                  Todas as células que receberiam sugestão já têm valor. Escolha sobrescrever ou
                  cancele.
                </p>
              )}
            </>
          )}

          {erro && (
            <p role="alert" className="text-xs text-[#FF5C5C]">
              {erro}
            </p>
          )}
          <p role="status" className="sr-only">
            {aplicando ? 'Salvando orçamentos sugeridos…' : ''}
          </p>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={aplicando}
            className="border-[#232B36] text-gray-300 hover:text-white hover:bg-[#1E2633] cursor-pointer"
          >
            Cancelar
          </Button>
          <Button
            type="button"
            onClick={handleAplicar}
            disabled={
              aplicando ||
              comSugestao.length === 0 ||
              alvoEfetivo.length === 0 ||
              (modo === 'vazias' && alvo.length === 0 && semBase.length === 0)
            }
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
          >
            {aplicando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            {aplicando ? 'Salvando…' : `Aplicar em ${alvoEfetivo.length} categoria(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
