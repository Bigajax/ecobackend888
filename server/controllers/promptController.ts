import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

let promptMestreCache: string;

async function carregarPromptMestre() {
  const assetsDir = path.join(process.cwd(), 'assets');
  const arquivos = [
    'eco_prompt_programavel.txt',
    'eco_manifesto_fonte.txt',
    'eco_principios_poeticos.txt',
    'eco_behavioral_instructions.txt',
    'eco_core_personality.txt',
    'eco_guidelines_general.txt',
    'eco_emotions.txt',
    'eco_examples_realistic.txt',
    'eco_generic_inputs.txt',
    'eco_forbidden_patterns.txt',
    'eco_farewell.txt',
  ];

  const textos = await Promise.all(
    arquivos.map(filename =>
      fs.readFile(path.join(assetsDir, filename), 'utf-8')
    )
  );

  promptMestreCache = textos
    .map((conteudo, idx) => {
      const titulo = arquivos[idx]
        .replace('.txt', '')
        .replace(/eco_/g, '')
        .replace(/_/g, ' ')
        .toUpperCase();
      return `## ${titulo}\n\n${conteudo.trim()}`;
    })
    .join('\n\n');
}

carregarPromptMestre().catch(err => {
  console.error('Falha ao carregar prompt mestre:', err);
  process.exit(1);
});

export const getPromptMestre = (_req: Request, res: Response) => {
  res.json({ prompt: promptMestreCache });
};
