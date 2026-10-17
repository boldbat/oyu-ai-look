import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  GoogleAuthProvider,
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from 'firebase/firestore/lite';
import webConfig from './firebase-web-config.json';
import { parseCloudPreferences } from './cloud-preferences-schema';
import type { Preferences } from './types';

export interface CloudUser {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export interface SavedCloudPreferences {
  preferences: Preferences;
  updatedAt: string | null;
}

const appName = 'oyu-style-preferences';
function services() {
  const app = getApps().some((item) => item.name === appName)
    ? getApp(appName)
    : initializeApp(webConfig, appName);
  return { auth: getAuth(app), db: getFirestore(app) };
}

function ownedDocument(uid: string) {
  const { auth, db } = services();
  if (!uid || auth.currentUser?.uid !== uid)
    throw new Error('Your Google sign-in changed. Please try again.');
  return doc(db, 'users', uid, 'settings', 'preferences');
}

export function observeCloudUser(
  next: (user: CloudUser | null) => void,
  error: (error: unknown) => void,
) {
  return onAuthStateChanged(
    services().auth,
    (user) =>
      next(user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null),
    error,
  );
}

export async function connectGoogle() {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  await signInWithPopup(services().auth, provider);
}

export async function disconnectGoogle() {
  await signOut(services().auth);
}

export async function saveCloudPreferences(uid: string, value: Preferences) {
  const preferences = parseCloudPreferences(value);
  if (!preferences) throw new Error('Check your name and style preferences before saving.');
  await setDoc(ownedDocument(uid), {
    schemaVersion: 1,
    preferences,
    updatedAt: serverTimestamp(),
  });
  ownedDocument(uid);
}

export async function loadCloudPreferences(uid: string): Promise<SavedCloudPreferences | null> {
  const snapshot = await getDoc(ownedDocument(uid));
  ownedDocument(uid);
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  const preferences = parseCloudPreferences(data.preferences);
  if (data.schemaVersion !== 1 || !preferences || !(data.updatedAt instanceof Timestamp))
    throw new Error(
      'These saved preferences cannot be applied. Your local settings are unchanged.',
    );
  return { preferences, updatedAt: data.updatedAt.toDate().toISOString() };
}

export async function removeCloudPreferences(uid: string) {
  await deleteDoc(ownedDocument(uid));
  ownedDocument(uid);
}

export function cloudErrorMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(code))
    return 'Google sign-in was cancelled. You can continue using this device.';
  if (code === 'auth/popup-blocked')
    return 'Allow popups for this site, then try Continue with Google again.';
  if (code === 'auth/unauthorized-domain')
    return 'Google sign-in is not enabled for this website address yet.';
  if (code === 'auth/operation-not-allowed')
    return 'Google sign-in is not enabled for this app yet.';
  if (['permission-denied', 'auth/user-token-expired', 'auth/invalid-user-token'].includes(code))
    return 'Cloud access was denied. Sign out and connect your Google account again.';
  if (code === 'auth/network-request-failed' || code === 'unavailable')
    return 'Cloud preferences could not connect. Your local workspace is still available.';
  if (error instanceof Error && !code) return error.message;
  return 'Cloud preferences are unavailable right now. Your local workspace is unchanged.';
}
