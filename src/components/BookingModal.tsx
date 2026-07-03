import React, { useState, useEffect } from 'react';
import { 
  X, 
  MapPin, 
  Calendar, 
  Clock, 
  Users, 
  Video, 
  ChevronDown, 
  AlertTriangle,
  Info,
  CheckCircle,
  HelpCircle,
  Link,
  Plus
} from 'lucide-react';
import { Booking, RoomId, MeetingRoom, MeetingPlatform, UserAccount } from '../types';
import { MEETING_ROOMS, db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId?: RoomId;
  initialDate?: string; // YYYY-MM-DD
  rooms?: MeetingRoom[];
  onSubmit: (bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>) => Promise<void>;
  currentUserEmail: string | null;
  currentUserName: string | null;
  isAdmin: boolean;
  bookings?: Booking[];
}

export default function BookingModal({
  isOpen,
  onClose,
  roomId: initialRoomId,
  initialDate,
  rooms = MEETING_ROOMS,
  onSubmit,
  currentUserEmail,
  currentUserName,
  isAdmin,
  bookings = []
}: BookingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId>('room1');
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [meetingPlatform, setMeetingPlatform] = useState<MeetingPlatform>('meet');
  const [customLink, setCustomLink] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserAccount[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<UserAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Hydrate fields on open/props change
  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setDescription('');
      setSelectedRoomId(initialRoomId || 'room1');
      
      const now = new Date();
      const localYear = now.getFullYear();
      const localMonth = String(now.getMonth() + 1).padStart(2, '0');
      const localDay = String(now.getDate()).padStart(2, '0');
      const todayStr = `${localYear}-${localMonth}-${localDay}`;
      setDate(initialDate || todayStr);
      setStartTime('09:00');
      setEndTime('10:00');
      setMeetingPlatform('meet');
      setCustomLink('');
      setSelectedAttendees([]);
      setErrorMsg('');
      
      // Fetch users from Firebase
      fetchUsers();
    }
  }, [isOpen, initialRoomId, initialDate]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      let qSnap;
      try {
        qSnap = await getDocs(collection(db, 'users'));
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'users');
        return;
      }
      const list: UserAccount[] = [];
      qSnap.forEach(d => {
        list.push(d.data() as UserAccount);
      });
      setAvailableUsers(list);
    } catch (error) {
      console.error('Error fetching users for attendees list:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  if (!isOpen) return null;

  // Generate standard 30-min time slots
  const generateTimeSlots = () => {
    const slots = [];
    for (let h = 8; h <= 18; h++) {
      const hourStr = String(h).padStart(2, '0');
      slots.push(`${hourStr}:00`);
      slots.push(`${hourStr}:30`);
    }
    return slots;
  };

  const timeSlots = generateTimeSlots();

  const toggleAttendee = (user: UserAccount) => {
    const exists = selectedAttendees.find(a => a.email === user.email);
    if (exists) {
      setSelectedAttendees(selectedAttendees.filter(a => a.email !== user.email));
    } else {
      setSelectedAttendees([...selectedAttendees, user]);
    }
  };

  const handlePlatformChange = (p: MeetingPlatform) => {
    setMeetingPlatform(p);
    if (p === 'meet') {
      setCustomLink('ลิงก์ Google Meet จะถูกสร้างโดยอัตโนมัติเมื่ออนุมัติ');
    } else {
      setCustomLink('');
    }
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');

    if (!title.trim()) {
      setErrorMsg('กรุณากรอกหัวข้อเรื่องการประชุม');
      return;
    }

    if (meetingPlatform === 'external' && !customLink.trim()) {
      setErrorMsg('กรุณากรอกลิงก์ประชุมออนไลน์สำหรับช่องทางภายนอก');
      return;
    }

    if (startTime >= endTime) {
      setErrorMsg('เวลาสิ้นสุดการประชุมต้องอยู่หลังเวลาเริ่มต้น');
      return;
    }

    // Check for overlapping bookings
    if (bookings && bookings.length > 0) {
      const startISO = `${date}T${startTime}`;
      const endISO = `${date}T${endTime}`;
      
      const overlappingBooking = bookings.find(b => {
        if (b.roomId !== selectedRoomId) return false;
        if (b.status === 'rejected') return false;
        return b.startTime < endISO && startISO < b.endTime;
      });

      if (overlappingBooking) {
        setErrorMsg(
          `ห้องประชุมนี้ถูกจองไว้แล้วในช่วงเวลาดังกล่าว\n\nหัวข้อ: ${overlappingBooking.title}\nเวลา: ${overlappingBooking.startTime.split('T')[1]} - ${overlappingBooking.endTime.split('T')[1]} น.`
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      // Build ISO times
      const startISO = `${date}T${startTime}`;
      const endISO = `${date}T${endTime}`;

      const selectedRoom = rooms.find(r => r.id === selectedRoomId);
      const roomName = selectedRoom ? selectedRoom.name : 'ห้องประชุม 1 (Focus Room)';

      // Auto link format or custom link
      let finalLink = customLink;
      if (meetingPlatform === 'meet') {
        finalLink = ''; // Google Meet link will be injected by the Calendar Sync step
      }

      // Attendees mapping
      const mappedAttendees = selectedAttendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
        nickname: a.nickname
      }));

      // Submit
      await onSubmit({
        title,
        description,
        roomId: selectedRoomId,
        roomName,
        startTime: startISO,
        endTime: endISO,
        status: isAdmin ? 'approved' : 'pending', // Admins bypass approvals, employees default to pending
        attendees: mappedAttendees,
        meetingType: meetingPlatform,
        meetingLink: finalLink
      });

      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการสร้างข้อมูลจอง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredUsers = availableUsers.filter(u => {
    const term = searchTerm.toLowerCase();
    return (
      u.displayName.toLowerCase().includes(term) ||
      u.email.toLowerCase().includes(term) ||
      (u.nickname && u.nickname.toLowerCase().includes(term))
    );
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-100 shadow-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col">
        
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="space-y-1">
            <h3 className="font-bold text-slate-800 text-lg">จองห้องประชุมใหม่</h3>
            <p className="text-xs text-slate-500">กรอกข้อมูลเพื่อสร้างกิจกรรมจองและเลือกช่องทางประชุม</p>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 bg-slate-100 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmitForm} className="p-6 overflow-y-auto flex-1 space-y-5 text-sm">
          {errorMsg && (
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 z-[60]">
              <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xl max-w-sm w-full space-y-4 text-center animate-in fade-in duration-200">
                <div className="flex flex-col items-center space-y-3">
                  <div className="p-3 bg-rose-50 text-rose-600 rounded-full">
                    <AlertTriangle className="h-8 w-8 text-rose-600 animate-pulse" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800">แจ้งเตือน</h3>
                </div>
                
                <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-line">{errorMsg}</p>

                <button
                  type="button"
                  onClick={() => setErrorMsg('')}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-all cursor-pointer shadow-lg shadow-indigo-200"
                >
                  ตกลง
                </button>
              </div>
            </div>
          )}

          {/* Title & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">หัวข้อเรื่องการประชุม *</label>
              <input 
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="เช่น ประชุมวางแผนพัฒนาโครงการ Q3"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">รายละเอียดการประชุม</label>
              <textarea 
                rows={3}
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="ระบุวาระการประชุม และรายละเอียดสำหรับผู้เข้าร่วม (ไม่บังคับ)"
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Room Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">เลือกห้องประชุม *</label>
              <div className="relative">
                <select 
                  value={selectedRoomId}
                  onChange={e => setSelectedRoomId(e.target.value as RoomId)}
                  className="w-full appearance-none px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  {rooms.map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            {/* Date Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">วันที่ต้องการจอง *</label>
              <input 
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Time Slot Selection */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">เวลาเริ่มประชุม *</label>
              <div className="relative">
                <select
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="w-full appearance-none px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  {timeSlots.map(slot => (
                    <option key={`start-${slot}`} value={slot}>{slot} น.</option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">เวลาสิ้นสุดประชุม *</label>
              <div className="relative">
                <select
                  value={endTime}
                  onChange={e => setEndTime(e.target.value)}
                  className="w-full appearance-none px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                >
                  {timeSlots.map(slot => (
                    <option key={`end-${slot}`} value={slot}>{slot} น.</option>
                  ))}
                </select>
                <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Meeting Platform Selection */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <label className="block text-xs font-bold text-slate-600">
              ช่องทางการโทรวิดีโอคอลออนไลน์ (วิดีโอคอลร่วมกัน)
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {[
                { id: 'meet', label: 'Google Meet', icon: 'meet' },
                { id: 'external', label: 'ช่องทางภายนอก', icon: 'external' },
                { id: 'none', label: 'ไม่มี (On-site)', icon: 'none' }
              ].map(p => (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => handlePlatformChange(p.id as MeetingPlatform)}
                  className={`py-2 px-3 rounded-lg border text-xs font-bold text-center transition-all ${
                    meetingPlatform === p.id
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold ring-2 ring-indigo-500/10'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {meetingPlatform !== 'none' && (
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center space-x-2">
                <Video className="h-4 w-4 text-indigo-500 shrink-0" />
                <input 
                  type="text"
                  disabled={meetingPlatform === 'meet'}
                  value={customLink}
                  onChange={e => setCustomLink(e.target.value)}
                  placeholder={
                    meetingPlatform === 'external' 
                      ? "วางลิงก์วิดีอลคอลภายนอกที่นี่ (เช่น Zoom, MS Teams, Line ฯลฯ)" 
                      : "ลิงก์ Google Meet จะถูกสร้างโดยอัตโนมัติเมื่ออนุมัติ"
                  }
                  className="bg-transparent border-none text-xs text-slate-600 focus:outline-none w-full font-mono select-all disabled:opacity-80"
                />
              </div>
            )}
          </div>

          {/* Add Attendees List */}
          <div className="space-y-2 border-t border-slate-100 pt-4">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-600">
                เลือกผู้เข้าร่วมประชุมจากบัญชีพนักงาน ({selectedAttendees.length} คน)
              </label>
              <span className="text-[10px] text-slate-400">ดึงชื่อเล่น ชื่อ-นามสกุล และอีเมลอัตโนมัติ</span>
            </div>
            
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              {/* Search bar inside */}
              <div className="bg-slate-50 p-2 border-b border-slate-200">
                <input 
                  type="text"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  placeholder="🔍 ค้นหารายชื่อพนักงาน..."
                  className="w-full text-xs px-2.5 py-1.5 rounded-md border border-slate-200 bg-white focus:outline-none"
                />
              </div>

              {/* Scrolling Users Selection */}
              <div className="max-h-[140px] overflow-y-auto divide-y divide-slate-100 bg-white">
                {loadingUsers ? (
                  <div className="text-center py-4 text-slate-400 text-xs">กำลังโหลดรายชื่อพนักงาน...</div>
                ) : filteredUsers.length > 0 ? (
                  filteredUsers.map(user => {
                    const isSelected = selectedAttendees.some(a => a.email === user.email);
                    return (
                      <button
                        type="button"
                        key={user.id}
                        onClick={() => toggleAttendee(user)}
                        className={`w-full text-left p-2 px-3 flex items-center justify-between text-xs transition-colors ${
                          isSelected ? 'bg-indigo-50/70 hover:bg-indigo-100/70' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="font-semibold text-slate-800">
                            {user.displayName} {user.nickname ? `(${user.nickname})` : ''}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">{user.email}</div>
                        </div>
                        <div className={`h-4 w-4 rounded border flex items-center justify-center ${
                          isSelected ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300'
                        }`}>
                          {isSelected && <span className="text-[10px]">✓</span>}
                        </div>
                      </button>
                    );
                  })
                ) : (
                  <div className="text-center py-6 text-slate-400 text-xs">ไม่พบรายชื่อพนักงานในระบบ</div>
                )}
              </div>
            </div>
          </div>

          {/* Informational Warning */}
          <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl flex items-start space-x-2.5">
            <Info className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <h4 className="font-bold text-amber-800 text-xs">
                {isAdmin ? 'การยืนยันการจองโดยแอดมิน' : 'ต้องได้รับการอนุมัติจากผู้ดูแลระบบ'}
              </h4>
              <p className="text-[11px] text-amber-700">
                {isAdmin 
                  ? 'คุณล็อกอินในฐานะผู้ดูแลระบบ การจองนี้จะได้รับการอนุมัติโดยอัตโนมัติและซิงค์ขึ้น Google Calendar ทันที' 
                  : 'เนื่องจากสิทธิ์ของคุณเป็นพนักงานทั่วไป การจองห้องนี้จะส่งเรื่องรอดำเนินการเพื่อให้แอดมินตรวจสอบก่อน จึงจะถูกซิงค์ไปยังปฏิทิน'}
              </p>
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSubmitForm}
            disabled={isSubmitting}
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50"
          >
            {isSubmitting ? (
              <span>กำลังบันทึก...</span>
            ) : (
              <span>ยืนยันการจอง</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
