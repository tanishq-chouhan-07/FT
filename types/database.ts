// Auto-generated type stub — matches Supabase schema
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tree: {
        Row: {
          id: string
          name: string
          description: string | null
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          updated_at?: string
        }
      }
      tree_member: {
        Row: {
          tree_id: string
          user_id: string
          role: 'owner' | 'editor' | 'viewer'
          created_at: string
        }
        Insert: {
          tree_id: string
          user_id: string
          role: 'owner' | 'editor' | 'viewer'
          created_at?: string
        }
        Update: {
          role?: 'owner' | 'editor' | 'viewer'
        }
      }
      person: {
        Row: {
          id: string
          tree_id: string
          full_name: string
          gender: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | null
          birth_date: string | null
          death_date: string | null
          is_alive: boolean
          city: string | null
          country: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tree_id: string
          full_name: string
          gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | null
          birth_date?: string | null
          death_date?: string | null
          is_alive?: boolean
          city?: string | null
          country?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string
          gender?: 'Male' | 'Female' | 'Other' | 'Prefer not to say' | null
          birth_date?: string | null
          death_date?: string | null
          is_alive?: boolean
          city?: string | null
          country?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      parent_child: {
        Row: {
          id: string
          tree_id: string
          parent_id: string
          child_id: string
          relationship_type: 'biological' | 'adopted' | 'step'
          created_at: string
        }
        Insert: {
          id?: string
          tree_id: string
          parent_id: string
          child_id: string
          relationship_type: 'biological' | 'adopted' | 'step'
          created_at?: string
        }
        Update: {
          relationship_type?: 'biological' | 'adopted' | 'step'
        }
      }
      partnership: {
        Row: {
          id: string
          tree_id: string
          partner1_id: string
          partner2_id: string
          start_date: string | null
          end_date: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tree_id: string
          partner1_id: string
          partner2_id: string
          start_date?: string | null
          end_date?: string | null
          created_at?: string
        }
        Update: {
          start_date?: string | null
          end_date?: string | null
        }
      }
    }
    Views: {}
    Functions: {
      has_tree_access: {
        Args: {
          p_tree_id: string
        }
        Returns: boolean
      }
      get_user_role: {
        Args: {
          p_tree_id: string
        }
        Returns: string | null
      }
    }
    Enums: {}
  }
}
