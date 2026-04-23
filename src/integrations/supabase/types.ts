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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_insights: {
        Row: {
          data_version: number
          generated_at: string
          id: string
          input_hash: string
          kind: string
          payload: Json
          updated_at: string
          user_id: string
        }
        Insert: {
          data_version?: number
          generated_at?: string
          id?: string
          input_hash: string
          kind: string
          payload: Json
          updated_at?: string
          user_id: string
        }
        Update: {
          data_version?: number
          generated_at?: string
          id?: string
          input_hash?: string
          kind?: string
          payload?: Json
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      cities: {
        Row: {
          created_at: string
          id: string
          lat: number
          lng: number
          name: string
          state: string
        }
        Insert: {
          created_at?: string
          id?: string
          lat: number
          lng: number
          name: string
          state: string
        }
        Update: {
          created_at?: string
          id?: string
          lat?: number
          lng?: number
          name?: string
          state?: string
        }
        Relationships: []
      }
      household_profile: {
        Row: {
          adults: number
          children: number
          created_at: string
          favorite_brands: string[]
          favorite_stores: string[]
          id: string
          income_range: string | null
          monthly_grocery_budget: number | null
          onboarding_completed_at: string | null
          pets: number
          preferred_payment_method: string | null
          preferred_shopping_day: string | null
          restrictions: string[]
          shopping_frequency: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          adults?: number
          children?: number
          created_at?: string
          favorite_brands?: string[]
          favorite_stores?: string[]
          id?: string
          income_range?: string | null
          monthly_grocery_budget?: number | null
          onboarding_completed_at?: string | null
          pets?: number
          preferred_payment_method?: string | null
          preferred_shopping_day?: string | null
          restrictions?: string[]
          shopping_frequency?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          adults?: number
          children?: number
          created_at?: string
          favorite_brands?: string[]
          favorite_stores?: string[]
          id?: string
          income_range?: string | null
          monthly_grocery_budget?: number | null
          onboarding_completed_at?: string | null
          pets?: number
          preferred_payment_method?: string | null
          preferred_shopping_day?: string | null
          restrictions?: string[]
          shopping_frequency?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          canonical_name: string
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          canonical_name: string
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          canonical_name?: string
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      promo_categories: {
        Row: {
          created_at: string
          icon: string
          id: string
          name: string
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          icon?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          icon?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
        }
        Relationships: []
      }
      promo_flyers: {
        Row: {
          created_at: string
          error_message: string | null
          extracted_count: number
          id: string
          processed_at: string | null
          raw_extraction: Json | null
          source_kind: string
          source_url: string | null
          status: string
          storage_path: string | null
          storage_paths: string[]
          store_id: string | null
          store_name_guess: string | null
          updated_at: string
          user_id: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          extracted_count?: number
          id?: string
          processed_at?: string | null
          raw_extraction?: Json | null
          source_kind: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          storage_paths?: string[]
          store_id?: string | null
          store_name_guess?: string | null
          updated_at?: string
          user_id: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          extracted_count?: number
          id?: string
          processed_at?: string | null
          raw_extraction?: Json | null
          source_kind?: string
          source_url?: string | null
          status?: string
          storage_path?: string | null
          storage_paths?: string[]
          store_id?: string | null
          store_name_guess?: string | null
          updated_at?: string
          user_id?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_flyers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "promo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_notifications: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          promotion_id: string | null
          read_at: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          promotion_id?: string | null
          read_at?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          promotion_id?: string | null
          read_at?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_notifications_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_price_history: {
        Row: {
          created_at: string
          id: string
          observed_at: string
          price: number
          product_id: string
          store_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          observed_at?: string
          price: number
          product_id: string
          store_id: string
        }
        Update: {
          created_at?: string
          id?: string
          observed_at?: string
          price?: number
          product_id?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_price_history_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "promo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_price_history_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "promo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_product_aliases: {
        Row: {
          alias: string
          created_at: string
          id: string
          product_id: string
        }
        Insert: {
          alias: string
          created_at?: string
          id?: string
          product_id: string
        }
        Update: {
          alias?: string
          created_at?: string
          id?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "promo_product_aliases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "promo_products"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          id: string
          image_emoji: string
          name: string
          unit: string
          user_id: string | null
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_emoji?: string
          name: string
          unit?: string
          user_id?: string | null
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          id?: string
          image_emoji?: string
          name?: string
          unit?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "promo_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_stores: {
        Row: {
          address: string | null
          brand_color: string
          chain: string
          city_id: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          logo_emoji: string
          name: string
          user_id: string | null
        }
        Insert: {
          address?: string | null
          brand_color?: string
          chain: string
          city_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          logo_emoji?: string
          name: string
          user_id?: string | null
        }
        Update: {
          address?: string | null
          brand_color?: string
          chain?: string
          city_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          logo_emoji?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promo_stores_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          created_at: string
          discount_pct: number | null
          ends_at: string
          flyer_id: string | null
          id: string
          is_featured: boolean
          original_price: number
          price: number
          product_id: string
          source: string
          starts_at: string
          status: string
          stock_level: string
          store_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          discount_pct?: number | null
          ends_at: string
          flyer_id?: string | null
          id?: string
          is_featured?: boolean
          original_price: number
          price: number
          product_id: string
          source?: string
          starts_at?: string
          status?: string
          stock_level?: string
          store_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          discount_pct?: number | null
          ends_at?: string
          flyer_id?: string | null
          id?: string
          is_featured?: boolean
          original_price?: number
          price?: number
          product_id?: string
          source?: string
          starts_at?: string
          status?: string
          stock_level?: string
          store_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "promotions_flyer_id_fkey"
            columns: ["flyer_id"]
            isOneToOne: false
            referencedRelation: "promo_flyers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "promo_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promotions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "promo_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      receipt_items: {
        Row: {
          canonical_name: string | null
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          description: string
          id: string
          product_id: string | null
          quantity: number
          receipt_id: string
          total_price: number
          unit_price: number
          user_id: string
        }
        Insert: {
          canonical_name?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description: string
          id?: string
          product_id?: string | null
          quantity?: number
          receipt_id: string
          total_price?: number
          unit_price?: number
          user_id: string
        }
        Update: {
          canonical_name?: string | null
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          description?: string
          id?: string
          product_id?: string | null
          quantity?: number
          receipt_id?: string
          total_price?: number
          unit_price?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipt_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipt_items_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          image_path: string | null
          payment_method: string | null
          purchased_at: string
          raw_extraction: Json | null
          store_cnpj: string | null
          store_id: string | null
          store_name: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_path?: string | null
          payment_method?: string | null
          purchased_at: string
          raw_extraction?: Json | null
          store_cnpj?: string | null
          store_id?: string | null
          store_name: string
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_path?: string | null
          payment_method?: string | null
          purchased_at?: string
          raw_extraction?: Json | null
          store_cnpj?: string | null
          store_id?: string | null
          store_name?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          cnpj: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          cnpj?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      user_location: {
        Row: {
          city_id: string | null
          created_at: string
          id: string
          lat: number | null
          lng: number | null
          radius_km: number
          updated_at: string
          user_id: string
        }
        Insert: {
          city_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          radius_km?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          city_id?: string | null
          created_at?: string
          id?: string
          lat?: number | null
          lng?: number | null
          radius_km?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_location_city_id_fkey"
            columns: ["city_id"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["id"]
          },
        ]
      }
      user_promotion_events: {
        Row: {
          created_at: string
          event: string
          id: string
          promotion_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event: string
          id?: string
          promotion_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          event?: string
          id?: string
          promotion_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_promotion_events_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_watchlist: {
        Row: {
          created_at: string
          id: string
          product_id: string
          target_price: number | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          target_price?: number | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          target_price?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_watchlist_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "promo_products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      product_category:
        | "alimentos"
        | "bebidas"
        | "limpeza"
        | "higiene"
        | "padaria"
        | "hortifruti"
        | "carnes"
        | "laticinios"
        | "outros"
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
    Enums: {
      app_role: ["admin", "user"],
      product_category: [
        "alimentos",
        "bebidas",
        "limpeza",
        "higiene",
        "padaria",
        "hortifruti",
        "carnes",
        "laticinios",
        "outros",
      ],
    },
  },
} as const
