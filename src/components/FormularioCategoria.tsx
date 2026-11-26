import { useEffect, useState } from 'react'
import { BookOpen, Loader2 } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { PlanoConta, PlanoGrupo } from '@/types/financeiro'

export type ModoCategoria = { modo: 'criar' } | { modo: 'editar'; categoria: PlanoConta } | null

interface Props {
  modo: ModoCategoria
  grupos: PlanoGrupo[]
  onFechar: () => void
  onSalvo: () => Promise<void>
}

// Janela de criar/editar categoria do Plano de Contas (código, descrição,
// descrição complementar, tipo e grupo). Dialog garante visibilidade imediata.
export default function FormularioCategoria({ modo, grupos, onFechar, onSalvo }: Props) {
  const { toast } = useToast()
  const editing = modo?.modo === 'editar' ? modo.categoria : null
  const [codigo, setCodigo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [descricaoComplementar, setDescricaoComplementar] = useState('')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('despesa')
  const [grupoId, setGrupoId] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!modo) return
    if (editing) {
      setCodigo(editing.codigo)
      setDescricao(editing.descricao)
      setDescricaoComplementar(editing.descricao_complementar || '')
      setTipo(editing.tipo)
      setGrupoId(editing.grupo_id || '')
    } else {
      setCodigo('')
      setDescricao('')
      setDescricaoComplementar('')
      setTipo('despesa')
      setGrupoId('')
    }
  }, [modo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!codigo.trim() || !descricao.trim()) return
    const grupoSelecionado = grupos.find((g) => g.id === grupoId)
    if (!grupoSelecionado) {
      toast({
        variant: 'destructive',
        title: 'Selecione um grupo',
        description: 'Toda categoria pertence a um grupo do mesmo tipo.',
      })
      return
    }
    if (grupoSelecionado.tipo !== tipo) {
      toast({
        variant: 'destructive',
        title: 'Grupo de outro tipo',
        description: `A categoria é de ${tipo} e o grupo escolhido é de ${grupoSelecionado.tipo}.`,
      })
      return
    }
    try {
      setSaving(true)
      if (editing) {
        await FinanceiroService.updatePlanoConta(editing.id, {
          codigo: codigo.trim(),
          descricao: descricao.trim(),
          descricao_complementar: descricaoComplementar.trim() || null,
          tipo,
          grupo_id: grupoId,
        })
        toast({ title: 'Categoria atualizada com sucesso!' })
      } else {
        await FinanceiroService.createPlanoConta({
          codigo: codigo.trim(),
          descricao: descricao.trim(),
          descricao_complementar: descricaoComplementar.trim() || null,
          tipo,
          grupo_id: grupoId,
          ativo: true,
        })
        toast({ title: 'Categoria adicionada ao Plano de Contas Global!' })
      }
      await onSalvo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: editing ? 'Erro ao atualizar categoria' : 'Erro ao criar categoria',
        description: err.message,
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!modo} onOpenChange={(aberto) => !aberto && onFechar()}>
      <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#00D68F]" aria-hidden="true" />
            {editing ? 'Editar Categoria do Plano de Contas' : 'Nova Categoria no Plano de Contas'}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {editing
              ? 'Altere os dados da categoria abaixo e salve.'
              : 'Preencha os dados da nova categoria. Ela fica disponível para todas as empresas.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="plano-codigo" className="text-xs text-gray-400">
                Código Contábil *
              </Label>
              <Input
                id="plano-codigo"
                required
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                placeholder="Ex: 2.05"
                autoComplete="off"
                className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1 font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="plano-descricao" className="text-xs text-gray-400">
                Descrição da Categoria *
              </Label>
              <Input
                id="plano-descricao"
                required
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Marketing Digital"
                autoComplete="off"
                className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="plano-desc-compl" className="text-xs text-gray-400">
              Descrição complementar
            </Label>
            <Textarea
              id="plano-desc-compl"
              value={descricaoComplementar}
              onChange={(e) => setDescricaoComplementar(e.target.value)}
              placeholder="Ex: Use para anúncios pagos (Google/Meta Ads). Não incluir material impresso."
              className="bg-[#0B0F14] border-[#232B36] text-white mt-1 min-h-[60px]"
              rows={2}
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Texto de apoio exibido na árvore e na seleção de categoria dos lançamentos.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="plano-tipo" className="text-xs text-gray-400">
                Tipo *
              </Label>
              <select
                id="plano-tipo"
                value={tipo}
                onChange={(e) => setTipo(e.target.value as 'receita' | 'despesa')}
                className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
              >
                <option value="despesa">Despesa</option>
                <option value="receita">Receita</option>
              </select>
            </div>
            <div>
              <Label htmlFor="plano-grupo" className="text-xs text-gray-400">
                Grupo do Plano de Contas *
              </Label>
              <select
                id="plano-grupo"
                required
                value={grupoId}
                onChange={(e) => setGrupoId(e.target.value)}
                className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1 cursor-pointer"
              >
                <option value="">Selecione um grupo...</option>
                {grupos
                  .filter((g) => g.tipo === tipo)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.nome}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onFechar}
              className="border-[#232B36] text-gray-300 hover:text-white text-xs h-9 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-[#00D68F] hover:bg-[#00B97A] text-[#0B0F14] font-bold text-xs h-9 cursor-pointer"
            >
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" aria-hidden="true" />}
              {editing ? 'Atualizar Categoria' : 'Salvar Categoria'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
