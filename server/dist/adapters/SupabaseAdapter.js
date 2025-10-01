"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabaseWithBearer = supabaseWithBearer;
const supabase_js_1 = require("@supabase/supabase-js");
function supabaseWithBearer(accessToken) {
    return (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY, { global: { headers: { Authorization: `Bearer ${accessToken}` } } });
}
//# sourceMappingURL=SupabaseAdapter.js.map