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
      campanhas_produto: {
        Row: {
          campanha: string
          canal: string
          created_at: string
          data_fim: string
          data_inicio: string
          id: string
          produto_id: string
        }
        Insert: {
          campanha?: string
          canal?: string
          created_at?: string
          data_fim: string
          data_inicio: string
          id?: string
          produto_id: string
        }
        Update: {
          campanha?: string
          canal?: string
          created_at?: string
          data_fim?: string
          data_inicio?: string
          id?: string
          produto_id?: string
        }
        Relationships: []
      }
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
          margem: number | null
          nome_comissao: string
          percentual_desconto: number | null
          preco_atacado: number | null
          preco_corporativo: number | null
          preco_filial_sc: number | null
          preco_filial_sp: number | null
          preco_internet: number | null
          preco_maff: number | null
          preco_marketplace: number | null
          preco_padrao: number | null
          preco_software_by_maringa: number | null
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
          margem?: number | null
          nome_comissao?: string
          percentual_desconto?: number | null
          preco_atacado?: number | null
          preco_corporativo?: number | null
          preco_filial_sc?: number | null
          preco_filial_sp?: number | null
          preco_internet?: number | null
          preco_maff?: number | null
          preco_marketplace?: number | null
          preco_padrao?: number | null
          preco_software_by_maringa?: number | null
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
          margem?: number | null
          nome_comissao?: string
          percentual_desconto?: number | null
          preco_atacado?: number | null
          preco_corporativo?: number | null
          preco_filial_sc?: number | null
          preco_filial_sp?: number | null
          preco_internet?: number | null
          preco_maff?: number | null
          preco_marketplace?: number | null
          preco_padrao?: number | null
          preco_software_by_maringa?: number | null
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
          fonte: string
          fonte_outro: string | null
          id: string
          link: string | null
          observacao: string | null
          preco: number
          produto_id: string
          updated_at: string
        }
        Insert: {
          fonte?: string
          fonte_outro?: string | null
          id?: string
          link?: string | null
          observacao?: string | null
          preco: number
          produto_id: string
          updated_at?: string
        }
        Update: {
          fonte?: string
          fonte_outro?: string | null
          id?: string
          link?: string | null
          observacao?: string | null
          preco?: number
          produto_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_precos_mercado_produto"
            columns: ["produto_id"]
            isOneToOne: false
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
          estoque_minimo: number
          grupo: string
          id: string
          marca: string
          no_mktplace: string | null
          sku_mktplace: string | null
          subgrupo: string
        }
        Insert: {
          codigo: string
          data_criacao?: string
          descricao?: string
          estoque_minimo?: number
          grupo?: string
          id?: string
          marca?: string
          no_mktplace?: string | null
          sku_mktplace?: string | null
          subgrupo?: string
        }
        Update: {
          codigo?: string
          data_criacao?: string
          descricao?: string
          estoque_minimo?: number
          grupo?: string
          id?: string
          marca?: string
          no_mktplace?: string | null
          sku_mktplace?: string | null
          subgrupo?: string
        }
        Relationships: []
      }
      user_allowed_pages: {
        Row: {
          allowed_pages: string[]
          id: string
          user_id: string
        }
        Insert: {
          allowed_pages: string[]
          id?: string
          user_id: string
        }
        Update: {
          allowed_pages?: string[]
          id?: string
          user_id?: string
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
