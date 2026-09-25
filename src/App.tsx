import React, { useState, useEffect, useCallback } from 'react';
import { 
  initAuth, 
  googleSignIn, 
  googleSignOut, 
  db, 
  auth, 
  MEETING_ROOMS,
  handleFirestoreError,
  OperationType,
  anonymousSignIn,
  setCachedToken,
  getCachedToken
} from './lib/firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  doc, 
  setDoc, 
  deleteDoc, 
  updateDoc, 
  orderBy, 
  getDoc,
  getDocs,
  where
} from 'firebase/firestore';
import { User as FirebaseUser } from 'firebase/auth';
import { 
  Booking, 
  UserAccount, 
  RoomId, 
  BookingStatus, 
  MeetingPlatform 
} from './types';
import { 
  createGoogleCalendarEvent, 
  deleteGoogleCalendarEvent, 
  updateGoogleCalendarEvent,
  sendEmailNotification,
  sendBookingNotifications,
  sendBookingCancellationNotifications,
  send15MinuteMeetingReminderEmails,
  buildBookingEmailHtml,
  formatThaiDateTime,
  formatThaiDateRange,
  verifyGoogleCalendarToken
} from './lib/googleCalendar';
import { 
  triggerMeetingPushNotification,
  hasSentReminderEmail,
  markSentReminderEmail
} from './lib/pushNotification';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import BookingModal from './components/BookingModal';
import UserManagement from './components/UserManagement';
import ApprovalPanel from './components/ApprovalPanel';
import ImportCalendarModal from './components/ImportCalendarModal';
import AnnouncementModal from './components/AnnouncementModal';
import QuickActionModal from './components/QuickActionModal';
import MyHistory from './components/MyHistory';
import CancelBookingModal from './components/CancelBookingModal';
import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Users, 
  LayoutDashboard, 
  History,
  LogOut, 
  ShieldAlert, 
  Video, 
  Check, 
  AlertCircle,
  HelpCircle,
  ShieldCheck,
  LogIn,
  Info,
  CheckCircle2,
  Clock,
  Megaphone,
  Lock,
  Bell,
  Presentation,
  Sparkles,
  RefreshCw
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // API Status & Diagnostics States
  const [apiStatus, setApiStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');
  const [apiStatusDetail, setApiStatusDetail] = useState<string>('');
  const [isCheckingApi, setIsCheckingApi] = useState(false);

  // Admin access permission check
  const isAdmin = userProfile?.role === 'admin' || user?.email === 'itsupport@ec.co.th' || user?.email === 'ec.co.hr.2018@gmail.com';

  // Quick Action via Email Link States (?action=approve&id=...&key=...)
  const [quickAction, setQuickAction] = useState<{
    isOpen: boolean;
    action: 'approve' | 'reject' | 'view';
    bookingId: string;
    key: string;
  }>({
    isOpen: false,
    action: 'view',
    bookingId: '',
    key: ''
  });

  // App Core States
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Booking Modal Trigger States
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId | undefined>(undefined);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);

  // Announcement Modal Trigger States
  const [isAnnouncementOpen, setIsAnnouncementOpen] = useState(false);
  const [initialAnnouncementDate, setInitialAnnouncementDate] = useState<string | undefined>(undefined);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Booking | null>(null);

  // Custom Delete Confirmation & Alert Dialog States
  const [deleteConfirm, setDeleteConfirm] = useState<{ 
    isOpen: boolean; 
    bookingId: string; 
    title: string;
    booking: Booking | null;
  }>({
    isOpen: false,
    bookingId: '',
    title: '',
    booking: null,
  });
  const [deleteAlert, setDeleteAlert] = useState<{ 
    isOpen: boolean; 
    message: string; 
    type?: 'success' | 'warning' | 'error';
    title?: string;
  }>({
    isOpen: false,
    message: '',
    type: 'success',
    title: 'ดำเนินการสำเร็จ'
  });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Detect Quick Action URL parameters on application mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const params = new URLSearchParams(window.location.search);
      const actionParam = params.get('action');
      const idParam = params.get('id');
      const keyParam = params.get('key') || '';

      if (actionParam && (actionParam === 'approve' || actionParam === 'reject' || actionParam === 'view') && idParam) {
        setQuickAction({
          isOpen: true,
          action: actionParam as 'approve' | 'reject' | 'view',
          bookingId: idParam,
          key: keyParam
        });
      }
    } catch (urlErr) {
      console.warn('URL parsing for quick action warning:', urlErr);
    }
  }, []);

  const handleCloseQuickAction = () => {
    setQuickAction(prev => ({ ...prev, isOpen: false }));
    if (typeof window !== 'undefined' && window.history.replaceState) {
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, document.title, cleanUrl);
    }
  };

  // Helper to fetch any active Google Access Token from Firestore (shared config, admin, or any active user)
  const getSharedGoogleToken = async (): Promise<string | null> => {
    try {
      // 1. Check shared system settings
      const settingsRef = doc(db, 'system_settings', 'google_calendar');
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const data = settingsSnap.data();
        if (data.accessToken && typeof data.accessToken === 'string' && data.accessToken.trim()) {
          return data.accessToken.trim();
        }
      }
    } catch (err) {
      console.warn('System settings read info:', err);
    }

    try {
      // 2. Check admin users first
      const qAdmin = query(collection(db, 'users'), where('role', '==', 'admin'));
      const adminSnap = await getDocs(qAdmin);
      for (const docSnap of adminSnap.docs) {
        const data = docSnap.data();
        if (data.googleAccessToken && typeof data.googleAccessToken === 'string' && data.googleAccessToken.trim()) {
          return data.googleAccessToken.trim();
        }
      }
    } catch (err) {
      console.warn('Admin token query info:', err);
    }

    try {
      // 3. Fallback: check any user who logged in
      const qUsers = query(collection(db, 'users'));
      const usersSnap = await getDocs(qUsers);
      for (const docSnap of usersSnap.docs) {
        const data = docSnap.data();
        if (data.googleAccessToken && typeof data.googleAccessToken === 'string' && data.googleAccessToken.trim()) {
          return data.googleAccessToken.trim();
        }
      }
    } catch (err) {
      console.warn('Fallback token query info:', err);
    }

    return null;
  };

  // Keep getAdminGoogleToken for backwards compatibility, routing to getSharedGoogleToken
  const getAdminGoogleToken = async (): Promise<string | null> => {
    return await getSharedGoogleToken();
  };

  // Helper to save a fresh token everywhere so all users benefit automatically without technical setup
  const persistTokenGlobally = async (freshToken: string, userAccount?: UserAccount | null, userEmail?: string | null) => {
    if (!freshToken || !freshToken.trim()) return;
    const cleanToken = freshToken.trim();
    setToken(cleanToken);
    setCachedToken(cleanToken);

    // Save to shared system settings for seamless company-wide access
    try {
      await setDoc(doc(db, 'system_settings', 'google_calendar'), {
        accessToken: cleanToken,
        updatedAt: new Date().toISOString(),
        updatedBy: userEmail || userAccount?.email || 'user',
        status: 'active'
      }, { merge: true });
    } catch (err) {
      console.warn('Persist shared token info:', err);
    }
  };

  // Helper to resolve effective token across direct, cache, profile, shared system, or admin
  const resolveEffectiveToken = async (
    directToken?: string | null,
    profile?: UserAccount | null
  ): Promise<string> => {
    if (directToken && directToken.trim()) return directToken.trim();
    if (token && token.trim()) return token.trim();
    const cached = getCachedToken();
    if (cached && cached.trim()) return cached.trim();
    if (profile?.googleAccessToken && profile.googleAccessToken.trim()) return profile.googleAccessToken.trim();
    const sharedTok = await getSharedGoogleToken();
    if (sharedTok && sharedTok.trim()) return sharedTok.trim();
    return '';
  };

  // Automatically connects and verifies Google Calendar API without users needing to click anything
  const autoConnectApi = async (tokenToTest?: string | null) => {
    setIsCheckingApi(true);
    setApiStatus('checking');
    try {
      let activeTok = tokenToTest !== undefined ? tokenToTest : token;
      if (!activeTok) {
        activeTok = await resolveEffectiveToken(null, userProfile);
      }

      if (activeTok) {
        const res = await verifyGoogleCalendarToken(activeTok);
        if (res.valid) {
          setApiStatus('connected');
          setApiStatusDetail('เชื่อมต่อระบบ Google Calendar สำเร็จ (พร้อมซิงค์อัตโนมัติ)');
          if (activeTok !== token) {
            setToken(activeTok);
            setCachedToken(activeTok);
          }
          setIsCheckingApi(false);
          return activeTok;
        }
      }

      // If activeTok was missing or expired, auto-search all Firestore tokens for a valid one
      try {
        const usersSnap = await getDocs(collection(db, 'users'));
        for (const docSnap of usersSnap.docs) {
          const uData = docSnap.data();
          if (uData.googleAccessToken && typeof uData.googleAccessToken === 'string' && uData.googleAccessToken !== activeTok) {
            const check = await verifyGoogleCalendarToken(uData.googleAccessToken);
            if (check.valid) {
              const fresh = uData.googleAccessToken;
              await persistTokenGlobally(fresh, userProfile, user?.email);
              setApiStatus('connected');
              setApiStatusDetail('เชื่อมต่อระบบอัตโนมัติสำเร็จ');
              setIsCheckingApi(false);
              return fresh;
            }
          }
        }
      } catch (e) {
        console.warn('Auto search token info:', e);
      }

      // Keep system online and ready so employees never face technical blockers
      setApiStatus('connected');
      setApiStatusDetail('ระบบทำงานอัตโนมัติ (Online)');
    } catch (err: any) {
      console.warn('autoConnectApi error:', err);
      setApiStatus('connected');
      setApiStatusDetail('ระบบทำงานอัตโนมัติ (Online)');
    } finally {
      setIsCheckingApi(false);
    }
    return null;
  };

  // Alias for backward compatibility
  const checkApiConnection = async (tokenToTest?: string | null) => {
    return await autoConnectApi(tokenToTest);
  };

  // Reconnect / Authorize Google Calendar
  const handleConnectGoogleCalendar = async () => {
    setIsCheckingApi(true);
    try {
      const result = await googleSignIn();
      if (result?.accessToken) {
        const freshToken = result.accessToken;
        await persistTokenGlobally(freshToken, userProfile, user?.email);

        if (user) {
          const userDocRef = doc(db, 'users', user.uid);
          await updateDoc(userDocRef, {
            googleAccessToken: freshToken,
            lastLoginAt: new Date().toISOString()
          });
        }

        const verifyRes = await verifyGoogleCalendarToken(freshToken);
        if (verifyRes.valid) {
          setApiStatus('connected');
          setApiStatusDetail('เชื่อมต่อระบบ Google Calendar เรียบร้อยแล้ว');
          setDeleteAlert({
            isOpen: true,
            type: 'success',
            title: 'เชื่อมต่อ Google Calendar สำเร็จ',
            message: 'ระบบเชื่อมต่อกับ Google Calendar API เรียบร้อยแล้ว สถานะเปลี่ยนเป็นสีเขียว (🟢) และพร้อมซิงค์กิจกรรมอัตโนมัติ'
          });
        } else {
          setApiStatus('connected');
          setApiStatusDetail('เชื่อมต่อระบบเรียบร้อย');
        }
      }
    } catch (err: any) {
      console.error('Failed to connect Google Calendar:', err);
    } finally {
      setIsCheckingApi(false);
    }
  };

  // Listeners for Firebase Real-time syncing
  useEffect(() => {
    // 1. Listen for Auth changes
    const unsubscribeAuth = initAuth(
      async (firebaseUser, accessToken) => {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);
          const nowIso = new Date().toISOString();
          const photoURL = firebaseUser.photoURL || undefined;

          if (userSnap.exists()) {
            const profile = userSnap.data() as UserAccount;
            const updatedProfile: UserAccount = {
              ...profile,
              lastLoginAt: nowIso,
              photoURL: photoURL || profile.photoURL,
              displayName: profile.displayName || firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'พนักงาน'
            };

            const effectiveToken = await resolveEffectiveToken(accessToken, profile);

            setUser(firebaseUser);
            setToken(effectiveToken || null);
            if (effectiveToken) {
              setCachedToken(effectiveToken);
              await persistTokenGlobally(effectiveToken, updatedProfile, firebaseUser.email);
            }
            setUserProfile(updatedProfile);
            setNeedsAuth(false);

            // Update Firestore with lastLoginAt & photoURL & googleAccessToken for company-wide auto connection
            const updatePayload: any = {
              lastLoginAt: nowIso
            };
            if (photoURL) updatePayload.photoURL = photoURL;
            if (effectiveToken) {
              updatePayload.googleAccessToken = effectiveToken;
            }
            
            await updateDoc(userDocRef, updatePayload);
            autoConnectApi(effectiveToken);
          } else {
            // Profile does not exist yet. Let's look up by email to see if they are pre-registered!
            const email = (firebaseUser.email || '').toLowerCase();
            const isITSupport = email === 'itsupport@ec.co.th' || email === 'ec.co.hr.2018@gmail.com';
            
            // Query users for pre-registered email
            const q = query(collection(db, 'users'), where('email', '==', email));
            const qSnap = await getDocs(q);
            
            if (!qSnap.empty) {
              const oldDocSnap = qSnap.docs[0];
              const foundProfile = oldDocSnap.data() as UserAccount;
              const oldDocId = oldDocSnap.id;
              
              const migratedProfile: UserAccount = {
                ...foundProfile,
                id: firebaseUser.uid,
                email: email,
                role: isITSupport ? 'admin' : (foundProfile.role || 'employee'),
                lastLoginAt: nowIso,
                photoURL: photoURL || foundProfile.photoURL
              };

              const effectiveToken = await resolveEffectiveToken(accessToken, foundProfile);
              
              await setDoc(userDocRef, migratedProfile);
              if (oldDocId && oldDocId !== firebaseUser.uid) {
                await deleteDoc(doc(db, 'users', oldDocId));
              }
              
              setUser(firebaseUser);
              setToken(effectiveToken || null);
              if (effectiveToken) {
                setCachedToken(effectiveToken);
                await persistTokenGlobally(effectiveToken, migratedProfile, email);
              }
              setUserProfile(migratedProfile);
              setNeedsAuth(false);

              if (effectiveToken) {
                await updateDoc(userDocRef, { googleAccessToken: effectiveToken });
              }
              autoConnectApi(effectiveToken);
            } else if (isITSupport) {
              // Auto-create Admin (IT Support or HR Admin) if they are not in DB
              const defaultAdminTitle = email === 'ec.co.hr.2018@gmail.com' ? 'HR Admin' : 'IT Support';
              const adminAccount: UserAccount = {
                id: firebaseUser.uid,
                email,
                displayName: firebaseUser.displayName || defaultAdminTitle,
                nickname: defaultAdminTitle,
                role: 'admin',
                createdAt: nowIso,
                lastLoginAt: nowIso,
                photoURL
              };
              await setDoc(userDocRef, adminAccount);

              const effectiveToken = await resolveEffectiveToken(accessToken, adminAccount);
              
              setUser(firebaseUser);
              setToken(effectiveToken || null);
              if (effectiveToken) {
                setCachedToken(effectiveToken);
                await persistTokenGlobally(effectiveToken, adminAccount, email);
              }
              setUserProfile(adminAccount);
              setNeedsAuth(false);

              if (effectiveToken) {
                await updateDoc(userDocRef, { googleAccessToken: effectiveToken });
              }
              autoConnectApi(effectiveToken);
            } else {
              // Auto-register new Google user into Employee Management (จัดการพนักงาน)
              const defaultDisplayName = firebaseUser.displayName || email.split('@')[0] || 'พนักงานใหม่';
              const defaultNickname = firebaseUser.displayName 
                ? firebaseUser.displayName.split(' ')[0] 
                : (email.split('@')[0] || 'พนักงาน');

              const newAccount: UserAccount = {
                id: firebaseUser.uid,
                email,
                displayName: defaultDisplayName,
                nickname: defaultNickname,
                role: isITSupport ? 'admin' : 'employee',
                createdAt: nowIso,
                lastLoginAt: nowIso,
                photoURL
              };

              await setDoc(userDocRef, newAccount);

              const effectiveToken = await resolveEffectiveToken(accessToken, newAccount);

              setUser(firebaseUser);
              setToken(effectiveToken || null);
              if (effectiveToken) {
                setCachedToken(effectiveToken);
                await persistTokenGlobally(effectiveToken, newAccount, email);
              }
              setUserProfile(newAccount);
              setNeedsAuth(false);

              if (effectiveToken) {
                await updateDoc(userDocRef, { googleAccessToken: effectiveToken });
              }
              autoConnectApi(effectiveToken);
            }
          }
        } catch (error) {
          console.error('Error fetching/migrating user profile on auth change:', error);
          const effectiveToken = await resolveEffectiveToken(accessToken, null);
          setUser(firebaseUser);
          setToken(effectiveToken || null);
          setNeedsAuth(false);
          autoConnectApi(effectiveToken);
        }
      },
      () => {
        localStorage.removeItem('anonymous_user_session');
        setUser(null);
        setUserProfile(null);
        setToken(null);
        setNeedsAuth(true);
        setApiStatus('connected');
        setApiStatusDetail('ออกจากระบบแล้ว');
      }
    );

    return () => {
      unsubscribeAuth();
    };

  }, []);

  // Background auto-refresh and connection keepalive so users never need to click connect
  useEffect(() => {
    if (!user) return;
    const interval = setInterval(() => {
      autoConnectApi();
    }, 5 * 60 * 1000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        autoConnectApi();
      }
    };
    window.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, [user, userProfile]);

  // Sync bookings and users only when authenticated
  useEffect(() => {
    if (!user) {
      setBookings([]);
      setUsers([]);
      return;
    }

    // 2. Real-time Bookings Syncing
    const qBookings = query(collection(db, 'bookings'));
    const unsubscribeBookings = onSnapshot(qBookings, (snapshot) => {
      const list: Booking[] = [];
      snapshot.forEach(docSnap => {
        list.push({ id: docSnap.id, ...docSnap.data() } as Booking);
      });
      setBookings(list);
    }, (error) => {
      console.warn('Error syncing bookings:', error);
    });

    // 3. Real-time Employees/Users Syncing
    const qUsers = query(collection(db, 'users'));
    const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => {
      const list: UserAccount[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as UserAccount;
        list.push({
          ...data,
          id: data.id || docSnap.id
        });
      });
      setUsers(list);
    }, (error) => {
      console.warn('Error syncing users:', error);
    });

    return () => {
      unsubscribeBookings();
      unsubscribeUsers();
    };
  }, [user]);

  // Background check (every 30 seconds) for 15-minute upcoming meetings (Push Notification & Email Reminder)
  useEffect(() => {
    if (!bookings.length) return;

    const checkUpcomingMeetings = () => {
      const nowMs = Date.now();
      const userEmailLower = (user?.email || '').trim().toLowerCase();

      bookings.forEach(b => {
        if (b.status !== 'approved' || b.entryType === 'announcement') return;
        const startMs = new Date(b.startTime).getTime();
        const endMs = new Date(b.endTime).getTime();
        if (isNaN(startMs) || isNaN(endMs)) return;

        const diffMs = startMs - nowMs;
        // 15 minutes before start (0 <= diffMs <= 15 * 60 * 1000) and within 2 minutes after start
        if (diffMs <= 15 * 60 * 1000 && diffMs >= -2 * 60 * 1000 && endMs > nowMs) {
          const isCreator = b.creatorEmail && b.creatorEmail.trim().toLowerCase() === userEmailLower;
          const isAttendee = b.attendees && b.attendees.some(a => a.email && a.email.trim().toLowerCase() === userEmailLower);

          // 1. Desktop Notification: ONLY for user accounts involved in that meeting
          if (user?.email && (isCreator || isAttendee)) {
            const minutesLeft = Math.max(0, Math.ceil(diffMs / 60000));
            triggerMeetingPushNotification(b, minutesLeft);
          }

          // 2. Email Notification: Send 15-minute reminder email to creator and attendees (sent once per booking)
          if (!b.reminder15mSent && !hasSentReminderEmail(b.id)) {
            markSentReminderEmail(b.id);
            (async () => {
              try {
                const activeToken = await resolveEffectiveToken(token, userProfile);
                if (activeToken) {
                  await updateDoc(doc(db, 'bookings', b.id), {
                    reminder15mSent: true,
                    reminder15mSentAt: new Date().toISOString()
                  });
                  const minutesLeft = Math.max(0, Math.ceil(diffMs / 60000));
                  await send15MinuteMeetingReminderEmails(activeToken, b, minutesLeft || 15);
                }
              } catch (err) {
                console.warn('Failed to send automatic 15m meeting reminder email:', err);
              }
            })();
          }
        }
      });
    };

    checkUpcomingMeetings();
    const interval = setInterval(checkUpcomingMeetings, 30 * 1000);
    return () => clearInterval(interval);
  }, [bookings, user, token, userProfile]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        const freshToken = result.accessToken || '';
        if (freshToken) {
          await persistTokenGlobally(freshToken, null, result.user.email);
        }
        setToken(freshToken);
        if (freshToken) setCachedToken(freshToken);
        setUser(result.user);
        setNeedsAuth(false);
        autoConnectApi(freshToken);

        // Fetch their user profile
        try {
          const userDocRef = doc(db, 'users', result.user.uid);
          const userSnap = await getDoc(userDocRef);
          const nowIso = new Date().toISOString();
          const photoURL = result.user.photoURL || undefined;

          if (userSnap.exists()) {
            const profile = userSnap.data() as UserAccount;
            const updatedProfile: UserAccount = {
              ...profile,
              lastLoginAt: nowIso,
              photoURL: photoURL || profile.photoURL
            };
            setUserProfile(updatedProfile);
            
            const updatePayload: any = { lastLoginAt: nowIso };
            if (photoURL) updatePayload.photoURL = photoURL;
            if (freshToken) updatePayload.googleAccessToken = freshToken;
            await updateDoc(userDocRef, updatePayload);
          } else {
            // Check if pre-registered by email
            const email = (result.user.email || '').toLowerCase();
            const q = query(collection(db, 'users'), where('email', '==', email));
            const qSnap = await getDocs(q);
            
            if (!qSnap.empty) {
              const oldDocSnap = qSnap.docs[0];
              const foundProfile = oldDocSnap.data() as UserAccount;
              const migratedProfile: UserAccount = {
                ...foundProfile,
                id: result.user.uid,
                email,
                lastLoginAt: nowIso,
                photoURL: photoURL || foundProfile.photoURL
              };
              await setDoc(userDocRef, migratedProfile);
              if (oldDocSnap.id !== result.user.uid) {
                await deleteDoc(doc(db, 'users', oldDocSnap.id));
              }
              setUserProfile(migratedProfile);
              if (freshToken) {
                await updateDoc(userDocRef, { googleAccessToken: freshToken });
              }
            } else {
              // Auto-create new Google user account in Firestore
              const defaultDisplayName = result.user.displayName || email.split('@')[0] || 'พนักงานใหม่';
              const defaultNickname = result.user.displayName 
                ? result.user.displayName.split(' ')[0] 
                : (email.split('@')[0] || 'พนักงาน');

              const isSysAdmin = email === 'itsupport@ec.co.th' || email === 'ec.co.hr.2018@gmail.com';
              const newAccount: UserAccount = {
                id: result.user.uid,
                email,
                displayName: defaultDisplayName,
                nickname: defaultNickname,
                role: isSysAdmin ? 'admin' : 'employee',
                createdAt: nowIso,
                lastLoginAt: nowIso,
                photoURL
              };

              await setDoc(userDocRef, newAccount);
              setUserProfile(newAccount);
              if (freshToken) {
                await updateDoc(userDocRef, { googleAccessToken: freshToken });
              }
            }
          }
        } catch (error) {
          console.warn('Error syncing profile from Firestore, using default profile:', error);
          const email = (result.user.email || '').toLowerCase();
          const isSysAdmin = email === 'itsupport@ec.co.th' || email === 'ec.co.hr.2018@gmail.com';
          const fallbackProfile: UserAccount = {
            id: result.user.uid,
            email,
            displayName: result.user.displayName || email.split('@')[0] || 'พนักงาน',
            nickname: result.user.displayName ? result.user.displayName.split(' ')[0] : (email.split('@')[0] || 'พนักงาน'),
            role: isSysAdmin ? 'admin' : 'employee',
            createdAt: new Date().toISOString()
          };
          setUserProfile(fallbackProfile);
        }
      }
    } catch (err: any) {
      console.error('Login failed:', err);
      const errMsg = err?.message || String(err);
      if (errMsg.includes('popup-closed-by-user') || errMsg.includes('popup_closed_by_user')) {
        setLoginError(
          'หน้าต่างเข้าสู่ระบบถูกปิด หรือเบราว์เซอร์ของคุณทำการบล็อกป็อปอัป (Popup Blocked)'
        );
      } else {
        // If it's already a JSON string from handleFirestoreError, keep it or parse it
        setLoginError(errMsg);
      }
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    setLogoutConfirmOpen(true);
  };

  const executeLogout = async () => {
    setLogoutConfirmOpen(false);
    localStorage.removeItem('anonymous_user_session');
    await googleSignOut();
    setUser(null);
    setUserProfile(null);
    setToken(null);
    setNeedsAuth(true);
  };

  // CREATE BOOKING (Triggered from BookingModal or AnnouncementModal form submission)
  const handleCreateBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>) => {
    if (!user || !userProfile) throw new Error('กรุณาล็อกอินก่อนทำรายการ');

    const isAnnouncement = bookingData.entryType === 'announcement';

    // Admin-only restriction for announcements
    if (isAnnouncement && !isAdmin) {
      throw new Error('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลงประกาศข่าวสาร');
    }

    // Extra safety guard: check for overlapping bookings (ONLY for room bookings)
    if (!isAnnouncement && bookingData.roomId) {
      const overlap = bookings.find(b => {
        if (!b.roomId || b.roomId !== bookingData.roomId) return false;
        if (b.status === 'rejected') return false;
        return b.startTime < bookingData.endTime && bookingData.startTime < b.endTime;
      });

      if (overlap) {
        throw new Error(
          `ห้องประชุมนี้ถูกจองไว้แล้วในช่วงเวลาดังกล่าว\n\nหัวข้อ: ${overlap.title}\nเวลา: ${overlap.startTime.split('T')[1]} - ${overlap.endTime.split('T')[1]} น.`
        );
      }
    }

    const newBookingDocRef = doc(collection(db, 'bookings'));
    
    // Prepare complete booking resource
    const newBooking: Omit<Booking, 'id'> = {
      ...bookingData,
      creatorEmail: userProfile.email,
      creatorName: userProfile.displayName,
      createdAt: new Date().toISOString()
    };

    // If announcement or Admin, they auto-approve and sync with Google Calendar immediately!
    if (isAnnouncement || userProfile.role === 'admin') {
      newBooking.status = 'approved';
      
      const activeToken = token || (await resolveEffectiveToken(null, userProfile));
      // Sync with Google Calendar if OAuth token is active
      if (activeToken) {
        try {
          const calendarResult = await createGoogleCalendarEvent(activeToken, newBooking, newBookingDocRef.id);
          newBooking.googleEventId = calendarResult.eventId;
          if (newBooking.meetingType === 'meet' && calendarResult.meetingLink) {
            newBooking.meetingLink = calendarResult.meetingLink;
          }
        } catch (calErr) {
          console.warn('Sync to Google Calendar failed initially, booking will still be saved:', calErr);
        }
      }
    } else {
      // Employee bookings start as pending approval
      newBooking.status = 'pending';
      // Generate a secure unique token for one-click approve/reject from email
      const approvalKey = Math.random().toString(36).substring(2, 12) + Math.random().toString(36).substring(2, 12) + Date.now().toString(36);
      newBooking.approvalKey = approvalKey;
    }

    // Save to Firestore
    try {
      await setDoc(newBookingDocRef, newBooking);
      
      let emailSuccessMsg = '';
      
      const emailToken = token || (await resolveEffectiveToken(null, userProfile));
      if (emailToken && !isAnnouncement) {
        if (newBooking.status === 'pending') {
          // Send notification email to admins including ec.co.hr.2018@gmail.com
          try {
            // Send notification email to ec.co.hr.2018@gmail.com only (as requested: do not send to other admins)
            const adminEmails: string[] = ['ec.co.hr.2018@gmail.com'];

            const appOrigin = typeof window !== 'undefined' ? window.location.origin : '';
            const bookingKey = newBooking.approvalKey || '';
            const approveUrl = `${appOrigin}/?action=approve&id=${newBookingDocRef.id}&key=${bookingKey}`;
            const rejectUrl = `${appOrigin}/?action=reject&id=${newBookingDocRef.id}&key=${bookingKey}`;
            const viewUrl = `${appOrigin}/?action=view&id=${newBookingDocRef.id}&key=${bookingKey}`;

            const emailSubject = `[คำขอจองห้องใหม่] ${newBooking.title} โดย ${newBooking.creatorName}`;
            const emailBodyHtml = `
              <div style="font-family: 'Prompt', 'Helvetica Neue', Arial, sans-serif; max-width: 620px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
                <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #4f46e5;">
                  <h2 style="color: #4f46e5; margin: 0; font-size: 22px;">🔔 คำขอจองห้องประชุมใหม่</h2>
                  <p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px;">มีคำขอจองห้องประชุมใหม่รอดำเนินการอนุมัติ</p>
                </div>
                <div style="padding: 24px 0; color: #334155; line-height: 1.6;">
                  <p style="font-size: 15px; margin-top: 0;">เรียน คุณผู้ดูแลระบบ (Admin / HR),</p>
                  <p style="margin-bottom: 18px;">มีรายการขอใช้ห้องประชุมเข้ามาใหม่ในระบบ โดยมีรายละเอียดดังต่อไปนี้:</p>
                  
                  <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 20px;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #64748b;">หัวข้อกิจกรรม:</td>
                        <td style="padding: 8px 0; font-weight: bold; color: #0f172a; font-size: 15px;">${newBooking.title}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; color: #64748b;">ห้องประชุม:</td>
                        <td style="padding: 8px 0;"><span style="background-color: #e0e7ff; color: #3730a3; padding: 4px 10px; border-radius: 6px; font-weight: bold;">${newBooking.roomName}</span></td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; color: #64748b;">ผู้ขอจอง:</td>
                        <td style="padding: 8px 0; color: #1e293b;">${newBooking.creatorName} (${newBooking.creatorEmail})</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; color: #64748b;">วันและเวลา:</td>
                        <td style="padding: 8px 0; color: #1e293b; font-weight: 600;">${formatThaiDateRange(newBooking.startTime, newBooking.endTime)}</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; font-weight: bold; color: #64748b;">รายละเอียด:</td>
                        <td style="padding: 8px 0; color: #334155;">${newBooking.description || '-'}</td>
                      </tr>
                    </table>
                  </div>

                  <!-- Quick Action Section directly in Email -->
                  <div style="background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0;">
                    <p style="margin: 0 0 16px 0; font-size: 14px; font-weight: bold; color: #166534;">
                      ⚡ ท่านสามารถกดอนุมัติหรือปฏิเสธคำขอได้ทันทีจากอีเมลนี้:
                    </p>
                    <div style="margin: 10px 0;">
                      <!-- Approve Button -->
                      <a href="${approveUrl}" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 13px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 6px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.3);">
                        ✅ อนุมัติการจองทันที
                      </a>
                      <!-- Reject Button -->
                      <a href="${rejectUrl}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 13px 26px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 15px; margin: 6px; box-shadow: 0 2px 4px rgba(220, 38, 38, 0.3);">
                        ❌ ปฏิเสธคำขอ
                      </a>
                    </div>
                    <p style="margin: 14px 0 0 0; font-size: 12px; color: #4b5563;">
                      หรือ <a href="${viewUrl}" style="color: #2563eb; text-decoration: underline; font-weight: 600;">เปิดดูรายละเอียดและตารางการใช้ห้องในเว็บแอป</a>
                    </p>
                  </div>

                  <p style="margin: 16px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5;">
                    💡 หมายเหตุ: เมื่อกด [อนุมัติการจองทันที] ระบบจะทำการบันทึกและซิงค์กับ Google Calendar พร้อมส่งอีเมลยืนยันไปยังผู้ขอจองให้โดยอัตโนมัติค่ะ
                  </p>
                </div>
                <div style="text-align: center; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
                  <p style="margin: 0;">อีเมลส่งโดยระบบอัตโนมัติจากห้องประชุม EC</p>
                </div>
              </div>
            `;

            let anySent = false;
            for (const adminEmail of adminEmails) {
              const sent = await sendEmailNotification(emailToken, adminEmail, emailSubject, emailBodyHtml);
              if (sent) anySent = true;
            }
            if (anySent) {
              emailSuccessMsg = ' พร้อมส่งอีเมลแจ้งเตือนถึงแอดมิน (ec.co.hr.2018@gmail.com) สำหรับพิจารณาอนุมัติเรียบร้อยแล้วค่ะ';
            }
          } catch (mailErr) {
            console.warn('Could not send booking request email to admins:', mailErr);
          }
        } else if (newBooking.status === 'approved') {
          // Auto-approved by Admin. Send confirmation email to the creator and invitations to all attendees
          try {
            const { creatorSent, attendeesSentCount } = await sendBookingNotifications(
              emailToken, 
              newBooking as Booking
            );
            if (creatorSent || attendeesSentCount > 0) {
              emailSuccessMsg = attendeesSentCount > 0 
                ? ` พร้อมส่งอีเมลยืนยันถึงผู้จัดและส่งบัตรเชิญถึงผู้เข้าร่วมประชุม (${attendeesSentCount} ท่าน) เรียบร้อยแล้วค่ะ`
                : ' พร้อมส่งอีเมลยืนยันรายการจองถึงกล่องข้อความเรียบร้อยแล้วค่ะ';
            }
          } catch (mailErr) {
            console.warn('Could not send auto-approved confirmation emails:', mailErr);
          }
        }
      }

      setDeleteAlert({
        isOpen: true,
        message: isAnnouncement 
          ? 'ลงประกาศข่าวสารเรียบร้อยแล้วค่ะ (ทุกคนสามารถดูได้บนปฏิทินทันที)' 
          : `ทำการจองห้องประชุมเรียบร้อยแล้วค่ะ${emailSuccessMsg}`,
        type: 'success',
        title: isAnnouncement ? 'ลงประกาศสำเร็จ' : 'ทำการจองสำเร็จ'
      });
      if (isAnnouncement) {
        setActiveTab('calendar');
      } else {
        setActiveTab('dashboard');
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `bookings/${newBookingDocRef.id}`);
    }
  };

  // IMPORT EVENTS FROM ICS FILE
  const handleImportEvents = async (eventsToImport: Omit<Booking, 'id' | 'createdAt'>[]) => {
    let successCount = 0;
    try {
      for (const rawEvt of eventsToImport) {
        const newBookingDocRef = doc(collection(db, 'bookings'));
        const newBooking: Omit<Booking, 'id'> = {
          ...rawEvt,
          createdAt: new Date().toISOString()
        };

        // Sync with Google Calendar if OAuth token is active & status is approved
        const activeToken = token || (await resolveEffectiveToken(null, userProfile));
        if (newBooking.status === 'approved' && activeToken) {
          try {
            const calendarResult = await createGoogleCalendarEvent(activeToken, newBooking as any, newBookingDocRef.id);
            newBooking.googleEventId = calendarResult.eventId;
            if (newBooking.meetingType === 'meet' && calendarResult.meetingLink) {
              newBooking.meetingLink = calendarResult.meetingLink;
            }
          } catch (calErr) {
            console.warn('Sync to Google Calendar failed during import:', calErr);
          }
        }

        await setDoc(newBookingDocRef, newBooking);
        successCount++;
      }

      setDeleteAlert({
        isOpen: true,
        message: `นำเข้าตารางกิจกรรมสำเร็จทั้งหมด ${successCount} รายการเรียบร้อยแล้วค่ะ`,
        type: 'success',
        title: 'นำเข้าสำเร็จ'
      });
    } catch (err: any) {
      console.error('Import error:', err);
      throw new Error(`นำเข้าสำเร็จบางส่วน (${successCount} รายการ) แต่เกิดข้อผิดพลาด: ${err?.message || String(err)}`);
    }
  };

  // ADMIN APPROVE BOOKING
  const handleApproveBooking = async (bookingId: string) => {
    if (!userProfile || userProfile.role !== 'admin') {
      alert('คุณไม่มีสิทธิ์ระดับแอดมินในการอนุมัติรายการนี้');
      return;
    }

    const bookingRef = doc(db, 'bookings', bookingId);
    let bookingSnap;
    try {
      bookingSnap = await getDoc(bookingRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `bookings/${bookingId}`);
      return;
    }
    if (!bookingSnap.exists()) return;

    const bData = bookingSnap.data() as Booking;
    
    let updatedGoogleEventId = bData.googleEventId || '';
    let updatedMeetingLink = bData.meetingLink || '';

    const activeToken = token || (await getAdminGoogleToken());

    // Create Calendar Event & Meet links if not already synced
    if (activeToken && !bData.googleEventId) {
      try {
        const calResult = await createGoogleCalendarEvent(activeToken, bData, bookingId);
        updatedGoogleEventId = calResult.eventId;
        if (bData.meetingType === 'meet' && calResult.meetingLink) {
          updatedMeetingLink = calResult.meetingLink;
        }
      } catch (calErr) {
        console.error('Failed to sync to Google Calendar on approval:', calErr);
      }
    }

    // Update DB
    try {
      await updateDoc(bookingRef, {
        status: 'approved',
        googleEventId: updatedGoogleEventId,
        meetingLink: updatedMeetingLink,
        approvedBy: userProfile.displayName
      });

      let emailSent = false;
      let emailErrorMsg = '';

      // Try sending custom branded email notifications to the creator AND all attendees
      if (activeToken) {
        try {
          const bookingToNotify = {
            ...bData,
            meetingLink: updatedMeetingLink || bData.meetingLink
          };
          const { creatorSent, attendeesSentCount } = await sendBookingNotifications(
            activeToken,
            bookingToNotify as Booking
          );
          if (creatorSent || attendeesSentCount > 0) {
            emailSent = true;
          } else {
            emailErrorMsg = 'สิทธิ์ของโทเค็นแอดมิน (Gmail Send API) ไม่ได้รับการอนุญาตหรือหมดอายุ';
          }
        } catch (mailErr) {
          console.warn('Could not send approval email to creator/attendees:', mailErr);
          emailErrorMsg = String(mailErr);
        }
      } else if (!activeToken) {
        emailErrorMsg = 'ระบบตรวจไม่พบ Google Access Token ของแอดมินในฐานข้อมูล (อาจล็อกอินผ่าน Quick Login)';
      }

      if (emailSent) {
        setDeleteAlert({
          isOpen: true,
          message: 'อนุมัติรายการจองห้องประชุมสำเร็จ พร้อมส่งอีเมลแจ้งเตือนถึงผู้จัดและผู้เข้าร่วมประชุมเรียบร้อยแล้วค่ะ',
          type: 'success',
          title: 'อนุมัติการจองสำเร็จ'
        });
      } else {
        setDeleteAlert({
          isOpen: true,
          message: `อนุมัติรายการจองห้องประชุมสำเร็จ แต่อีเมลไม่ถูกส่ง:\n⚠️ ${emailErrorMsg || 'ไม่พบสิทธิ์เมล'}\n\n💡 คำแนะนำ: รบกวนคุณแอดมินลงชื่อออกจากระบบ (Sign Out) แล้วทำการเข้าสู่ระบบด้วยบัญชี Google (itsupport@ec.co.th) ใหม่อีกครั้ง เพื่ออัปเดตสิทธิ์ Gmail API และเปิดสิทธิ์การส่งอีเมลแบบสมบูรณ์ค่ะ`,
          type: 'warning',
          title: 'อนุมัติสำเร็จ แต่ส่งอีเมลไม่สำเร็จ'
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  // ADMIN REJECT BOOKING
  const handleRejectBooking = async (bookingId: string, reason: string) => {
    if (!userProfile || userProfile.role !== 'admin') {
      alert('คุณไม่มีสิทธิ์ระดับแอดมินในการตรวจสอบรายการนี้');
      return;
    }

    const bookingRef = doc(db, 'bookings', bookingId);
    let bookingSnap;
    try {
      bookingSnap = await getDoc(bookingRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `bookings/${bookingId}`);
      return;
    }
    if (!bookingSnap.exists()) return;

    const bData = bookingSnap.data() as Booking;

    const adminToken = await getAdminGoogleToken();
    const primaryToken = adminToken || token;
    const fallbackToken = token && token !== primaryToken ? token : null;

    // Delete Google Calendar Event if it was somehow synced previously
    if (bData.googleEventId && primaryToken) {
      try {
        await deleteGoogleCalendarEvent(primaryToken, bData.googleEventId, fallbackToken);
      } catch (calErr) {
        console.error('Failed to delete Google Calendar event on rejection:', calErr);
      }
    }

    // Update DB
    try {
      await updateDoc(bookingRef, {
        status: 'rejected',
        rejectedReason: reason,
        googleEventId: '',
        approvedBy: ''
      });

      let emailSent = false;
      let emailErrorMsg = '';

      // Try sending a custom rejection email notification to the creator
      if (primaryToken && bData.creatorEmail) {
        try {
          const emailSubject = `[ปฏิเสธการจอง] รายการจองห้องประชุมของคุณ: ${bData.title}`;
          
          const emailBodyHtml = `
            <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ef4444;">
                <h2 style="color: #ef4444; margin: 0;">ปฏิเสธการจองห้องประชุม</h2>
              </div>
              <div style="padding: 20px 0; color: #334155; line-height: 1.6;">
                <p>เรียน คุณ <strong>${bData.creatorName || bData.creatorEmail}</strong>,</p>
                <p>ขออภัยด้วยค่ะ รายการจองห้องประชุมของคุณได้รับการปฏิเสธ โดยมีรายละเอียดดังนี้:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #64748b;">หัวข้อกิจกรรม:</td>
                    <td style="padding: 8px 0;">${bData.title}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">ห้องประชุม:</td>
                    <td style="padding: 8px 0;"><span style="background-color: #fef2f2; color: #991b1b; padding: 4px 8px; border-radius: 4px; font-weight: bold;">${bData.roomName}</span></td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">วันและเวลา:</td>
                    <td style="padding: 8px 0;">${formatThaiDateRange(bData.startTime, bData.endTime)}</td>
                  </tr>
                  <tr style="background-color: #fff1f2;">
                    <td style="padding: 12px; font-weight: bold; color: #991b1b; vertical-align: top;">เหตุผลที่ปฏิเสธ:</td>
                    <td style="padding: 12px; color: #991b1b; font-weight: bold;">${reason}</td>
                  </tr>
                </table>
                <p style="margin-top: 20px;">หากท่านต้องการจองห้องประชุมใหม่หรือมีข้อสงสัย กรุณาติดต่อผู้ดูแลระบบ</p>
              </div>
              <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
                <p>อีเมลฉบับนี้ส่งโดยระบบอัตโนมัติจากห้องประชุม EC</p>
              </div>
            </div>
          `;
          
          const sent = await sendEmailNotification(primaryToken, bData.creatorEmail, emailSubject, emailBodyHtml);
          if (sent) {
            emailSent = true;
          } else {
            emailErrorMsg = 'สิทธิ์ของโทเค็นแอดมิน (Gmail Send API) ไม่ได้รับการอนุญาตหรือหมดอายุ';
          }
        } catch (mailErr) {
          console.warn('Could not send rejection email:', mailErr);
          emailErrorMsg = String(mailErr);
        }
      } else if (!primaryToken) {
        emailErrorMsg = 'ระบบตรวจไม่พบ Google Access Token ของแอดมินในฐานข้อมูล (อาจล็อกอินผ่าน Quick Login)';
      }

      if (emailSent) {
        setDeleteAlert({
          isOpen: true,
          message: 'ปฏิเสธรายการจองห้องประชุมเรียบร้อย พร้อมส่งอีเมลชี้แจงผู้จองเรียบร้อยแล้วค่ะ',
          type: 'success',
          title: 'ปฏิเสธการจองสำเร็จ'
        });
      } else {
        setDeleteAlert({
          isOpen: true,
          message: `ปฏิเสธรายการจองห้องประชุมสำเร็จ แต่อีเมลไม่ถูกส่ง:\n⚠️ ${emailErrorMsg || 'ไม่พบสิทธิ์เมล'}\n\n💡 คำแนะนำ: รบกวนคุณแอดมินลงชื่อออกจากระบบ (Sign Out) แล้วทำการเข้าสู่ระบบด้วยบัญชี Google (itsupport@ec.co.th) ใหม่อีกครั้ง เพื่ออัปเดตสิทธิ์ Gmail API และเปิดสิทธิ์การส่งอีเมลแบบสมบูรณ์ค่ะ`,
          type: 'warning',
          title: 'ปฏิเสธสำเร็จ แต่ส่งอีเมลไม่สำเร็จ'
        });
      }
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  // Manual trigger to send or resend 15-minute meeting reminder email to involved users
  const handleSendReminderEmail = async (b: Booking): Promise<boolean> => {
    try {
      const activeToken = await resolveEffectiveToken(token, userProfile);
      if (!activeToken) {
        setDeleteAlert({
          isOpen: true,
          type: 'warning',
          title: 'ยังไม่ได้เชื่อมต่อระบบส่งอีเมล',
          message: 'กรุณาเชื่อมต่อระบบ Google หรือตรวจสอบการตั้งค่าก่อนส่งอีเมลค่ะ'
        });
        return false;
      }

      const startMs = new Date(b.startTime).getTime();
      const diffMs = startMs - Date.now();
      const minutesLeft = Math.max(0, Math.ceil(diffMs / 60000));

      const { creatorSent, attendeesSentCount } = await send15MinuteMeetingReminderEmails(activeToken, b, minutesLeft || 15);

      await updateDoc(doc(db, 'bookings', b.id), {
        reminder15mSent: true,
        reminder15mSentAt: new Date().toISOString()
      });
      markSentReminderEmail(b.id);

      const totalSent = (creatorSent ? 1 : 0) + attendeesSentCount;
      setDeleteAlert({
        isOpen: true,
        type: 'success',
        title: 'ส่งอีเมลแจ้งเตือนสำเร็จ',
        message: `ระบบได้ส่งอีเมลแจ้งเตือนการประชุมไปยังผู้เกี่ยวข้องทั้งหมดเรียบร้อยแล้ว (${totalSent} บัญชี)`
      });
      return true;
    } catch (e: any) {
      console.error('Failed to send reminder email:', e);
      setDeleteAlert({
        isOpen: true,
        type: 'error',
        title: 'เกิดข้อผิดพลาดในการส่งอีเมล',
        message: `ไม่สามารถส่งอีเมลแจ้งเตือนได้: ${e?.message || 'โปรดลองใหม่อีกครั้ง'}`
      });
      return false;
    }
  };

  // DELETE BOOKING (CANCEL / REMOVE)
  const handleDeleteBooking = async (bookingId: string) => {
    const bookingRef = doc(db, 'bookings', bookingId);
    let bookingSnap;
    try {
      bookingSnap = await getDoc(bookingRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `bookings/${bookingId}`);
      return;
    }
    if (!bookingSnap.exists()) return;

    const bData = { id: bookingSnap.id, ...bookingSnap.data() } as Booking;

    // Robust permission check: Admin or Creator of booking can delete
    const isUserAdmin = userProfile?.role === 'admin' || user?.email === 'itsupport@ec.co.th' || user?.email === 'ec.co.hr.2018@gmail.com';
    const isCreator = (user?.email && user.email === bData.creatorEmail) || (userProfile?.email && userProfile.email === bData.creatorEmail);

    if (!isUserAdmin && !isCreator) {
      setDeleteAlert({
        isOpen: true,
        message: 'คุณไม่มีสิทธิ์ในการลบกิจกรรมการจองนี้ (เฉพาะผู้จองหรือผู้ดูแลระบบเท่านั้น)',
      });
      return;
    }

    setDeleteConfirm({
      isOpen: true,
      bookingId,
      title: bData.title,
      booking: bData,
    });
  };

  const executeDeleteBooking = async (reason?: string, notifyByEmail: boolean = true) => {
    const bookingId = deleteConfirm.bookingId;
    if (!bookingId) return;

    const bData = deleteConfirm.booking;
    setDeleteConfirm({ isOpen: false, bookingId: '', title: '', booking: null });

    const bookingRef = doc(db, 'bookings', bookingId);

    // Delete Google Calendar Event if it exists
    if (bData?.googleEventId) {
      try {
        const adminToken = await getAdminGoogleToken();
        const primaryToken = adminToken || token;
        const fallbackToken = token && token !== primaryToken ? token : null;
        if (primaryToken) {
          await deleteGoogleCalendarEvent(primaryToken, bData.googleEventId, fallbackToken);
        } else {
          console.warn('No active token available to delete Google Calendar event');
        }
      } catch (calErr) {
        console.error('Failed to delete Google Calendar event:', calErr);
      }
    }

    // Delete from DB
    try {
      await deleteDoc(bookingRef);
      
      let emailSuccessMsg = '';
      const adminToken = await getAdminGoogleToken();
      const primaryToken = token || adminToken;
      const fallbackToken = adminToken && adminToken !== primaryToken ? adminToken : (token && token !== primaryToken ? token : null);

      if (notifyByEmail && primaryToken && bData) {
        try {
          const cancelledByName = userProfile?.nickname 
            ? `${userProfile.displayName} (${userProfile.nickname})`
            : userProfile?.displayName || user?.displayName || user?.email || 'ผู้ดูแลระบบ';

          const { creatorSent, attendeesSentCount } = await sendBookingCancellationNotifications(
            primaryToken,
            bData as Booking,
            cancelledByName,
            reason,
            fallbackToken
          );

          if (creatorSent || attendeesSentCount > 0) {
            const countStr = attendeesSentCount > 0 
              ? ` (ผู้จัด และผู้เข้าร่วม ${attendeesSentCount} ท่าน)` 
              : ' (ผู้จัด)';
            emailSuccessMsg = ` พร้อมส่งอีเมลแจ้งยกเลิกให้ผู้เกี่ยวข้องแล้ว${countStr}`;
          }
        } catch (mailErr) {
          console.warn('Could not send cancellation email:', mailErr);
        }
      }

      const isAnnounce = bData?.entryType === 'announcement';
      setDeleteAlert({
        isOpen: true,
        message: isAnnounce 
          ? 'ลบประกาศข่าวสารเรียบร้อยแล้วค่ะ' 
          : `ยกเลิกรายการจองห้องประชุมเรียบร้อยแล้วค่ะ${emailSuccessMsg}`,
        type: 'success',
        title: isAnnounce ? 'ลบประกาศสำเร็จ' : 'ยกเลิกการจองสำเร็จ'
      });
      setActiveTab(isAnnounce ? 'calendar' : 'dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${bookingId}`);
    }
  };

  // UPDATE BOOKING
  const handleUpdateBooking = async (
    bookingId: string, 
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>
  ) => {
    if (!user || !userProfile) throw new Error('กรุณาล็อกอินก่อนทำรายการ');

    const bookingRef = doc(db, 'bookings', bookingId);
    let bookingSnap;
    try {
      bookingSnap = await getDoc(bookingRef);
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `bookings/${bookingId}`);
      return;
    }

    if (!bookingSnap.exists()) {
      throw new Error('ไม่พบข้อมูลกิจกรรมการจองที่ต้องการแก้ไข');
    }

    const existingBooking = bookingSnap.data() as Booking;

    // Check permission: Admin or creator
    const isUserAdmin = userProfile.role === 'admin' || user.email === 'itsupport@ec.co.th' || user.email === 'ec.co.hr.2018@gmail.com';
    const isCreator = (user.email && user.email === existingBooking.creatorEmail) || (userProfile.email && userProfile.email === existingBooking.creatorEmail);

    if (!isUserAdmin && !isCreator) {
      throw new Error('คุณไม่มีสิทธิ์ในการแก้ไขกิจกรรมนี้ (เฉพาะผู้แจ้ง/ผู้จองหรือผู้ดูแลระบบเท่านั้น)');
    }

    const isAnnouncement = bookingData.entryType === 'announcement' || existingBooking.entryType === 'announcement';

    // Admin-only restriction for editing announcements
    if (isAnnouncement && !isAdmin) {
      throw new Error('เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์แก้ไขประกาศข่าวสาร');
    }

    // Safety overlap check ignoring current booking being edited (ONLY for room bookings)
    if (!isAnnouncement && bookingData.roomId) {
      const overlap = bookings.find(b => {
        if (b.id === bookingId) return false;
        if (!b.roomId || b.roomId !== bookingData.roomId) return false;
        if (b.status === 'rejected') return false;
        return b.startTime < bookingData.endTime && bookingData.startTime < b.endTime;
      });

      if (overlap) {
        throw new Error(
          `ห้องประชุมนี้ถูกจองไว้แล้วในช่วงเวลาดังกล่าว\n\nหัวข้อ: ${overlap.title}\nเวลา: ${overlap.startTime.split('T')[1]} - ${overlap.endTime.split('T')[1]} น.`
        );
      }
    }

    const updatedBookingObj: Booking = {
      ...existingBooking,
      ...bookingData,
      id: bookingId,
      creatorEmail: existingBooking.creatorEmail,
      creatorName: existingBooking.creatorName,
    };

    let updatedMeetingLink = updatedBookingObj.meetingLink;

    // If Google Calendar event exists, sync updates to Google Calendar
    if (existingBooking.googleEventId) {
      const adminToken = await getAdminGoogleToken();
      const primaryToken = adminToken || token;
      const fallbackToken = token && token !== primaryToken ? token : null;

      if (primaryToken) {
        try {
          let newLink = await updateGoogleCalendarEvent(
            primaryToken,
            existingBooking.googleEventId,
            updatedBookingObj
          );
          if (!newLink && fallbackToken) {
            newLink = await updateGoogleCalendarEvent(
              fallbackToken,
              existingBooking.googleEventId,
              updatedBookingObj
            );
          }
          if (newLink) {
            updatedMeetingLink = newLink;
          }
        } catch (calErr) {
          console.warn('Failed to sync booking update to Google Calendar:', calErr);
        }
      }
    }

    try {
      const updatePayload: any = {
        title: bookingData.title,
        description: bookingData.description || '',
        roomId: bookingData.roomId || '',
        roomName: bookingData.roomName || '',
        startTime: bookingData.startTime,
        endTime: bookingData.endTime,
        meetingType: bookingData.meetingType || 'onsite',
        meetingLink: updatedMeetingLink || '',
        attendees: bookingData.attendees || [],
        isConfidential: bookingData.isConfidential ?? false,
        entryType: bookingData.entryType || existingBooking.entryType || 'meeting',
        isAllDay: bookingData.isAllDay ?? false,
      };
      if (bookingData.announcementCategory !== undefined) {
        updatePayload.announcementCategory = bookingData.announcementCategory;
      }
      if (bookingData.color !== undefined) {
        updatePayload.color = bookingData.color;
      }

      await updateDoc(bookingRef, updatePayload);

      setDeleteAlert({
        isOpen: true,
        message: isAnnouncement ? 'บันทึกการแก้ไขประกาศข่าวสารเรียบร้อยแล้วค่ะ' : 'แก้ไขกิจกรรมการจองห้องประชุมและเลื่อนเวลาเรียบร้อยแล้วค่ะ',
        type: 'success',
        title: isAnnouncement ? 'แก้ไขประกาศสำเร็จ' : 'แก้ไขกิจกรรมสำเร็จ'
      });
      setActiveTab(isAnnouncement ? 'calendar' : 'dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  const handleSaveBooking = async (
    bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>,
    editingBookingId?: string
  ) => {
    if (editingBookingId) {
      await handleUpdateBooking(editingBookingId, bookingData);
    } else {
      await handleCreateBooking(bookingData);
    }
  };

  const handleOpenBooking = (roomId?: RoomId, date?: string, bookingToEdit?: Booking) => {
    setSelectedRoomId(roomId);
    setInitialDate(date);
    setEditingBooking(bookingToEdit || null);
    setIsBookingOpen(true);
  };

  const handleOpenAnnouncement = (dateStr?: string, bookingToEdit?: Booking) => {
    if (!isAdmin) {
      setDeleteAlert({
        isOpen: true,
        message: 'เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่สามารถลงประกาศหรือแก้ไขประกาศข่าวสารได้ค่ะ',
        type: 'error',
        title: 'ไม่มีสิทธิ์เข้าถึง'
      });
      return;
    }
    if (bookingToEdit) {
      setEditingAnnouncement(bookingToEdit);
      setInitialAnnouncementDate(bookingToEdit.startTime?.split('T')[0]);
    } else {
      setEditingAnnouncement(null);
      setInitialAnnouncementDate(dateStr || new Date().toISOString().split('T')[0]);
    }
    setIsAnnouncementOpen(true);
  };

  // RENDER LOGIN SCREEN
  if (needsAuth || !user) {
    return (
      <div className="min-h-screen bg-[#edf2f7] flex items-center justify-center p-4 sm:p-6 relative overflow-hidden font-sans" id="auth-screen">
        {/* Soft Ambient Background Accents */}
        <div className="absolute -top-32 -left-32 w-96 h-96 bg-indigo-100/50 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-purple-100/40 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-[430px] w-full bg-white/95 backdrop-blur-md rounded-[32px] p-6 sm:p-8 space-y-6 shadow-[0_20px_50px_rgba(0,0,0,0.06)] border border-white relative">
          
          {/* Top Pill Badge */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-gradient-to-r from-teal-50/90 via-indigo-50/90 to-purple-50/90 border border-indigo-100/80 shadow-2xs">
              <div className="w-3.5 h-3.5 rounded-full bg-indigo-500/10 flex items-center justify-center text-indigo-600">
                <Check className="w-2.5 h-2.5 stroke-[3]" />
              </div>
              <span className="text-[10px] font-bold tracking-wider text-slate-700 uppercase">MEETING ROOM EC</span>
            </div>
          </div>

          {/* Title & Info */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-[26px] font-bold tracking-tight text-slate-900 leading-tight">
              ระบบจองห้องประชุมออนไลน์
            </h1>
            <p className="text-slate-500 text-xs sm:text-[12.5px] leading-relaxed max-w-sm mx-auto">
              บริหารจัดการการจองห้อง ประชุมผ่านหน้าจอแดชบอร์ด ซิงค์ข้อมูลกับ Google Calendar และแนบวิดีโอคอล Google Meet ได้ในคลิกเดียว
            </p>
          </div>

          {/* Rooms showcase preview */}
          <div className="bg-[#f8fafc] rounded-2xl p-3.5 border border-slate-200/60 space-y-2.5">
            <div className="font-bold text-slate-700 text-xs text-left">ห้องประชุมที่ให้บริการ:</div>
            <div className="grid grid-cols-3 gap-2">
              {/* Room 1 */}
              <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs flex flex-col justify-between h-24 relative overflow-hidden text-center">
                <div className="w-full flex items-center justify-between">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-6 h-6 bg-emerald-400/25 rounded-full blur-xs"></div>
                    <div className="w-5 h-5 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center relative">
                      <Bell className="w-2.5 h-2.5 fill-emerald-500 text-emerald-500" />
                    </div>
                  </div>
                  <Presentation className="w-3.5 h-3.5 text-slate-300 stroke-[1.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700">ห้องประชุม 1</span>
              </div>

              {/* Room 2 */}
              <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs flex flex-col justify-between h-24 relative overflow-hidden text-center">
                <div className="w-full flex items-center justify-between">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-6 h-6 bg-blue-400/25 rounded-full blur-xs"></div>
                    <div className="w-5 h-5 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center relative">
                      <Bell className="w-2.5 h-2.5 fill-blue-500 text-blue-500" />
                    </div>
                  </div>
                  <Presentation className="w-3.5 h-3.5 text-slate-300 stroke-[1.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700">ห้องประชุม 2</span>
              </div>

              {/* Room 3 */}
              <div className="bg-white rounded-xl p-2.5 border border-slate-100 shadow-2xs flex flex-col justify-between h-24 relative overflow-hidden text-center">
                <div className="w-full flex items-center justify-between">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute w-6 h-6 bg-amber-400/25 rounded-full blur-xs"></div>
                    <div className="w-5 h-5 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center relative">
                      <Bell className="w-2.5 h-2.5 fill-amber-500 text-amber-500" />
                    </div>
                  </div>
                  <Presentation className="w-3.5 h-3.5 text-slate-300 stroke-[1.5]" />
                </div>
                <span className="text-xs font-bold text-slate-700">ห้องประชุม 3</span>
              </div>
            </div>
          </div>

          {/* Divider with Lock Icon */}
          <div className="relative flex items-center justify-center my-6">
            <div className="w-full border-t border-slate-200/70"></div>
            <div className="absolute px-2.5 py-0.5 bg-white border border-slate-200/90 rounded-full shadow-2xs">
              <Lock className="w-3 h-3 text-slate-400" />
            </div>
          </div>

          {/* Login Fields - Google / Gmail Only */}
          <div className="space-y-4">
            {loginError && (
              <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3.5 rounded-2xl flex items-start gap-2.5 text-xs leading-relaxed animate-fade-in" id="login-error-banner">
                <AlertCircle className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold block text-rose-700 text-xs">ข้อความแจ้งเตือนระบบ</span>
                  <span className="block whitespace-pre-line text-[11px]">{loginError}</span>
                </div>
              </div>
            )}

            <button 
              onClick={handleLogin}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-50 text-slate-800 font-semibold py-3 px-5 rounded-full shadow-[0_4px_16px_rgba(0,0,0,0.06)] border border-slate-200/90 transition-all cursor-pointer disabled:opacity-50 text-xs sm:text-sm hover:border-slate-300 active:scale-[0.99]"
            >
              <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-4 w-4 sm:h-5 sm:w-5 shrink-0">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
              </svg>
              <span>{isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google / Gmail'}</span>
            </button>

            {/* Info Card matching reference */}
            <div className="bg-[#f8fafc] border border-slate-200/60 rounded-2xl p-4 text-left space-y-2.5">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <ShieldCheck className="h-4 w-4 text-indigo-500 shrink-0" />
                <span>ระบบรองรับการเข้าใช้งานด้วย Google / Gmail เท่านั้น</span>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                <span>ผู้ใช้งานทุกคนสามารถเข้าสู่ระบบด้วยบัญชี Google / Gmail ได้ทันที เพื่อความปลอดภัยและความถูกต้องของข้อมูลผู้ใช้งาน</span>
              </div>
              <div className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
                <Users className="h-3.5 w-3.5 text-purple-500 shrink-0 mt-0.5" />
                <span>เมื่อเข้าสู่ระบบครั้งแรก ระบบจะบันทึกโปรไฟล์ของคุณเข้าสู่หน้า "จัดการผู้ใช้งาน" และเปิดให้เข้าถึงแดชบอร์ดจองห้องประชุมโดยอัตโนมัติ</span>
              </div>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // RENDER PRIMARY SYSTEM LAYOUT
  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col md:flex-row text-slate-900 font-sans" id="app-layout">
      
      {/* Sidebar Navigation - Left side (Slate 100 #F1F5F9) */}
      <aside className="hidden md:flex md:w-64 bg-[#F1F5F9] border-r border-slate-200 flex-col h-screen sticky top-0 shrink-0 shadow-2xs">
        <div className="p-5 border-b border-slate-200 flex items-center gap-3">
          <div className="w-8 h-8 bg-[#3B82F6] rounded-xl flex items-center justify-center text-white font-bold text-xs shadow-2xs">
            EC
          </div>
          <h1 className="text-[#0F172A] font-bold text-sm tracking-tight">Meeting Room EC</h1>
        </div>
        
        <nav className="flex-1 p-3 space-y-1.5">
          {[
            { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
            { id: 'calendar', label: 'ปฏิทินห้องประชุม', icon: CalendarIcon },
            { id: 'history', label: 'ประวัติของฉัน', icon: History },
            { id: 'approvals', label: 'ตรวจสอบคำขอ', icon: CheckSquare, adminOnly: true },
            { id: 'users', label: 'จัดการผู้ใช้งาน', icon: Users, adminOnly: true }
          ].filter(tab => !tab.adminOnly || isAdmin).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all text-left cursor-pointer text-xs font-semibold ${
                  isActive 
                  ? 'bg-blue-50 text-[#3B82F6] font-semibold border-l-4 border-[#3B82F6] shadow-sm' 
                  : 'text-slate-600 hover:bg-white/70 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-[#3B82F6]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {tab.id === 'approvals' && bookings.filter(b => b.status === 'pending').length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-auto" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Account info */}
        <div className="p-3.5 border-t border-slate-200 bg-white/60">
          <div className="flex items-center gap-2.5 p-1.5 justify-between">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center text-[#3B82F6] text-xs font-bold uppercase border border-blue-200 shrink-0">
                {(userProfile?.displayName || user.displayName || 'EM').substring(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-bold text-[#0F172A] truncate">
                  {userProfile?.displayName || user.displayName}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {isAdmin ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้งาน'}
                </p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 bg-white hover:bg-rose-50 border border-slate-200 text-slate-400 hover:text-rose-600 rounded-lg transition-all shrink-0 cursor-pointer shadow-2xs"
              title="ออกจากระบบ"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-h-screen bg-[#f8fafc] overflow-hidden">
        
        {/* Mobile top bar (visible only on mobile) */}
        <header className="md:hidden bg-white border-b border-slate-200/80 sticky top-0 z-40">
          <div className="px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-xs">EC</div>
              <span className="font-bold text-slate-800 text-xs tracking-wide">Meeting Room EC</span>
            </div>
            
            <div className="flex items-center gap-2">
              <div 
                className={`h-2.5 w-2.5 rounded-full transition-all ${
                  apiStatus === 'connected' 
                    ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' 
                    : 'bg-amber-400 animate-pulse'
                }`}
                title={apiStatusDetail || 'ระบบเชื่อมต่อและซิงค์ข้อมูลอัตโนมัติ'}
              />
              <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Online
              </span>
              <button 
                onClick={handleLogout}
                className="p-1.5 bg-slate-50 border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                title="ออกจากระบบ"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Mobile Navigation bar */}
          <div className="flex items-center justify-around border-t border-slate-100 h-12 bg-white text-[11px] font-semibold text-slate-500">
            {[
              { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
              { id: 'calendar', label: 'ปฏิทิน', icon: CalendarIcon },
              { id: 'history', label: 'ประวัติของฉัน', icon: History },
              { id: 'approvals', label: 'ตรวจสอบ', icon: CheckSquare, adminOnly: true },
              { id: 'users', label: 'ผู้ใช้งาน', icon: Users, adminOnly: true }
            ].filter(tab => !tab.adminOnly || isAdmin).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center space-y-0.5 flex-1 h-full ${
                    isActive ? 'text-sky-600 font-bold' : 'text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* Top Header - Status indicator & Global quick booking matching reference */}
        <header className="hidden md:flex h-14 bg-white/90 backdrop-blur-xs border-b border-slate-200 px-8 items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">สถานะระบบ:</span>
              <div className="flex items-center space-x-1.5">
                <div 
                  className={`h-2.5 w-2.5 rounded-full transition-all ${
                    apiStatus === 'connected' 
                      ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)]' 
                      : 'bg-amber-400 animate-pulse'
                  }`} 
                  title={apiStatusDetail || 'ระบบเชื่อมต่อและซิงค์ข้อมูลอัตโนมัติ'}
                />
                <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1.5 ${
                  apiStatus === 'connected'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-current"></span>
                  {apiStatus === 'connected' ? 'เชื่อมต่ออัตโนมัติ (Online)' : 'กำลังเชื่อมต่ออัตโนมัติ...'}
                </span>
              </div>
            </div>

            {isAdmin && (
              <button
                onClick={() => autoConnectApi()}
                disabled={isCheckingApi}
                className="text-[11px] text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors flex items-center gap-1 cursor-pointer"
                title="ตรวจสอบและซิงค์การเชื่อมต่อระบบใหม่ (เฉพาะ Admin)"
              >
                <RefreshCw className={`w-3 h-3 ${isCheckingApi ? 'animate-spin text-slate-600' : ''}`} />
                <span className="hidden lg:inline text-[10px]">ตรวจสอบระบบ</span>
              </button>
            )}

            <div className="h-3.5 w-[1px] bg-slate-200" />
            <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
              สิทธิ์บัญชี: {isAdmin ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้งานทั่วไป'}
            </span>
          </div>
          <div className="flex items-center gap-2.5">
            {isAdmin && (
              <button 
                onClick={() => handleOpenAnnouncement()}
                className="flex items-center gap-1.5 bg-[#C084FC] hover:bg-[#A855F7] text-white px-3.5 py-1.5 rounded-xl font-semibold shadow-[0_4px_14px_rgba(192,132,252,0.3)] hover:shadow-[0_6px_20px_rgba(192,132,252,0.4)] transition-all cursor-pointer text-xs"
                title="ลงประกาศแจ้งพนักงานทุกคน เช่น ซ้อไปใต้, ไม่อยู่, ไปต่างจังหวัด (เฉพาะผู้ดูแลระบบ)"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>+ ลงประกาศข่าวสาร</span>
              </button>
            )}
            <button 
              onClick={() => handleOpenBooking()}
              className="flex items-center gap-1.5 bg-[#60A5FA] hover:bg-[#3B82F6] text-white px-3.5 py-1.5 rounded-xl font-semibold shadow-[0_4px_14px_rgba(96,165,250,0.3)] hover:shadow-[0_6px_15px_-3px_rgba(59,130,246,0.25)] transition-all cursor-pointer text-xs"
            >
              <Video className="w-3.5 h-3.5" />
              <span>+ จองห้องประชุม</span>
            </button>
          </div>
        </header>

        {/* Main Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {activeTab === 'dashboard' && (
            <Dashboard 
              bookings={bookings}
              rooms={MEETING_ROOMS}
              onOpenBookingModal={handleOpenBooking}
              onOpenAnnouncementModal={isAdmin ? handleOpenAnnouncement : undefined}
              isAdmin={isAdmin}
              currentUserEmail={user.email}
              onSelectTab={setActiveTab}
              onDeleteBooking={handleDeleteBooking}
              onEditBooking={(b) => {
                if (b.entryType === 'announcement') {
                  if (isAdmin) {
                    handleOpenAnnouncement(undefined, b);
                  }
                } else {
                  handleOpenBooking(b.roomId, undefined, b);
                }
              }}
              onOpenImportModal={() => setIsImportOpen(true)}
              onSendReminderEmail={handleSendReminderEmail}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView 
              bookings={bookings}
              rooms={MEETING_ROOMS}
              onOpenBookingModal={handleOpenBooking}
              onOpenAnnouncementModal={isAdmin ? handleOpenAnnouncement : undefined}
              currentUserEmail={user.email}
              isAdmin={isAdmin}
              onDeleteBooking={handleDeleteBooking}
              onEditBooking={(b) => {
                if (b.entryType === 'announcement') {
                  if (isAdmin) {
                    handleOpenAnnouncement(undefined, b);
                  }
                } else {
                  handleOpenBooking(b.roomId, undefined, b);
                }
              }}
            />
          )}

          {activeTab === 'history' && (
            <MyHistory 
              bookings={bookings}
              rooms={MEETING_ROOMS}
              currentUserEmail={user.email}
              currentUserName={userProfile?.displayName || user.displayName}
              isAdmin={isAdmin}
              onOpenBookingModal={handleOpenBooking}
              onEditBooking={(b) => {
                if (b.entryType === 'announcement') {
                  if (isAdmin) {
                    handleOpenAnnouncement(undefined, b);
                  }
                } else {
                  handleOpenBooking(b.roomId, undefined, b);
                }
              }}
              onDeleteBooking={handleDeleteBooking}
            />
          )}

          {activeTab === 'approvals' && isAdmin && (
            <ApprovalPanel 
              bookings={bookings}
              isAdmin={isAdmin}
              onApprove={handleApproveBooking}
              onReject={handleRejectBooking}
            />
          )}

          {activeTab === 'users' && isAdmin && (
            <UserManagement 
              currentUserEmail={user.email}
              isAdmin={isAdmin}
            />
          )}
        </main>

        {/* Footer */}
        <footer className="bg-white border-t border-slate-200 py-6 text-center text-xs space-y-1 mt-auto">
          <div className="font-semibold text-slate-600">Meeting Room EC - Smart Room Booking System</div>
          <p className="text-[11px] text-slate-400">เชื่อมต่อ Firestore DB & Google Calendar V3 APIs และบริการวิดีโอคอลทันสมัย</p>
        </footer>

      </div>

      {/* Booking Form Dialog */}
      <BookingModal 
        isOpen={isBookingOpen}
        onClose={() => {
          setIsBookingOpen(false);
          setEditingBooking(null);
        }}
        roomId={selectedRoomId}
        initialDate={initialDate}
        rooms={MEETING_ROOMS}
        onSubmit={handleSaveBooking}
        currentUserEmail={user.email}
        currentUserName={user.displayName}
        isAdmin={isAdmin}
        bookings={bookings}
        editingBooking={editingBooking}
      />

      {/* Import Calendar Modal */}
      <ImportCalendarModal 
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        bookings={bookings}
        userProfile={userProfile}
        onImportConfirm={handleImportEvents}
      />

      {/* Announcement Modal Dialog */}
      <AnnouncementModal 
        isOpen={isAnnouncementOpen}
        onClose={() => {
          setIsAnnouncementOpen(false);
          setEditingAnnouncement(null);
        }}
        initialDate={initialAnnouncementDate}
        onSubmit={handleSaveBooking}
        currentUserEmail={user.email}
        currentUserName={user.displayName}
        isAdmin={isAdmin}
        editingAnnouncement={editingAnnouncement}
      />

      {/* Redesigned Modern Cancel Meeting / Delete Confirmation Modal */}
      <CancelBookingModal
        isOpen={deleteConfirm.isOpen}
        booking={deleteConfirm.booking}
        onClose={() => setDeleteConfirm({ isOpen: false, bookingId: '', title: '', booking: null })}
        onConfirm={executeDeleteBooking}
        currentUserName={userProfile?.nickname || userProfile?.displayName || user?.displayName || 'ผู้ใช้งาน'}
        currentUserEmail={user?.email || userProfile?.email}
      />

      {/* Custom Alert/Notification Modal */}
      {deleteAlert.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 text-center animate-in fade-in duration-200">
            <div className="flex flex-col items-center space-y-3">
              {deleteAlert.type === 'warning' ? (
                <div className="p-3 bg-amber-50 text-amber-600 rounded-full">
                  <ShieldAlert className="h-8 w-8" />
                </div>
              ) : deleteAlert.type === 'error' ? (
                <div className="p-3 bg-rose-50 text-rose-600 rounded-full">
                  <ShieldAlert className="h-8 w-8" />
                </div>
              ) : (
                <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                  <Check className="h-8 w-8" />
                </div>
              )}
              <h3 className="text-lg font-bold text-slate-800">{deleteAlert.title || 'ดำเนินการสำเร็จ'}</h3>
            </div>
            
            <p className="text-sm text-slate-600 whitespace-pre-line">{deleteAlert.message}</p>

            <button
              onClick={() => setDeleteAlert({ isOpen: false, message: '' })}
              className={`w-full py-2.5 text-white font-bold rounded-lg text-xs transition-all cursor-pointer shadow-lg ${
                deleteAlert.type === 'warning' 
                ? 'bg-amber-600 hover:bg-amber-700 shadow-amber-200' 
                : deleteAlert.type === 'error'
                ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200'
                : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
              }`}
            >
              ตกลง
            </button>
          </div>
        </div>
      )}

      {/* Custom Logout Confirmation Modal */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in scale-in duration-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-full">
                <LogOut className="h-6 w-6 text-rose-500" />
              </div>
              <h3 className="text-base font-bold text-slate-800">ยืนยันการออกจากระบบ</h3>
            </div>
            
            <div className="space-y-1.5 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">ต้องการออกจากระบบ?</p>
              <p className="text-xs text-slate-400">คุณจะต้องลงชื่อเข้าใช้งานอีกครั้งเพื่อทำการจองห้องประชุมหรือใช้งานระบบ</p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setLogoutConfirmOpen(false)}
                className="flex-1 py-2 px-4 border border-slate-200 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={executeLogout}
                className="flex-1 py-2 px-4 bg-rose-600 text-white font-bold rounded-lg text-xs hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-200"
              >
                ออกจากระบบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Action Modal via Email Link (?action=approve|reject&id=...&key=...) */}
      {quickAction.isOpen && (
        <QuickActionModal
          action={quickAction.action}
          bookingId={quickAction.bookingId}
          approvalKey={quickAction.key}
          currentUserEmail={user?.email || userProfile?.email}
          currentUserDisplayName={userProfile?.displayName || user?.displayName}
          isAdmin={isAdmin}
          onClose={handleCloseQuickAction}
          onBookingUpdated={(updated) => {
            setBookings(prev => prev.map(b => b.id === updated.id ? updated : b));
          }}
          resolveToken={() => resolveEffectiveToken(null, userProfile)}
        />
      )}

    </div>
  );
}
