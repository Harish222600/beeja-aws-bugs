const { createClient } = require('@supabase/supabase-js');

// Admin client with service key for server-side operations
const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY, // Use service role key instead of anon key
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    }
);

module.exports = { supabaseAdmin };
