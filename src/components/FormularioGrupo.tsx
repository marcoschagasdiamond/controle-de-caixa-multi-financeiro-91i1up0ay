import { useEffect, useState } from 'react'
import { FolderPlus, Loader2 } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { FinanceiroService } from '@/services/financeiro'
import { PlanoGrupo } from '@/types/financeiro'

export type ModoGrupo = { modo: 'criar' } | { modo: 'editar'; grupo: PlanoGrupo } | null

interface Props {
  modo: ModoGrupo
  onCancelar: () => void
  onSalvo: () => Promise<void>
}

// Janela de criar/renomear grupo do Plano de Contas (nome + tipo). Dialog
// garante que o formulário aparece imediatamente, visível sem rolar a página.
// A exclusão fica na linha do grupo na árvore, com o aviso de CASCADE.
export default function FormularioGrupo({ modo, onCancelar, onSalvo }: Props) {
  const { toast } = useToast()
  const editing = modo?.modo === 'editar' ? modo.grupo : null
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>('despesa')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!modo) return
    if (editing) {
      setNome(editing.nome)
      setTipo(editing.tipo)
    } else {
      setNome('')
      setTipo('despesa')
    }
  }, [modo])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!nome.trim()) return
    try {
      setSaving(true)
      if (editing) {
        await FinanceiroService.updatePlanoGrupo(editing.id, { nome: nome.trim() })
        toast({ title: 'Grupo renomeado com sucesso!' })
      } else {
        await FinanceiroService.createPlanoGrupo({ nome: nome.trim(), tipo, ordem: 0 })
        toast({ title: 'Grupo criado com sucesso!' })
      }
      setNome('')
      await onSalvo()
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: editing ? 'Erro ao renomear grupo' : 'Erro ao criar grupo',
        description: err?.message || 'Tente novamente.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={!!modo} onOpenChange={(aberto) => !aberto && onCancelar()}>
      <DialogContent className="bg-[#141A22] border-[#232B36] text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <FolderPlus className="w-5 h-5 text-[#00D68F]" aria-hidden="true" />
            {editing ? `Renomear grupo "${editing.nome}"` : 'Novo Grupo do Plano de Contas'}
          </DialogTitle>
          <DialogDescription className="text-gray-400 text-sm">
            {editing
              ? 'Altere o nome do grupo. O tipo (receita/despesa) é fixo.'
              : 'O grupo organiza as categorias na árvore do Plano de Contas.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="grupo-nome" className="text-xs text-gray-400">
                Nome do Grupo *
              </Label>
              <Input
                id="grupo-nome"
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Custos Administrativos"
                autoComplete="off"
                className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
              />
            </div>
            <div>
              <Label htmlFor="grupo-tipo" className="text-xs text-gray-400">
                Tipo
              </Label>
              {editing ? (
                // Tipo do grupo é fixo: mover categorias entre tipos não é permitido
                <div
                  id="grupo-tipo"
                  className="h-9 mt-1 flex items-center text-xs text-gray-400 border border-[#232B36] rounded px-2 bg-[#0B0F14]"
                >
                  {tipo === 'receita' ? 'Receita' : 'Despesa'} (fixo)
                </div>
              ) : (
                <select
                  id="grupo-tipo"
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value as 'receita' | 'despesa')}
                  className="w-full h-9 px-2 rounded bg-[#0B0F14] border border-[#232B36] text-white text-xs mt-1"
                >
                  <option value="despesa">Despesa</option>
                  <option value="receita">Receita</option>
                </select>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={onCancelar}
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
              {editing ? 'Salvar Grupo' : 'Criar Grupo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
