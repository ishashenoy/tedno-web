import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY

// Debug logging
console.log('Supabase URL:', supabaseUrl)
console.log('Supabase Key available:', !!supabaseAnonKey)

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase configuration missing:')
  console.error('URL:', supabaseUrl)
  console.error('Key available:', !!supabaseAnonKey)
}
// Create a dummy client if keys are missing to prevent crash
export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey)
  : {
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
        signUp: async () => ({ error: { message: 'Supabase keys missing' } }),
        signInWithPassword: async () => ({ error: { message: 'Supabase keys missing' } }),
        signOut: async () => ({ error: { message: 'Supabase keys missing' } }),
      },
      from: () => ({
        select: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: { message: 'Supabase keys missing' } }) }) }),
      })
    }

