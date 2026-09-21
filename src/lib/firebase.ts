import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  signInAnonymously,
  User 
} from 'firebase/auth';
import { 
  initializeFirestore, 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  query, 
  where, 
  addDoc,
  deleteDoc,
  updateDoc,
  orderBy,
  serverTimestamp
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { UserAccount, MeetingRoom, RoomId } from '../types';

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Use custom Firestore Database ID if present in the config
const dbId = (firebaseConfig as any).firestoreDatabaseId || 'ai-studio-meetingroomec-3c2bddea-cdac-4fd8-a67f-a08c0376010b';
export const db = dbId 
  ? initializeFirestore(app, { experimentalForceLongPolling: true }, dbId)
  : initializeFirestore(app, { experimentalForceLongPolling: true });

// Error syncing helpers and types for Firestore Security Rules diagnostics
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Configure Google OAuth Provider
export const provider = new GoogleAuthProvider();
// Request Calendar scope & Profile scope
provider.addScope('https://www.googleapis.com/auth/calendar');
provider.addScope('https://www.googleapis.com/auth/userinfo.email');
provider.addScope('https://www.googleapis.com/auth/userinfo.profile');
provider.addScope('https://www.googleapis.com/auth/gmail.send');
provider.addScope('https://mail.google.com/');

// Enable auto-select to avoid silent loop if needed, or prompt
provider.setCustomParameters({
  prompt: 'select_account'
});

// Cache the access token in memory
let cachedAccessToken: string | null = null;
let isSigningIn = false;

// Meeting rooms static configuration
export const MEETING_ROOMS: MeetingRoom[] = [
  {
    id: 'room1',
    name: 'ห้องประชุม 1',
    displayName: 'ห้องประชุม 1',
    capacity: 4,
    amenities: ['Whiteboard', '4K Monitor', 'High-speed Wi-Fi', 'Coffee Station Access'],
    color: 'emerald',
    bgLight: 'bg-emerald-50',
    borderClass: 'border-emerald-200'
  },
  {
    id: 'room2',
    name: 'ห้องประชุม 2',
    displayName: 'ห้องประชุม 2',
    capacity: 8,
    amenities: ['Interactive Smart TV', 'Polycom Video Conference', 'Glass Whiteboard', 'Wireless Presentation Screen'],
    color: 'indigo',
    bgLight: 'bg-indigo-50',
    borderClass: 'border-indigo-200'
  },
  {
    id: 'room3',
    name: 'ห้องประชุม 3',
    displayName: 'ห้องประชุม 3',
    capacity: 20,
    amenities: ['Dual Projectors', 'Wireless Mics & Sound System', 'Stage & Podium', 'Video Recording Setup', 'Catering Station'],
    color: 'amber',
    bgLight: 'bg-amber-50',
    borderClass: 'border-amber-200'
  }
];

// Initialize Auth Listener & manage memory cache token
export const initAuth = (
  onAuthSuccess: (user: User, token: string) => void,
  onAuthFailure: () => void
) => {
  return onAuthStateChanged(auth, async (user) => {
    if (user) {
      if (user.isAnonymous) {
        onAuthSuccess(user, '');
      } else if (cachedAccessToken) {
        onAuthSuccess(user, cachedAccessToken);
      } else {
        // If we have a user but token wasn't cached (e.g. refresh), we might need to prompt login 
        // to get the calendar API access token. In client SPAs, the access token resides inside GoogleAuthProvider result.
        // Therefore, we trigger sign-in if needed or let the App state know we need token.
        onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      onAuthFailure();
    }
  });
};

// Sign in with Google Popup and grab credentials
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('ไม่ได้รับ Access Token จาก Google Account');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    if (
      error?.code === 'auth/popup-closed-by-user' || 
      error?.code === 'auth/cancelled-popup-request' ||
      error?.message?.includes('popup-closed-by-user') ||
      error?.message?.includes('popup_closed_by_user')
    ) {
      console.log('User closed sign-in popup or request cancelled');
      return null;
    }
    console.error('เกิดข้อผิดพลาดระหว่างล็อกอิน:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

// Sign in anonymously to bypass Google Sign-In restrictions (for testing or guest mode)
export const anonymousSignIn = async (email: string, displayName: string, nickname: string): Promise<{ user: User; isNewUser: boolean } | null> => {
  try {
    const result = await signInAnonymously(auth);
    
    // Check if user exists in our Firestore users collection
    const userDocRef = doc(db, 'users', result.user.uid);
    let userDocSnap;
    try {
      userDocSnap = await getDoc(userDocRef);
    } catch (error) {
      console.warn('Unable to query Firestore anonymously:', error);
    }
    
    let isNewUser = false;
    if (userDocSnap && !userDocSnap.exists()) {
      isNewUser = true;
      const role = email === 'itsupport@ec.co.th' ? 'admin' : 'employee';
      const newAccount: UserAccount = {
        id: result.user.uid,
        email,
        displayName,
        nickname,
        role,
        createdAt: new Date().toISOString()
      };
      
      try {
        await setDoc(userDocRef, newAccount);
      } catch (error) {
        console.warn('Unable to save user profile anonymously:', error);
      }
    }
    
    return { user: result.user, isNewUser };
  } catch (error) {
    console.error('Anonymous sign in failed:', error);
    throw error;
  }
};

// Sign Out
export const googleSignOut = async () => {
  await signOut(auth);
  cachedAccessToken = null;
};

// Retrieve cached access token
export const getCachedToken = (): string | null => {
  return cachedAccessToken;
};

// Set token directly (for re-hydration or keeping track)
export const setCachedToken = (token: string) => {
  cachedAccessToken = token;
};

// Seed sample users to make user management lively and useful immediately
const seedDefaultUsersIfNeeded = async () => {
  try {
    const usersColl = collection(db, 'users');
    let qSnap;
    try {
      qSnap = await getDocs(usersColl);
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'users');
      return;
    }
    
    // If we only have 1 user (the logged-in one), seed a few more employees to make user selection and role management realistic
    if (qSnap.size <= 1) {
      const defaultUsers: Omit<UserAccount, 'id'>[] = [
        {
          email: 'somchai.j@ec.co.th',
          displayName: 'สมชาย ใจดี',
          nickname: 'ชาย',
          role: 'employee'
        },
        {
          email: 'napaporn.k@ec.co.th',
          displayName: 'นภาพร แก้วสะอาด',
          nickname: 'เปิ้ล',
          role: 'employee'
        },
        {
          email: 'peeradon.s@ec.co.th',
          displayName: 'พีรดนย์ ศรีสุข',
          nickname: 'บอส',
          role: 'admin'
        },
        {
          email: 'chayanit.m@ec.co.th',
          displayName: 'ชยานิษฐ์ มั่งมี',
          nickname: 'ฝน',
          role: 'employee'
        }
      ];
      
      for (const u of defaultUsers) {
        // Create random doc ID
        const newDocRef = doc(collection(db, 'users'));
        try {
          await setDoc(newDocRef, {
            id: newDocRef.id,
            ...u,
            createdAt: new Date().toISOString()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `users/${newDocRef.id}`);
        }
      }
      console.log('Seeded initial mock users successfully.');
    }
  } catch (error) {
    console.error('Error seeding default users:', error);
  }
};
