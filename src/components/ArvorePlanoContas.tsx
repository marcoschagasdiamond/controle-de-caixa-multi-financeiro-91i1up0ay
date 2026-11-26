import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Plus,
  Trash2,
  Edit2,
  FolderInput,
  Copy,
  Loader2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatCurrency } from '@/lib/formatters'
import { useToast } from '@/hooks/use-toast'
import { TotalPorCategoria } from '@/services/financeiro'
import { PlanoConta, PlanoGrupo } from '@/types/financeiro'

interface Props {
  grupos: PlanoGrupo[]
  /** Categorias visíveis com o filtro de busca aplicado */
  planosFiltrados: PlanoConta[]
  /** Todas as categorias (para totais do grupo somarem TUDO, não só o filtrado) */
  planos: PlanoConta[]
  totaisPorCategoria: Map<string, TotalPorCategoria>
  /** Estado de expansão controlado pela página (persistido na sessão) */
  abertos: Set<string>
  onToggleGrupo: (id: string) => void
  editarCategoria: (p: PlanoConta) => void
  duplicarCategoria: (p: PlanoConta) => void
  excluirCategoria: (id: string) => void
  iniciandoMoverId: string | null
  onMoverCategoria: (planoContaId: string, grupoId: string) => Promise<void>
  onRenomearGrupo: (g: PlanoGrupo) => void
  onExcluirGrupo: (g: PlanoGrupo) => void
  semGrupos: boolean
}

// Árvore do Plano de Contas: grupos como linhas-mãe (chevron, totais somando
// as filhas) e categorias como filhas indentadas. Estado de expansão vem da
// página (Set persistido durante a sessão).
export default function ArvorePlanoContas({
  grupos,
  planosFiltrados,
  planos,
  totaisPorCategoria,
  abertos,
  onToggleGrupo,
  editarCategoria,
  duplicarCategoria,
  excluirCategoria,
  iniciandoMoverId,
  onMoverCategoria,
  onRenomearGrupo,
  onExcluirGrupo,
  semGrupos,
}: Props) {
  const { toast } = useToast()
  // Por grupo aberto, qual categoria está com o seletor "mover para grupo" aberto
  const [moverId, setMoverId] = useState<string | null>(null)

  const filhosPorGrupo = new Map<string, PlanoConta[]>()
  for (const p of planos) {
    const gid = p.grupo_id || '__sem__'
    const lista = filhosPorGrupo.get(gid) || []
    lista.push(p)
    filhosPorGrupo.set(gid, lista)
  }
  for (const lista of filhosPorGrupo.values()) {
    lista.sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true }))
  }

  // Totais por grupo: soma das filhas sobre TODAS as categorias (ignora a busca)
  const totalGrupo = (gid: string | null): { despesa: number; receita: number } => {
    const filhas = filhosPorGrupo.get(gid || '__sem__') || []
    const t = { despesa: 0, receita: 0 }
    for (const f of filhas) {
      const tot = totaisPorCategoria.get(f.id)
      if (tot) {
        t.despesa += tot.despesa
        t.receita += tot.receita
      }
    }
    return t
  }

  // Grupos ordenados: despesas primeiro (ordem/nome), depois receitas — mesma
  // convenção visual do resto da tela (vermelho = despesa, verde = receita)
  const gruposDespesa = grupos.filter((g) => g.tipo === 'despesa')
  const gruposReceita = grupos.filter((g) => g.tipo === 'receita')
  const gruposOrdenados = [...gruposDespesa, ...gruposReceita]

  // IDs de categorias visíveis com o filtro de busca (para expandir/ocultar)
  const idsFiltrados = new Set(planosFiltrados.map((p) => p.id))

  const handleMover = async (categoria: PlanoConta, grupoId: string) => {
    setMoverId(null)
    try {
      await onMoverCategoria(categoria.id, grupoId)
    } catch (err: any) {
      toast({
        variant: 'destructive',
        title: 'Erro ao mover categoria',
        description: err?.message || 'Tente novamente.',
      })
    }
  }

  const renderLinhaCategoria = (p: PlanoConta) => {
    const tot = totaisPorCategoria.get(p.id)
    const gruposDoMesmoTipo = grupos.filter((g) => g.tipo === p.tipo && g.id !== p.grupo_id)
    return (
      <tr key={p.id} className="hover:bg-[#1A222D]/40">
        <td className="py-2 px-4 pl-10 font-mono text-xs text-gray-400">{p.codigo}</td>
        <td className="py-2 px-4 text-white text-sm">
          {p.descricao}
          {p.descricao_complementar && (
            <span className="block text-[11px] text-gray-500 leading-snug max-w-md">
              {p.descricao_complementar}
            </span>
          )}
        </td>
        <td className="py-2 px-4">
          <Badge
            variant="outline"
            className={`text-[10px] ${
              p.tipo === 'receita'
                ? 'text-[#00D68F] border-[#00D68F]/30'
                : 'text-[#FF5C5C] border-[#FF5C5C]/30'
            }`}
          >
            {p.tipo}
          </Badge>
        </td>
        <td className="py-2 px-4 text-right font-mono text-xs text-[#FF5C5C] whitespace-nowrap">
          {tot ? formatCurrency(tot.despesa) : 'R$ 0,00'}
        </td>
        <td className="py-2 px-4 text-right font-mono text-xs text-[#00D68F] whitespace-nowrap">
          {tot ? formatCurrency(tot.receita) : 'R$ 0,00'}
        </td>
        <td className="py-2 px-4 text-center whitespace-nowrap">
          <div className="relative inline-block text-left">
            <button
              onClick={() => setMoverId(moverId === p.id ? null : p.id)}
              title="Mover para outro grupo"
              aria-label={`Mover ${p.descricao} para outro grupo`}
              disabled={gruposDoMesmoTipo.length === 0}
              className="p-1 text-gray-500 hover:text-amber-400 hover:bg-amber-400/10 rounded transition-colors cursor-pointer disabled:opacity-40 mr-1"
            >
              {iniciandoMoverId === p.id ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FolderInput className="w-4 h-4" />
              )}
            </button>
            {moverId === p.id && (
              <select
                value=""
                autoFocus
                aria-label="Escolher grupo de destino"
                onChange={(e) => {
                  if (e.target.value) handleMover(p, e.target.value)
                }}
                onBlur={() => setMoverId(null)}
                className="absolute z-20 right-0 top-7 w-56 rounded border border-[#232B36] bg-[#0B0F14] text-white text-xs p-1.5 shadow-lg"
              >
                <option value="">Mover para...</option>
                {gruposDoMesmoTipo.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome} ({g.tipo})
                  </option>
                ))}
              </select>
            )}
          </div>
          <button
            onClick={() => editarCategoria(p)}
            title="Editar categoria"
            aria-label={`Editar ${p.descricao}`}
            className="p-1 text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 rounded transition-colors cursor-pointer mr-1"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => duplicarCategoria(p)}
            title="Duplicar categoria"
            aria-label={`Duplicar ${p.descricao}`}
            className="p-1 text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 rounded transition-colors cursor-pointer mr-1"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={() => excluirCategoria(p.id)}
            title="Excluir categoria"
            aria-label={`Excluir ${p.descricao}`}
            className="p-1 text-gray-500 hover:text-[#FF5C5C] hover:bg-[#FF5C5C]/10 rounded transition-colors cursor-pointer"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </td>
      </tr>
    )
  }

  const renderLinhaGrupo = (g: PlanoGrupo) => {
    const tot = totalGrupo(g.id)
    const filhasTodas = filhosPorGrupo.get(g.id) || []
    const filhasVisiveis = filhasTodas.filter((f) => idsFiltrados.has(f.id))
    const aberto = abertos.has(g.id)
    return [
      <tr
        key={g.id}
        className="bg-[#0F141B] hover:bg-[#141A22] cursor-pointer border-t border-[#232B36]"
      >
        <td className="py-2.5 px-4" colSpan={2}>
          <button
            onClick={() => onToggleGrupo(g.id)}
            className="flex items-center gap-2 text-left cursor-pointer"
            aria-expanded={aberto}
          >
            {aberto ? (
              <ChevronDown className="w-4 h-4 text-[#00D68F] shrink-0" />
            ) : (
              <ChevronRight className="w-4 h-4 text-gray-500 shrink-0" />
            )}
            <FolderTree className="w-4 h-4 text-[#00D68F] shrink-0" />
            <span className="font-bold text-white text-sm">{g.nome}</span>
            <Badge
              variant="outline"
              className={`text-[10px] ml-1 ${
                g.tipo === 'receita'
                  ? 'text-[#00D68F] border-[#00D68F]/30'
                  : 'text-[#FF5C5C] border-[#FF5C5C]/30'
              }`}
            >
              {g.tipo}
            </Badge>
            <span className="text-[11px] text-gray-500 ml-1">
              {filhasVisiveis.length} de {filhasTodas.length} categoria(s)
            </span>
          </button>
        </td>
        <td className="py-2.5 px-4 text-right font-mono text-xs text-gray-400 whitespace-nowrap">
          {g.tipo === 'despesa' ? formatCurrency(tot.despesa) : '—'}
        </td>
        <td className="py-2.5 px-4 text-right font-mono text-xs text-gray-400 whitespace-nowrap">
          {g.tipo === 'receita' ? formatCurrency(tot.receita) : '—'}
        </td>
        <td className="py-2.5 px-4 text-center whitespace-nowrap">
          <button
            onClick={() => onExcluirGrupo(g)}
            title="Excluir grupo"
            aria-label={`Excluir grupo ${g.nome}`}
            className="p-1 text-gray-500 hover:text-[#FF5C5C] hover:bg-[#FF5C5C]/10 rounded transition-colors cursor-pointer mr-1"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => onRenomearGrupo(g)}
            title="Renomear grupo"
            aria-label={`Renomear grupo ${g.nome}`}
            className="p-1 text-gray-500 hover:text-[#00D68F] hover:bg-[#00D68F]/10 rounded transition-colors cursor-pointer"
          >
            <Edit2 className="w-4 h-4" />
          </button>
        </td>
      </tr>,
      ...(aberto ? filhasVisiveis.map(renderLinhaCategoria) : []),
    ]
  }

  return (
    <div className="overflow-x-auto max-h-[32rem]">
      <table className="w-full text-left text-sm text-gray-300">
        <thead className="bg-[#0B0F14] border-b border-[#232B36] text-xs text-gray-400 uppercase tracking-wider font-semibold sticky top-0">
          <tr>
            <th className="py-3 px-4" colSpan={2}>
              Grupo / Categoria
            </th>
            <th className="py-3 px-4 text-right">Despesas lançadas</th>
            <th className="py-3 px-4 text-right">Receitas lançadas</th>
            <th className="py-3 px-4 text-center">Ações</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#232B36]">
          {gruposOrdenados.length === 0 && planosFiltrados.length === 0 && (
            <tr>
              <td colSpan={5} className="py-8 px-4 text-center text-sm text-gray-500">
                {semGrupos
                  ? 'Nenhum grupo do plano de contas encontrado. Crie um no painel acima.'
                  : 'Nenhuma categoria encontrada para a busca.'}
              </td>
            </tr>
          )}
          {gruposOrdenados.map(renderLinhaGrupo)}
        </tbody>
      </table>
    </div>
  )
}
