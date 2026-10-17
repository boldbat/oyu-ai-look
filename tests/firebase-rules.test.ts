import { readFileSync } from 'node:fs';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore';

const runningEmulator = process.env.FIRESTORE_EMULATOR_HOST === '127.0.0.1:8089';

describe.skipIf(!runningEmulator)('Firebase preferences ownership and schema', () => {
  let environment: RulesTestEnvironment;
  beforeAll(async () => {
    environment = await initializeTestEnvironment({
      projectId: 'demo-oyu-ai',
      firestore: { host: '127.0.0.1', port: 8089, rules: readFileSync('firestore.rules', 'utf8') },
    });
  });
  afterEach(async () => {
    await environment.clearFirestore();
  });
  afterAll(async () => {
    await environment?.cleanup();
  });

  const payload = () => ({
    schemaVersion: 1,
    preferences: { name: 'Alex', styles: ['Classic'], theme: 'system', language: 'en' },
    updatedAt: serverTimestamp(),
  });
  const owned = (actor = 'alice', owner = 'alice') =>
    doc(
      environment.authenticatedContext(actor).firestore(),
      'users',
      owner,
      'settings',
      'preferences',
    );

  it('lets the owner create, read, update and delete only their preferences', async () => {
    await assertSucceeds(setDoc(owned(), payload()));
    expect((await assertSucceeds(getDoc(owned()))).data()?.preferences.name).toBe('Alex');
    await assertSucceeds(
      setDoc(owned(), {
        ...payload(),
        preferences: { ...payload().preferences, name: 'New name' },
      }),
    );
    expect((await getDoc(owned())).data()?.preferences.name).toBe('New name');
    await assertSucceeds(deleteDoc(owned()));
    expect((await getDoc(owned())).exists()).toBe(false);
  });

  it('rejects unauthenticated reads, writes and deletes', async () => {
    const reference = doc(
      environment.unauthenticatedContext().firestore(),
      'users',
      'alice',
      'settings',
      'preferences',
    );
    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, payload()));
    await assertFails(deleteDoc(reference));
  });

  it('rejects cross-user reads, writes and deletes', async () => {
    await setDoc(owned(), payload());
    await assertFails(getDoc(owned('bob')));
    await assertFails(setDoc(owned('bob'), payload()));
    await assertFails(deleteDoc(owned('bob')));
  });

  it('rejects collection enumeration and unrelated document access', async () => {
    const db = environment.authenticatedContext('alice').firestore();
    await assertFails(getDocs(collection(db, 'users', 'alice', 'settings')));
    await assertFails(setDoc(doc(db, 'users', 'alice', 'garments', 'piece'), { name: 'Top' }));
    await assertFails(getDoc(doc(db, 'users', 'alice', 'settings', 'billing')));
  });

  it('rejects added payload fields, unsupported versions, and client timestamps', async () => {
    await assertFails(setDoc(owned(), { ...payload(), photo: 'private-image' }));
    await assertFails(setDoc(owned(), { ...payload(), schemaVersion: 2 }));
    await assertFails(setDoc(owned(), { ...payload(), updatedAt: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(owned(), { schemaVersion: 1, preferences: payload().preferences }));
  });

  it.each([
    { name: '' },
    { name: 'x'.repeat(41) },
    { name: 123 },
    { styles: ['Classic', 'Classic'] },
    { styles: ['Unknown'] },
    { styles: ['Classic', 'Business', 'Casual', 'Sporty'] },
    { styles: [12] },
    { theme: 'unknown' },
    { language: 'unknown' },
    { privateImage: 'not-a-preference' },
  ])('rejects invalid preference data: %j', async (patch) => {
    await assertFails(
      setDoc(owned(), {
        ...payload(),
        preferences: { ...payload().preferences, ...patch },
      }),
    );
  });
});
