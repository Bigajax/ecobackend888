import "express-serve-static-core";

declare module "express-serve-static-core" {
  interface AuthenticatedUser {
    id: string;
    email?: string | null;
    [key: string]: unknown;
  }

  interface GuestSessionMeta {
    id: string;
    ip: string;
    interactionsUsed: number;
    maxInteractions: number;
    rateLimit: { limit: number; remaining: number; resetAt: number };
  }

  interface Request {
    user?: AuthenticatedUser | null;
    guestId?: string;
    guest?: GuestSessionMeta;
  }
}
