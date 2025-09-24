// server/lib/supabaseAdmin.ts
import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Export default (para: import supabaseAdmin from '../lib/supabaseAdmin')
export default supabaseAdmin;

// Exports nomeados compatíveis
export { supabaseAdmin };           // para: import { supabaseAdmin } from ...
export { supabaseAdmin as supabase }; // para: import { supabase } from ...
