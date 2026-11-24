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
      budgets: {
        Row: {
          created_at: string
          financeiro_id: string
          id: string
          mes_ano: string
          plano_conta_id: string
          updated_at: string
          user_id: string
          valor_orcado: number
        }
        Insert: {
          created_at?: string
          financeiro_id: string
          id?: string
          mes_ano: string
          plano_conta_id: string
          updated_at?: string
          user_id: string
          valor_orcado?: number
        }
        Update: {
          created_at?: string
          financeiro_id?: string
          id?: string
          mes_ano?: string
          plano_conta_id?: string
          updated_at?: string
          user_id?: string
          valor_orcado?: number
        }
        Relationships: [
          {
            foreignKeyName: 'budgets_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'budgets_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'budgets_plano_conta_id_fkey'
            columns: ['plano_conta_id']
            isOneToOne: false
            referencedRelation: 'plano_contas'
            referencedColumns: ['id']
          },
        ]
      }
      contas: {
        Row: {
          agencia: string | null
          ativo: boolean
          banco: string
          conta: string
          created_at: string
          financeiro_id: string
          id: string
          pix: string | null
          saldo_inicial: number
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agencia?: string | null
          ativo?: boolean
          banco: string
          conta: string
          created_at?: string
          financeiro_id: string
          id?: string
          pix?: string | null
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agencia?: string | null
          ativo?: boolean
          banco?: string
          conta?: string
          created_at?: string
          financeiro_id?: string
          id?: string
          pix?: string | null
          saldo_inicial?: number
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'contas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
        ]
      }
      contas_fixas: {
        Row: {
          ativo: boolean
          conta_id: string | null
          created_at: string
          descricao: string
          dia_vencimento: number
          financeiro_id: string
          id: string
          plano_conta_id: string | null
          tipo: string
          user_id: string
          valor_estimado: number
        }
        Insert: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          descricao: string
          dia_vencimento: number
          financeiro_id: string
          id?: string
          plano_conta_id?: string | null
          tipo?: string
          user_id: string
          valor_estimado?: number
        }
        Update: {
          ativo?: boolean
          conta_id?: string | null
          created_at?: string
          descricao?: string
          dia_vencimento?: number
          financeiro_id?: string
          id?: string
          plano_conta_id?: string | null
          tipo?: string
          user_id?: string
          valor_estimado?: number
        }
        Relationships: [
          {
            foreignKeyName: 'contas_fixas_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contas_fixas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'contas_fixas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'contas_fixas_plano_conta_id_fkey'
            columns: ['plano_conta_id']
            isOneToOne: false
            referencedRelation: 'plano_contas'
            referencedColumns: ['id']
          },
        ]
      }
      equipe_membros: {
        Row: {
          created_at: string
          financeiro_id: string
          id: string
          member_user_id: string
          owner_user_id: string
          papel: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          financeiro_id: string
          id?: string
          member_user_id: string
          owner_user_id: string
          papel?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          financeiro_id?: string
          id?: string
          member_user_id?: string
          owner_user_id?: string
          papel?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'equipe_membros_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'equipe_membros_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
        ]
      }
      extrato_itens: {
        Row: {
          conta_id: string
          created_at: string
          data: string
          descricao: string
          documento: string | null
          financeiro_id: string
          id: string
          importacao_id: string
          lancamento_id: string | null
          status: string
          tipo: string
          user_id: string
          valor: number
        }
        Insert: {
          conta_id: string
          created_at?: string
          data: string
          descricao: string
          documento?: string | null
          financeiro_id: string
          id?: string
          importacao_id: string
          lancamento_id?: string | null
          status?: string
          tipo: string
          user_id: string
          valor: number
        }
        Update: {
          conta_id?: string
          created_at?: string
          data?: string
          descricao?: string
          documento?: string | null
          financeiro_id?: string
          id?: string
          importacao_id?: string
          lancamento_id?: string | null
          status?: string
          tipo?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: 'extrato_itens_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'extrato_itens_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'extrato_itens_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'extrato_itens_importacao_id_fkey'
            columns: ['importacao_id']
            isOneToOne: false
            referencedRelation: 'importacoes'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'extrato_itens_lancamento_id_fkey'
            columns: ['lancamento_id']
            isOneToOne: false
            referencedRelation: 'lancamentos'
            referencedColumns: ['id']
          },
        ]
      }
      financeiros: {
        Row: {
          cor: string
          cpf_cnpj: string | null
          created_at: string
          id: string
          nome: string
          regime_tributario: string | null
          socios: string | null
          tipo: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cor?: string
          cpf_cnpj?: string | null
          created_at?: string
          id?: string
          nome: string
          regime_tributario?: string | null
          socios?: string | null
          tipo: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cor?: string
          cpf_cnpj?: string | null
          created_at?: string
          id?: string
          nome?: string
          regime_tributario?: string | null
          socios?: string | null
          tipo?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      importacoes: {
        Row: {
          conta_id: string
          created_at: string
          financeiro_id: string
          id: string
          nome_arquivo: string
          total_linhas: number
          user_id: string
        }
        Insert: {
          conta_id: string
          created_at?: string
          financeiro_id: string
          id?: string
          nome_arquivo: string
          total_linhas?: number
          user_id: string
        }
        Update: {
          conta_id?: string
          created_at?: string
          financeiro_id?: string
          id?: string
          nome_arquivo?: string
          total_linhas?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'importacoes_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'importacoes_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'importacoes_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
        ]
      }
      lancamentos: {
        Row: {
          conciliado: boolean
          conta_id: string
          contraparte: string | null
          created_at: string
          data: string
          descricao: string
          documento: string | null
          extrato_item_id: string | null
          financeiro_id: string
          id: string
          observacao: string | null
          plano_conta_id: string
          status: string
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          conciliado?: boolean
          conta_id: string
          contraparte?: string | null
          created_at?: string
          data?: string
          descricao: string
          documento?: string | null
          extrato_item_id?: string | null
          financeiro_id: string
          id?: string
          observacao?: string | null
          plano_conta_id: string
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          conciliado?: boolean
          conta_id?: string
          contraparte?: string | null
          created_at?: string
          data?: string
          descricao?: string
          documento?: string | null
          extrato_item_id?: string | null
          financeiro_id?: string
          id?: string
          observacao?: string | null
          plano_conta_id?: string
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: 'lancamentos_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'lancamentos_plano_conta_id_fkey'
            columns: ['plano_conta_id']
            isOneToOne: false
            referencedRelation: 'plano_contas'
            referencedColumns: ['id']
          },
        ]
      }
      lancamentos_recorrentes: {
        Row: {
          ativo: boolean
          conta_id: string
          created_at: string
          data_inicial: string
          descricao: string
          dia_mes: number
          financeiro_id: string
          id: string
          plano_conta_id: string
          status: string
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          ativo?: boolean
          conta_id: string
          created_at?: string
          data_inicial: string
          descricao: string
          dia_mes: number
          financeiro_id: string
          id?: string
          plano_conta_id: string
          status?: string
          tipo: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          ativo?: boolean
          conta_id?: string
          created_at?: string
          data_inicial?: string
          descricao?: string
          dia_mes?: number
          financeiro_id?: string
          id?: string
          plano_conta_id?: string
          status?: string
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: 'lancamentos_recorrentes_conta_id_fkey'
            columns: ['conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_recorrentes_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'lancamentos_recorrentes_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'lancamentos_recorrentes_plano_conta_id_fkey'
            columns: ['plano_conta_id']
            isOneToOne: false
            referencedRelation: 'plano_contas'
            referencedColumns: ['id']
          },
        ]
      }
      mutuos: {
        Row: {
          created_at: string
          data: string
          destino_conta_id: string
          destino_financeiro_id: string
          documento: string | null
          id: string
          observacao: string | null
          origem_conta_id: string
          origem_financeiro_id: string
          status: string
          taxa_juros: number
          tipo: string
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data?: string
          destino_conta_id: string
          destino_financeiro_id: string
          documento?: string | null
          id?: string
          observacao?: string | null
          origem_conta_id: string
          origem_financeiro_id: string
          status?: string
          taxa_juros?: number
          tipo?: string
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          data?: string
          destino_conta_id?: string
          destino_financeiro_id?: string
          documento?: string | null
          id?: string
          observacao?: string | null
          origem_conta_id?: string
          origem_financeiro_id?: string
          status?: string
          taxa_juros?: number
          tipo?: string
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: 'mutuos_destino_conta_id_fkey'
            columns: ['destino_conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mutuos_destino_financeiro_id_fkey'
            columns: ['destino_financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mutuos_destino_financeiro_id_fkey'
            columns: ['destino_financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'mutuos_origem_conta_id_fkey'
            columns: ['origem_conta_id']
            isOneToOne: false
            referencedRelation: 'contas'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mutuos_origem_financeiro_id_fkey'
            columns: ['origem_financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'mutuos_origem_financeiro_id_fkey'
            columns: ['origem_financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
        ]
      }
      plano_contas: {
        Row: {
          ativo: boolean
          codigo: string
          created_at: string
          descricao: string
          financeiro_id: string | null
          id: string
          tipo: string
          user_id: string
        }
        Insert: {
          ativo?: boolean
          codigo: string
          created_at?: string
          descricao: string
          financeiro_id?: string | null
          id?: string
          tipo: string
          user_id: string
        }
        Update: {
          ativo?: boolean
          codigo?: string
          created_at?: string
          descricao?: string
          financeiro_id?: string | null
          id?: string
          tipo?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'plano_contas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'plano_contas_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
        ]
      }
      regras_conciliacao: {
        Row: {
          created_at: string
          financeiro_id: string
          id: string
          padrao_texto: string
          plano_conta_id: string | null
          tipo: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          financeiro_id: string
          id?: string
          padrao_texto: string
          plano_conta_id?: string | null
          tipo?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          financeiro_id?: string
          id?: string
          padrao_texto?: string
          plano_conta_id?: string | null
          tipo?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: 'regras_conciliacao_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'financeiros'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'regras_conciliacao_financeiro_id_fkey'
            columns: ['financeiro_id']
            isOneToOne: false
            referencedRelation: 'vw_fechamento_financeiro'
            referencedColumns: ['financeiro_id']
          },
          {
            foreignKeyName: 'regras_conciliacao_plano_conta_id_fkey'
            columns: ['plano_conta_id']
            isOneToOne: false
            referencedRelation: 'plano_contas'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: {
      vw_fechamento_financeiro: {
        Row: {
          a_pagar_previsto: number | null
          a_receber_previsto: number | null
          financeiro_id: string | null
          financeiro_nome: string | null
          financeiro_tipo: string | null
          resultado_realizado: number | null
          saldo_atual: number | null
          saldo_inicial_total: number | null
          total_entradas_realizadas: number | null
          total_saidas_realizadas: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      equipe_listar_membros: {
        Args: never
        Returns: {
          email: string
          financeiro_ids: string[]
          member_user_id: string
          nome: string
        }[]
      }
      usuario_pode_acessar_financeiro: {
        Args: { p_financeiro_id: string }
        Returns: boolean
      }
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
