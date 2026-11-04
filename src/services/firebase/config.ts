import type { FirebaseApp } from 'firebase/app'

const env = import.meta.env

export const firebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
  appId: env.VITE_FIREBASE_APP_ID as string | undefined,
}

export const isFirebaseConfigured = Boolean(firebaseOptions.apiKey && firebaseOptions.projectId && firebaseOptions.appId)

/** Cloud Storage needs the Blaze plan, so it stays off unless explicitly enabled. */
export const isCloudStorageEnabled =
  isFirebaseConfigured && env.VITE_FIREBASE_STORAGE_ENABLED === 'true' && Boolean(firebaseOptions.storageBucket)

export const useEmulators = env.VITE_USE_EMULATORS === 'true'

let appPromise: Promise<FirebaseApp> | null = null

/** Firebase is loaded on demand, so local-only mode never downloads it. */
export function getFirebaseApp(): Promise<FirebaseApp> {
  if (!isFirebaseConfigured) return Promise.reject(new Error('Firebase is not configured'))
  appPromise ??= import('firebase/app').then(({ initializeApp }) => initializeApp(firebaseOptions as Record<string, string>))
  return appPromise
}
