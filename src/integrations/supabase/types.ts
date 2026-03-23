export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      estoque_produto_snapshots: {
        Row: {
          categoria_estoque: string
          comissao: number
          data_fim_promocao: string | null
          data_ultima_compra: string | null
          data_ultima_venda: string | null
          dias_sem_compra: number
          dias_sem_venda: number
          id: string
          nome_comissao: string
          percentual_desconto: number | null
          preco_tabela: number
          produto_id: string
          quantidade: number
          snapshot_id: string
          valor_promocao: number | null
          valor_total: number
          valor_unitario: number
          valor_venda_total: number
        }
        Insert: {
          categoria_estoque?: string
          comissao?: number
          data_fim_promocao?: string | null
          data_ultima_compra?: string | null
          data_ultima_venda?: string | null
          dias_sem_compra?: number
          dias_sem_venda?: number
          id?: string
          nome_comissao?: string
          percentual_desconto?: number | null
          preco_tabela?: number
          produto_id: string
          quantidade?: number
          snapshot_id: string
          valor_promocao?: number | null
          valor_total?: number
          valor_unitario?: number
          valor_venda_total?: number
        }
        Update: {
          categoria_estoque?: string
          comissao?: number
          data_fim_promocao?: string | null
          data_ultima_compra?: string | null
          data_ultima_venda?: string | null
          dias_sem_compra?: number
          dias_sem_venda?: number
          id?: string
          nome_comissao?: string
          percentual_desconto?: number | null
          preco_tabela?: number
          produto_id?: string
          quantidade?: number
          snapshot_id?: string
          valor_promocao?: number | null
          valor_total?: number
          valor_unitario?: number
          valor_venda_total?: number
        }
        Relationships: [
          {
            foreignKeyName: "estoque_produto_snapshots_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "estoque_produto_snapshots_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "estoque_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_snapshots: {
        Row: {
          data_criacao: string
          data_importacao: string
          id: string
          nome_arquivo: string
          total_produtos: number
          usuario: string
          valor_total: number
        }
        Insert: {
          data_criacao?: string
          data_importacao?: string
          id?: string
          nome_arquivo?: string
          total_produtos?: number
          usuario?: string
          valor_total?: number
        }
        Update: {
          data_criacao?: string
          data_importacao?: string
          id?: string
          nome_arquivo?: string
          total_produtos?: number
          usuario?: string
          valor_total?: number
        }
        Relationships: []
      }
      precos_mercado: {
        Row: {
          id: string
          preco: number
          produto_id: string
          updated_at: string
        }
        Insert: {
          id?: string
          preco: number
          produto_id: string
          updated_at?: string
        }
        Update: {
          id?: string
          preco?: number
          produto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_precos_mercado_produto"
            columns: ["produto_id"]
            isOneToOne: true
            referencedRelation: "produtos"
            referencedColumns: ["codigo"]
          },
        ]
      }
      produtos: {
        Row: {
          codigo: string
          data_criacao: string
          descricao: string
          grupo: string
          id: string
          marca: string
          subgrupo: string
        }
        Insert: {
          codigo: string
          data_criacao?: string
          descricao?: string
          grupo?: string
          id?: string
          marca?: string
          subgrupo?: string
        }
        Update: {
          codigo?: string
          data_criacao?: string
          descricao?: string
          grupo?: string
          id?: string
          marca?: string
          subgrupo?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
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

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
