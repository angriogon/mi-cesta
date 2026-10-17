// Generado desde el esquema de Supabase con `npm run gen:types`. No editar a mano.

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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activity: {
        Row: {
          detail: string
          device_id: string
          device_name: string
          household_id: string
          id: string
          updated_at: string
        }
        Insert: {
          detail?: string
          device_id: string
          device_name: string
          household_id: string
          id: string
          updated_at?: string
        }
        Update: {
          detail?: string
          device_id?: string
          device_name?: string
          household_id?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      barcodes: {
        Row: {
          allergens: Json
          brand: string
          code: string
          created_at: string
          household_id: string
          id: string
          image: string | null
          name: string
          nutrients: Json
          quantity: string
          source: string
        }
        Insert: {
          allergens?: Json
          brand?: string
          code: string
          created_at?: string
          household_id: string
          id: string
          image?: string | null
          name: string
          nutrients?: Json
          quantity?: string
          source?: string
        }
        Update: {
          allergens?: Json
          brand?: string
          code?: string
          created_at?: string
          household_id?: string
          id?: string
          image?: string | null
          name?: string
          nutrients?: Json
          quantity?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "barcodes_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_template: {
        Row: {
          category: string
          name: string
          sku: string
        }
        Insert: {
          category: string
          name: string
          sku: string
        }
        Update: {
          category?: string
          name?: string
          sku?: string
        }
        Relationships: []
      }
      dog_items: {
        Row: {
          current_stock: number
          household_id: string
          id: string
          minimum_stock: number
          name: string
          updated_at: string
        }
        Insert: {
          current_stock?: number
          household_id: string
          id: string
          minimum_stock?: number
          name: string
          updated_at?: string
        }
        Update: {
          current_stock?: number
          household_id?: string
          id?: string
          minimum_stock?: number
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_items_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      dog_reminders: {
        Row: {
          created_at: string
          enabled: boolean
          household_id: string
          id: string
          reminder_time: string
          title: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          household_id: string
          id: string
          reminder_time: string
          title: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          household_id?: string
          id?: string
          reminder_time?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "dog_reminders_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_events: {
        Row: {
          created_at: string
          data: Json
          household_id: string
          id: string
          kind: string
          ref: string | null
        }
        Insert: {
          created_at?: string
          data?: Json
          household_id: string
          id: string
          kind: string
          ref?: string | null
        }
        Update: {
          created_at?: string
          data?: Json
          household_id?: string
          id?: string
          kind?: string
          ref?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "household_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          created_at: string
          household_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          household_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          household_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          invite_code: string
          mode: string
          name: string
          pet_name: string
          postal_code: string
          preferences: Json
          price_meta: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code: string
          mode?: string
          name?: string
          pet_name?: string
          postal_code?: string
          preferences?: Json
          price_meta?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          invite_code?: string
          mode?: string
          name?: string
          pet_name?: string
          postal_code?: string
          preferences?: Json
          price_meta?: Json
        }
        Relationships: []
      }
      inventory_lots: {
        Row: {
          created_at: string
          estimated: boolean
          expiry_date: string | null
          household_id: string
          id: string
          location: string | null
          product_id: string | null
          product_name: string
          quantity: number
          state: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          estimated?: boolean
          expiry_date?: string | null
          household_id: string
          id: string
          location?: string | null
          product_id?: string | null
          product_name: string
          quantity?: number
          state?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          estimated?: boolean
          expiry_date?: string | null
          household_id?: string
          id?: string
          location?: string | null
          product_id?: string | null
          product_name?: string
          quantity?: number
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_lots_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      lists: {
        Row: {
          checklist: Json
          household_id: string
          revision: number
          shopping: Json
          updated_at: string
        }
        Insert: {
          checklist?: Json
          household_id: string
          revision?: number
          shopping?: Json
          updated_at?: string
        }
        Update: {
          checklist?: Json
          household_id?: string
          revision?: number
          shopping?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lists_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: true
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      name_aliases: {
        Row: {
          alias: string
          created_at: string
          household_id: string
          id: string
          product_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          household_id: string
          id: string
          product_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          household_id?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "name_aliases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      operations: {
        Row: {
          created_at: string
          household_id: string
          id: string
          inverse: Json
          operation_type: string
          summary: string
          undone: boolean
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          inverse?: Json
          operation_type: string
          summary: string
          undone?: boolean
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          inverse?: Json
          operation_type?: string
          summary?: string
          undone?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "operations_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      prices: {
        Row: {
          category: string
          household_id: string
          id: string
          merchant: string
          observed_at: string
          price_cents: number
          product_id: string | null
          product_name: string
          source: string
        }
        Insert: {
          category: string
          household_id: string
          id: string
          merchant?: string
          observed_at?: string
          price_cents: number
          product_id?: string | null
          product_name: string
          source: string
        }
        Update: {
          category?: string
          household_id?: string
          id?: string
          merchant?: string
          observed_at?: string
          price_cents?: number
          product_id?: string | null
          product_name?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "prices_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          confirmed_at: string | null
          created_at: string
          current_stock: number
          household_id: string
          id: string
          minimum_stock: number
          name: string
          planned_until: string | null
          sku: string
          suppressed: boolean
          updated_at: string
        }
        Insert: {
          category?: string
          confirmed_at?: string | null
          created_at?: string
          current_stock?: number
          household_id: string
          id: string
          minimum_stock?: number
          name: string
          planned_until?: string | null
          sku?: string
          suppressed?: boolean
          updated_at?: string
        }
        Update: {
          category?: string
          confirmed_at?: string | null
          created_at?: string
          current_stock?: number
          household_id?: string
          id?: string
          minimum_stock?: number
          name?: string
          planned_until?: string | null
          sku?: string
          suppressed?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      provisional_purchases: {
        Row: {
          created_at: string
          household_id: string
          id: string
          items: Json
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          items?: Json
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          items?: Json
        }
        Relationships: [
          {
            foreignKeyName: "provisional_purchases_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      push_config: {
        Row: { id: boolean; public_key: string }
        Insert: { id?: boolean; public_key: string }
        Update: { id?: boolean; public_key?: string }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          household_id: string
          p256dh: string
          time_zone: string
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          household_id: string
          p256dh: string
          time_zone?: string
          user_id?: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          household_id?: string
          p256dh?: string
          time_zone?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_sessions: {
        Row: {
          created_at: string
          household_id: string
          id: string
          planned: Json
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          planned?: Json
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          planned?: Json
        }
        Relationships: [
          {
            foreignKeyName: "purchase_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_sessions: {
        Row: {
          committed: boolean
          household_id: string
          id: string
          items: Json
          location: string
          updated_at: string
        }
        Insert: {
          committed?: boolean
          household_id: string
          id: string
          items?: Json
          location: string
          updated_at?: string
        }
        Update: {
          committed?: boolean
          household_id?: string
          id?: string
          items?: Json
          location?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_sessions_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_events: {
        Row: {
          created_at: string
          delta: number
          household_id: string
          id: string
          product_id: string
          reason: string
        }
        Insert: {
          created_at?: string
          delta: number
          household_id: string
          id: string
          product_id: string
          reason: string
        }
        Update: {
          created_at?: string
          delta?: number
          household_id?: string
          id?: string
          product_id?: string
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_events_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_reviews: {
        Row: {
          created_at: string
          description: string
          household_id: string
          id: string
          issue_type: string
          line_total_cents: number
          product_id: string | null
          quantity: number
          resolved: boolean
          suggestion: Json
          ticket_id: string
        }
        Insert: {
          created_at?: string
          description: string
          household_id: string
          id: string
          issue_type: string
          line_total_cents?: number
          product_id?: string | null
          quantity?: number
          resolved?: boolean
          suggestion?: Json
          ticket_id: string
        }
        Update: {
          created_at?: string
          description?: string
          household_id?: string
          id?: string
          issue_type?: string
          line_total_cents?: number
          product_id?: string | null
          quantity?: number
          resolved?: boolean
          suggestion?: Json
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_reviews_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          created_at: string
          household_id: string
          id: string
          image_path: string | null
          items: Json
          merchant: string
          purchased_at: string
          raw_text: string
          total_cents: number
        }
        Insert: {
          created_at?: string
          household_id: string
          id: string
          image_path?: string | null
          items?: Json
          merchant: string
          purchased_at: string
          raw_text?: string
          total_cents: number
        }
        Update: {
          created_at?: string
          household_id?: string
          id?: string
          image_path?: string | null
          items?: Json
          merchant?: string
          purchased_at?: string
          raw_text?: string
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "tickets_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      apply_batch: {
        Args: { p_household_id: string; p_ops: Json }
        Returns: undefined
      }
      cas_lists: {
        Args: {
          p_checklist: Json
          p_household_id: string
          p_revision: number
          p_shopping: Json
        }
        Returns: Json
      }
      create_household: { Args: { p_name: string }; Returns: string }
      delete_my_account: { Args: never; Returns: undefined }
      household_members_list: {
        Args: { p_household_id: string }
        Returns: {
          email: string
          role: string
          user_id: string
        }[]
      }
      is_member: { Args: { p_household_id: string }; Returns: boolean }
      join_household: { Args: { p_code: string }; Returns: string }
      leave_household: { Args: { p_household_id: string }; Returns: undefined }
      my_households: {
        Args: never
        Returns: {
          id: string
          invite_code: string
          name: string
          role: string
        }[]
      }
      new_invite_code: { Args: never; Returns: string }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
