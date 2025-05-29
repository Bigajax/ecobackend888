"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/memoryRoutes.ts
const express_1 = require("express");
const supabaseClient_1 = require("../lib/supabaseClient");
// Explicitamente tipar 'router' como um Express.Router
const router = (0, express_1.Router)();
router.get('/memories', async (req, res) => {
    const { usuario_id, emocao, intensidade_min } = req.query;
    if (!usuario_id) {
        return res.status(400).json({ error: 'Parâmetro usuario_id é obrigatório.' });
    }
    try {
        let query = supabaseClient_1.supabase
            .from('memories')
            .select('*')
            .eq('usuario_id', usuario_id)
            .order('data_registro', { ascending: false });
        if (emocao) {
            query = query.eq('emocao_principal', emocao);
        }
        if (intensidade_min) {
            // Ensure intensity_min is a valid number before using it
            const minIntensity = Number(intensidade_min);
            if (!isNaN(minIntensity)) {
                query = query.gte('intensidade', minIntensity);
            }
            else {
                return res.status(400).json({ error: 'Parâmetro intensidade_min deve ser um número válido.' });
            }
        }
        const { data, error } = await query;
        if (error) {
            console.error('Erro ao buscar memórias:', error.message);
            return res.status(500).json({ error: 'Erro ao buscar memórias.' });
        }
        return res.status(200).json(data);
    }
    catch (err) {
        console.error('Erro geral no endpoint /memories:', err);
        return res.status(500).json({ error: 'Erro interno do servidor.' });
    }
});
exports.default = router;
//# sourceMappingURL=memoryRoutes.js.map