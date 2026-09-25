import React, { useState, useEffect } from 'react';
import { 
  CalendarX, 
  X, 
  Clock, 
  MapPin, 
  User, 
  Users, 
  AlertTriangle, 
  CheckCircle2, 
  Mail, 
  Video, 
  Calendar, 
  Loader2, 
  FileText, 
  Sparkles,
  ArrowRight,
  ShieldAlert,
  Megaphone
} from 'lucide-react';
import { Booking } from '../types';
import { formatThaiDateRange } from '../lib/googleCalendar';

interface CancelBookingModalProps {
  isOpen: boolean;
  booking: Booking | null;
  onClose: () => void;
  onConfirm: (reason: string, notifyByEmail: boolean) => Promise<void>;
  currentUserName?: string;
  currentUserEmail?: string;
}

const PRESET_REASONS = [
  { id: 'reschedule', label: 'ขอเลื่อนกำหนดการประชุม', icon: '🔄' },
  { id: 'urgent_conflict', label: 'ติดภารกิจด่วน / ไม่สะดวก', icon: '🚨' },
  { id: 'room_change', label: 'เปลี่ยนสถานที่ / ย้ายห้องประชุม', icon: '🏢' },
  { id: 'task_completed', label: 'เสร็จสิ้นภารกิจ / ไม่ต้องใช้ห้องแล้ว', icon: '✅' },
  { id: 'attendee_unavailable', label: 'ผู้เข้าร่วมติดธุระ / ขอยกเลิก', icon: '👥' },
];

export default function CancelBookingModal({
  isOpen,
  booking,
  onClose,
  onConfirm,
  currentUserName,
  currentUserEmail,
}: CancelBookingModalProps) {
  const [selectedPreset, setSelectedPreset] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState<string>('');
  const [notifyByEmail, setNotifyByEmail] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Reset state when modal opens or booking changes
  useEffect(() => {
    if (isOpen) {
      setSelectedPreset(null);
      setCustomReason('');
      setNotifyByEmail(true);
      setIsSubmitting(false);
    }
  }, [isOpen, booking?.id]);

  if (!isOpen || !booking) return null;

  const isAnnouncement = booking.entryType === 'announcement';
  const attendeeCount = booking.attendees ? booking.attendees.length : 0;
  
  // Calculate duration
  const getDurationText = (startStr: string, endStr: string) => {
    try {
      const s = new Date(startStr).getTime();
      const e = new Date(endStr).getTime();
      if (isNaN(s) || isNaN(e) || e <= s) return '';
      const diffMins = Math.round((e - s) / (1000 * 60));
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      if (hours > 0 && mins > 0) return `${hours} ชม. ${mins} นาที`;
      if (hours > 0) return `${hours} ชั่วโมง`;
      return `${mins} นาที`;
    } catch {
      return '';
    }
  };

  const durationStr = getDurationText(booking.startTime, booking.endTime);

  const handleSelectPreset = (presetLabel: string) => {
    if (selectedPreset === presetLabel) {
      setSelectedPreset(null);
      setCustomReason('');
    } else {
      setSelectedPreset(presetLabel);
      setCustomReason(presetLabel);
    }
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const finalReason = customReason.trim() || selectedPreset || (isAnnouncement ? 'ลบประกาศข่าวสาร' : 'ยกเลิกการจองห้องประชุม');
      await onConfirm(finalReason, notifyByEmail);
    } catch (err) {
      console.error('Cancellation error:', err);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/70 backdrop-blur-md transition-all animate-in fade-in duration-200">
      <div 
        className="bg-white rounded-2xl sm:rounded-3xl border border-slate-200/90 shadow-2xl max-w-xl w-full flex flex-col max-h-[92vh] overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Top Header */}
        <div className="relative px-5 sm:px-6 pt-5 pb-4 bg-gradient-to-b from-rose-50/70 via-rose-50/30 to-white border-b border-rose-100/80 flex items-start justify-between gap-4">
          <div className="flex items-center space-x-3.5">
            <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-lg shadow-rose-200 shrink-0">
              {isAnnouncement ? (
                <Megaphone className="w-6 h-6" />
              ) : (
                <CalendarX className="w-6 h-6" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg sm:text-xl font-extrabold text-slate-800 tracking-tight">
                  {isAnnouncement ? 'ลบประกาศข่าวสาร' : 'ยกเลิกการจองห้องประชุม'}
                </h3>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-100 text-rose-700 border border-rose-200">
                  ยกเลิกรายการ
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                {isAnnouncement 
                  ? 'ตรวจสอบรายละเอียดและยืนยันการลบประกาศออกจากปฏิทิน' 
                  : 'ระบุเหตุผลและยืนยันการยกเลิก เพื่อแจ้งเตือนผู้เข้าร่วมและเปิดห้องให้ว่าง'}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            title="ปิดหน้าต่าง"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 text-slate-700 divide-y divide-slate-100">
          
          {/* Section 1: Meeting Details Card */}
          <div className="bg-gradient-to-br from-slate-50 via-white to-rose-50/20 border border-slate-200/80 rounded-2xl p-4 sm:p-4.5 space-y-3.5 shadow-sm">
            {/* Top row: Status & Room */}
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg text-xs font-bold bg-white border border-slate-200 text-slate-800 shadow-2xs">
                  <MapPin className="w-3.5 h-3.5 text-rose-500" />
                  <span>{booking.roomName || 'ห้องประชุม'}</span>
                </span>
                {durationStr && (
                  <span className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600">
                    ⏱️ {durationStr}
                  </span>
                )}
              </div>

              {/* Status Badge */}
              <div>
                {booking.status === 'approved' ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                    <CheckCircle2 className="w-3 h-3" />
                    <span>อนุมัติแล้ว</span>
                  </span>
                ) : booking.status === 'pending' ? (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                    <Clock className="w-3 h-3" />
                    <span>รอการอนุมัติ</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                    <span>ปฏิเสธ/ยกเลิก</span>
                  </span>
                )}
              </div>
            </div>

            {/* Meeting Title */}
            <div>
              <h4 className="text-base sm:text-lg font-bold text-slate-900 leading-snug">
                {booking.title}
              </h4>
              {booking.description && (
                <p className="text-xs text-slate-500 mt-1 line-clamp-2 italic">
                  "{booking.description}"
                </p>
              )}
            </div>

            {/* Information Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 text-xs text-slate-600">
              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-xl border border-slate-150">
                <Clock className="w-4 h-4 text-indigo-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5">
                  <span className="font-semibold text-slate-700">วันและเวลานัดหมาย:</span>
                  <p className="text-slate-900 font-medium">
                    {formatThaiDateRange(booking.startTime, booking.endTime)}
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-2 bg-white/80 p-2.5 rounded-xl border border-slate-150">
                <User className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />
                <div className="space-y-0.5 overflow-hidden">
                  <span className="font-semibold text-slate-700">ผู้จอง / ผู้จัด:</span>
                  <p className="text-slate-900 font-medium truncate" title={booking.creatorEmail}>
                    {booking.creatorName || booking.creatorEmail}
                  </p>
                </div>
              </div>
            </div>

            {/* Attendees & Sync Badges */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {attendeeCount > 0 ? (
                <div className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-100 text-xs font-semibold">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>ผู้เข้าร่วม {attendeeCount} ท่าน</span>
                  {booking.attendees && (
                    <span className="text-[11px] text-indigo-500 max-w-[220px] truncate">
                      ({booking.attendees.map(a => a.nickname || a.displayName?.split(' ')[0] || a.email.split('@')[0]).join(', ')})
                    </span>
                  )}
                </div>
              ) : (
                <span className="text-[11px] text-slate-400">
                  ไม่มีผู้เข้าร่วมอื่น
                </span>
              )}

              {booking.googleEventId && (
                <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-sky-50 text-sky-700 border border-sky-100 text-[11px] font-medium ml-auto">
                  <Calendar className="w-3 h-3 text-sky-600" />
                  <span>Google Calendar Sync</span>
                </span>
              )}
            </div>
          </div>

          {/* Section 2: Cancellation Reason Form */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1.5">
                <span>เหตุผลในการยกเลิก</span>
                <span className="text-[11px] font-normal text-rose-600 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100">
                  แจ้งให้ผู้เข้าร่วมทราบ
                </span>
              </label>
              {customReason && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPreset(null);
                    setCustomReason('');
                  }}
                  className="text-[11px] text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                >
                  ล้างข้อความ
                </button>
              )}
            </div>

            {/* Quick Reason Chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRESET_REASONS.map(preset => {
                const isSelected = selectedPreset === preset.label;
                return (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleSelectPreset(preset.label)}
                    className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-rose-600 text-white shadow-sm shadow-rose-200 border border-rose-600 scale-[1.02]'
                        : 'bg-slate-100 hover:bg-slate-200/80 text-slate-700 border border-slate-200/80'
                    }`}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Reason Textarea */}
            <div className="relative">
              <textarea
                value={customReason}
                onChange={(e) => {
                  setCustomReason(e.target.value);
                  if (selectedPreset && e.target.value !== selectedPreset) {
                    setSelectedPreset(null);
                  }
                }}
                rows={3}
                placeholder="พิมพ์ระบุเหตุผลหรือข้อความเพิ่มเติมที่ต้องการแจ้งให้ผู้เข้าร่วมประชุมทราบ (ไม่บังคับ)..."
                className="w-full text-xs sm:text-sm p-3 rounded-xl border border-slate-200 bg-slate-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 text-slate-800 transition-all placeholder:text-slate-400"
              />
            </div>
          </div>

          {/* Section 3: Notification Options & Warning Notice */}
          <div className="pt-4 space-y-3">
            {/* Email Notification Toggle */}
            <label className="flex items-start space-x-3 p-3 rounded-xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200/80 cursor-pointer transition-colors">
              <input
                type="checkbox"
                checked={notifyByEmail}
                onChange={(e) => setNotifyByEmail(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
              />
              <div className="space-y-0.5 flex-1">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-800">
                  <Mail className="w-3.5 h-3.5 text-indigo-600" />
                  <span>ส่งอีเมลแจ้งยกเลิกให้ผู้เกี่ยวข้องทุกคนทันที</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  ระบบจะส่งอีเมลแจ้งเตือนพร้อมระบุเหตุผลการยกเลิกไปยังผู้จอง 
                  {attendeeCount > 0 ? ` และผู้เข้าร่วมประชุมอีก ${attendeeCount} ท่าน` : ''}
                </p>
              </div>
            </label>

            {/* Permanent Cancellation Warning */}
            <div className="flex items-start space-x-2.5 p-3 rounded-xl bg-rose-50/80 border border-rose-200/70 text-rose-900">
              <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
              <div className="text-[11px] sm:text-xs leading-relaxed space-y-0.5">
                <span className="font-bold text-rose-700">คำเตือน:</span>
                <p className="text-rose-800">
                  การกดยกเลิกจะนำข้อมูลการจองออกจากระบบ และลบกิจกรรมออกจาก Google Calendar 
                  พร้อมทั้งเปิดห้องประชุมให้ผู้อื่นสามารถจองได้ทันที
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="px-5 sm:px-6 py-4 bg-slate-50 border-t border-slate-200/80 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-bold text-xs sm:text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            ไม่ยกเลิก / ย้อนกลับ
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 active:scale-[0.98] text-white font-bold text-xs sm:text-sm transition-all cursor-pointer shadow-lg shadow-rose-200 flex items-center justify-center space-x-2 disabled:opacity-60"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>กำลังดำเนินการยกเลิก...</span>
              </>
            ) : (
              <>
                <CalendarX className="w-4 h-4" />
                <span>ยืนยันยกเลิกการประชุม</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
