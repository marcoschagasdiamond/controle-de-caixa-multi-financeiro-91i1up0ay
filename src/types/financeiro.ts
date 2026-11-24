export interface Financeiro {
  id: string
  user_id: string
  nome: string
  tipo: 'PF' | 'PJ'
  cpf_cnpj?: string | null
  socios?: string | null
  regime_tributario?: string | null
  cor: string
  created_at?: string
  updated_at?: string
}

export interface ContaBancaria {
  id: string
  user_id: string
  financeiro_id: string
  banco: string
  agencia?: string | null
  conta: string
  tipo: string
  pix?: string | null
  saldo_inicial: number
  ativo: boolean
  created_at?: string
  updated_at?: string
}

export interface PlanoConta {
  id: string
  user_id: string
  codigo: string
  descricao: string
  tipo: 'receita' | 'despesa'
  ativo: boolean
  grupo_id?: string | null
  created_at?: string
}

// Grupo hierárquico REAL do plano de contas (tabela grupos_plano_contas).
// Agrupa categorias do mesmo tipo (receita ou despesa); o usuário pode
// mover categorias entre grupos livremente — o código não define mais o grupo.
export interface PlanoGrupo {
  id: string
  user_id: string
  nome: string
  tipo: 'receita' | 'despesa'
  ordem: number
  created_at?: string
}

export interface ContaFixa {
  id: string
  user_id: string
  financeiro_id: string
  conta_id?: string | null
  plano_conta_id?: string | null
  descricao: string
  valor_estimado: number
  dia_vencimento: number
  tipo: 'receita' | 'despesa'
  ativo: boolean
  created_at?: string
}

export interface LancamentoRecorrente {
  id: string
  user_id: string
  financeiro_id: string
  conta_id: string
  plano_conta_id: string
  descricao: string
  valor: number
  tipo: 'credito' | 'debito'
  status: 'previsto'
  dia_mes: number
  data_inicial: string // YYYY-MM-DD
  total_parcelas?: number | null // parcelado: nº total de parcelas; ausente/NULL = mensal contínua
  ativo: boolean
  created_at?: string
  updated_at?: string
}

export interface Lancamento {
  id: string
  user_id: string
  financeiro_id: string
  conta_id: string
  plano_conta_id: string
  tipo: 'credito' | 'debito'
  valor: number
  data: string // YYYY-MM-DD
  descricao: string
  status: 'previsto' | 'realizado'
  contraparte?: string | null
  documento?: string | null
  observacao?: string | null
  conciliado: boolean
  extrato_item_id?: string | null
  created_at?: string
  updated_at?: string
}

export interface Importacao {
  id: string
  user_id: string
  financeiro_id: string
  conta_id: string
  nome_arquivo: string
  total_linhas: number
  created_at?: string
}

export interface ExtratoItem {
  id: string
  user_id: string
  importacao_id: string
  financeiro_id: string
  conta_id: string
  data: string
  descricao: string
  documento?: string | null
  valor: number
  tipo: 'credito' | 'debito'
  status: 'conciliado' | 'pendente' | 'sem_correspondencia' | 'ignorado'
  lancamento_id?: string | null
  created_at?: string
}

export interface RegraConciliacao {
  id: string
  user_id: string
  financeiro_id: string
  padrao_texto: string
  plano_conta_id?: string | null
  tipo?: 'credito' | 'debito' | null
  created_at?: string
}

export interface Mutuo {
  id: string
  user_id: string
  origem_financeiro_id: string
  origem_conta_id: string
  destino_financeiro_id: string
  destino_conta_id: string
  data: string
  valor: number
  tipo: 'adiantamento' | 'reembolso' | 'emprestimo'
  taxa_juros: number
  documento?: string | null
  observacao?: string | null
  status: 'aberto' | 'quitado' | 'parcial'
  created_at?: string
  updated_at?: string
}

export interface Budget {
  id: string
  user_id: string
  financeiro_id: string
  plano_conta_id: string
  mes_ano: string // YYYY-MM
  valor_orcado: number
  created_at?: string
  updated_at?: string
}

export interface FechamentoFinanceiroView {
  financeiro_id: string
  user_id: string
  financeiro_nome: string
  financeiro_tipo: string
  saldo_inicial_total: number
  total_entradas_realizadas: number
  total_saidas_realizadas: number
  resultado_realizado: number
  saldo_atual: number
  a_receber_previsto: number
  a_pagar_previsto: number
}

// ==== EQUIPE ====
// Membro da equipe: acesso concedido a financeiros (empresas) do dono.
// O master é o dono dos financeiros (user_id = financeiro.user_id).
export interface EquipeMembroAcesso {
  id: string
  owner_user_id: string
  member_user_id: string
  financeiro_id: string
  papel: 'master' | 'membro'
  created_at?: string
  updated_at?: string
}

export interface MembroEquipeView {
  member_user_id: string
  email: string
  nome: string
  financeiros: string[] // ids liberados
}
