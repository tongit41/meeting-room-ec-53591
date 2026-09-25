import React, { useState, useEffect } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  User, 
  Calendar, 
  AlertCircle, 
  Loader2, 
  ShieldCheck,
  Video
} from 'lucide-react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { signInAnonymously } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { Booking } from '../types';
import { 
  formatThaiDateTime, 
  formatThaiDateRange,
  createGoogleCalendarEvent, 
  sendEmailNotification,
  sendBookingNotifications
} from '../lib/googleCalendar';

interface QuickActionModalProps {
  action: 'approve' | 'reject' | 'view';
  bookingId: string;
  approvalKey: string;
  currentUserId?: string | null;
  currentUserEmail?: string | null;
  currentUserDisplayName?: string | null;
  isAdmin: boolean;
  onClose: () => void;
  onBookingUpdated?: (updatedBooking: Booking) => void;
  resolveToken: () => Promise<string>;
}

export default function QuickActionModal({
  action,
  bookingId,
  approvalKey,
  currentUserEmail,
  currentUserDisplayName,
  isAdmin,
  onClose,
  onBookingUpdated,
  resolveToken
}: QuickActionModalProps) {
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [statusState, setStatusState] = useState<'idle' | 'processing' | 'success' | 'failed'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');
  
  // Rejection Form States
  const [selectedPresetReason, setSelectedPresetReason] = useState<string>('ห้องติดภารกิจอื่น');
  const [customReason, setCustomReason] = useState<string>('');
  const [isSubmittingReject, setIsSubmittingReject] = useState(false);

  // Preset reject reasons
  const presetReasons = [
    'ห้องติดภารกิจด่วนของผู้บริหาร',
    'เวลาทับซ้อนกับการประชุมอื่น',
    'ห้องปิดปรับปรุง/ซ่อมบำรุง',
    'อยู่นอกเวลาทำการ',
    'ระบุเหตุผลอื่นๆ'
  ];

  // Helper to ensure authenticated state for Firestore Rules
  const ensureAuth = async () => {
    if (!auth.currentUser) {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.warn('Anonymous sign-in for quick action:', err);
      }
    }
  };

  // Fetch Booking Document
  useEffect(() => {
    let isMounted = true;

    async function fetchBookingData() {
      setLoading(true);
      setError(null);

      try {
        await ensureAuth();
        const docRef = doc(db, 'bookings', bookingId);
        const snap = await getDoc(docRef);

        if (!snap.exists()) {
          if (isMounted) setError('ไม่พบข้อมูลรายการจองนี้ หรือรายการอาจถูกลบไปแล้ว');
          setLoading(false);
          return;
        }

        const data = { id: snap.id, ...snap.data() } as Booking;
        if (isMounted) {
          setBooking(data);

          // Verify approval key if not logged in as admin
          const hasValidKey = (data.approvalKey && data.approvalKey === approvalKey);
          if (!hasValidKey && !isAdmin) {
            setError('รหัสยืนยันคำขอไม่ถูกต้อง หรือลิงก์การอนุมัตินี้ไม่ถูกต้อง');
            setLoading(false);
            return;
          }

          // If action is approve and status is pending, execute auto approval
          if (action === 'approve' && data.status === 'pending') {
            executeApprove(data);
          } else {
            setLoading(false);
          }
        }
      } catch (err: any) {
        console.error('Fetch booking error:', err);
        if (isMounted) {
          setError(`ไม่สามารถโหลดข้อมูลคำขอได้: ${err?.message || 'Network error'}`);
          setLoading(false);
        }
      }
    }

    fetchBookingData();

    return () => {
      isMounted = false;
    };
  }, [bookingId, approvalKey]);

  // Execute Approval
  const executeApprove = async (bData: Booking) => {
    setStatusState('processing');
    setStatusMessage('กำลังบันทึกการอนุมัติและซิงค์กับ Google Calendar...');

    try {
      await ensureAuth();
      const activeToken = await resolveToken();

      let updatedGoogleEventId = bData.googleEventId || '';
      let updatedMeetingLink = bData.meetingLink || '';

      // Sync with Google Calendar if token available and not synced yet
      if (activeToken && !bData.googleEventId) {
        try {
          const calResult = await createGoogleCalendarEvent(activeToken, bData, bData.id);
          updatedGoogleEventId = calResult.eventId;
          if (bData.meetingType === 'meet' && calResult.meetingLink) {
            updatedMeetingLink = calResult.meetingLink;
          }
        } catch (calErr) {
          console.warn('Google Calendar sync in quick approve warning:', calErr);
        }
      }

      const approverName = currentUserDisplayName || 
        (currentUserEmail === 'ec.co.hr.2018@gmail.com' ? 'HR Admin (ec.co.hr.2018@gmail.com)' : 'Admin (ec.co.hr.2018@gmail.com)');

      const bookingRef = doc(db, 'bookings', bData.id);
      const updateData: Partial<Booking> = {
        status: 'approved',
        googleEventId: updatedGoogleEventId,
        meetingLink: updatedMeetingLink,
        approvedBy: approverName
      };

      await updateDoc(bookingRef, updateData);

      const updatedBooking: Booking = {
        ...bData,
        ...updateData
      };
      setBooking(updatedBooking);
      if (onBookingUpdated) onBookingUpdated(updatedBooking);

      // Send confirmation emails to creator and all attendees
      if (activeToken) {
        try {
          const bookingToNotify = {
            ...bData,
            meetingLink: updatedMeetingLink || bData.meetingLink
          };
          await sendBookingNotifications(activeToken, bookingToNotify as Booking);
        } catch (mailErr) {
          console.warn('Mail send error in quick approve:', mailErr);
        }
      }

      setStatusState('success');
      setStatusMessage('อนุมัติการจองห้องประชุมเรียบร้อยแล้ว พร้อมส่งอีเมลแจ้งเตือนถึงผู้จัดและผู้เข้าร่วมเรียบร้อยค่ะ');
    } catch (err: any) {
      console.error('Approve failed:', err);
      setStatusState('failed');
      setStatusMessage(`ไม่สามารถอนุมัติได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setLoading(false);
    }
  };

  // Execute Reject
  const handleConfirmReject = async () => {
    if (!booking) return;

    const finalReason = selectedPresetReason === 'ระบุเหตุผลอื่นๆ'
      ? customReason.trim()
      : selectedPresetReason;

    if (!finalReason) {
      alert('กรุณาระบุเหตุผลการปฏิเสธคำขอ');
      return;
    }

    setIsSubmittingReject(true);
    setStatusState('processing');
    setStatusMessage('กำลังบันทึกการปฏิเสธคำขอ...');

    try {
      await ensureAuth();
      const activeToken = await resolveToken();

      const bookingRef = doc(db, 'bookings', booking.id);
      const updateData: Partial<Booking> = {
        status: 'rejected',
        rejectedReason: finalReason,
        googleEventId: '',
        approvedBy: ''
      };

      await updateDoc(bookingRef, updateData);

      const updatedBooking: Booking = {
        ...booking,
        ...updateData
      };
      setBooking(updatedBooking);
      if (onBookingUpdated) onBookingUpdated(updatedBooking);

      // Send rejection notification email to creator
      if (activeToken && booking.creatorEmail) {
        try {
          const emailSubject = `[ปฏิเสธการจอง] รายการจองห้องประชุม: ${booking.title}`;
          const emailBodyHtml = `
            <div style="font-family: 'Prompt', 'Helvetica Neue', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
              <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ef4444;">
                <h2 style="color: #ef4444; margin: 0; font-size: 20px;">ปฏิเสธคำขอจองห้องประชุม</h2>
              </div>
              <div style="padding: 20px 0; color: #334155; line-height: 1.6;">
                <p>เรียน คุณ <strong>${booking.creatorName || booking.creatorEmail}</strong>,</p>
                <p>ขออภัยด้วยค่ะ รายการจองห้องประชุมของคุณได้รับการปฏิเสธ โดยมีรายละเอียดดังนี้:</p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0; font-size: 14px;">
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; width: 120px; color: #64748b;">หัวข้อกิจกรรม:</td>
                    <td style="padding: 8px 0;">${booking.title}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">ห้องประชุม:</td>
                    <td style="padding: 8px 0;">${booking.roomName}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #64748b;">วันและเวลา:</td>
                    <td style="padding: 8px 0;">${formatThaiDateRange(booking.startTime, booking.endTime)}</td>
                  </tr>
                  <tr>
                    <td style="padding: 8px 0; font-weight: bold; color: #ef4444;">เหตุผลที่ปฏิเสธ:</td>
                    <td style="padding: 8px 0; font-weight: bold; color: #b91c1c;">${finalReason}</td>
                  </tr>
                </table>
                <p style="margin-top: 20px; color: #64748b; font-size: 13px;">
                  หากท่านต้องการเลือกช่วงเวลาหรือห้องประชุมอื่น สามารถเข้าสู่ระบบเพื่อสร้างคำขอจองใหม่ได้ตลอดเวลาค่ะ
                </p>
              </div>
              <div style="text-align: center; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
                <p>อีเมลส่งโดยระบบอัตโนมัติจากห้องประชุม EC</p>
              </div>
            </div>
          `;

          await sendEmailNotification(activeToken, booking.creatorEmail, emailSubject, emailBodyHtml);
        } catch (mailErr) {
          console.warn('Mail send error in quick reject:', mailErr);
        }
      }

      setStatusState('success');
      setStatusMessage('ปฏิเสธคำขอการจองเรียบร้อยแล้ว พร้อมส่งอีเมลแจ้งผู้ขอจองแล้วค่ะ');
    } catch (err: any) {
      console.error('Reject failed:', err);
      setStatusState('failed');
      setStatusMessage(`ไม่สามารถปฏิเสธได้: ${err?.message || 'เกิดข้อผิดพลาด'}`);
    } finally {
      setIsSubmittingReject(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
      <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 to-indigo-950 p-6 text-white relative">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center border border-white/20">
              <ShieldCheck className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">ระบบจัดการคำขอจองด่วน</h2>
              <p className="text-xs text-slate-300">ดำเนินการอนุมัติหรือปฏิเสธผ่านอีเมลอัตโนมัติ</p>
            </div>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
              <p className="text-sm font-medium text-slate-600">กำลังตรวจสอบข้อมูลคำขอจอง...</p>
            </div>
          ) : error ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-full bg-red-50 text-red-500 flex items-center justify-center border border-red-200">
                <AlertCircle className="w-8 h-8" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">ไม่สามารถดำเนินการได้</h3>
                <p className="text-sm text-slate-500 mt-1">{error}</p>
              </div>
              <button
                onClick={onClose}
                className="mt-4 px-6 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-semibold transition"
              >
                เข้าสู่หน้าระบบหลัก
              </button>
            </div>
          ) : booking ? (
            <div className="space-y-5">
              {/* Status Header Banners */}
              {statusState === 'processing' && (
                <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-2xl flex items-center space-x-3 text-indigo-700">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0 text-indigo-600" />
                  <span className="text-sm font-medium">{statusMessage}</span>
                </div>
              )}

              {statusState === 'success' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-start space-x-3 text-emerald-800">
                  <CheckCircle className="w-5 h-5 shrink-0 text-emerald-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">ดำเนินการเรียบร้อยแล้ว</h4>
                    <p className="text-xs text-emerald-700 mt-0.5">{statusMessage}</p>
                  </div>
                </div>
              )}

              {statusState === 'failed' && (
                <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex items-start space-x-3 text-red-800">
                  <XCircle className="w-5 h-5 shrink-0 text-red-600 mt-0.5" />
                  <div>
                    <h4 className="text-sm font-bold">เกิดข้อผิดพลาด</h4>
                    <p className="text-xs text-red-700 mt-0.5">{statusMessage}</p>
                  </div>
                </div>
              )}

              {/* Already Approved or Rejected notice */}
              {statusState === 'idle' && booking.status === 'approved' && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center space-x-3 text-emerald-800">
                  <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
                  <span className="text-sm font-medium">รายการนี้ได้รับการอนุมัติแล้ว โดย {booking.approvedBy || 'ผู้ดูแลระบบ'}</span>
                </div>
              )}

              {statusState === 'idle' && booking.status === 'rejected' && (
                <div className="p-4 bg-rose-50 border border-rose-200 rounded-2xl flex items-center space-x-3 text-rose-800">
                  <XCircle className="w-5 h-5 text-rose-600 shrink-0" />
                  <div>
                    <span className="text-sm font-bold block">รายการนี้ได้รับการปฏิเสธแล้ว</span>
                    <span className="text-xs text-rose-700">เหตุผล: {booking.rejectedReason || '-'}</span>
                  </div>
                </div>
              )}

              {/* Booking Details Card */}
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4.5 space-y-3">
                <div className="flex items-start justify-between">
                  <h3 className="text-base font-bold text-slate-900 leading-snug">{booking.title}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                    booking.status === 'approved' 
                      ? 'bg-emerald-100 text-emerald-700' 
                      : booking.status === 'rejected'
                      ? 'bg-rose-100 text-rose-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {booking.status === 'approved' ? 'อนุมัติแล้ว' : booking.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รอการตรวจสอบ'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 text-xs text-slate-600 pt-1">
                  <div className="flex items-center space-x-2">
                    <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="font-semibold text-slate-800">{booking.roomName}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>{formatThaiDateRange(booking.startTime, booking.endTime)}</span>
                  </div>

                  <div className="flex items-center space-x-2">
                    <User className="w-4 h-4 text-slate-400 shrink-0" />
                    <span>ผู้ขอ: <strong className="text-slate-800">{booking.creatorName}</strong> ({booking.creatorEmail})</span>
                  </div>

                  {booking.meetingType && booking.meetingType !== 'none' && (
                    <div className="flex items-center space-x-2">
                      <Video className="w-4 h-4 text-slate-400 shrink-0" />
                      <span>รูปแบบการประชุม: <strong>{booking.meetingType.toUpperCase()}</strong></span>
                    </div>
                  )}

                  {booking.description && (
                    <div className="mt-1 pt-2 border-t border-slate-200 text-slate-600">
                      <span className="font-semibold text-slate-700">รายละเอียด: </span>
                      <span>{booking.description}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons for Pending status */}
              {booking.status === 'pending' && statusState !== 'success' && (
                <>
                  {action === 'reject' ? (
                    <div className="space-y-3 pt-2">
                      <label className="block text-xs font-bold text-slate-700">
                        เลือกเหตุผลในการปฏิเสธคำขอ:
                      </label>
                      <div className="space-y-1.5">
                        {presetReasons.map((reason) => (
                          <label 
                            key={reason}
                            className={`flex items-center space-x-2 p-2.5 rounded-xl border text-xs cursor-pointer transition ${
                              selectedPresetReason === reason 
                                ? 'bg-rose-50 border-rose-300 text-rose-900 font-semibold' 
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                            }`}
                          >
                            <input
                              type="radio"
                              name="presetReason"
                              value={reason}
                              checked={selectedPresetReason === reason}
                              onChange={() => setSelectedPresetReason(reason)}
                              className="text-rose-600 focus:ring-rose-500"
                            />
                            <span>{reason}</span>
                          </label>
                        ))}
                      </div>

                      {selectedPresetReason === 'ระบุเหตุผลอื่นๆ' && (
                        <textarea
                          value={customReason}
                          onChange={(e) => setCustomReason(e.target.value)}
                          placeholder="กรุณาระบุเหตุผลการปฏิเสธที่ต้องการแจ้งผู้ขอ..."
                          className="w-full text-xs p-3 rounded-xl border border-slate-300 focus:ring-2 focus:ring-rose-500 focus:outline-hidden"
                          rows={2}
                        />
                      )}

                      <div className="flex items-center space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={handleConfirmReject}
                          disabled={isSubmittingReject}
                          className="flex-1 py-2.5 px-4 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
                        >
                          {isSubmittingReject ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>กำลังบันทึก...</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-4 h-4" />
                              <span>ยืนยันปฏิเสธคำขอ</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => executeApprove(booking)}
                          disabled={isSubmittingReject}
                          className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center space-x-1"
                        >
                          <CheckCircle className="w-4 h-4" />
                          <span>เปลี่ยนใจอนุมัติ</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => executeApprove(booking)}
                        disabled={statusState === 'processing'}
                        className="flex-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs shadow-md transition disabled:opacity-50 flex items-center justify-center space-x-2"
                      >
                        <CheckCircle className="w-4 h-4" />
                        <span>กดอนุมัติการจองทันที</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Close / Return to app button */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-2.5 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition"
                >
                  เข้าสู่หน้าปฏิทินและระบบหลัก
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
