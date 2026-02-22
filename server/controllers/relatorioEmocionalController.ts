import { Request, Response } from 'express';
import { gerarRelatorioEmocional } from '../services/gerarRelatorioEmocional';
import { log } from '../services/promptContext/logger';

const logger = log.withContext("relatorio-emocional-controller");

export const relatorioEmocionalHandler = async (req: Request, res: Response) => {
  const { usuario_id } = req.query;

  if (!usuario_id || typeof usuario_id !== 'string') {
    return res.status(400).json({ erro: 'Usuário não especificado' });
  }

  try {
    const relatorio = await gerarRelatorioEmocional(usuario_id);
    res.status(200).json(relatorio);
  } catch (err) {
    logger.error("relatorio_emocional_failed", {
      usuario_id,
      message: err instanceof Error ? err.message : String(err),
    });
    res.status(500).json({ erro: 'Erro ao gerar relatório emocional' });
  }
};
