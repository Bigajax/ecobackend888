export class AskEcoRequestError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "AskEcoRequestError";
    this.statusCode = statusCode;
  }
}
