import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase/client'
import { Financeiro } from '@/types/financeiro'

// Espelha o RLS (usuario_pode_acessar_financeiro): o master (dono) vê TODAS as
// empresas — as suas E as criadas por membros da equipe; membro vê a UNIÃO de
// criadas por ele + liberadas via equipe_membros. Sem vínculo algum: só as suas.
export function useAcessoFinanceiros(): {
  financeiros: Financeiro[]
  isMaster: boolean
  loading: boolean
  podeCriarEmpresas: boolean
} {
  const [financeiros, setFinanceiros] = useState<Financeiro[]>([])
  const [isMaster, setIsMaster] = useState(true)
  const [loading, setLoading] = useState(true)
  const [podeCriarEmpresas, setPodeCriarEmpresas] = useState(true)

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
            supabase
              .from('equipe_membros')
              .select('financeiro_id, pode_criar_empresas')
              .eq('member_user_id', user.id),
          ],
        )
        if (error) throw error
        if (errLiberados) throw errLiberados

        const todas = (fins as Financeiro[]) || []
        const linhas =
          (liberados as { financeiro_id: string; pode_criar_empresas: boolean }[]) || []
        const idsLiberados = new Set(linhas.map((r) => r.financeiro_id))
        // Membro = tem linha em equipe_membros como member_user_id.
        const membro = linhas.length > 0

        // Master (sem linha em equipe_membros como membro): vê tudo o que o RLS
        // retorna — suas empresas + as de membros. Membro: união criadas+liberadas.
        const lista = membro
          ? todas.filter((f) => idsLiberados.has(f.id) || f.user_id === user.id)
          : todas

        if (ativo) {
          setFinanceiros(lista)
          setIsMaster(!membro)
          setPodeCriarEmpresas(!membro || linhas.some((r) => r.pode_criar_empresas))
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

  return { financeiros, isMaster, loading, podeCriarEmpresas }
}
