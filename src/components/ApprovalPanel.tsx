import React, { useState } from 'react';
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  MapPin, 
  User, 
  Users, 
  Video, 
  MessageSquare, 
  AlertCircle,
  FileText,
  Calendar
} from 'lucide-react';
import { Booking, RoomId } from '../types';

interface ApprovalPanelProps {
  bookings: Booking[];
  isAdmin: boolean;
  onApprove: (bookingId: string) => Promise<void>;
  onReject: (bookingId: string, reason: string) => Promise<void>;
}

export default function ApprovalPanel({
  bookings,
  isAdmin,
  onApprove,
  onReject
}: ApprovalPanelProps) {
  const pendingList = bookings.filter(b => b.status === 'pending');
  const pastList = bookings.filter(b => b.status === 'approved' || b.status === 'rejected');
  
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [activeRejectId, setActiveRejectId] = useState<string | null>(null);
  const [processingId, setProcessingId] = useState<string | null>(null);

  const handleApproveAction = async (id: string) => {
    setProcessingId(id);
    try {
      await onApprove(id);
    } catch (error) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการอนุมัติการจอง');
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectAction = async (id: string) => {
    const reason = rejectReason[id] || '';
    if (!reason.trim()) {
      alert('กรุณากรอกเหตุผลประกอบการปฏิเสธการจอง');
      return;
    }
    setProcessingId(id);
    try {
      await onReject(id, reason.trim());
      setActiveRejectId(null);
    } catch (error) {
      console.error(error);
      alert('เกิดข้อผิดพลาดในการปฏิเสธการจอง');
    } finally {
      setProcessingId(null);
    }
  };

  const roomColors: Record<RoomId, string> = {
    '': 'bg-slate-100 text-slate-700 border-slate-200',
    room1: 'bg-emerald-50 text-emerald-700 border-emerald-100',
    room2: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    room3: 'bg-amber-50 text-amber-700 border-amber-100'
  };

  return (
    <div className="space-y-6" id="approval-panel-root">
      {/* Panel Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-800 flex items-center space-x-2">
          <CheckCircle className="h-5 w-5 text-indigo-600" />
          <span>ระบบตรวจสอบและอนุมัติการจองห้องประชุม</span>
        </h2>
        <p className="text-xs text-slate-500">สำหรับผู้ดูแลระบบตรวจสอบคำขอจองจากพนักงาน ดำเนินการซิงค์ข้อมูลกับ Google Calendar ทันทีเมื่ออนุมัติสำเร็จ</p>
      </div>

      {!isAdmin ? (
        <div className="bg-amber-50 border border-amber-200 p-5 rounded-2xl flex items-center space-x-3 text-xs max-w-2xl text-amber-800">
          <AlertCircle className="h-5 w-5 text-amber-500 shrink-0" />
          <div>
            <span className="font-bold block">ฟังก์ชั่นเฉพาะผู้ดูแลระบบ (Admin) เท่านั้น</span>
            <span>ระดับบัญชีปัจจุบันของคุณไม่สามารถทำการอนุมัติหรือปฏิเสธรายการได้ คุณสามารถดูรายละเอียดเหล่านี้ได้เท่านั้น</span>
          </div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        {/* Left/Middle Column: Pending Requests */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-2">
            <span>คำขอที่รอการตรวจสอบ</span>
            <span className="bg-amber-100 text-amber-800 text-xs px-2.5 py-0.5 rounded-full font-bold">
              {pendingList.length} รายการ
            </span>
          </h3>

          {pendingList.length > 0 ? (
            <div className="space-y-4">
              {pendingList.map(b => {
                const isProcessing = processingId === b.id;
                const isRejecting = activeRejectId === b.id;

                return (
                  <div 
                    key={b.id} 
                    className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4 hover:shadow-md transition-all"
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2.5 py-1 rounded-md border ${roomColors[b.roomId] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                          {b.roomName || 'ไม่ระบุห้องประชุม'}
                        </span>
                        <span className="flex items-center text-[10px] font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded border border-slate-200/50">
                          <Calendar className="h-3.5 w-3.5 mr-1" />
                          {new Date(b.startTime).toLocaleDateString('th-TH', {day: 'numeric', month: 'short', year: 'numeric'})}
                        </span>
                      </div>
                      
                      <div className="flex items-center text-xs text-slate-500 font-mono">
                        <Clock className="h-4 w-4 mr-1 text-slate-400" />
                        <span>
                          {new Date(b.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(b.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                        </span>
                      </div>
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                      <h4 className="font-bold text-slate-800 text-base">{b.title}</h4>
                      <p className="text-xs text-slate-500 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
                        {b.description}
                      </p>
                    </div>

                    {/* Details Row */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 text-xs text-slate-500">
                      <div className="flex items-center space-x-2 bg-slate-50/50 p-2 rounded-lg border border-slate-100/30">
                        <User className="h-4 w-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">ผู้ยื่นคำขอจอง</span>
                          <span className="font-semibold text-slate-700">{b.creatorName}</span>
                          <span className="text-[10px] text-slate-400 font-mono ml-1">({b.creatorEmail})</span>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 bg-slate-50/50 p-2 rounded-lg border border-slate-100/30">
                        <Users className="h-4 w-4 text-slate-400" />
                        <div>
                          <span className="text-[10px] text-slate-400 block">ผู้เข้าร่วมประชุม</span>
                          <span className="font-semibold text-slate-700">{b.attendees.length} คน</span>
                          <span className="text-[10px] text-slate-400 ml-1">
                            ({b.attendees.map(a => a.nickname || a.displayName.split(' ')[0]).join(', ') || 'ไม่มี'})
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Meeting Links Info */}
                    <div className="flex items-center space-x-2 text-xs">
                      <span className="text-slate-400">ช่องทางโทร:</span>
                      <span className="font-bold text-indigo-600 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100 flex items-center space-x-1 capitalize text-[10px]">
                        <Video className="h-3 w-3" />
                        <span>{b.meetingType === 'none' ? 'On-site เท่านั้น' : b.meetingType}</span>
                      </span>
                      {b.meetingLink && (
                        <span className="text-slate-400 truncate text-[11px] font-mono select-all">
                          ลิงก์: {b.meetingLink}
                        </span>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {isAdmin ? (
                      <div className="pt-3 border-t border-slate-50 flex items-center justify-between gap-3">
                        {isRejecting ? (
                          <div className="w-full space-y-2">
                            <input 
                              type="text"
                              required
                              value={rejectReason[b.id] || ''}
                              onChange={e => setRejectReason({...rejectReason, [b.id]: e.target.value})}
                              placeholder="ระบุเหตุผลในการปฏิเสธคำจอง เช่น ห้องไม่ว่างในเวลาดังกล่าว..."
                              className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none"
                            />
                            <div className="flex space-x-2 justify-end text-xs">
                              <button
                                onClick={() => setActiveRejectId(null)}
                                className="px-3 py-1.5 border border-slate-200 rounded-md text-slate-500 hover:bg-slate-100 font-medium"
                              >
                                ยกเลิก
                              </button>
                              <button
                                onClick={() => handleRejectAction(b.id)}
                                disabled={isProcessing}
                                className="px-3 py-1.5 bg-rose-600 text-white rounded-md hover:bg-rose-700 font-bold"
                              >
                                ยืนยันปฏิเสธ
                              </button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <button
                              onClick={() => setActiveRejectId(b.id)}
                              disabled={isProcessing}
                              className="px-4 py-2 border border-rose-200 hover:bg-rose-50 text-rose-600 font-bold rounded-xl text-xs flex items-center space-x-1.5"
                            >
                              <XCircle className="h-4 w-4" />
                              <span>ปฏิเสธการจอง</span>
                            </button>
                            <button
                              onClick={() => handleApproveAction(b.id)}
                              disabled={isProcessing}
                              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs flex items-center space-x-1.5 shadow-sm"
                            >
                              <CheckCircle className="h-4 w-4" />
                              <span>{isProcessing ? 'กำลังประมวลผล...' : 'อนุมัติการจอง'}</span>
                            </button>
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="bg-slate-50/50 p-2 text-slate-400 text-xs text-center border rounded-lg">
                        รอดำเนินการโดยผู้ดูแลระบบ (Admin)
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 text-slate-400 space-y-1.5 shadow-sm">
              <CheckCircle className="h-10 w-10 text-emerald-500 mx-auto" />
              <p className="font-bold text-slate-700">ไม่มีคำขอจองที่ค้างอยู่</p>
              <p className="text-xs">ทุกคำขอจองห้องประชุมได้รับการตรวจสอบเรียบร้อยแล้ว</p>
            </div>
          )}
        </div>

        {/* Right Column: History List */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center space-x-1.5">
            <FileText className="h-4 w-4 text-indigo-600" />
            <span>ประวัติการตรวจสอบล่าสุด</span>
          </h3>

          <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1">
            {pastList.length > 0 ? (
              pastList
                .sort((a, b) => b.createdAt?.localeCompare(a.createdAt || ''))
                .slice(0, 10)
                .map(b => {
                  const isApproved = b.status === 'approved';
                  return (
                    <div key={b.id} className="p-3 border border-slate-50 rounded-lg text-[11px] space-y-1 bg-slate-50/30">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-slate-800 truncate block max-w-[120px]">{b.title}</span>
                        <span className={`px-1.5 py-0.25 rounded font-bold ${
                          isApproved 
                          ? 'bg-emerald-50 text-emerald-700' 
                          : 'bg-rose-50 text-rose-700'
                        }`}>
                          {isApproved ? 'อนุมัติ' : 'ปฏิเสธ'}
                        </span>
                      </div>
                      
                      <div className="text-slate-400 font-mono">
                        ห้อง: {b.roomName ? b.roomName.split(' (')[0] : 'ไม่ระบุห้องประชุม'}
                      </div>
                      <div className="text-slate-500">
                        ผู้จอง: <strong className="text-slate-700">{b.creatorName}</strong>
                      </div>
                      {b.rejectedReason && !isApproved && (
                        <div className="text-rose-600 font-medium bg-rose-50/50 p-1 rounded mt-1">
                          เหตุผล: {b.rejectedReason}
                        </div>
                      )}
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-8 text-slate-400">ยังไม่มีประวัติการอนุมัติ</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
