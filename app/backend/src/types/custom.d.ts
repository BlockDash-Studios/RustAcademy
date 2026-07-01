// Lightweight module declarations to satisfy TypeScript in the build environment
declare module 'nest-winston';
declare module 'winston';

declare global {
  namespace Express {
    interface Request {
      apiKey?: {
        id: string;
        name: string;
        scopes: string[];
        rateLimit: number;
        organization_id?: string | null;
        userId?: string;
      };
      organizationContext?: {
        organizationId?: string;
        role: "admin" | "member" | "read_only";
      };
      correlationId?: string;
      user?: {
        id?: string;
      };
      userId?: string;
      publicKey?: string;
      rateLimitContext?: {
        group?: string;
        keyType?: string;
      };
    }
  }
}

declare module "express-serve-static-core" {
  interface Request {
    apiKey?: {
      id: string;
      name: string;
      scopes: string[];
      rateLimit: number;
      organization_id?: string | null;
      userId?: string;
    };
    organizationContext?: {
      organizationId?: string;
      role: "admin" | "member" | "read_only";
    };
    correlationId?: string;
    user?: {
      id?: string;
    };
    userId?: string;
    publicKey?: string;
    rateLimitContext?: {
      group?: string;
      keyType?: string;
    };
  }
}

export {};
