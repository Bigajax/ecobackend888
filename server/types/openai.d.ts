declare module "openai" {
  export default class OpenAI {
    constructor(config: { apiKey: string; timeout?: number; maxRetries?: number });
    embeddings: {
      create(args: { model: string; input: string }): Promise<{
        data?: Array<{ embedding?: number[] }>;
      }>;
    };
  }
}
