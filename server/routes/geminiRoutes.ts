// C:\Users\Rafael\Desktop\eco5555\Eco666\server\routes\geminiRoutes.ts

import express, { Request, Response } from 'express'; // Importar Request e Response
import { askGemini } from '../services/geminiService'; // Certifique-se de que o caminho está correto

const router = express.Router();

// AQUI ESTÁ A SEGUNDA TENTATIVA DE CORREÇÃO:
// Envolve 'askGemini' em um middleware assíncrono explícito.
// Isso garante que o TypeScript trate isso como um handler de rota padrão.
router.post('/ask-gemini', async (req: Request, res: Response) => {
    try {
        await askGemini(req, res); // Chama a função askGemini com req e res
    } catch (error) {
        console.error("Erro no handler de rota /ask-gemini:", error);
        // Garante que uma resposta de erro é enviada, caso askGemini não a envie.
        // askGemini já está tratando erros internamente com res.status().json(),
        // mas este catch é uma proteção extra para erros inesperados aqui.
        if (!res.headersSent) { // Verifica se a resposta já foi enviada
            res.status(500).json({ error: 'Erro interno do servidor.' });
        }
    }
});

export default router;