import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Financeiro } from '@/types/financeiro'

interface UseAcessoFinanceiros {
  financeiros: Financeiro[]
  isMaster: boolean
  loading: boolean
}

/**
 * useAcessoFinanceiros — lista de financeiros visíveis ao usuário logado.
 * Master (dono): vê todos os seus financeiros.
 * Membro da equipe: vê somente os liberados em equipe_membros.
 * O RLS do banco já aplica a mesma regra; aqui espelhamos no frontend
 * para filtrar listas e o consolidado nas telas.
 */
export function useAcessoFinanceiros(): UseAcessoFinanceiros {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [isMaster, setIsMaster] = useState(true)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let ativo = true

    const carregar = async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          if (ativo) {
            setFinanceiros([])
            setLoading(false)
          }
          return
        }

        const [{ data: fins, error }, { data: liberados, error: errLiberados }] = await Promise.all(
          [
            supabase.from('financeiros').select('*').order('nome', { ascending: true }),
            supabase.from('equipe_membros').select('financeiro_id').eq('member_user_id', user.id),
          ],
        )
        if (error) throw error

        const idsLiberados = new Set(
          ((liberados as { financeiro_id: string }[]) || []).map((r) => r.financeiro_id),
        )
        // Membro = tem linha em equipe_membros como member_user_id.
        const membro = idsLiberados.size > 0
        const lista = membro
          ? ((fins as Financeiro[]) || []).filter((f) => idsLiberados.has(f.id))
          : ((fins as Financeiro[]) || []).filter((f) => f.user_id === user.id)

        if (ativo) {
          setFinanceiros(lista)
          setIsMaster(!membro)
          setLoading(false)
        }
      } catch {
        if (ativo) setLoading(false)
      }
    }

    carregar()
    return () => {
      ativo = false
    }
  }, [])

  return { financeiros, isMaster, loading }
}
