// AVOID UPDATING THIS FILE DIRECTLY. It is automatically generated.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.18'
  }
  public: {
    Tables: {
      financeiros: {
        Row: {
          id: string
          user_id: string
          nome: string
          tipo: string
          cpf_cnpj: string | null
          socios: string | null
          regime_tributario: string | null
          cor: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          nome: string
          tipo: string
          cpf_cnpj?: string | null
          socios?: string | null
          regime_tributario?: string | null
          cor?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          nome?: string
          tipo?: string
          cpf_cnpj?: string | null
          socios?: string | null
          regime_tributario?: string | null
          cor?: string
          created_at?: string
          updated_at?: string
        }
      }
      contas: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          banco: string
          agencia: string | null
          conta: string
          tipo: string
          pix: string | null
          saldo_inicial: number
          ativo: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          banco: string
          agencia?: string | null
          conta: string
          tipo?: string
          pix?: string | null
          saldo_inicial?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          banco?: string
          agencia?: string | null
          conta?: string
          tipo?: string
          pix?: string | null
          saldo_inicial?: number
          ativo?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      plano_contas: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          codigo: string
          descricao: string
          tipo: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          codigo: string
          descricao: string
          tipo: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          codigo?: string
          descricao?: string
          tipo?: string
          ativo?: boolean
          created_at?: string
        }
      }
      contas_fixas: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          conta_id: string | null
          plano_conta_id: string | null
          descricao: string
          valor_estimado: number
          dia_vencimento: number
          tipo: string
          ativo: boolean
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          conta_id?: string | null
          plano_conta_id?: string | null
          descricao: string
          valor_estimado?: number
          dia_vencimento: number
          tipo?: string
          ativo?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          conta_id?: string | null
          plano_conta_id?: string | null
          descricao?: string
          valor_estimado?: number
          dia_vencimento?: number
          tipo?: string
          ativo?: boolean
          created_at?: string
        }
      }
      lancamentos: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          conta_id: string
          plano_conta_id: string
          tipo: string
          valor: number
          data: string
          descricao: string
          status: string
          contraparte: string | null
          documento: string | null
          observacao: string | null
          conciliado: boolean
          extrato_item_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          conta_id: string
          plano_conta_id: string
          tipo: string
          valor: number
          data?: string
          descricao: string
          status?: string
          contraparte?: string | null
          documento?: string | null
          observacao?: string | null
          conciliado?: boolean
          extrato_item_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          conta_id?: string
          plano_conta_id?: string
          tipo?: string
          valor?: number
          data?: string
          descricao?: string
          status?: string
          contraparte?: string | null
          documento?: string | null
          observacao?: string | null
          conciliado?: boolean
          extrato_item_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      importacoes: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          conta_id: string
          nome_arquivo: string
          total_linhas: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          conta_id: string
          nome_arquivo: string
          total_linhas?: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          conta_id?: string
          nome_arquivo?: string
          total_linhas?: number
          created_at?: string
        }
      }
      extrato_itens: {
        Row: {
          id: string
          user_id: string
          importacao_id: string
          financeiro_id: string
          conta_id: string
          data: string
          descricao: string
          documento: string | null
          valor: number
          tipo: string
          status: string
          lancamento_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          importacao_id: string
          financeiro_id: string
          conta_id: string
          data: string
          descricao: string
          documento?: string | null
          valor: number
          tipo: string
          status?: string
          lancamento_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          importacao_id?: string
          financeiro_id?: string
          conta_id?: string
          data?: string
          descricao?: string
          documento?: string | null
          valor?: number
          tipo?: string
          status?: string
          lancamento_id?: string | null
          created_at?: string
        }
      }
      regras_conciliacao: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          padrao_texto: string
          plano_conta_id: string | null
          tipo: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          padrao_texto: string
          plano_conta_id?: string | null
          tipo?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          padrao_texto?: string
          plano_conta_id?: string | null
          tipo?: string | null
          created_at?: string
        }
      }
      mutuos: {
        Row: {
          id: string
          user_id: string
          origem_financeiro_id: string
          origem_conta_id: string
          destino_financeiro_id: string
          destino_conta_id: string
          data: string
          valor: number
          tipo: string
          taxa_juros: number
          documento: string | null
          observacao: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          origem_financeiro_id: string
          origem_conta_id: string
          destino_financeiro_id: string
          destino_conta_id: string
          data?: string
          valor: number
          tipo?: string
          taxa_juros?: number
          documento?: string | null
          observacao?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          origem_financeiro_id?: string
          origem_conta_id?: string
          destino_financeiro_id?: string
          destino_conta_id?: string
          data?: string
          valor?: number
          tipo?: string
          taxa_juros?: number
          documento?: string | null
          observacao?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          financeiro_id: string
          plano_conta_id: string
          mes_ano: string
          valor_orcado: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          financeiro_id: string
          plano_conta_id: string
          mes_ano: string
          valor_orcado?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          financeiro_id?: string
          plano_conta_id?: string
          mes_ano?: string
          valor_orcado?: number
          created_at?: string
          updated_at?: string
        }
      }
    }
    Views: {
      vw_fechamento_financeiro: {
        Row: {
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
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
