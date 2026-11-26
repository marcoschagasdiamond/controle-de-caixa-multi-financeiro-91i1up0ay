import { useMemo, useState } from 'react'
import { formatCurrency } from '@/lib/formatters'
import { PlanoConta } from '@/types/financeiro'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
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
}

interface Props {
  open: boolean
  onClose: () => void
  onAplicar: (modo: ModoSugestao) => Promise<void>
  linhas: LinhaSugestao[]
  mesesHistorico: number
}

const fmt = (v: number) => (v > 0 ? formatCurrency(v) : '—')

// Diálogo do botão "Preencher com sugestão": mostra a sugestão calculada
// (média dos meses realizados + recorrentes/parcelas do mês) por categoria
// e escolhe se aplica somente nas células vazias ou em todas (sobrescreve).
export function DialogoSugestaoOrcado({ open, onClose, onAplicar, linhas, mesesHistorico }: Props) {
  const [modo, setModo] = useState<ModoSugestao>('vazias')
  const [aplicando, setAplicando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const comSugestao = useMemo(() => linhas.filter((l) => l.sugestao > 0), [linhas])
  const totalSugestao = useMemo(
    () => comSugestao.reduce((acc, l) => acc + l.sugestao, 0),
    [comSugestao],
  )

  const alvo = modo === 'todas' ? comSugestao : comSugestao.filter((l) => l.orcadoAtual <= 0)

  const handleAplicar = async () => {
    setErro(null)
    setAplicando(true)
    try {
      await onAplicar(modo)
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
            Média dos últimos {mesesHistorico} meses realizados + recorrentes/parcelas com
            vencimento no mês. Revise e ajuste na célula onde precisar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {comSugestao.length === 0 ? (
            <p className="text-sm text-gray-400 bg-[#0B0F14] border border-[#232B36] rounded-md p-3">
              Nenhuma sugestão calculada: as categorias não têm histórico realizado nem
              recorrentes/parcelas com vencimento neste mês.
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
                      <tr key={l.plano.id}>
                        <th
                          scope="row"
                          className="py-1.5 px-3 text-left font-medium text-white normal-case"
                        >
                          {l.plano.codigo ? `${l.plano.codigo} — ` : ''}
                          {l.plano.descricao}
                        </th>
                        <td className="py-1.5 px-3 text-right font-mono text-gray-400">
                          {fmt(l.orcadoAtual)}
                        </td>
                        <td className="py-1.5 px-3 text-right font-mono font-semibold text-[#00D68F]">
                          {fmt(l.sugestao)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[11px] text-gray-500">
                {comSugestao.length} categoria(s) com sugestão — total{' '}
                {formatCurrency(totalSugestao)}
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
              aplicando || comSugestao.length === 0 || (modo === 'vazias' && alvo.length === 0)
            }
            className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
          >
            {aplicando ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
            ) : (
              <Wand2 className="w-4 h-4 mr-2" aria-hidden="true" />
            )}
            {aplicando
              ? 'Salvando…'
              : modo === 'todas'
                ? `Aplicar em todas (${comSugestao.length})`
                : `Aplicar nas vazias (${alvo.length})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
