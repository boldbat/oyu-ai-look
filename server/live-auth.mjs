import { createRemoteJWKSet, jwtVerify } from 'jose';

// Google's public Secure Token signing keys. No service-account credential is needed.
const googleKeys = createRemoteJWKSet(
  new URL(
    'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com',
  ),
);

export function createFirebaseTokenVerifier(projectId, keys = googleKeys) {
  return async (idToken) => {
    const { payload, protectedHeader } = await jwtVerify(idToken, keys, {
      algorithms: ['RS256'],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      requiredClaims: ['exp', 'iat', 'sub', 'auth_time'],
    });
    const now = Math.floor(Date.now() / 1000);
    if (
      !protectedHeader.kid ||
      payload.aud !== projectId ||
      !payload.sub ||
      payload.sub.length > 128 ||
      typeof payload.iat !== 'number' ||
      payload.iat > now ||
      typeof payload.auth_time !== 'number' ||
      payload.auth_time > now
    )
      throw new Error('Invalid Firebase identity');
    return { ...payload, uid: payload.sub };
  };
}

export function createLiveAuthorizer({ projectId, allowedEmails, verifyToken } = {}) {
  const emails = new Set(
    (allowedEmails || []).map((email) => email.trim().toLowerCase()).filter(Boolean),
  );
  const verify = verifyToken || createFirebaseTokenVerifier(projectId);
  return async (idToken) => {
    if (!projectId || !emails.size || typeof idToken !== 'string') return false;
    let claims;
    try {
      claims = await verify(idToken);
    } catch {
      return false;
    }
    return (
      !!claims.uid &&
      claims.email_verified === true &&
      claims.firebase?.sign_in_provider === 'google.com' &&
      typeof claims.email === 'string' &&
      emails.has(claims.email.toLowerCase())
    );
  };
}
