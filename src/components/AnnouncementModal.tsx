import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  Users, 
  Megaphone, 
  Plane, 
  UserMinus, 
  AlertCircle, 
  Check, 
  Star,
  Info
} from 'lucide-react';
import { Booking, AnnouncementCategory, UserAccount } from '../types';
import { db, handleFirestoreError, OperationType } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { isKeyAttendee, sortAttendeesByPriority } from '../lib/permissions';

export interface AnnouncementModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string; // YYYY-MM-DD
  onSubmit: (data: Omit<Booking, 'id' | 'createdAt' | 'creatorEmail' | 'creatorName'>, editingBookingId?: string) => Promise<void>;
  currentUserEmail: string | null;
  currentUserName: string | null;
  isAdmin?: boolean;
  editingAnnouncement?: Booking | null;
  editingBooking?: Booking | null;
}

const CATEGORY_OPTIONS: Array<{ id: AnnouncementCategory; label: string; icon: any; color: string }> = [
  { id: 'travel', label: 'ไปต่างจังหวัด', icon: Plane, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'out_of_office', label: 'ไม่อยู่', icon: UserMinus, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'general', label: 'ข่าวสารทั่วไป', icon: Megaphone, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'urgent', label: 'สำคัญ / ด่วน', icon: AlertCircle, color: 'text-rose-600 bg-rose-50 border-rose-200' },
];

const COLOR_OPTIONS = [
  { id: 'purple', label: 'สีม่วง (Google Calendar)', bgClass: 'bg-purple-700 text-white', borderClass: 'border-purple-600 ring-purple-400' },
  { id: 'indigo', label: 'สีน้ำเงินคราม', bgClass: 'bg-indigo-600 text-white', borderClass: 'border-indigo-500 ring-indigo-300' },
  { id: 'emerald', label: 'สีเขียวมรกต', bgClass: 'bg-emerald-600 text-white', borderClass: 'border-emerald-500 ring-emerald-300' },
  { id: 'amber', label: 'สีส้มอำพัน', bgClass: 'bg-amber-600 text-white', borderClass: 'border-amber-500 ring-amber-300' },
  { id: 'rose', label: 'สีแดงกุหลาบ', bgClass: 'bg-rose-600 text-white', borderClass: 'border-rose-500 ring-rose-300' },
  { id: 'sky', label: 'สีฟ้าสดใส', bgClass: 'bg-sky-600 text-white', borderClass: 'border-sky-500 ring-sky-300' },
];

// Pre-defined VIP Executive accounts to ensure executives are always immediately selectable
const DEFAULT_VIP_EXECUTIVES: UserAccount[] = [
  { id: 'vip-meechai', email: 'meechai.chun@gmail.com', displayName: 'มีชัย ชุนหรักษ์โชติ', nickname: 'คุณมีชัย', role: 'admin' },
  { id: 'vip-supanee', email: 'supanee.chun@gmail.com', displayName: 'สุภาณี ชุนหรักษ์โชติ', nickname: 'คุณสุภาณี', role: 'admin' },
  { id: 'vip-supamet', email: 'supamet.c@ec.co.th', displayName: 'ศุภเมธ ชุนหรักษ์โชติ', nickname: 'คุณโอ', role: 'admin' },
  { id: 'vip-achira', email: 'achira.c@ec.co.th', displayName: 'อชิระ ชุนหรักษ์โชติ', nickname: 'คุณอชิ', role: 'admin' },
  { id: 'vip-chanatip', email: 'chanatip.h@ec.co.th', displayName: 'ชนาธิป หงษ์สมุทร', nickname: 'คุณอาร์ท', role: 'admin' },
  { id: 'vip-chompoonuch', email: 'chompoonuch.s@ec.co.th', displayName: 'ชมพูนุช ศักดิ์ศิริ', nickname: 'คุณนุช', role: 'admin' },
  { id: 'vip-tassanee', email: 'tassanee.t@ec.co.th', displayName: 'ทัศนีย์ ตาลสุข', nickname: 'คุณทัศ', role: 'admin' },
];

export default function AnnouncementModal({
  isOpen,
  onClose,
  initialDate,
  onSubmit,
  currentUserEmail,
  currentUserName,
  isAdmin = false,
  editingAnnouncement = null,
  editingBooking = null,
}: AnnouncementModalProps) {
  const activeEditing = editingAnnouncement || editingBooking;
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<AnnouncementCategory>('travel');
  const [isAllDay, setIsAllDay] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('08:00');
  const [endTime, setEndTime] = useState('17:00');
  const [color, setColor] = useState('purple');
  const [description, setDescription] = useState('');
  const [availableUsers, setAvailableUsers] = useState<UserAccount[]>([]);
  const [selectedAttendees, setSelectedAttendees] = useState<Array<{ email: string; displayName: string; nickname?: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Load registered users from Firestore for attendee selection
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const snap = await getDocs(collection(db, 'users'));
        const list: UserAccount[] = [];
        snap.forEach((d) => {
          list.push({ id: d.id, ...d.data() } as UserAccount);
        });
        setAvailableUsers(list);
      } catch (err) {
        console.warn('Unable to load users for announcement:', err);
      }
    };
    if (isOpen) {
      fetchUsers();
    }
  }, [isOpen]);

  // Filter and display ONLY VIP management/executives as requested
  const vipAttendees = useMemo(() => {
    // 1. Get all VIP users from loaded database users
    const fromDb = availableUsers.filter(u => isKeyAttendee(u.email));
    
    // 2. Supplement with any known VIP executives not yet in DB so they are always selectable
    const combined = [...fromDb];
    for (const defVip of DEFAULT_VIP_EXECUTIVES) {
      const alreadyExists = combined.some(u => {
        const uPrefix = u.email.toLowerCase().split('@')[0];
        const defPrefix = defVip.email.toLowerCase().split('@')[0];
        return u.email.toLowerCase() === defVip.email.toLowerCase() || uPrefix === defPrefix;
      });
      if (!alreadyExists) {
        combined.push(defVip);
      }
    }
    
    return sortAttendeesByPriority(combined);
  }, [availableUsers]);

  // Initialize or reset form state
  useEffect(() => {
    if (!isOpen) return;

    if (activeEditing) {
      setTitle(activeEditing.title || '');
      setDescription(activeEditing.description || '');
      setCategory(activeEditing.announcementCategory || 'travel');
      setIsAllDay(activeEditing.isAllDay !== false);
      setColor(activeEditing.color || 'purple');

      const sDate = activeEditing.startTime ? activeEditing.startTime.split('T')[0] : '';
      const eDate = activeEditing.endTime ? activeEditing.endTime.split('T')[0] : sDate;
      setStartDate(sDate);
      setEndDate(eDate);

      if (activeEditing.startTime && activeEditing.startTime.includes('T')) {
        setStartTime(activeEditing.startTime.split('T')[1].slice(0, 5));
      }
      if (activeEditing.endTime && activeEditing.endTime.includes('T')) {
        setEndTime(activeEditing.endTime.split('T')[1].slice(0, 5));
      }

      setSelectedAttendees(activeEditing.attendees || []);
    } else {
      const todayIso = initialDate || new Date().toISOString().split('T')[0];
      setTitle('');
      setDescription('');
      setCategory('travel');
      setIsAllDay(true);
      setStartDate(todayIso);
      setEndDate(todayIso);
      setStartTime('08:00');
      setEndTime('17:00');
      setColor('purple');

      // Default attendee to current user
      if (currentUserEmail) {
        setSelectedAttendees([{
          email: currentUserEmail,
          displayName: currentUserName || currentUserEmail.split('@')[0],
          nickname: currentUserName ? currentUserName.split(' ')[0] : 'ฉัน'
        }]);
      } else {
        setSelectedAttendees([]);
      }
    }
    setErrorMessage('');
  }, [isOpen, activeEditing, initialDate, currentUserEmail, currentUserName]);

  if (!isOpen) return null;

  const toggleAttendee = (user: UserAccount) => {
    const exists = selectedAttendees.some(a => a.email.toLowerCase() === user.email.toLowerCase());
    if (exists) {
      setSelectedAttendees(selectedAttendees.filter(a => a.email.toLowerCase() !== user.email.toLowerCase()));
    } else {
      setSelectedAttendees([...selectedAttendees, {
        email: user.email,
        displayName: user.displayName,
        nickname: user.nickname
      }]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isAdmin) {
      setErrorMessage('ขออภัยค่ะ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลงประกาศหรือแก้ไขประกาศข่าวสาร');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('กรุณาระบุหัวข้อประกาศ (เช่น ซ้อไปใต้, คุณสุภาณีไปเขาใหญ่)');
      return;
    }

    if (!startDate) {
      setErrorMessage('กรุณาระบุวันที่เริ่มต้น');
      return;
    }

    const actualEndDate = endDate || startDate;
    if (actualEndDate < startDate) {
      setErrorMessage('วันที่สิ้นสุดต้องไม่เกิดขึ้นก่อนวันที่เริ่มต้น');
      return;
    }

    let startIso: string;
    let endIso: string;

    if (isAllDay) {
      startIso = `${startDate}T00:00:00`;
      endIso = `${actualEndDate}T23:59:59`;
    } else {
      if (!startTime || !endTime) {
        setErrorMessage('กรุณาระบุเวลาเริ่มต้นและเวลาสิ้นสุด');
        return;
      }
      if (startDate === actualEndDate && startTime >= endTime) {
        setErrorMessage('เวลาสิ้นสุดต้องมากกว่าเวลาเริ่มต้น');
        return;
      }
      startIso = `${startDate}T${startTime}:00`;
      endIso = `${actualEndDate}T${endTime}:00`;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(
        {
          title: title.trim(),
          description: description.trim(),
          roomId: '', // No room required
          roomName: 'ประกาศ / แจ้งข่าวสาร',
          startTime: startIso,
          endTime: endIso,
          status: 'approved', // Auto-approved public announcement
          attendees: sortAttendeesByPriority(selectedAttendees),
          meetingType: 'none',
          meetingLink: '',
          isConfidential: false,
          entryType: 'announcement',
          isAllDay,
          announcementCategory: category,
          color,
        },
        activeEditing?.id
      );
      onClose();
    } catch (err: any) {
      console.error('Error saving announcement:', err);
      setErrorMessage(err?.message || 'เกิดข้อผิดพลาดในการบันทึกประกาศ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 z-50 overflow-y-auto animate-in fade-in duration-150">
      <div 
        id="announcement-modal-dialog"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full my-8 overflow-hidden text-slate-800 animate-in zoom-in-95 duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-linear-to-r from-purple-50 via-indigo-50/50 to-white">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-purple-600 text-white rounded-xl shadow-md shadow-purple-200">
              <Megaphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-slate-800">
                {activeEditing ? 'แก้ไขประกาศ / แจ้งข่าวสาร' : 'ลงประกาศ / แจ้งข่าวสาร'}
              </h2>
              <p className="text-xs text-slate-500">
                แจ้งให้พนักงานทุกคนทราบ เช่น ไปต่างจังหวัด, ไม่อยู่ (เฉพาะสิทธิ์ผู้ดูแลระบบ Admin)
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 text-xs flex items-start space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Title */}
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
              <span>หัวข้อประกาศ / แจ้งเรื่อง <span className="text-rose-500">*</span></span>
              <span className="text-[11px] font-normal text-slate-400">แสดงในแถบปฏิทิน</span>
            </label>
            <input
              type="text"
              id="announcement-title-input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="เช่น ซ้อไปใต้, คุณสุภาณีไปเขาใหญ่, คุณมีชัยนัดพบแพทย์ กทม."
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
              required
            />
          </div>

          {/* Category Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">หมวดหมู่</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {CATEGORY_OPTIONS.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-2 rounded-xl border text-left transition-all flex flex-col items-center justify-center text-center space-y-1 cursor-pointer ${
                      isSelected
                        ? `${cat.color} font-bold ring-2 ring-purple-400/40 shadow-xs`
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-[11px] leading-tight">{cat.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Date & Time Settings */}
          <div className="space-y-3 p-4 bg-slate-50/80 rounded-xl border border-slate-200">
            {/* All Day Toggle */}
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Calendar className="h-4 w-4 text-purple-600" />
                <span className="text-xs font-bold text-slate-700">ช่วงเวลาที่ประกาศ</span>
              </div>
              <label className="flex items-center space-x-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAllDay}
                  onChange={(e) => setIsAllDay(e.target.checked)}
                  className="w-4 h-4 text-purple-600 rounded border-slate-300 focus:ring-purple-500 cursor-pointer"
                />
                <span className="text-xs font-semibold text-slate-700">ตลอดทั้งวัน (All Day)</span>
              </label>
            </div>

            {/* Date Range Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  วันที่เริ่มต้น
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    if (!endDate || endDate < e.target.value) {
                      setEndDate(e.target.value);
                    }
                  }}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>

              <div>
                <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                  วันที่สิ้นสุด (กรณีหลายวัน เช่น 24 - 28)
                </label>
                <input
                  type="date"
                  value={endDate}
                  min={startDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  required
                />
              </div>
            </div>

            {/* Time range (if not all day) */}
            {!isAllDay && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    เวลาเริ่มต้น
                  </label>
                  <div className="relative">
                    <Clock className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                    เวลาสิ้นสุด
                  </label>
                  <div className="relative">
                    <Clock className="h-3.5 w-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                    <input
                      type="time"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Color Selection (Google Calendar Banner Style) */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700">สีแถบประกาศบนปฏิทิน</label>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
              {COLOR_OPTIONS.map((c) => {
                const isSelected = color === c.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center space-x-1 cursor-pointer ${c.bgClass} ${
                      isSelected ? 'ring-3 ring-offset-1 ' + c.borderClass : 'opacity-85 hover:opacity-100'
                    }`}
                  >
                    {isSelected && <Check className="h-3.5 w-3.5" />}
                    <span className="text-[11px] truncate">{c.id === 'purple' ? 'ม่วง' : c.label.replace('สี', '')}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Attendees / Person Involved (VIP Executives Only) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center space-x-1.5">
                <Users className="h-3.5 w-3.5 text-purple-600" />
                <span>บุคคลที่เกี่ยวข้อง (เฉพาะผู้บริหาร VIP)</span>
              </label>
              <span className="text-[11px] text-purple-700 font-semibold">
                {selectedAttendees.length > 0 ? `เลือกแล้ว ${selectedAttendees.length} ท่าน` : 'เฉพาะผู้บริหาร VIP'}
              </span>
            </div>

            <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl p-2 bg-slate-50/50 space-y-1.5">
              {vipAttendees.map((u) => {
                const isSelected = selectedAttendees.some(a => a.email.toLowerCase() === u.email.toLowerCase());
                return (
                  <div
                    key={u.id || u.email}
                    onClick={() => toggleAttendee(u)}
                    className={`flex items-center justify-between p-2 rounded-xl text-xs cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-purple-50 border border-purple-300 text-purple-900 font-semibold shadow-2xs'
                        : 'hover:bg-white text-slate-700 bg-white/80 border border-slate-200'
                    }`}
                  >
                    <div className="flex items-center space-x-2.5">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
                      />
                      <span className="font-semibold text-slate-800">
                        {u.displayName} {u.nickname ? `(${u.nickname})` : ''}
                      </span>
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shadow-2xs">
                        <Star className="h-2.5 w-2.5 mr-0.5 fill-amber-500 text-amber-500" />
                        VIP
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 font-mono">{u.email}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Description / Additional Notes */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">
              รายละเอียดเพิ่มเติม / หมายเหตุ (ถ้ามี)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="ระบุรายละเอียดเพิ่มเติม ช่องทางติดต่อสำรอง หรือผู้ปฏิบัติงานแทน..."
              rows={2}
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white transition-all"
            />
          </div>

          {/* No room required notice */}
          <div className="p-3 bg-purple-50/70 border border-purple-200 rounded-xl flex items-start space-x-2.5 text-xs text-purple-900">
            <Info className="h-4 w-4 text-purple-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-purple-800">ไม่ต้องเลือกห้องประชุม</p>
              <p className="text-[11px] text-purple-700 mt-0.5">
                ประกาศนี้จะถูกแสดงบนปฏิทินรวมของบริษัททันที เพื่อให้พนักงานทุกคนทราบและวางแผนงานร่วมกันได้อย่างราบรื่น
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-200 text-slate-700 font-bold rounded-xl text-xs hover:bg-slate-50 transition-all cursor-pointer"
            >
              ยกเลิก
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 py-2.5 px-4 bg-[#C084FC] hover:bg-[#A855F7] text-white font-bold rounded-xl text-xs transition-all shadow-[0_4px_14px_rgba(192,132,252,0.35)] hover:shadow-[0_6px_20px_rgba(192,132,252,0.45)] disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? 'กำลังบันทึก...' : (editingBooking ? 'บันทึกการแก้ไข' : 'บันทึกและลงประกาศ')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
