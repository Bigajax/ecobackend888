"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
// server/lib/supabaseAdmin.ts
const supabase_js_1 = require("@supabase/supabase-js");
const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET ||
    process.env.SUPABASE_KEY ||
    "";
if (!url || !serviceKey) {
    const missing = [
        !url ? "SUPABASE_URL (ou NEXT_PUBLIC_SUPABASE_URL)" : null,
        !serviceKey
            ? "SUPABASE_SERVICE_ROLE_KEY (ou SUPABASE_SECRET/SUPABASE_KEY)"
            : null,
    ]
        .filter(Boolean)
        .join(", ");
    throw new Error(`Supabase admin não configurado: defina ${missing} nas variáveis de ambiente.`);
}
/** Singleton do Supabase usando a Service Role Key (admin) */
exports.supabase = (0, supabase_js_1.createClient)(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
});
// 🔐 Compatibilidade: permite `import supabase from "..."`
exports.default = exports.supabase;
//# sourceMappingURL=supabaseAdmin.js.map