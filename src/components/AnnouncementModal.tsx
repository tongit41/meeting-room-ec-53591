import React, { useState, useEffect } from 'react';
import { 
  X, 
  Calendar, 
  Clock, 
  Megaphone, 
  Plane, 
  UserMinus, 
  AlertCircle, 
  Info
} from 'lucide-react';
import { Booking, AnnouncementCategory } from '../types';
import { sortAttendeesByPriority } from '../lib/permissions';

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
  { id: 'travel', label: 'ท่องเที่ยว', icon: Plane, color: 'text-purple-600 bg-purple-50 border-purple-200' },
  { id: 'out_of_office', label: 'ไม่อยู่', icon: UserMinus, color: 'text-amber-600 bg-amber-50 border-amber-200' },
  { id: 'general', label: 'ข่าวสารทั่วไป', icon: Megaphone, color: 'text-indigo-600 bg-indigo-50 border-indigo-200' },
  { id: 'urgent', label: 'สำคัญ / ด่วน', icon: AlertCircle, color: 'text-rose-600 bg-rose-50 border-rose-200' },
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
  const [selectedAttendees, setSelectedAttendees] = useState<Array<{ email: string; displayName: string; nickname?: string }>>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!isAdmin) {
      setErrorMessage('ขออภัยค่ะ เฉพาะผู้ดูแลระบบ (Admin) เท่านั้นที่มีสิทธิ์ลงประกาศหรือแก้ไขประกาศข่าวสาร');
      return;
    }

    if (!title.trim()) {
      setErrorMessage('กรุณาระบุหัวข้อประกาศ');
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
              placeholder="รายละเอียดเพิ่มเติม...."
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
