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
import { t } from './lang';

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
    throw new Error(
      t(
        'Google нэвтрэлт өөрчлөгдсөн байна. Дахин оролдоно уу.',
        'Your Google sign-in changed. Please try again.',
      ),
    );
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

export async function getCloudIdToken(): Promise<string> {
  const { auth } = services();
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user)
    throw new Error(
      t(
        'Шууд өмсөж үзэхээс өмнө Google-ээр нэвтэрнэ үү.',
        'Sign in with Google before you start live try-on.',
      ),
    );
  return user.getIdToken();
}

export async function saveCloudPreferences(uid: string, value: Preferences) {
  const preferences = parseCloudPreferences(value);
  if (!preferences)
    throw new Error(
      t(
        'Хадгалахаас өмнө нэр болон стилийн сонголтоо шалгана уу.',
        'Check your name and style choices before saving.',
      ),
    );
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
      t(
        'Хадгалсан тохиргоог ашиглах боломжгүй байна. Энэ төхөөрөмжийн тохиргоо өөрчлөгдөөгүй.',
        'These saved preferences can’t be applied. This device’s settings are unchanged.',
      ),
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
    return t(
      'Google нэвтрэлтийг цуцаллаа. Энэ төхөөрөмж дээр үргэлжлүүлэн ашиглаж болно.',
      'Google sign-in was canceled. You can keep using this device.',
    );
  if (code === 'auth/popup-blocked')
    return t(
      'Энэ сайтад попап цонх зөвшөөрөөд “Google-ээр үргэлжлүүлэх”-ийг дахин дарна уу.',
      'Allow pop-ups for this site, then select “Continue with Google” again.',
    );
  if (code === 'auth/unauthorized-domain')
    return t(
      'Энэ вэб хаягт Google нэвтрэлт хараахан идэвхжээгүй байна.',
      'Google sign-in isn’t enabled for this web address yet.',
    );
  if (code === 'auth/operation-not-allowed')
    return t(
      'Энэ аппад Google нэвтрэлт хараахан идэвхжээгүй байна.',
      'Google sign-in isn’t enabled for this app yet.',
    );
  if (['permission-denied', 'auth/user-token-expired', 'auth/invalid-user-token'].includes(code))
    return t(
      'Үүлэн санд хандах эрх олгогдсонгүй. Гараад Google бүртгэлээ дахин холбоно уу.',
      'Cloud access was denied. Sign out, then connect your Google account again.',
    );
  if (code === 'auth/network-request-failed' || code === 'unavailable')
    return t(
      'Үүлэн тохиргоонд холбогдож чадсангүй. Энэ төхөөрөмжийн орчин хэвээр ашиглагдана.',
      'Couldn’t connect to cloud preferences. Your local workspace is still available.',
    );
  if (/^auth\/[a-z-]{1,60}$/.test(code))
    return t(
      `Google нэвтрэлт амжилтгүй боллоо (${code}). Дахин оролдох эсвэл Тохиргооноос дахин холбогдоно уу.`,
      `Google sign-in didn’t work (${code}). Try again, or reconnect from Settings.`,
    );
  if (error instanceof Error && !code) return error.message;
  return t(
    'Үүлэн тохиргоо одоогоор ажиллахгүй байна. Энэ төхөөрөмжийн орчин өөрчлөгдөөгүй.',
    'Cloud preferences are unavailable right now. Your local workspace is unchanged.',
  );
}
