import { useEffect, useMemo, useState } from 'react'
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { Financeiro, PlanoConta, RecebivelSemData } from '@/types/financeiro'
import { formatCurrency } from '@/lib/formatters'
import { parseCSV } from '@/lib/sheetParser'
import {
  CAMPOS_RECEBIVEL,
  CampoRecebivel,
  LABEL_CAMPO,
  LinhaImportada,
  ResultadoParse,
  sugerirMapeamento,
  transformarLinhas,
  separarDuplicados,
} from '@/lib/csvRecebiveis'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Upload, Loader2, AlertTriangle, CheckCircle2, FileSpreadsheet, X } from 'lucide-react'

interface Props {
  open: boolean
  onClose: () => void
  financeiros: Financeiro[]
  planos: PlanoConta[]
  financeiroPadraoId: string // financeiro selecionado no filtro da tela
  onImportado: () => void
}

type Passo = 1 | 2 | 3 | 4

interface ResultadoFinal {
  importados: number
  ignorados: number
  erros: Array<{ linha: number; motivo: string }>
}

const CATEGORIES_PT: Record<CampoRecebivel, string> = LABEL_CAMPO

// Diálogo de importação de recebíveis sem data a partir de CSV, em 4 passos:
// arquivo → mapeamento de colunas → prévia → resultado (reutiliza o padrão da Conciliação).
export function DialogoImportarRecebiveis({
  open,
  onClose,
  financeiros,
  planos,
  financeiroPadraoId,
  onImportado,
}: Props) {
  const { toast } = useToast()

  const [passo, setPasso] = useState<Passo>(1)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<Record<CampoRecebivel, string> | null>(null)
  const [parse, setParse] = useState<ResultadoParse | null>(null)
  const [resultado, setResultado] = useState<ResultadoFinal | null>(null)
  const [importando, setImportando] = useState(false)
  const [erroArquivo, setErroArquivo] = useState<string | null>(null)

  // Pendentes atuais, para detectar duplicidade na prévia
  const [existentes, setExistentes] = useState<RecebivelSemData[]>([])

  useEffect(() => {
    if (open) {
      setPasso(1)
      setFileName('')
      setHeaders([])
      setRows([])
      setMap(null)
      setParse(null)
      setResultado(null)
      setErroArquivo(null)
      FinanceiroService.getRecebiveisSemData()
        .then(setExistentes)
        .catch(() => setExistentes([]))
    }
  }, [open])

  const handleFile = (file: File) => {
    setErroArquivo(null)
    if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv') {
      setErroArquivo('Escolha um arquivo .csv (delimitador vírgula ou ponto-e-vírgula).')
      return
    }
    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = String(ev.target?.result ?? '')
      // Remove BOM, se houver
      const limpo = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
      const { headers: hs, rows: rs } = parseCSV(limpo)
      if (hs.length === 0 || rs.length === 0) {
        setErroArquivo('Não encontramos cabeçalho ou linhas de dados no arquivo.')
        return
      }
      setHeaders(hs)
      setRows(rs)
      setMap(sugerirMapeamento(hs))
      setPasso(2)
    }
    reader.onerror = () => setErroArquivo('Não foi possível ler o arquivo.')
    reader.readAsText(file, 'utf-8')
  }

  const preview = useMemo(() => {
    if (!map || !headers.length) return null
    return transformarLinhas(rows, headers, map, financeiros, planos)
  }, [map, headers, rows, financeiros, planos])

  const duplicidade = useMemo(() => {
    if (!preview) return { novas: [] as LinhaImportada[], duplicadas: [] as LinhaImportada[] }
    return separarDuplicados(preview.linhas, existentes)
  }, [preview, existentes])

  const handleImportar = async () => {
    if (!preview) return
    setImportando(true)
    try {
      const finais = FinanceiroService.getRecebiveisSemData()
      const { novas } = separarDuplicados(preview.linhas, await finais)
      let importados = 0
      const erros: Array<{ linha: number; motivo: string }> = [...preview.erros]
      for (const l of novas) {
        try {
          await FinanceiroService.createRecebivelSemData({
            financeiro_id: l.financeiro_id || financeiroPadraoId,
            descricao: l.descricao,
            valor_total: l.valor,
            total_parcelas: l.total_parcelas,
            contratante: l.contratante,
            status_gatilho: l.status_gatilho,
            gatilho_outro: l.gatilho_outro,
            observacao: l.observacao,
            plano_conta_id: l.plano_conta_id,
          })
          importados++
        } catch (err: any) {
          erros.push({ linha: l.linha, motivo: err.message || 'Erro ao salvar' })
        }
      }
      const ignorados = preview.linhas.length - novas.length - (erros.length - preview.erros.length)
      const res: ResultadoFinal = { importados, ignorados, erros }
      setResultado(res)
      setPasso(4)
      toast({
        title: 'Importação concluída',
        description: `${importados} importado(s), ${res.ignorados} ignorado(s) por duplicidade${
          erros.length ? `, ${erros.length} com erro` : ''
        }.`,
        variant: erros.length || res.ignorados ? 'default' : 'default',
      })
      onImportado()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro na importação',
        description: err.message,
      })
    } finally {
      setImportando(false)
    }
  }

  const handleMapearContinuar = () => {
    if (!map) return
    if (!map.descricao || !map.valor) {
      toast({
        variant: 'destructive',
        title: 'Mapeamento incompleto',
        description: 'Mapeie as colunas de Descrição e Valor — são obrigatórias.',
      })
      return
    }
    setPasso(3)
  }

  const podeAbrir = open

  if (!podeAbrir) return null

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-3xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#00D68F]" aria-hidden="true" />
            Importar Recebíveis de CSV —{' '}
            <span className="text-gray-400 font-normal">
              {passo === 1
                ? '1. Arquivo'
                : passo === 2
                  ? '2. Mapear colunas'
                  : passo === 3
                    ? '3. Prévia'
                    : '4. Resultado'}
            </span>
          </DialogTitle>
        </DialogHeader>

        {passo === 1 && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Escolha uma planilha .csv com os contratos a receber. Colunas reconhecidas
              automaticamente pelo cabeçalho: descrição, valor, contratante, gatilho, parcelas,
              categoria, observação e financeiro.
            </p>
            <div>
              <Label htmlFor="imp-arquivo" className="text-xs text-gray-300 font-semibold">
                Arquivo CSV <span aria-hidden="true">*</span>
              </Label>
              <input
                id="imp-arquivo"
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) handleFile(f)
                }}
                className="mt-1.5 w-full text-sm text-gray-300 file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-[#00D68F] file:text-[#0B0F14] file:font-bold file:cursor-pointer cursor-pointer"
              />
            </div>
            {erroArquivo && (
              <Alert className="bg-[#FF5C5C]/15 border-[#FF5C5C]/50 text-[#FF5C5C]">
                <AlertTriangle className="w-4 h-4 mr-2" />
                <AlertDescription className="font-medium">{erroArquivo}</AlertDescription>
              </Alert>
            )}
            <p className="text-[11px] text-gray-500">
              Valores aceitos: "R$ 1.234,56", "1234.56". Gatilho sem coluna mapeada fica como
              "Aguardando despacho". Categoria é casada por código ou descrição com o plano de
              contas global; sem casamento, fica sem categoria.
            </p>
          </div>
        )}

        {passo === 2 && map && (
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Confirme qual coluna do arquivo corresponde a cada campo do recebível. Apenas{' '}
              <strong className="text-white">descrição</strong> e{' '}
              <strong className="text-white">valor</strong> são obrigatórios.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {CAMPOS_RECEBIVEL.map((campo) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`map-${campo}`} className="text-xs text-gray-300 font-semibold">
                    {CATEGORIES_PT[campo]}
                  </Label>
                  <select
                    id={`map-${campo}`}
                    value={map[campo]}
                    onChange={(e) => setMap({ ...map, [campo]: e.target.value })}
                    className="h-9 w-full px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-sm cursor-pointer"
                  >
                    <option value="">— não usar —</option>
                    {headers.map((h) => (
                      <option key={h} value={h}>
                        {h}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="rounded-md border border-[#232B36] bg-[#0B0F14] p-3 overflow-x-auto">
              <table className="text-[11px] w-full">
                <thead>
                  <tr className="text-gray-400">
                    {headers.map((h) => (
                      <th key={h} className="px-2 py-1 text-left font-semibold whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((r, i) => (
                    <tr key={i} className="border-t border-[#232B36] text-gray-300">
                      {r.map((c, j) => (
                        <td key={j} className="px-2 py-1 whitespace-nowrap">
                          {c}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {passo === 3 && preview && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-[#00D68F]/15 text-[#00D68F] border-[#00D68F]/40">
                {duplicidade.novas.length} para importar
              </Badge>
              <Badge className="bg-amber-400/15 text-amber-300 border-amber-400/40">
                {duplicidade.duplicadas.length} duplicado(s) — serão ignorados
              </Badge>
              <Badge className="bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/40">
                {preview.erros.length} com erro
              </Badge>
              {!financeiroPadraoId && (
                <Badge className="bg-[#FF5C5C]/15 text-[#FF5C5C] border-[#FF5C5C]/40">
                  Nenhum financeiro padrão — linhas sem coluna de financeiro serão recusadas
                </Badge>
              )}
            </div>

            {duplicidade.duplicadas.length > 0 && (
              <Alert className="bg-amber-400/10 border-amber-400/40 text-amber-300">
                <AlertTriangle className="w-4 h-4 mr-2" />
                <AlertDescription>
                  Já existem recebíveis pendentes com a mesma descrição + valor + contratante. Essas
                  linhas serão ignoradas para não duplicar.
                </AlertDescription>
              </Alert>
            )}

            {preview.erros.length > 0 && (
              <div className="rounded-md border border-[#FF5C5C]/40 bg-[#FF5C5C]/10 p-3 max-h-40 overflow-y-auto">
                <ul className="text-[11px] text-[#FF5C5C] space-y-1">
                  {preview.erros.map((e, i) => (
                    <li key={i}>
                      Linha {e.linha}: {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="rounded-md border border-[#232B36] max-h-72 overflow-y-auto">
              <table className="text-[11px] w-full">
                <thead className="sticky top-0 bg-[#141A22]">
                  <tr className="text-gray-400">
                    <th className="px-2 py-1.5 text-left">Linha</th>
                    <th className="px-2 py-1.5 text-left">Descrição</th>
                    <th className="px-2 py-1.5 text-left">Valor</th>
                    <th className="px-2 py-1.5 text-left">Contratante</th>
                    <th className="px-2 py-1.5 text-left">Financeiro</th>
                    <th className="px-2 py-1.5 text-left">Categoria</th>
                  </tr>
                </thead>
                <tbody>
                  {[...duplicidade.novas, ...duplicidade.duplicadas].map((l) => {
                    const dup = duplicidade.duplicadas.includes(l)
                    const fin = financeiros.find(
                      (f) => f.id === (l.financeiro_id || financeiroPadraoId),
                    )
                    const plano = planos.find((p) => p.id === l.plano_conta_id)
                    return (
                      <tr
                        key={l.linha}
                        className={`border-t border-[#232B36] ${
                          dup ? 'opacity-50 line-through' : ''
                        }`}
                      >
                        <td className="px-2 py-1 text-gray-500">{l.linha}</td>
                        <td className="px-2 py-1 text-gray-200 max-w-[180px] truncate">
                          {l.descricao}
                        </td>
                        <td className="px-2 py-1 font-mono text-[#00D68F]">
                          {formatCurrency(l.valor)}
                        </td>
                        <td className="px-2 py-1 text-gray-300">{l.contratante || '—'}</td>
                        <td className="px-2 py-1 text-gray-300">{fin?.nome || '—'}</td>
                        <td className="px-2 py-1 text-gray-300">
                          {plano
                            ? `${plano.codigo ? plano.codigo + ' - ' : ''}${plano.descricao}`
                            : '—'}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {passo === 4 && resultado && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-8 h-8 text-[#00D68F]" aria-hidden="true" />
              <div>
                <p className="text-sm font-bold text-white">
                  {resultado.importados} recebível(is) importado(s)
                </p>
                <p className="text-xs text-gray-400">
                  {resultado.ignorados} ignorado(s) por duplicidade
                  {resultado.erros.length > 0 && ` • ${resultado.erros.length} com erro`}
                </p>
              </div>
            </div>
            {resultado.erros.length > 0 && (
              <div className="rounded-md border border-[#FF5C5C]/40 bg-[#FF5C5C]/10 p-3 max-h-56 overflow-y-auto">
                <ul className="text-[11px] text-[#FF5C5C] space-y-1">
                  {resultado.erros.map((e, i) => (
                    <li key={i}>
                      Linha {e.linha}: {e.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {passo === 1 && (
            <Button onClick={onClose} className="bg-[#232B36] hover:bg-[#2E3947] text-white">
              Cancelar
            </Button>
          )}
          {passo === 2 && (
            <>
              <Button
                onClick={() => setPasso(1)}
                className="bg-[#232B36] hover:bg-[#2E3947] text-white"
              >
                Voltar
              </Button>
              <Button
                onClick={handleMapearContinuar}
                className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold"
              >
                Continuar
              </Button>
            </>
          )}
          {passo === 3 && (
            <>
              <Button
                onClick={() => setPasso(2)}
                className="bg-[#232B36] hover:bg-[#2E3947] text-white"
              >
                Voltar
              </Button>
              <Button
                onClick={handleImportar}
                disabled={importando || duplicidade.novas.length === 0}
                className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold cursor-pointer"
              >
                {importando ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" aria-hidden="true" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" aria-hidden="true" />
                )}
                {importando ? 'Importando…' : `Importar ${duplicidade.novas.length} recebível(is)`}
              </Button>
            </>
          )}
          {passo === 4 && (
            <Button
              onClick={onClose}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold"
            >
              Concluir
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
