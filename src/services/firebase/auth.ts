import type { Auth, User } from 'firebase/auth'
import { getFirebaseApp, useEmulators } from './config'

let authPromise: Promise<Auth> | null = null
/** The name given at sign-up. The auth listener fires before the profile update lands. */
let signUpName = ''
export const takeSignUpName = () => {
  const name = signUpName
  signUpName = ''
  return name
}

async function getAuthInstance(): Promise<Auth> {
  authPromise ??= (async () => {
    const [{ initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, connectAuthEmulator }, app] = await Promise.all([
      import('firebase/auth'),
      getFirebaseApp(),
    ])
    // Keeps the session across restarts, and lets the app open offline without a network check.
    const auth = initializeAuth(app, { persistence: [indexedDBLocalPersistence, browserLocalPersistence] })
    if (useEmulators) connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
    return auth
  })()
  return authPromise
}

export async function watchAuth(cb: (user: User | null) => void): Promise<() => void> {
  const [{ onAuthStateChanged }, auth] = await Promise.all([import('firebase/auth'), getAuthInstance()])
  return onAuthStateChanged(auth, cb)
}

export async function signIn(email: string, password: string) {
  const [{ signInWithEmailAndPassword }, auth] = await Promise.all([import('firebase/auth'), getAuthInstance()])
  await signInWithEmailAndPassword(auth, email, password)
}

export async function signUp(email: string, password: string, displayName: string) {
  const [{ createUserWithEmailAndPassword, updateProfile }, auth] = await Promise.all([import('firebase/auth'), getAuthInstance()])
  signUpName = displayName
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    if (displayName) await updateProfile(cred.user, { displayName })
  } catch (e) {
    signUpName = ''
    throw e
  }
}

export async function resetPassword(email: string) {
  const [{ sendPasswordResetEmail }, auth] = await Promise.all([import('firebase/auth'), getAuthInstance()])
  await sendPasswordResetEmail(auth, email)
}

export async function signOutUser() {
  const [{ signOut }, auth] = await Promise.all([import('firebase/auth'), getAuthInstance()])
  await signOut(auth)
}

export function authErrorMessage(code: string, lang: 'ar' | 'en'): string {
  const m: Record<string, [string, string]> = {
    'auth/invalid-credential': ['البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
    'auth/wrong-password': ['البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
    'auth/user-not-found': ['البريد الإلكتروني أو كلمة المرور غير صحيحة.', 'Incorrect email or password.'],
    'auth/invalid-email': ['صيغة البريد الإلكتروني غير صحيحة.', 'That email address is not valid.'],
    'auth/email-already-in-use': ['هذا البريد مسجل بالفعل. جرّب تسجيل الدخول.', 'This email is already registered. Try signing in.'],
    'auth/weak-password': ['كلمة المرور ضعيفة. استخدم 6 أحرف على الأقل.', 'Password is too weak. Use at least 6 characters.'],
    'auth/too-many-requests': ['محاولات كثيرة. انتظر قليلًا ثم حاول مجددًا.', 'Too many attempts. Wait a little and try again.'],
    'auth/network-request-failed': ['لا يوجد اتصال بالإنترنت.', 'No internet connection.'],
    'auth/operation-not-allowed': ['إنشاء الحسابات غير مفعّل في هذا المشروع.', 'Creating accounts is turned off for this project.'],
    'auth/admin-restricted-operation': ['إنشاء الحسابات غير مفعّل في هذا المشروع.', 'Creating accounts is turned off for this project.'],
  }
  const hit = m[code]
  if (hit) return lang === 'ar' ? hit[0] : hit[1]
  return lang === 'ar' ? 'حدث خطأ. حاول مرة أخرى.' : 'Something went wrong. Please try again.'
}
