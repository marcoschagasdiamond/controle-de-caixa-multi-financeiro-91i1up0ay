import { useState } from 'react'
import { FolderPlus, Loader2 } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
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

// Painel de criar/renomear grupo do Plano de Contas (nome + tipo). A exclusão
// fica na linha do grupo na árvore, com o aviso de CASCADE.
export default function FormularioGrupo({ modo, onCancelar, onSalvo }: Props) {
  const { toast } = useToast()
  const editing = modo?.modo === 'editar' ? modo.grupo : null
  const [nome, setNome] = useState(editing?.nome || '')
  const [tipo, setTipo] = useState<'receita' | 'despesa'>(editing?.tipo || 'despesa')
  const [saving, setSaving] = useState(false)

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

  if (!modo) return null

  return (
    <Card className="bg-[#141A22] border-[#232B36] text-white">
      <CardHeader className="pb-3 border-b border-[#232B36]">
        <CardTitle className="text-base text-white flex items-center gap-2">
          <FolderPlus className="w-4 h-4 text-[#00D68F]" />
          {editing ? `Renomear grupo "${editing.nome}"` : 'Novo Grupo do Plano de Contas'}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label className="text-xs text-gray-400">Nome do Grupo *</Label>
              <Input
                required
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex: Custos Administrativos"
                className="bg-[#0B0F14] border-[#232B36] text-white h-9 mt-1"
              />
            </div>
            <div>
              <Label className="text-xs text-gray-400">Tipo</Label>
              {editing ? (
                // Tipo do grupo é fixo: mover categorias entre tipos não é permitido
                <div className="h-9 mt-1 flex items-center text-xs text-gray-400 border border-[#232B36] rounded px-2 bg-[#0B0F14]">
                  {tipo === 'receita' ? 'Receita' : 'Despesa'} (fixo)
                </div>
              ) : (
                <select
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
          <div className="flex justify-end gap-2 pt-2">
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
              {saving && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
              {editing ? 'Salvar Grupo' : 'Criar Grupo'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
