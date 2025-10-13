import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface AuthenticatedUser {
    id: string;
    email?: string | null;
    [key: string]: unknown;
  }

  interface Request {
    user?: AuthenticatedUser | null;
  }
}
