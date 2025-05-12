
import fs from 'fs/promises';
import path from 'path';

export async function loadEcoPrompt(): Promise<string> {
  const promptsDir = path.join(process.cwd(), 'src', 'eco_prompts');

  const files = await fs.readdir(promptsDir);
  const mdFiles = files.filter(file => file.endsWith('.md'));

  const contents = await Promise.all(
    mdFiles.map(file => fs.readFile(path.join(promptsDir, file), 'utf-8'))
  );

  return contents.join('\n\n');
}
