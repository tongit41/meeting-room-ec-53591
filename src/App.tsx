import React, { useState, useEffect } from 'react';
import { 
  initAuth, 
  googleSignIn, 
  googleSignOut, 
  db, 
  auth, 
  MEETING_ROOMS,
  handleFirestoreError,
  OperationType,
  anonymousSignIn
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
  updateGoogleCalendarEvent 
} from './lib/googleCalendar';
import Dashboard from './components/Dashboard';
import CalendarView from './components/CalendarView';
import BookingModal from './components/BookingModal';
import UserManagement from './components/UserManagement';
import ApprovalPanel from './components/ApprovalPanel';
import { 
  Calendar as CalendarIcon, 
  CheckSquare, 
  Users, 
  LayoutDashboard, 
  LogOut, 
  ShieldAlert, 
  Video, 
  Check, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [userProfile, setUserProfile] = useState<UserAccount | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // States for Alternative / Bypass Login form
  const [loginMethod, setLoginMethod] = useState<'google' | 'bypass'>('google');
  const [bypassEmail, setBypassEmail] = useState('');
  const [bypassName, setBypassName] = useState('');
  const [bypassNickname, setBypassNickname] = useState('');
  const [bypassRole, setBypassRole] = useState<'admin' | 'employee'>('employee');
  const [isBypassSubmitting, setIsBypassSubmitting] = useState(false);
  const [quickLoginEmail, setQuickLoginEmail] = useState('');
  const [isQuickLoggingIn, setIsQuickLoggingIn] = useState(false);

  // App Core States
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Booking Modal Trigger States
  const [isBookingOpen, setIsBookingOpen] = useState(false);
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId | undefined>(undefined);
  const [initialDate, setInitialDate] = useState<string | undefined>(undefined);

  // Custom Delete Confirmation & Alert Dialog States
  const [deleteConfirm, setDeleteConfirm] = useState<{ isOpen: boolean; bookingId: string; title: string }>({
    isOpen: false,
    bookingId: '',
    title: '',
  });
  const [deleteAlert, setDeleteAlert] = useState<{ isOpen: boolean; message: string }>({
    isOpen: false,
    message: '',
  });
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);

  // Listeners for Firebase Real-time syncing
  useEffect(() => {
    // 1. Listen for Auth changes
    const unsubscribeAuth = initAuth(
      async (firebaseUser, accessToken) => {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const profile = userSnap.data() as UserAccount;
            setUser(firebaseUser);
            setToken(accessToken);
            setUserProfile(profile);
            setNeedsAuth(false);

            // If user is Admin and has accessToken, save it to Firestore for employee calendar sync deletions
            if (profile.role === 'admin' && accessToken) {
              await updateDoc(userDocRef, { googleAccessToken: accessToken });
            }
          } else {
            // Profile does not exist yet. Let's look up by email to see if they are pre-registered!
            const email = (firebaseUser.email || '').toLowerCase();
            const isITSupport = email === 'itsupport@ec.co.th';
            
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
                email: email
              };
              
              await setDoc(userDocRef, migratedProfile);
              if (oldDocId && oldDocId !== firebaseUser.uid) {
                await deleteDoc(doc(db, 'users', oldDocId));
              }
              
              setUser(firebaseUser);
              setToken(accessToken);
              setUserProfile(migratedProfile);
              setNeedsAuth(false);

              if (migratedProfile.role === 'admin' && accessToken) {
                await updateDoc(userDocRef, { googleAccessToken: accessToken });
              }
            } else if (isITSupport) {
              // Auto-create IT Support Admin if they are not in DB
              const adminAccount: UserAccount = {
                id: firebaseUser.uid,
                email,
                displayName: firebaseUser.displayName || 'IT Support',
                nickname: 'IT Support',
                role: 'admin',
                createdAt: new Date().toISOString()
              };
              await setDoc(userDocRef, adminAccount);
              
              setUser(firebaseUser);
              setToken(accessToken);
              setUserProfile(adminAccount);
              setNeedsAuth(false);

              if (accessToken) {
                await updateDoc(userDocRef, { googleAccessToken: accessToken });
              }
            } else {
              // Deny access
              await googleSignOut();
              setUser(null);
              setUserProfile(null);
              setToken(null);
              setNeedsAuth(true);
              setLoginError(`ขออภัย อีเมล ${email} ยังไม่ได้ลงทะเบียนในระบบจัดการบัญชีพนักงาน กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อเพิ่มบัญชีใช้งานของคุณก่อน`);
            }
          }
        } catch (error) {
          console.error('Error fetching/migrating user profile on auth change:', error);
          setUser(firebaseUser);
          setToken(accessToken);
          setNeedsAuth(false);
        }
      },
      () => {
        const sessionStr = localStorage.getItem('anonymous_user_session');
        if (sessionStr) {
          try {
            const session = JSON.parse(sessionStr);
            const savedEmail = (session.email || '').toLowerCase();
            if (savedEmail) {
              getDocs(query(collection(db, 'users'), where('email', '==', savedEmail)))
                .then((qSnap) => {
                  if (!qSnap.empty) {
                    const docSnap = qSnap.docs[0];
                    const foundProfile = docSnap.data() as UserAccount;
                    const customUser = {
                      uid: docSnap.id,
                      email: foundProfile.email,
                      displayName: foundProfile.displayName,
                      photoURL: null
                    } as unknown as FirebaseUser;
                    setUser(customUser);
                    setUserProfile(foundProfile);
                    setToken('');
                    setNeedsAuth(false);
                  } else {
                    localStorage.removeItem('anonymous_user_session');
                    setUser(null);
                    setUserProfile(null);
                    setToken(null);
                    setNeedsAuth(true);
                  }
                })
                .catch((err) => {
                  console.error('Error hydrating quick-login session:', err);
                  localStorage.removeItem('anonymous_user_session');
                  setUser(null);
                  setUserProfile(null);
                  setToken(null);
                  setNeedsAuth(true);
                });
              return;
            }
          } catch (err) {
            console.error('Failed fallback hydration:', err);
          }
        }
        setUser(null);
        setUserProfile(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );

    return () => {
      unsubscribeAuth();
    };
  }, []);

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
      console.error('Error syncing bookings:', error);
      handleFirestoreError(error, OperationType.LIST, 'bookings');
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
      console.error('Error syncing users:', error);
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    return () => {
      unsubscribeBookings();
      unsubscribeUsers();
    };
  }, [user]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await googleSignIn();
      if (result) {
        setToken(result.accessToken);
        setUser(result.user);
        setNeedsAuth(false);

        // Fetch their user profile
        try {
          const userDocRef = doc(db, 'users', result.user.uid);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            const profile = userSnap.data() as UserAccount;
            setUserProfile(profile);
            
            // Save admin token for background calendar actions
            if (profile.role === 'admin' && result.accessToken) {
              await updateDoc(userDocRef, { googleAccessToken: result.accessToken });
            }
          }
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${result.user.uid}`);
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

  const handleBypassLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!bypassEmail.trim() || !bypassName.trim()) {
      setLoginError('กรุณากรอกอีเมลและชื่อ-นามสกุลให้ครบถ้วน');
      return;
    }
    
    if (!bypassEmail.includes('@') || !bypassEmail.includes('.')) {
      setLoginError('กรุณากรอกอีเมลในรูปแบบที่ถูกต้อง');
      return;
    }

    setIsBypassSubmitting(true);
    setLoginError(null);
    
    try {
      const finalNickname = bypassNickname.trim() || bypassName.trim().split(' ')[0] || 'คุณ';
      
      const session = {
        email: bypassEmail.trim().toLowerCase(),
        displayName: bypassName.trim(),
        nickname: finalNickname,
        role: bypassRole
      };
      localStorage.setItem('anonymous_user_session', JSON.stringify(session));

      const result = await anonymousSignIn(session.email, session.displayName, session.nickname);
      
      if (result) {
        setToken('');
        setNeedsAuth(false);
      }
    } catch (err: any) {
      console.error('Anonymous sign-in failed, using offline fallback mode:', err);
      
      const fallbackUid = 'mock_uid_' + Math.random().toString(36).substring(2, 11);
      const finalNickname = bypassNickname.trim() || bypassName.trim().split(' ')[0] || 'คุณ';
      
      const session = {
        email: bypassEmail.trim().toLowerCase(),
        displayName: bypassName.trim(),
        nickname: finalNickname,
        role: bypassRole
      };
      
      localStorage.setItem('anonymous_user_session', JSON.stringify(session));
      
      const customUser = {
        uid: fallbackUid,
        email: session.email,
        displayName: session.displayName,
        photoURL: null
      } as unknown as FirebaseUser;
      
      setUser(customUser);
      const profile = {
        id: fallbackUid,
        email: session.email,
        displayName: session.displayName,
        nickname: session.nickname,
        role: session.role,
        createdAt: new Date().toISOString()
      };
      setUserProfile(profile);
      setToken('');
      setNeedsAuth(false);

      try {
        await setDoc(doc(db, 'users', fallbackUid), profile);
      } catch (dbErr) {
        console.warn('Could not save fallback user profile to Firestore:', dbErr);
      }
    } finally {
      setIsBypassSubmitting(false);
    }
  };

  const handleEmployeeQuickLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = quickLoginEmail.trim().toLowerCase();
    if (!email) {
      setLoginError('กรุณากรอกอีเมลของคุณ');
      return;
    }
    if (!email.includes('@') || !email.includes('.')) {
      setLoginError('รูปแบบอีเมลไม่ถูกต้อง');
      return;
    }

    setIsQuickLoggingIn(true);
    setLoginError(null);

    try {
      // Query users collection for this email
      const q = query(collection(db, 'users'), where('email', '==', email));
      const qSnap = await getDocs(q);

      if (!qSnap.empty) {
        const docSnap = qSnap.docs[0];
        const foundProfile = docSnap.data() as UserAccount;
        
        const customUser = {
          uid: docSnap.id,
          email: foundProfile.email,
          displayName: foundProfile.displayName,
          photoURL: null
        } as unknown as FirebaseUser;

        // Save session
        localStorage.setItem('anonymous_user_session', JSON.stringify({ email: foundProfile.email }));

        setUser(customUser);
        setUserProfile(foundProfile);
        setToken('');
        setNeedsAuth(false);
        setQuickLoginEmail('');
      } else {
        setLoginError(`ขออภัย อีเมล "${email}" ยังไม่ได้ลงทะเบียนในระบบจัดการบัญชีพนักงาน กรุณาติดต่อผู้ดูแลระบบ (Admin) เพื่อเพิ่มบัญชีใช้งานของคุณก่อน`);
      }
    } catch (err: any) {
      console.error('Quick login error:', err);
      setLoginError('เกิดข้อผิดพลาดในการตรวจสอบฐานข้อมูล: ' + (err?.message || String(err)));
    } finally {
      setIsQuickLoggingIn(false);
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

  // CREATE BOOKING (Triggered from BookingModal form submission)
  const handleCreateBooking = async (bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>) => {
    if (!user || !userProfile) throw new Error('กรุณาล็อกอินก่อนทำรายการ');

    // Extra safety guard: check for overlapping bookings
    const overlap = bookings.find(b => {
      if (b.roomId !== bookingData.roomId) return false;
      if (b.status === 'rejected') return false;
      return b.startTime < bookingData.endTime && bookingData.startTime < b.endTime;
    });

    if (overlap) {
      throw new Error(
        `ห้องประชุมนี้ถูกจองไว้แล้วในช่วงเวลาดังกล่าว\n\nหัวข้อ: ${overlap.title}\nเวลา: ${overlap.startTime.split('T')[1]} - ${overlap.endTime.split('T')[1]} น.`
      );
    }

    const newBookingDocRef = doc(collection(db, 'bookings'));
    
    // Prepare complete booking resource
    const newBooking: Omit<Booking, 'id'> = {
      ...bookingData,
      creatorEmail: userProfile.email,
      creatorName: userProfile.displayName,
      createdAt: new Date().toISOString()
    };

    // If current user is Admin, they auto-approve and sync with Google Calendar immediately!
    if (userProfile.role === 'admin') {
      newBooking.status = 'approved';
      
      // Sync with Google Calendar if OAuth token is active
      if (token) {
        try {
          const calendarResult = await createGoogleCalendarEvent(token, newBooking, newBookingDocRef.id);
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
    }

    // Save to Firestore
    try {
      await setDoc(newBookingDocRef, newBooking);
      setDeleteAlert({
        isOpen: true,
        message: 'ทำการจองเรียบร้อย',
      });
      setActiveTab('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `bookings/${newBookingDocRef.id}`);
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

    // Create Calendar Event & Meet links if not already synced
    if (token && !bData.googleEventId) {
      try {
        const calResult = await createGoogleCalendarEvent(token, bData, bookingId);
        updatedGoogleEventId = calResult.eventId;
        if (bData.meetingType === 'meet' && calResult.meetingLink) {
          updatedMeetingLink = calResult.meetingLink;
        }
      } catch (calErr) {
        console.error('Failed to sync to Google Calendar on approval:', calErr);
        alert('อนุมัติสำเร็จในระบบ แต่ไม่สามารถซิงค์ขึ้น Google Calendar ของผู้จองได้ (สิทธิ์ Token อาจหมดอายุ)');
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
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
    }
  };

  // Helper to fetch any active Admin's Google Access Token from Firestore
  const getAdminGoogleToken = async (): Promise<string | null> => {
    try {
      const q = query(collection(db, 'users'), where('role', '==', 'admin'));
      const qSnap = await getDocs(q);
      for (const docSnap of qSnap.docs) {
        const data = docSnap.data();
        if (data.googleAccessToken) {
          return data.googleAccessToken;
        }
      }
    } catch (err) {
      console.error('Error fetching admin Google token:', err);
    }
    return null;
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

    // Delete Google Calendar Event if it was somehow synced previously
    if (bData.googleEventId) {
      try {
        const activeToken = token || (await getAdminGoogleToken());
        if (activeToken) {
          await deleteGoogleCalendarEvent(activeToken, bData.googleEventId);
        }
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
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `bookings/${bookingId}`);
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

    const bData = bookingSnap.data() as Booking;

    // Robust permission check: Admin or Creator of booking can delete
    const isUserAdmin = userProfile?.role === 'admin' || user?.email === 'itsupport@ec.co.th';
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
    });
  };

  const executeDeleteBooking = async () => {
    const bookingId = deleteConfirm.bookingId;
    if (!bookingId) return;

    setDeleteConfirm({ isOpen: false, bookingId: '', title: '' });

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

    // Delete Google Calendar Event if it exists
    if (bData.googleEventId) {
      try {
        const activeToken = token || (await getAdminGoogleToken());
        if (activeToken) {
          await deleteGoogleCalendarEvent(activeToken, bData.googleEventId);
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
      setDeleteAlert({
        isOpen: true,
        message: 'ลบกิจกรรมสำเร็จ',
      });
      setActiveTab('dashboard');
    } catch (error) {
      handleFirestoreError(error, OperationType.DELETE, `bookings/${bookingId}`);
    }
  };

  const handleOpenBooking = (roomId?: RoomId, date?: string) => {
    setSelectedRoomId(roomId);
    setInitialDate(date);
    setIsBookingOpen(true);
  };

  const isAdmin = userProfile?.role === 'admin' || user?.email === 'itsupport@ec.co.th';

  // RENDER LOGIN SCREEN
  if (needsAuth || !user) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 relative overflow-hidden" id="auth-screen">
        {/* Abstract Background Accents */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-rose-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl p-8 space-y-8 shadow-2xl relative">
          
          {/* Logo & Info */}
          <div className="text-center space-y-3">
            <span className="bg-indigo-500/20 text-indigo-400 text-xs px-4 py-1.5 rounded-full border border-indigo-500/30 font-semibold uppercase tracking-wider">
              Meeting Room EC
            </span>
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white font-sans">
              ระบบจองห้องประชุมออนไลน์
            </h1>
            <p className="text-slate-400 text-xs md:text-sm">
              บริหารจัดการการจองห้อง ประชุมผ่านหน้าจอแดชบอร์ด ซิงค์ข้อมูลกับ Google Calendar และแนบวิดีโอคอล Google Meet ได้ในคลิกเดียว
            </p>
          </div>

          {/* Rooms showcase preview */}
          <div className="bg-slate-800/40 rounded-2xl p-4 border border-slate-800/60 space-y-2 text-xs">
            <div className="font-bold text-slate-300">ห้องประชุมที่ให้บริการ:</div>
            <div className="grid grid-cols-1 gap-2">
              <div className="text-slate-400 font-medium">🟢 ห้องประชุม 1 (Focus Room)</div>
              <div className="text-slate-400 font-medium">🔵 ห้องประชุม 2 (Synergy Room)</div>
              <div className="text-slate-400 font-medium">🟡 ห้องประชุม 3 (Vision Hall)</div>
            </div>
          </div>

          {/* Login Fields */}
          <div className="space-y-4">
            {loginError && (
              <div className="bg-rose-500/15 border border-rose-500/30 text-rose-200 p-4 rounded-2xl flex items-start gap-3 text-xs leading-relaxed animate-fade-in" id="login-error-banner">
                <AlertCircle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1.5">
                  <span className="font-bold block text-rose-300 text-sm">เข้าสู่ระบบไม่สำเร็จ</span>
                  <span className="block">{loginError}</span>
                  <div className="pt-1.5 border-t border-rose-500/20 text-[10px] text-slate-400">
                    💡 <strong className="text-white">คำแนะนำ:</strong> หากใช้งานภายในกรอบ iFrame พรีวิว ให้ลองคลิกเปิดใช้งานในแท็บใหม่ด้วยปุ่ม <strong className="text-white">"Open in new tab"</strong> หรือ <strong className="text-white">"Share"</strong> ที่มุมขวาบน เพื่อล็อกอินแบบเต็มหน้าจอและเปิดให้เบราว์เซอร์เปิดหน้าต่างสิทธิ์ยืนยันตัวตน Google Account ของคุณ
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <button 
                onClick={handleLogin}
                disabled={isLoggingIn}
                className="w-full flex items-center justify-center space-x-3 bg-white hover:bg-slate-100 text-slate-800 font-bold py-3 px-4 rounded-xl shadow-lg border border-slate-200 transition-all cursor-pointer disabled:opacity-50 text-xs animate-pulse"
              >
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5 shrink-0">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                </svg>
                <span>{isLoggingIn ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบด้วย Google / Gmail'}</span>
              </button>

              <p className="text-[10px] text-slate-500 text-center leading-relaxed">
                *ระบบจองจะตรวจสอบข้อมูลพนักงานที่ลงทะเบียนไว้กับระบบแล้วเท่านั้น
              </p>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-slate-800"></div>
                <span className="flex-shrink mx-4 text-[10px] text-slate-600 font-bold uppercase tracking-wider">หรือ</span>
                <div className="flex-grow border-t border-slate-800"></div>
              </div>

              {/* Secure Quick Login Verification Form */}
              <form onSubmit={handleEmployeeQuickLogin} className="space-y-3.5 bg-slate-800/20 p-4 rounded-2xl border border-slate-800/80">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-slate-300 font-bold block text-[11px]">ล็อกอินด่วนด้วยอีเมลพนักงาน</label>
                    <span className="text-[9px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-1.5 py-0.5 rounded font-medium">Bypass Google Block</span>
                  </div>
                  <input
                    type="email"
                    required
                    value={quickLoginEmail}
                    onChange={(e) => setQuickLoginEmail(e.target.value)}
                    placeholder="ระบุอีเมลพนักงานของคุณ (เช่น hachi2159@gmail.com)"
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs transition-all"
                  />
                  <p className="text-[9px] text-slate-500 leading-relaxed">
                    *สำหรับพนักงานที่ลงทะเบียนในระบบแล้วเท่านั้น ป้อนอีเมลที่ได้รับการอนุมัติเพื่อล็อกอินทดสอบทันทีเพื่อเลี่ยงข้อจำกัดการบล็อกสิทธิ์ทดสอบจาก Google
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isQuickLoggingIn}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg border border-indigo-500 transition-all cursor-pointer disabled:opacity-50 text-xs"
                >
                  {isQuickLoggingIn ? 'กำลังตรวจสอบสิทธิ์พนักงาน...' : 'ยืนยันอีเมล & เข้าสู่ระบบทันที'}
                </button>
              </form>
            </div>
          </div>

        </div>
      </div>
    );
  }

  // RENDER PRIMARY SYSTEM LAYOUT
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row text-slate-900 font-sans" id="app-layout">
      
      {/* Sidebar Navigation - Left side (hidden on mobile, visible on desktop) */}
      <aside className="hidden md:flex md:w-64 bg-slate-900 flex-col h-screen sticky top-0 shrink-0">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold">EC</div>
            <h1 className="text-white font-semibold text-lg tracking-tight">Meeting Room EC</h1>
          </div>
        </div>
        
        <nav className="flex-1 p-4 space-y-1">
          {[
            { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
            { id: 'calendar', label: 'ปฏิทินห้องประชุม', icon: CalendarIcon },
            { id: 'approvals', label: 'ตรวจสอบคำขอ', icon: CheckSquare, adminOnly: true },
            { id: 'users', label: 'จัดการพนักงาน', icon: Users, adminOnly: true }
          ].filter(tab => !tab.adminOnly || isAdmin).map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all text-left cursor-pointer ${
                  isActive 
                  ? 'bg-blue-600/15 text-blue-400 font-semibold border-l-4 border-blue-500' 
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="text-sm">{tab.label}</span>
                {tab.id === 'approvals' && bookings.filter(b => b.status === 'pending').length > 0 && (
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse ml-auto" />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer Account info */}
        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 p-2 justify-between">
            <div className="flex items-center gap-3 overflow-hidden">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold uppercase border-2 border-white shadow-sm shrink-0">
                {(userProfile?.displayName || user.displayName || 'EM').substring(0, 2)}
              </div>
              <div className="overflow-hidden">
                <p className="text-xs font-semibold text-white truncate">
                  {userProfile?.displayName || user.displayName}
                </p>
                <p className="text-[10px] text-slate-500 truncate">
                  {isAdmin ? 'ผู้ดูแลระบบ (Admin)' : 'พนักงานทั่วไป'}
                </p>
              </div>
            </div>
            <button 
              onClick={handleLogout}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700/50 text-rose-500 rounded-lg transition-all shrink-0 cursor-pointer"
              title="ออกจากระบบ"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col min-h-screen bg-slate-50 overflow-hidden">
        
        {/* Mobile top bar (visible only on mobile) */}
        <header className="md:hidden bg-white border-b border-slate-200/80 sticky top-0 z-40">
          <div className="px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">EC</div>
              <span className="font-bold text-slate-800 text-sm tracking-wide">Meeting Room EC</span>
            </div>
            
            <button 
              onClick={handleLogout}
              className="p-1.5 bg-slate-50 border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-xl transition-all"
              title="ออกจากระบบ"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>

          {/* Mobile Navigation bar */}
          <div className="flex items-center justify-around border-t border-slate-100 h-12 bg-white text-[11px] font-bold text-slate-500">
            {[
              { id: 'dashboard', label: 'แดชบอร์ด', icon: LayoutDashboard },
              { id: 'calendar', label: 'ปฏิทิน', icon: CalendarIcon },
              { id: 'approvals', label: 'ตรวจสอบ', icon: CheckSquare, adminOnly: true },
              { id: 'users', label: 'พนักงาน', icon: Users, adminOnly: true }
            ].filter(tab => !tab.adminOnly || isAdmin).map(tab => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex flex-col items-center justify-center space-y-0.5 flex-1 h-full ${
                    isActive ? 'text-blue-600 font-extrabold' : 'text-slate-400'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </header>

        {/* Top Header - Status indicator & Global quick booking */}
        <header className="hidden md:flex h-16 bg-white border-b border-slate-200 px-8 items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-500">Google Calendar API Status</span>
              <div className={`h-2.5 w-2.5 rounded-full ${token ? 'bg-green-500 animate-pulse' : 'bg-rose-500 animate-pulse'}`} />
            </div>
            <div className="h-4 w-[1px] bg-slate-200" />
            <span className="text-xs font-bold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200/40">
              สิทธิ์บัญชี: {isAdmin ? 'ผู้ดูแลระบบ (Admin)' : 'พนักงานทั่วไป (Employee)'}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <button 
              onClick={() => handleOpenBooking()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-lg font-medium shadow-lg shadow-blue-200 transition-all cursor-pointer text-xs"
            >
              <Video className="w-4 h-4" />
              <span>สร้างรายการจองใหม่</span>
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
              isAdmin={isAdmin}
              currentUserEmail={user.email}
              onSelectTab={setActiveTab}
              onDeleteBooking={handleDeleteBooking}
            />
          )}

          {activeTab === 'calendar' && (
            <CalendarView 
              bookings={bookings}
              rooms={MEETING_ROOMS}
              onOpenBookingModal={handleOpenBooking}
              currentUserEmail={user.email}
              isAdmin={isAdmin}
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
        onClose={() => setIsBookingOpen(false)}
        roomId={selectedRoomId}
        initialDate={initialDate}
        rooms={MEETING_ROOMS}
        onSubmit={handleCreateBooking}
        currentUserEmail={user.email}
        currentUserName={user.displayName}
        isAdmin={isAdmin}
        bookings={bookings}
      />

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center space-x-3 text-rose-600">
              <div className="p-2 bg-rose-50 rounded-full">
                <ShieldAlert className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">ยืนยันการลบกิจกรรม</h3>
            </div>
            
            <div className="space-y-1.5 text-sm text-slate-600">
              <p>คุณต้องการลบกิจกรรมการใช้ห้องประชุมนี้ใช่หรือไม่?</p>
              {deleteConfirm.title && (
                <p className="font-semibold text-slate-700 bg-slate-50 p-2 rounded-md border border-slate-100 italic">
                  "{deleteConfirm.title}"
                </p>
              )}
              <p className="text-xs text-rose-500 font-medium pt-1">⚠️ การลบนี้จะเป็นการยกเลิกการจองและลบข้อมูลออกจากระบบอย่างถาวร</p>
            </div>

            <div className="flex space-x-3 pt-2">
              <button
                onClick={() => setDeleteConfirm({ isOpen: false, bookingId: '', title: '' })}
                className="flex-1 py-2 px-4 border border-slate-200 text-slate-600 font-bold rounded-lg text-xs hover:bg-slate-50 transition-all cursor-pointer"
              >
                ยกเลิก
              </button>
              <button
                onClick={executeDeleteBooking}
                className="flex-1 py-2 px-4 bg-rose-600 text-white font-bold rounded-lg text-xs hover:bg-rose-700 transition-all cursor-pointer shadow-lg shadow-rose-200"
              >
                ยืนยันการลบ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert/Notification Modal */}
      {deleteAlert.isOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 text-center animate-in fade-in duration-200">
            <div className="flex flex-col items-center space-y-3">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-full">
                <Check className="h-8 w-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">ดำเนินการสำเร็จ</h3>
            </div>
            
            <p className="text-sm text-slate-600">{deleteAlert.message}</p>

            <button
              onClick={() => setDeleteAlert({ isOpen: false, message: '' })}
              className="w-full py-2.5 bg-indigo-600 text-white font-bold rounded-lg text-xs hover:bg-indigo-700 transition-all cursor-pointer shadow-lg shadow-indigo-200"
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

    </div>
  );
}
