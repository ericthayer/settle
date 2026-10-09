// Mirrors `supabase gen types typescript` for the settle project, with the repeated
// invoice/payment row shapes factored out. Update after every migration.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

type InvoiceRow = {
  bill_from: Json | null
  bill_to: Json | null
  checkout_url: string | null
  client_id: string
  created_at: string
  currency: string
  due_date: string | null
  id: string
  issue_date: string | null
  issued_at: string | null
  lifecycle: Database["public"]["Enums"]["invoice_lifecycle"]
  notes: string | null
  number: string | null
  owner_id: string
  payment_instructions: string | null
  public_token: string | null
  sent_at: string | null
  subtotal_minor: number
  tax_minor: number
  tax_rate_bps: number
  total_minor: number
  updated_at: string
  void_reason: string | null
  voided_at: string | null
}

type InvoiceEmailRow = {
  cc_emails: string[]
  created_at: string
  id: string
  invoice_id: string
  kind: Database["public"]["Enums"]["invoice_email_kind"]
  owner_id: string
  provider_message_id: string | null
  subject: string
  to_email: string
}

type PaymentRow = {
  amount_minor: number
  created_at: string
  currency: string
  deleted_at: string | null
  id: string
  invoice_id: string
  method: Database["public"]["Enums"]["payment_method"]
  note: string | null
  owner_id: string
  paid_on: string
  provider_fee_minor: number | null
  provider_payload: Json | null
  provider_ref: string | null
  reference: string | null
  source: Database["public"]["Enums"]["payment_source"]
  status: Database["public"]["Enums"]["payment_status"]
  updated_at: string
}

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      business_settings: {
        Row: {
          address: Json
          business_name: string
          created_at: string
          default_currency: string
          default_notes: string | null
          default_payment_terms_days: number
          default_tax_rate_bps: number
          email: string | null
          id: string
          invoice_number_width: number
          invoice_prefix: string
          logo_path: string | null
          next_invoice_number: number
          owner_id: string
          payment_instructions: string | null
          phone: string | null
          tax_id: string | null
          timezone: string
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: Json
          business_name: string
          created_at?: string
          default_currency?: string
          default_notes?: string | null
          default_payment_terms_days?: number
          default_tax_rate_bps?: number
          email?: string | null
          id?: string
          invoice_number_width?: number
          invoice_prefix?: string
          logo_path?: string | null
          next_invoice_number?: number
          owner_id?: string
          payment_instructions?: string | null
          phone?: string | null
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: Json
          business_name?: string
          created_at?: string
          default_currency?: string
          default_notes?: string | null
          default_payment_terms_days?: number
          default_tax_rate_bps?: number
          email?: string | null
          id?: string
          invoice_number_width?: number
          invoice_prefix?: string
          logo_path?: string | null
          next_invoice_number?: number
          owner_id?: string
          payment_instructions?: string | null
          phone?: string | null
          tax_id?: string | null
          timezone?: string
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      clients: {
        Row: {
          archived_at: string | null
          billing_address: Json
          cc_emails: string[]
          contact_name: string | null
          created_at: string
          currency: string | null
          email: string | null
          id: string
          name: string
          notes: string | null
          owner_id: string
          payment_terms_days: number | null
          phone: string | null
          tax_id: string | null
          updated_at: string
        }
        Insert: {
          archived_at?: string | null
          billing_address?: Json
          cc_emails?: string[]
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          owner_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Update: {
          archived_at?: string | null
          billing_address?: Json
          cc_emails?: string[]
          contact_name?: string | null
          created_at?: string
          currency?: string | null
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          owner_id?: string
          payment_terms_days?: number | null
          phone?: string | null
          tax_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          amount_minor: number | null
          created_at: string
          description: string
          id: string
          invoice_id: string
          owner_id: string
          position: number
          quantity: number
          taxable: boolean
          unit_price_minor: number
          updated_at: string
        }
        Insert: {
          amount_minor?: number | null
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          owner_id?: string
          position: number
          quantity: number
          taxable?: boolean
          unit_price_minor: number
          updated_at?: string
        }
        Update: {
          amount_minor?: number | null
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          owner_id?: string
          position?: number
          quantity?: number
          taxable?: boolean
          unit_price_minor?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_emails: {
        Row: InvoiceEmailRow
        Insert: Partial<InvoiceEmailRow> & {
          invoice_id: string
          kind: Database["public"]["Enums"]["invoice_email_kind"]
          subject: string
          to_email: string
        }
        Update: Partial<InvoiceEmailRow>
        Relationships: [
          {
            foreignKeyName: "invoice_emails_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: InvoiceRow
        Insert: Partial<InvoiceRow> & { client_id: string; currency: string }
        Update: Partial<InvoiceRow>
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: PaymentRow
        Insert: Partial<PaymentRow> & {
          amount_minor: number
          currency: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_on: string
        }
        Update: Partial<PaymentRow>
        Relationships: [
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      invoice_summary: {
        Row: { [K in keyof InvoiceRow]: InvoiceRow[K] | null } & {
          amount_paid_minor: number | null
          balance_minor: number | null
          client_name: string | null
          days_overdue: number | null
          last_paid_on: string | null
          status: Database["public"]["Enums"]["invoice_status"] | null
          today: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoices_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      delete_payment: {
        Args: { p_payment_id: string }
        Returns: PaymentRow
      }
      ensure_public_token: {
        Args: { p_invoice_id: string }
        Returns: string
      }
      get_public_invoice: {
        Args: { p_token: string }
        Returns: Json
      }
      has_succeeded_payments: {
        Args: { p_invoice_id: string }
        Returns: boolean
      }
      issue_invoice: {
        Args: { p_invoice_id: string; p_issue_date?: string }
        Returns: InvoiceRow
      }
      is_shared_logo: {
        Args: { p_path: string }
        Returns: boolean
      }
      lifecycle_change_allowed: { Args: never; Returns: boolean }
      log_invoice_email: {
        Args: {
          p_cc: string[]
          p_invoice_id: string
          p_kind: Database["public"]["Enums"]["invoice_email_kind"]
          p_provider_message_id?: string
          p_subject: string
          p_to: string
        }
        Returns: InvoiceEmailRow
      }
      owner_today: { Args: { p_owner?: string }; Returns: string }
      recompute_invoice_totals: {
        Args: { p_invoice_id: string }
        Returns: undefined
      }
      record_payment: {
        Args: {
          p_amount_minor: number
          p_invoice_id: string
          p_method: Database["public"]["Enums"]["payment_method"]
          p_note?: string
          p_paid_on: string
          p_reference?: string
        }
        Returns: PaymentRow
      }
      save_invoice_draft: {
        Args: { p_invoice_id: string; p_invoice: Json; p_lines: Json }
        Returns: InvoiceRow
      }
      revert_to_draft: {
        Args: { p_invoice_id: string }
        Returns: InvoiceRow
      }
      void_invoice: {
        Args: { p_invoice_id: string; p_reason?: string }
        Returns: InvoiceRow
      }
    }
    Enums: {
      invoice_email_kind: "invoice" | "reminder"
      invoice_lifecycle: "draft" | "issued" | "void"
      invoice_status: "draft" | "sent" | "partially_paid" | "paid" | "overdue" | "void"
      payment_method: "bank_transfer" | "ach" | "check" | "cash" | "card" | "zelle" | "paypal" | "other"
      payment_source: "manual" | "stripe"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof (PublicSchema["Tables"] & PublicSchema["Views"])> =
  (PublicSchema["Tables"] & PublicSchema["Views"])[T] extends { Row: infer R } ? R : never

export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]

export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]

export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
