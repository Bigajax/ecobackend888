declare module "openai" {
  class OpenAI {
    constructor(...args: any[]);
    embeddings: {
      create: (...args: any[]) => Promise<any>;
    };
  }
  export default OpenAI;
}

declare module "mixpanel" {
  const mixpanel: any;
  export default mixpanel;
}

declare module "dotenv" {
  const dotenv: {
    config: (...args: any[]) => void;
  };
  export default dotenv;
}
