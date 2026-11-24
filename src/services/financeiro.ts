import { supabase } from '@/lib/supabase/client'
import {
  Financeiro,
  ContaBancaria,
  PlanoConta,
  ContaFixa,
  Lancamento,
  Importacao,
  ExtratoItem,
  RegraConciliacao,
  Mutuo,
  Budget,
  FechamentoFinanceiroView,
  LancamentoRecorrente,
} from '@/types/financeiro'

export const FinanceiroService = {
  // Financeiros
  async getFinanceiros(): Promise<Financeiro[]> {
    const { data, error } = await supabase
      .from('financeiros')
      .select('*')
      .order('nome', { ascending: true })
    if (error) throw error
    return (data as Financeiro[]) || []
  },

  async createFinanceiro(
    payload: Omit<Financeiro, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<Financeiro> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('financeiros') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as Financeiro
  },

  async updateFinanceiro(id: string, payload: Partial<Financeiro>): Promise<Financeiro> {
    const { data, error } = await (supabase.from('financeiros') as any)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Financeiro
  },

  async deleteFinanceiro(id: string): Promise<void> {
    const { error } = await supabase.from('financeiros').delete().eq('id', id)
    if (error) throw error
  },

  // Contas bancárias
  async getContas(financeiroId?: string): Promise<ContaBancaria[]> {
    let query = supabase.from('contas').select('*').order('banco', { ascending: true })
    if (financeiroId) {
      query = query.eq('financeiro_id', financeiroId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data as ContaBancaria[]) || []
  },

  async createConta(
    payload: Omit<ContaBancaria, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<ContaBancaria> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('contas') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as ContaBancaria
  },

  async updateConta(
    id: string,
    payload: Partial<Omit<ContaBancaria, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<void> {
    const { error } = await supabase.from('contas').update(payload).eq('id', id)
    if (error) throw error
  },

  async deleteConta(id: string): Promise<void> {
    const { error } = await supabase.from('contas').delete().eq('id', id)
    if (error) throw error
  },

  // Plano de Contas — GLOBAL: sem filtro por financeiro, todas as categorias
  async getPlanoContas(_financeiroId?: string): Promise<PlanoConta[]> {
    const { data, error } = await supabase
      .from('plano_contas')
      .select('*')
      .order('codigo', { ascending: true })
    if (error) throw error
    return (data as PlanoConta[]) || []
  },

  async createPlanoConta(
    payload: Omit<PlanoConta, 'id' | 'user_id' | 'created_at'>,
  ): Promise<PlanoConta> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('plano_contas') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as PlanoConta
  },

  async updatePlanoConta(id: string, payload: Partial<PlanoConta>): Promise<void> {
    const { error } = await supabase.from('plano_contas').update(payload).eq('id', id)
    if (error) throw error
  },

  async deletePlanoConta(id: string): Promise<void> {
    const { error } = await supabase.from('plano_contas').delete().eq('id', id)
    if (error) throw error
  },

  // Contas Fixas
  async getContasFixas(financeiroId?: string): Promise<ContaFixa[]> {
    let query = supabase
      .from('contas_fixas')
      .select('*')
      .order('dia_vencimento', { ascending: true })
    if (financeiroId) {
      query = query.eq('financeiro_id', financeiroId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data as ContaFixa[]) || []
  },

  async createContaFixa(
    payload: Omit<ContaFixa, 'id' | 'user_id' | 'created_at'>,
  ): Promise<ContaFixa> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('contas_fixas') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as ContaFixa
  },

  async deleteContaFixa(id: string): Promise<void> {
    const { error } = await supabase.from('contas_fixas').delete().eq('id', id)
    if (error) throw error
  },

  // Lançamentos recorrentes mensais
  async getLancamentosRecorrentes(financeiroId?: string): Promise<LancamentoRecorrente[]> {
    let query = (supabase.from('lancamentos_recorrentes') as any)
      .select('*')
      .order('dia_mes', { ascending: true })
    if (financeiroId) {
      query = query.eq('financeiro_id', financeiroId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data as LancamentoRecorrente[]) || []
  },

  async createLancamentoRecorrente(
    payload: Omit<LancamentoRecorrente, 'id' | 'user_id' | 'created_at' | 'updated_at' | 'ativo'>,
  ): Promise<LancamentoRecorrente> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('lancamentos_recorrentes') as any)
      .insert({ ativo: true, ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as LancamentoRecorrente
  },

  async updateLancamentoRecorrente(
    id: string,
    payload: Partial<Omit<LancamentoRecorrente, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<void> {
    const { error } = await (supabase.from('lancamentos_recorrentes') as any)
      .update(payload)
      .eq('id', id)
    if (error) throw error
  },

  async deleteLancamentoRecorrente(id: string): Promise<void> {
    const { error } = await (supabase.from('lancamentos_recorrentes') as any).delete().eq('id', id)
    if (error) throw error
  },

  // Lançamentos
  async getLancamentos(filtros?: {
    financeiroId?: string
    contaId?: string
    tipo?: 'credito' | 'debito' | 'todos'
    status?: 'previsto' | 'realizado' | 'todos'
    dataInicio?: string
    dataFim?: string
    busca?: string
  }): Promise<Lancamento[]> {
    let query = supabase.from('lancamentos').select('*').order('data', { ascending: false })

    if (filtros?.financeiroId && filtros.financeiroId !== 'todos') {
      query = query.eq('financeiro_id', filtros.financeiroId)
    }
    if (filtros?.contaId && filtros.contaId !== 'todas') {
      query = query.eq('conta_id', filtros.contaId)
    }
    if (filtros?.tipo && filtros.tipo !== 'todos') {
      query = query.eq('tipo', filtros.tipo)
    }
    if (filtros?.status && filtros.status !== 'todos') {
      query = query.eq('status', filtros.status)
    }
    if (filtros?.dataInicio) {
      query = query.gte('data', filtros.dataInicio)
    }
    if (filtros?.dataFim) {
      query = query.lte('data', filtros.dataFim)
    }
    if (filtros?.busca) {
      query = query.ilike('descricao', `%${filtros.busca}%`)
    }

    const { data, error } = await query
    if (error) throw error
    return (data as Lancamento[]) || []
  },

  async createLancamento(
    payload: Omit<Lancamento, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<Lancamento> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await (supabase.from('lancamentos') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as Lancamento
  },

  async updateLancamento(id: string, payload: Partial<Lancamento>): Promise<Lancamento> {
    const { data, error } = await (supabase.from('lancamentos') as any)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Lancamento
  },

  async deleteLancamento(id: string): Promise<void> {
    const { error } = await supabase.from('lancamentos').delete().eq('id', id)
    if (error) throw error
  },

  // Importações & Extrato
  async createImportacao(payload: {
    financeiro_id: string
    conta_id: string
    nome_arquivo: string
    itens: Array<{
      data: string
      descricao: string
      documento?: string
      valor: number
      tipo: 'credito' | 'debito'
    }>
  }): Promise<{ importacao: Importacao; total: number }> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data: imp, error: errImp } = await (supabase.from('importacoes') as any)
      .insert({
        user_id: user.id,
        financeiro_id: payload.financeiro_id,
        conta_id: payload.conta_id,
        nome_arquivo: payload.nome_arquivo,
        total_linhas: payload.itens.length,
      })
      .select()
      .single()

    if (errImp) throw errImp

    const itensParaSalvar = payload.itens.map((item) => ({
      user_id: user.id,
      importacao_id: imp?.id,
      financeiro_id: payload.financeiro_id,
      conta_id: payload.conta_id,
      data: item.data,
      descricao: item.descricao,
      documento: item.documento || null,
      valor: item.valor,
      tipo: item.tipo,
      status: 'pendente' as const,
    }))

    const { error: errItens } = await (supabase.from('extrato_itens') as any).insert(
      itensParaSalvar,
    )
    if (errItens) throw errItens

    return { importacao: imp as Importacao, total: itensParaSalvar.length }
  },

  async getExtratoItens(financeiroId?: string, contaId?: string): Promise<ExtratoItem[]> {
    let query = supabase.from('extrato_itens').select('*').order('data', { ascending: false })
    if (financeiroId) query = query.eq('financeiro_id', financeiroId)
    if (contaId) query = query.eq('conta_id', contaId)
    const { data, error } = await query
    if (error) throw error
    return (data as ExtratoItem[]) || []
  },

  async updateExtratoItem(id: string, payload: Partial<ExtratoItem>): Promise<ExtratoItem> {
    const { data, error } = await (supabase.from('extrato_itens') as any)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as ExtratoItem
  },

  // Regras de conciliação
  async getRegrasConciliacao(financeiroId?: string): Promise<RegraConciliacao[]> {
    let query = supabase
      .from('regras_conciliacao')
      .select('*')
      .order('padrao_texto', { ascending: true })
    if (financeiroId) query = query.eq('financeiro_id', financeiroId)
    const { data, error } = await query
    if (error) throw error
    return (data as RegraConciliacao[]) || []
  },

  async createRegraConciliacao(
    payload: Omit<RegraConciliacao, 'id' | 'user_id' | 'created_at'>,
  ): Promise<RegraConciliacao> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('regras_conciliacao') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as RegraConciliacao
  },

  async deleteRegraConciliacao(id: string): Promise<void> {
    const { error } = await supabase.from('regras_conciliacao').delete().eq('id', id)
    if (error) throw error
  },

  // Mútuos (partes relacionadas)
  async getMutuos(): Promise<Mutuo[]> {
    const { data, error } = await supabase
      .from('mutuos')
      .select('*')
      .order('data', { ascending: false })
    if (error) throw error
    return (data as Mutuo[]) || []
  },

  async createMutuo(
    payload: Omit<Mutuo, 'id' | 'user_id' | 'created_at' | 'updated_at'>,
  ): Promise<Mutuo> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('mutuos') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as Mutuo
  },

  async updateMutuo(id: string, payload: Partial<Mutuo>): Promise<Mutuo> {
    const { data, error } = await (supabase.from('mutuos') as any)
      .update(payload)
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return data as Mutuo
  },

  async deleteMutuo(id: string): Promise<void> {
    const { error } = await supabase.from('mutuos').delete().eq('id', id)
    if (error) throw error
  },

  // Budgets
  async getBudgets(financeiroId: string, mesAno: string): Promise<Budget[]> {
    const { data, error } = await supabase
      .from('budgets')
      .select('*')
      .eq('financeiro_id', financeiroId)
      .eq('mes_ano', mesAno)
    if (error) throw error
    return (data as Budget[]) || []
  },

  async upsertBudget(payload: {
    financeiro_id: string
    plano_conta_id: string
    mes_ano: string
    valor_orcado: number
  }): Promise<Budget> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data, error } = await (supabase.from('budgets') as any)
      .upsert(
        { ...payload, user_id: user.id, updated_at: new Date().toISOString() },
        { onConflict: 'financeiro_id,plano_conta_id,mes_ano' },
      )
      .select()
      .single()
    if (error) throw error
    return data as Budget
  },

  // Fechamento View
  async getFechamento(): Promise<FechamentoFinanceiroView[]> {
    const { data, error } = await (supabase.from('vw_fechamento_financeiro') as any).select('*')
    if (error) throw error
    return (data as FechamentoFinanceiroView[]) || []
  },
}
