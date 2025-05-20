// C:\Users\Rafael\Desktop\eco5555\Eco666\server\routes\promptRoutes.ts

import { Router } from 'express';
import { getPromptMestre } from '../controllers/promptController';

const router = Router();

// >>> ADICIONE ESTE LOG AQUI <<<
console.log('Backend: promptRoutes carregado.');
// >>> FIM DO BLOCO DE LOG <<<

router.get('/prompt-mestre', getPromptMestre);

export default router;