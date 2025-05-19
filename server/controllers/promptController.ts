import { Request, Response } from 'express';
import fs from 'fs/promises';
import path from 'path';

export const getPromptMestre = async (req: Request, res: Response) => {
  try {
    const assetsDir = path.join(process.cwd(), 'assets'); // Alterado para process.cwd()
    const manifestoPath = path.join(assetsDir, 'eco_manifesto_fonte.txt');
    const principiosPath = path.join(assetsDir, 'eco_principios_poeticos.txt');
    const behavioralPath = path.join(assetsDir, 'eco_behavioral_instructions.txt');
    const corePath = path.join(assetsDir, 'eco_core_personality.txt');
    const guidelinesPath = path.join(assetsDir, 'eco_guidelines_general.txt');
    const emotionsPath = path.join(assetsDir, 'eco_emotions.txt');
    const examplesPath = path.join(assetsDir, 'eco_examples_realistic.txt');
    const genericPath = path.join(assetsDir, 'eco_generic_inputs.txt');
    const forbiddenPath = path.join(assetsDir, 'eco_forbidden_patterns.txt');
    const farewellPath = path.join(assetsDir, 'eco_farewell.txt');

    const [
      ecoManifesto,
      ecoPrincipios,
      ecoBehavioral,
      ecoCore,
      ecoGuidelines,
      ecoEmotions,
      ecoExamples,
      ecoGeneric,
      ecoForbidden,
      ecoFarewell,
    ] = await Promise.all([
      fs.readFile(manifestoPath, 'utf-8'),
      fs.readFile(principiosPath, 'utf-8'),
      fs.readFile(behavioralPath, 'utf-8'),
      fs.readFile(corePath, 'utf-8'),
      fs.readFile(guidelinesPath, 'utf-8'),
      fs.readFile(emotionsPath, 'utf-8'),
      fs.readFile(examplesPath, 'utf-8'),
      fs.readFile(genericPath, 'utf-8'),
      fs.readFile(forbiddenPath, 'utf-8'),
      fs.readFile(farewellPath, 'utf-8'),
    ]);

    const promptMestre = [
      `## MANIFESTO FONTE DA ECO\n\n${ecoManifesto}`,
      `## PRINCÍPIOS POÉTICOS DA ECO\n\n${ecoPrincipios}`,
      `## INSTRUÇÕES COMPORTAMENTAIS DA ECO\n\n${ecoBehavioral}`,
      `## PERSONALIDADE PRINCIPAL DA ECO\n\n${ecoCore}`,
      `## DIRETRIZES GERAIS DA ECO\n\n${ecoGuidelines}`,
      `## EMOÇÕES DA ECO\n\n${ecoEmotions}`,
      `## EXEMPLOS REALÍSTICOS DA ECO\n\n${ecoExamples}`,
      `## ENTRADAS GENÉRICAS DA ECO\n\n${ecoGeneric}`,
      `## PADRÕES PROIBIDOS DA ECO\n\n${ecoForbidden}`,
      `## DESPEDIDA DA ECO\n\n${ecoFarewell}`,
    ].join('\n\n');

    res.json({ prompt: promptMestre });
  } catch (error: any) {
    console.error('Erro ao ler os prompts da ECO:', error);
    res.status(500).json({ error: 'Falha ao obter o prompt mestre' });
  }
};