export function createLiveAuthorizer(options?: {
  projectId?: string;
  allowedEmails?: string[];
  verifyToken?: (idToken: string) => Promise<{
    uid?: string;
    email?: string;
    email_verified?: boolean;
    firebase?: { sign_in_provider?: string };
  }>;
}): (idToken: string) => Promise<boolean>;
import type { JWTVerifyGetKey, JWTPayload } from 'jose';

export function createFirebaseTokenVerifier(
  projectId: string,
  keys?: JWTVerifyGetKey,
): (idToken: string) => Promise<JWTPayload & { uid: string }>;
