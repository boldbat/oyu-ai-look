import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from 'jose';
import { createFirebaseTokenVerifier, createLiveAuthorizer } from '../server/live-auth.mjs';

describe('Firebase token signature and claims', () => {
  let privateKey: CryptoKey;
  let verify: ReturnType<typeof createFirebaseTokenVerifier>;
  const project = 'fixture-project';
  const now = Math.floor(Date.now() / 1000);
  beforeAll(async () => {
    const pair = await generateKeyPair('RS256');
    privateKey = pair.privateKey;
    const key = await exportJWK(pair.publicKey);
    verify = createFirebaseTokenVerifier(
      project,
      createLocalJWKSet({
        keys: [{ ...key, kid: 'fixture-key', alg: 'RS256' }],
      }),
    );
  });
  const token = (changes = {}, kid: string | null = 'fixture-key') =>
    new SignJWT({
      iss: `https://securetoken.google.com/${project}`,
      aud: project,
      sub: 'owner',
      iat: now - 1,
      auth_time: now - 10,
      exp: now + 300,
      ...changes,
    })
      .setProtectedHeader({ alg: 'RS256', ...(kid ? { kid } : {}) })
      .sign(privateKey);
  it('verifies an RSA-signed token and maps its subject to the Firebase UID', async () => {
    expect((await verify(await token())).uid).toBe('owner');
  });
  it.each([
    { aud: 'other-project' },
    { aud: [project] },
    { iss: 'https://securetoken.google.com/other-project' },
    { sub: '' },
    { sub: 'x'.repeat(129) },
    { exp: now - 10 },
    { iat: now + 300 },
    { auth_time: now + 300 },
    { auth_time: undefined },
  ])('rejects invalid Firebase claims: %j', async (changes) => {
    await expect(verify(await token(changes))).rejects.toThrow();
  });
  it('rejects a missing key ID and a forged signature', async () => {
    await expect(verify(await token({}, null))).rejects.toThrow();
    const signed = await token();
    const parts = signed.split('.');
    parts[2] = (parts[2][0] === 'A' ? 'B' : 'A') + parts[2].slice(1);
    await expect(verify(parts.join('.'))).rejects.toThrow();
  });
});

describe('hosted live Google authorization', () => {
  const claims = {
    uid: 'owner',
    email: 'owner@example.test',
    email_verified: true,
    firebase: { sign_in_provider: 'google.com' },
  };
  it('allows only a verified Google identity in the configured demo allowlist', async () => {
    const verifyToken = vi.fn().mockResolvedValue(claims);
    const authorize = createLiveAuthorizer({
      projectId: 'fixture-project',
      allowedEmails: ['OWNER@example.test'],
      verifyToken,
    });
    expect(await authorize('firebase-id-token')).toBe(true);
    expect(verifyToken).toHaveBeenCalledWith('firebase-id-token');
  });
  it.each([
    { ...claims, email: 'other@example.test' },
    { ...claims, email_verified: false },
    { ...claims, uid: undefined },
    { ...claims, firebase: { sign_in_provider: 'password' } },
  ])('rejects an ineligible identity: %j', async (value) => {
    const authorize = createLiveAuthorizer({
      projectId: 'fixture-project',
      allowedEmails: ['owner@example.test'],
      verifyToken: vi.fn().mockResolvedValue(value),
    });
    expect(await authorize('firebase-id-token')).toBe(false);
  });
  it('fails closed for missing configuration and invalid signatures', async () => {
    const verifyToken = vi.fn().mockRejectedValue(new Error('private token diagnostic'));
    expect(
      await createLiveAuthorizer({ projectId: 'fixture-project', allowedEmails: [], verifyToken })(
        'token',
      ),
    ).toBe(false);
    expect(verifyToken).not.toHaveBeenCalled();
    expect(
      await createLiveAuthorizer({
        projectId: 'fixture-project',
        allowedEmails: ['owner@example.test'],
        verifyToken,
      })('invalid-token'),
    ).toBe(false);
  });
});
