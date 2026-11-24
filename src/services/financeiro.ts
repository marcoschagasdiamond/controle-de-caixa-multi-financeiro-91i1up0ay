import { supabase } from '@/lib/supabase/client'
import {
  Financeiro,
  ContaBancaria,
  PlanoConta,
  PlanoGrupo,
  ContaFixa,
  Lancamento,
  Importacao,
  ExtratoItem,
  RegraConciliacao,
  Mutuo,
  Budget,
  FechamentoFinanceiroView,
  LancamentoRecorrente,
  RecebivelSemData,
} from '@/types/financeiro'

// Total lançado (somente realizados) por categoria do plano de contas
export interface TotalPorCategoria {
  despesa: number
  receita: number
}

// Período dos totais na aba Plano de Contas
export type PeriodoTotais = 'mes' | 'ano' | 'tudo'

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

  // Total lançado por categoria em UMA consulta agrupada (somente lançamentos realizados).
  // periodo: 'mes' (mês atual) | 'ano' (ano atual) | 'tudo' (todo o histórico)
  async getTotaisPorCategoria(periodo: PeriodoTotais): Promise<Map<string, TotalPorCategoria>> {
    let query = supabase
      .from('lancamentos')
      .select('plano_conta_id, tipo, valor')
      .eq('status', 'realizado')
    if (periodo === 'mes') {
      const agora = new Date()
      const inicio = new Date(agora.getFullYear(), agora.getMonth(), 1)
      const fim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0)
      const iso = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      query = query.gte('data', iso(inicio)).lte('data', iso(fim))
    } else if (periodo === 'ano') {
      const ano = new Date().getFullYear()
      query = query.gte('data', `${ano}-01-01`).lte('data', `${ano}-12-31`)
    }

    const { data, error } = await query
    if (error) throw error

    const totais = new Map<string, TotalPorCategoria>()
    for (const row of (data as any[]) || []) {
      if (!row.plano_conta_id) continue
      const atual = totais.get(row.plano_conta_id) || { despesa: 0, receita: 0 }
      if (row.tipo === 'credito') atual.receita += Number(row.valor)
      else atual.despesa += Number(row.valor)
      totais.set(row.plano_conta_id, atual)
    }
    return totais
  },

  // Duplicar categoria: nova categoria idêntica (mesmo tipo) com o próximo sufixo
  // livre dentro do mesmo grupo (2.09.01 → 2.09.02). Descrição recebe " (cópia)".
  async duplicarPlanoConta(categoria: PlanoConta): Promise<PlanoConta> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')

    const { data: todas, error } = await supabase.from('plano_contas').select('codigo, descricao')
    if (error) throw error
    const existentes = (todas as Pick<PlanoConta, 'codigo' | 'descricao'>[]) || []

    // Mesmo grupo da categoria original: tudo antes do último segmento
    const sep = categoria.codigo.lastIndexOf('.')
    const grupo = sep > 0 ? categoria.codigo.slice(0, sep) : ''
    const sufixoAtual = categoria.codigo.slice(sep + 1)

    const padWidth = Math.max(2, sufixoAtual.length)
    let novoCodigo = ''
    // Caminho 1: próximo índice livre dentro do grupo (até 200 tentativas)
    for (let i = 2; i < 200; i++) {
      const candidato = grupo ? `${grupo}.${String(i).padStart(padWidth, '0')}` : String(i)
      const ocupado = existentes.some(
        (p) => p.codigo.trim().toLowerCase() === candidato.trim().toLowerCase(),
      )
      if (!ocupado) {
        novoCodigo = candidato
        break
      }
    }
    // Caminho 2: grupo cheio ou código inválido — gera um código único com sufixo -D1, -D2...
    if (!novoCodigo) {
      let n = 1
      do {
        novoCodigo = `${categoria.codigo}-D${n}`
        n++
      } while (
        existentes.some((p) => p.codigo.trim().toLowerCase() === novoCodigo.toLowerCase()) &&
        n < 100
      )
    }

    // Descrição única: " (cópia)", " (cópia 2)", ... (índice único por usuário em descricao)
    let novaDescricao = `${categoria.descricao} (cópia)`
    if (existentes.some((p) => p.descricao.trim().toLowerCase() === novaDescricao.toLowerCase())) {
      let n = 2
      do {
        novaDescricao = `${categoria.descricao} (cópia ${n})`
        n++
      } while (
        existentes.some((p) => p.descricao.trim().toLowerCase() === novaDescricao.toLowerCase()) &&
        n < 100
      )
    }

    const { data, error: errInsert } = await (supabase.from('plano_contas') as any)
      .insert({
        codigo: novoCodigo,
        descricao: novaDescricao,
        tipo: categoria.tipo,
        ativo: true,
        // grupo_id é NOT NULL: a cópia fica no MESMO grupo da original
        grupo_id: categoria.grupo_id || null,
        user_id: user.id,
      })
      .select()
      .single()
    if (errInsert) throw errInsert
    return data as PlanoConta
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

  // ===== GRUPOS DO PLANO DE CONTAS (hierarquia REAL, tabela grupos_plano_contas) =====

  // Grupos do usuário, ordenados (receitas e despesas juntos; a UI separa por tipo)
  async getPlanoGrupos(): Promise<PlanoGrupo[]> {
    const { data, error } = await supabase
      .from('grupos_plano_contas')
      .select('*')
      .order('ordem', { ascending: true })
      .order('nome', { ascending: true })
    if (error) throw error
    return (data as PlanoGrupo[]) || []
  },

  async createPlanoGrupo(
    payload: Omit<PlanoGrupo, 'id' | 'user_id' | 'created_at'>,
  ): Promise<PlanoGrupo> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await supabase
      .from('grupos_plano_contas')
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as PlanoGrupo
  },

  async updatePlanoGrupo(id: string, payload: Partial<PlanoGrupo>): Promise<void> {
    const { error } = await supabase.from('grupos_plano_contas').update(payload).eq('id', id)
    if (error) throw error
  },

  async deletePlanoGrupo(id: string): Promise<void> {
    const { error } = await supabase.from('grupos_plano_contas').delete().eq('id', id)
    if (error) throw error
  },

  // Mover categoria(s) para outro grupo (mesmo tipo é validado na UI; o RPC
  // mover_categoria_para_grupo valida e normaliza no servidor)
  async moverCategoriaParaGrupo(planoContaId: string, grupoId: string | null): Promise<void> {
    const { data, error } = await supabase.rpc('mover_categoria_para_grupo', {
      p_plano_conta_id: planoContaId,
      p_grupo_id: grupoId,
    })
    if (error) throw error
    return (data as any) ?? undefined
  },

  // ===== RECEBÍVEIS SEM DATA (contratos a receber, sem data definida) =====
  // NÃO entram na projeção de caixa: nenhuma tela de projeção consulta esta tabela.

  async getRecebiveisSemData(financeiroId?: string): Promise<RecebivelSemData[]> {
    let query = (supabase.from('recebiveis_sem_data') as any)
      .select('*')
      .order('created_at', { ascending: false })
    if (financeiroId && financeiroId !== 'todos') {
      query = query.eq('financeiro_id', financeiroId)
    }
    const { data, error } = await query
    if (error) throw error
    return (data as RecebivelSemData[]) || []
  },

  async createRecebivelSemData(
    payload: Omit<
      RecebivelSemData,
      'id' | 'user_id' | 'status' | 'lancamento_id' | 'created_at' | 'updated_at'
    >,
  ): Promise<RecebivelSemData> {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) throw new Error('Usuário não autenticado')
    const { data, error } = await (supabase.from('recebiveis_sem_data') as any)
      .insert({ ...payload, user_id: user.id })
      .select()
      .single()
    if (error) throw error
    return data as RecebivelSemData
  },

  async updateRecebivelSemData(
    id: string,
    payload: Partial<Omit<RecebivelSemData, 'id' | 'user_id' | 'created_at' | 'updated_at'>>,
  ): Promise<void> {
    const { error } = await (supabase.from('recebiveis_sem_data') as any)
      .update(payload)
      .eq('id', id)
    if (error) throw error
  },

  async deleteRecebivelSemData(id: string): Promise<void> {
    const { error } = await (supabase.from('recebiveis_sem_data') as any).delete().eq('id', id)
    if (error) throw error
  },
}
