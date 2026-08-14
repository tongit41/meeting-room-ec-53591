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
  onSubmit: (bookingData: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>, editingBookingId?: string) => Promise<void>;
  currentUserEmail: string | null;
  currentUserName: string | null;
  isAdmin: boolean;
  bookings?: Booking[];
  editingBooking?: Booking | null;
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
  bookings = [],
  editingBooking = null
}: BookingModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [selectedRoomId, setSelectedRoomId] = useState<RoomId | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [dateMode, setDateMode] = useState<'range' | 'specific_days'>('range');
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5]); // Default Mon-Fri
  const [meetingPlatform, setMeetingPlatform] = useState<MeetingPlatform>('meet');
  const [customLink, setCustomLink] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserAccount[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<UserAccount[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const DAYS_OF_WEEK = [
    { id: 1, label: 'จ.', fullName: 'จันทร์' },
    { id: 2, label: 'อ.', fullName: 'อังคาร' },
    { id: 3, label: 'พ.', fullName: 'พุธ' },
    { id: 4, label: 'พฤ.', fullName: 'พฤหัสบดี' },
    { id: 5, label: 'ศ.', fullName: 'ศุกร์' },
    { id: 6, label: 'ส.', fullName: 'เสาร์' },
    { id: 0, label: 'อา.', fullName: 'อาทิตย์' },
  ];

  const calculateMatchingDates = (): string[] => {
    if (!startDate || !endDate || endDate < startDate) return [];
    const result: string[] = [];
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    const curr = new Date(start);

    while (curr <= end) {
      const year = curr.getFullYear();
      const month = String(curr.getMonth() + 1).padStart(2, '0');
      const day = String(curr.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      const dayOfWeek = curr.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat

      if (dateMode === 'range' || selectedDays.includes(dayOfWeek)) {
        result.push(dateStr);
      }
      curr.setDate(curr.getDate() + 1);
    }
    return result;
  };

  const matchingDates = calculateMatchingDates();

  // Hydrate fields on open/props change
  useEffect(() => {
    if (isOpen) {
      if (editingBooking) {
        setTitle(editingBooking.title || '');
        setDescription(editingBooking.description || '');
        setSelectedRoomId(editingBooking.roomId || '');
        
        const startParts = editingBooking.startTime ? editingBooking.startTime.split('T') : [];
        const endParts = editingBooking.endTime ? editingBooking.endTime.split('T') : [];
        setStartDate(startParts[0] || initialDate || '');
        setEndDate(endParts[0] || startParts[0] || initialDate || '');
        setStartTime(startParts[1] ? startParts[1].substring(0, 5) : '09:00');
        setEndTime(endParts[1] ? endParts[1].substring(0, 5) : '10:00');
        setMeetingPlatform(editingBooking.meetingType || 'meet');
        setCustomLink(editingBooking.meetingLink || '');
        setSelectedAttendees(editingBooking.attendees || []);
        setErrorMsg('');
      } else {
        setTitle('');
        setDescription('');
        setSelectedRoomId(initialRoomId || '');
        
        const now = new Date();
        const localYear = now.getFullYear();
        const localMonth = String(now.getMonth() + 1).padStart(2, '0');
        const localDay = String(now.getDate()).padStart(2, '0');
        const todayStr = `${localYear}-${localMonth}-${localDay}`;
        setStartDate(initialDate || todayStr);
        setEndDate(initialDate || todayStr);
        setStartTime('09:00');
        setEndTime('10:00');
        setMeetingPlatform('meet');
        setCustomLink('');
        setSelectedAttendees([]);
        setErrorMsg('');
      }
      
      // Fetch users from Firebase
      fetchUsers();
    }
  }, [isOpen, initialRoomId, initialDate, editingBooking]);

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

    if (!startDate || !endDate) {
      setErrorMsg('กรุณาเลือกวันที่เริ่มต้นและวันที่สิ้นสุดการจอง');
      return;
    }

    if (endDate < startDate) {
      setErrorMsg('วันที่สิ้นสุดการจองต้องไม่ย้อนหลังก่อนวันที่เริ่มต้น');
      return;
    }

    if (startTime >= endTime) {
      setErrorMsg('เวลาสิ้นสุดการประชุมต้องอยู่หลังเวลาเริ่มต้น');
      return;
    }

    if (meetingPlatform === 'external' && !customLink.trim()) {
      setErrorMsg('กรุณากรอกลิงก์ประชุมออนไลน์สำหรับช่องทางภายนอก');
      return;
    }

    if (dateMode === 'specific_days' && selectedDays.length === 0) {
      setErrorMsg('กรุณาเลือกวันในสัปดาห์ที่ต้องการจองอย่างน้อย 1 วัน');
      return;
    }

    const targetDates = calculateMatchingDates();
    if (targetDates.length === 0) {
      setErrorMsg('ไม่พบวันที่ตรงกับเงื่อนไขการจองในช่วงวันที่เลือก');
      return;
    }

    // Room Overlap Check (Only if a physical room is selected)
    if (selectedRoomId && bookings && bookings.length > 0) {
      if (dateMode === 'range') {
        const startISO = `${startDate}T${startTime}`;
        const endISO = `${endDate}T${endTime}`;

        const overlappingBooking = bookings.find(b => {
          if (editingBooking && b.id === editingBooking.id) return false;
          if (b.roomId !== selectedRoomId) return false;
          if (b.status === 'rejected') return false;
          return b.startTime < endISO && startISO < b.endTime;
        });

        if (overlappingBooking) {
          const oStartParts = overlappingBooking.startTime.split('T');
          const oEndParts = overlappingBooking.endTime.split('T');
          const oStartFormatted = oStartParts[0] === startDate ? `${oStartParts[1]} น.` : `${oStartParts[0]} ${oStartParts[1]} น.`;
          const oEndFormatted = oEndParts[0] === endDate ? `${oEndParts[1]} น.` : `${oEndParts[0]} ${oEndParts[1]} น.`;

          setErrorMsg(
            `ห้องประชุมนี้ถูกจองไว้แล้วในช่วงเวลาดังกล่าว\n\nหัวข้อที่ทับซ้อน: ${overlappingBooking.title}\nเวลา: ${oStartFormatted} - ${oEndFormatted}`
          );
          return;
        }
      } else {
        // Specific days check
        for (const d of targetDates) {
          const startISO = `${d}T${startTime}`;
          const endISO = `${d}T${endTime}`;

          const overlappingBooking = bookings.find(b => {
            if (editingBooking && b.id === editingBooking.id) return false;
            if (b.roomId !== selectedRoomId) return false;
            if (b.status === 'rejected') return false;
            return b.startTime < endISO && startISO < b.endTime;
          });

          if (overlappingBooking) {
            const oStartParts = overlappingBooking.startTime.split('T');
            const oEndParts = overlappingBooking.endTime.split('T');
            const oStartFormatted = `${oStartParts[0]} ${oStartParts[1]} น.`;
            const oEndFormatted = `${oEndParts[0]} ${oEndParts[1]} น.`;

            setErrorMsg(
              `ห้องประชุมนี้ถูกจองไว้แล้วในวันที่ ${d}\n\nหัวข้อที่ทับซ้อน: ${overlappingBooking.title}\nเวลา: ${oStartFormatted} - ${oEndFormatted}`
            );
            return;
          }
        }
      }
    }

    setIsSubmitting(true);
    try {
      const selectedRoom = rooms.find(r => r.id === selectedRoomId);
      const roomName = selectedRoom ? selectedRoom.name : 'ไม่ระบุห้องประชุม / ออนไลน์';

      // Auto link format or custom link
      let finalLink = customLink;
      if (meetingPlatform === 'meet') {
        finalLink = editingBooking ? (editingBooking.meetingLink || '') : '';
      }

      // Attendees mapping
      const mappedAttendees = selectedAttendees.map(a => ({
        email: a.email,
        displayName: a.displayName,
        nickname: a.nickname
      }));

      if (dateMode === 'range' || targetDates.length === 1) {
        const startISO = `${startDate}T${startTime}`;
        const endISO = `${endDate}T${endTime}`;

        await onSubmit({
          title,
          description,
          roomId: selectedRoomId as RoomId,
          roomName,
          startTime: startISO,
          endTime: endISO,
          status: editingBooking ? editingBooking.status : (isAdmin ? 'approved' : 'pending'),
          attendees: mappedAttendees,
          meetingType: meetingPlatform,
          meetingLink: finalLink
        }, editingBooking?.id);
      } else {
        // Multi-day specific creation/update
        if (editingBooking) {
          const firstDate = targetDates[0];
          await onSubmit({
            title,
            description,
            roomId: selectedRoomId as RoomId,
            roomName,
            startTime: `${firstDate}T${startTime}`,
            endTime: `${firstDate}T${endTime}`,
            status: editingBooking.status,
            attendees: mappedAttendees,
            meetingType: meetingPlatform,
            meetingLink: finalLink
          }, editingBooking.id);

          for (let i = 1; i < targetDates.length; i++) {
            const d = targetDates[i];
            await onSubmit({
              title,
              description,
              roomId: selectedRoomId as RoomId,
              roomName,
              startTime: `${d}T${startTime}`,
              endTime: `${d}T${endTime}`,
              status: isAdmin ? 'approved' : 'pending',
              attendees: mappedAttendees,
              meetingType: meetingPlatform,
              meetingLink: finalLink
            });
          }
        } else {
          for (const d of targetDates) {
            await onSubmit({
              title,
              description,
              roomId: selectedRoomId as RoomId,
              roomName,
              startTime: `${d}T${startTime}`,
              endTime: `${d}T${endTime}`,
              status: isAdmin ? 'approved' : 'pending',
              attendees: mappedAttendees,
              meetingType: meetingPlatform,
              meetingLink: finalLink
            });
          }
        }
      }

      onClose();
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'เกิดข้อผิดพลาดในการบันทึกข้อมูล');
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
            <h3 className="font-bold text-slate-800 text-lg">
              {editingBooking ? 'แก้ไขกิจกรรมการจองห้องประชุม' : 'จองห้องประชุมใหม่'}
            </h3>
            <p className="text-xs text-slate-500">
              {editingBooking ? 'ปรับเปลี่ยนเวลา ห้องประชุม หรือรายละเอียดกิจกรรม' : 'กรอกข้อมูลเพื่อสร้างกิจกรรมจองและเลือกช่องทางประชุม'}
            </p>
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

          {/* Room Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-slate-600">เลือกห้องประชุม (ไม่บังคับ)</label>
              <span className="text-[10px] text-slate-400">เลือก "ไม่ระบุห้องประชุม" สำหรับประชุมออนไลน์หรือนอกสถานที่</span>
            </div>
            <div className="relative">
              <select 
                value={selectedRoomId}
                onChange={e => setSelectedRoomId(e.target.value as RoomId | '')}
                className="w-full appearance-none px-3.5 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white cursor-pointer"
              >
                <option value="">-- ไม่ระบุห้องประชุม (ประชุมออนไลน์ / นอกสถานที่) --</option>
                {rooms.map(r => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="h-4 w-4 text-slate-400 absolute right-3.5 top-3 pointer-events-none" />
            </div>
          </div>

          {/* Date & Time Range Selection */}
          <div className="space-y-3.5 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="block text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-indigo-600" />
                <span>รูปแบบการเลือกวันที่ต้องการจอง *</span>
              </label>

              {/* Date Selection Mode Switcher */}
              <div className="flex items-center bg-slate-200/70 p-1 rounded-lg text-xs">
                <button
                  type="button"
                  onClick={() => setDateMode('range')}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    dateMode === 'range'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  ช่วงวันต่อเนื่อง
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDateMode('specific_days');
                    // Auto-set 1 month duration if startDate and endDate are identical or invalid
                    if (!endDate || endDate <= startDate) {
                      const base = startDate ? new Date(startDate + 'T00:00:00') : new Date();
                      base.setMonth(base.getMonth() + 1);
                      const y = base.getFullYear();
                      const m = String(base.getMonth() + 1).padStart(2, '0');
                      const d = String(base.getDate()).padStart(2, '0');
                      setEndDate(`${y}-${m}-${d}`);
                    }
                  }}
                  className={`px-2.5 py-1 rounded-md font-semibold transition-all cursor-pointer ${
                    dateMode === 'specific_days'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  เลือกตามวันในสัปดาห์
                </button>
              </div>
            </div>

            {/* Date Inputs */}
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {dateMode === 'specific_days' ? 'วันที่เริ่มนับการจอง *' : 'วันที่เริ่มต้น *'}
                  </label>
                  <input 
                    type="date"
                    required
                    value={startDate}
                    onChange={e => {
                      const val = e.target.value;
                      setStartDate(val);
                      if (!endDate || endDate < val) {
                        setEndDate(val);
                      }
                    }}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                    {dateMode === 'specific_days' ? 'วันที่สิ้นสุดช่วงเวลา *' : 'วันที่สิ้นสุด *'}
                  </label>
                  <input 
                    type="date"
                    required
                    min={startDate}
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white"
                  />
                </div>
              </div>

              {/* Quick Period Presets for Specific Days Mode */}
              {dateMode === 'specific_days' && (
                <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-medium text-slate-500">ขยายช่วงเวลาสร้างรายการ:</span>
                  {[
                    { label: '+1 สัปดาห์', weeks: 1, months: 0 },
                    { label: '+2 สัปดาห์', weeks: 2, months: 0 },
                    { label: '+1 เดือน', weeks: 0, months: 1 },
                    { label: '+2 เดือน', weeks: 0, months: 2 },
                    { label: '+3 เดือน', weeks: 0, months: 3 },
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => {
                        const base = startDate ? new Date(startDate + 'T00:00:00') : new Date();
                        if (p.weeks > 0) base.setDate(base.getDate() + p.weeks * 7 - 1);
                        if (p.months > 0) base.setMonth(base.getMonth() + p.months);
                        const y = base.getFullYear();
                        const m = String(base.getMonth() + 1).padStart(2, '0');
                        const d = String(base.getDate()).padStart(2, '0');
                        setEndDate(`${y}-${m}-${d}`);
                      }}
                      className="text-[10px] font-semibold bg-white text-indigo-700 hover:bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Day of Week Selection (Only when mode === 'specific_days') */}
            {dateMode === 'specific_days' && (
              <div className="space-y-2 pt-2 border-t border-slate-200/60">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-bold text-slate-700">
                    เลือกระบุวันในสัปดาห์ (เช่น จันทร์, พุธ, ศุกร์) *
                  </label>
                  <div className="flex items-center space-x-2 text-[10px]">
                    <button
                      type="button"
                      onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                      className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      วันทำการ (จ.-ศ.)
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([0, 1, 2, 3, 4, 5, 6])}
                      className="text-indigo-600 hover:underline font-semibold cursor-pointer"
                    >
                      ทุกวัน
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={() => setSelectedDays([])}
                      className="text-rose-500 hover:underline font-semibold cursor-pointer"
                    >
                      ล้าง
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-7 gap-1.5">
                  {DAYS_OF_WEEK.map(d => {
                    const isSelected = selectedDays.includes(d.id);
                    return (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedDays(selectedDays.filter(id => id !== d.id));
                          } else {
                            setSelectedDays([...selectedDays, d.id]);
                          }
                        }}
                        className={`py-2 px-1 text-center rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs ring-2 ring-indigo-500/20'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                        title={d.fullName}
                      >
                        {d.label}
                      </button>
                    );
                  })}
                </div>

                {/* Calculation preview */}
                {matchingDates.length > 0 ? (
                  <div className="bg-indigo-50/80 border border-indigo-200/80 p-2 rounded-lg text-xs text-indigo-900 flex items-center justify-between">
                    <span className="font-semibold">
                      🗓️ รวมเป็นรายการจองทั้งหมด <strong>{matchingDates.length} วัน</strong>
                    </span>
                    <span className="text-[10px] text-indigo-700 bg-white px-2 py-0.5 rounded border border-indigo-200 font-mono">
                      {matchingDates.length <= 3 
                        ? matchingDates.join(', ')
                        : `${matchingDates.slice(0, 3).join(', ')} ... (${matchingDates[matchingDates.length - 1]})`}
                    </span>
                  </div>
                ) : (
                  <p className="text-[11px] text-rose-500 font-semibold">
                    * กรุณาเลือกระบุวันในสัปดาห์อย่างน้อย 1 วัน
                  </p>
                )}
              </div>
            )}

            {/* Time Slot Selection */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200/50">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">เวลาเริ่มต้น *</label>
                <div className="relative">
                  <select
                    value={startTime}
                    onChange={e => setStartTime(e.target.value)}
                    className="w-full appearance-none px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white cursor-pointer"
                  >
                    {timeSlots.map(slot => (
                      <option key={`start-${slot}`} value={slot}>{slot} น.</option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">เวลาสิ้นสุด *</label>
                <div className="relative">
                  <select
                    value={endTime}
                    onChange={e => setEndTime(e.target.value)}
                    className="w-full appearance-none px-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-white cursor-pointer"
                  >
                    {timeSlots.map(slot => (
                      <option key={`end-${slot}`} value={slot}>{slot} น.</option>
                    ))}
                  </select>
                  <ChevronDown className="h-3.5 w-3.5 text-slate-400 absolute right-3 top-2.5 pointer-events-none" />
                </div>
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
            className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? (
              <span>กำลังบันทึก...</span>
            ) : (
              <span>{editingBooking ? 'บันทึกการแก้ไข' : 'ยืนยันการจอง'}</span>
            )}
          </button>
        </div>

      </div>
    </div>
  );
}
