import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Tv, 
  MapPin, 
  Calendar, 
  Clock, 
  CheckCircle, 
  AlertCircle, 
  Play, 
  Plus, 
  Sliders,
  Sparkles,
  MessageCircle,
  Video,
  Trash2,
  FileUp,
  Pencil,
  Lock,
  Star
} from 'lucide-react';
import { Booking, MeetingRoom, RoomId } from '../types';
import { MEETING_ROOMS } from '../lib/firebase';
import { canViewBookingDetails, isKeyAttendee, sortAttendeesByPriority } from '../lib/permissions';

interface DashboardProps {
  bookings: Booking[];
  rooms: MeetingRoom[];
  onOpenBookingModal: (roomId?: RoomId, initialTime?: string) => void;
  isAdmin: boolean;
  currentUserEmail: string | null;
  onSelectTab: (tab: string) => void;
  onDeleteBooking?: (bookingId: string) => void;
  onEditBooking?: (booking: Booking) => void;
  onOpenImportModal?: () => void;
}

export default function Dashboard({
  bookings,
  rooms = MEETING_ROOMS,
  onOpenBookingModal,
  isAdmin,
  currentUserEmail,
  onSelectTab,
  onDeleteBooking,
  onEditBooking,
  onOpenImportModal
}: DashboardProps) {
  const [now, setNow] = useState(new Date());

  // Keep clock running
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getThaiDateString = (date: Date) => {
    return date.toLocaleDateString('th-TH', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTimeStr = (date: Date) => {
    return date.toLocaleTimeString('th-TH', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    });
  };

  // Filter bookings for today (using local timezone values to prevent offset shifts)
  const localYear = now.getFullYear();
  const localMonth = String(now.getMonth() + 1).padStart(2, '0');
  const localDay = String(now.getDate()).padStart(2, '0');
  const todayStr = `${localYear}-${localMonth}-${localDay}`;
  const todayBookings = bookings.filter(b => {
    const bStart = b.startTime.split('T')[0];
    const bEnd = b.endTime ? b.endTime.split('T')[0] : bStart;
    return todayStr >= bStart && todayStr <= bEnd && b.status === 'approved';
  });

  const pendingBookings = bookings.filter(b => b.status === 'pending');

  // Helper to determine room status at current moment
  const getRoomStatus = (roomId: RoomId) => {
    const currentTimeStr = now.toISOString();
    
    // Check if there is an approved booking happening right now
    const activeBooking = bookings.find(b => {
      return (
        b.roomId === roomId &&
        b.status === 'approved' &&
        currentTimeStr >= b.startTime &&
        currentTimeStr <= b.endTime
      );
    });

    if (activeBooking) {
      return {
        status: 'occupied' as const,
        label: 'กำลังใช้งาน',
        color: 'text-rose-600 bg-rose-50 border-rose-200',
        badgeColor: 'bg-rose-500 animate-pulse',
        booking: activeBooking
      };
    }

    // Check if there is a pending booking happening right now or coming up in next 30 mins
    const pendingBooking = bookings.find(b => {
      return (
        b.roomId === roomId &&
        b.status === 'pending' &&
        currentTimeStr >= b.startTime &&
        currentTimeStr <= b.endTime
      );
    });

    if (pendingBooking) {
      return {
        status: 'pending' as const,
        label: 'รออนุมัติการจอง',
        color: 'text-amber-600 bg-amber-50 border-amber-200',
        badgeColor: 'bg-amber-500',
        booking: pendingBooking
      };
    }

    // Check for next upcoming booking today
    const nextBooking = bookings
      .filter(b => b.roomId === roomId && b.status === 'approved' && b.startTime > currentTimeStr)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];

    return {
      status: 'available' as const,
      label: 'ว่าง',
      color: 'text-emerald-600 bg-emerald-50 border-emerald-200',
      badgeColor: 'bg-emerald-500',
      nextBooking
    };
  };

  return (
    <div className="space-y-8" id="dashboard-main">
      {/* Upper Section: Welcome banner & Realtime clock */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 p-6 rounded-2xl text-white shadow-xl border border-slate-700/50">
        <div className="space-y-2">
          <div className="flex items-center space-x-2">
            <span className="bg-indigo-500/20 text-indigo-300 text-xs px-3 py-1 rounded-full border border-indigo-500/30 font-medium">
              Meeting Room EC
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">ระบบบริหารจัดการห้องประชุมอัจฉริยะ</h1>
          <p className="text-slate-300 text-sm md:text-base">
            จองห้องประชุม ค้นหาสล็อตเวลา ซิงค์ Google Calendar และสร้างลิงก์วิดีโอคอลได้ทันที
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center space-x-4 bg-slate-800/80 p-4 rounded-xl border border-slate-700/60 self-start md:self-auto min-w-[240px]">
          <Clock className="h-10 w-10 text-indigo-400 shrink-0" />
          <div>
            <div className="text-2xl font-mono font-bold tracking-wider text-indigo-300">{formatTimeStr(now)}</div>
            <div className="text-xs text-slate-400 font-medium">{getThaiDateString(now)}</div>
          </div>
        </div>
      </div>

      {/* Stats Counters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium block">จองสำเร็จวันนี้</span>
            <span className="text-2xl font-bold text-slate-800">{todayBookings.length} รายการ</span>
          </div>
          <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center border border-emerald-200">
            <CheckCircle className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium block">รอนุมัติการจอง</span>
            <span className="text-2xl font-bold text-amber-600">{pendingBookings.length} รายการ</span>
          </div>
          <div className="h-12 w-12 bg-amber-50 text-amber-600 rounded-lg flex items-center justify-center border border-amber-200">
            <AlertCircle className="h-6 w-6" />
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-xs text-slate-500 font-medium block">สิทธิ์การใช้งานของคุณ</span>
            <span className="text-md font-bold text-slate-700 block">
              {isAdmin ? 'ผู้ดูแลระบบ (Admin)' : 'ผู้ใช้งาน'}
            </span>
          </div>
          <div className="h-12 w-12 bg-slate-50 text-slate-600 rounded-lg flex items-center justify-center border border-slate-200">
            <Users className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* Main Rooms Status Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-slate-800">สถานะห้องประชุมแบบเรียลไทม์</h2>
            <p className="text-xs text-slate-500">แสดงผลสถานะห้องและรายการประชุมที่จะเกิดขึ้นในวันนี้</p>
          </div>
          <div className="flex items-center space-x-2">
            {onOpenImportModal && (
              <button 
                onClick={onOpenImportModal}
                className="flex items-center space-x-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 text-xs font-semibold px-3 py-2.5 sm:px-4 sm:py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
                title="นำเข้าไฟล์ปฏิทิน .ics จาก Google Calendar"
              >
                <FileUp className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>นำเข้าปฏิทิน (.ics)</span>
              </button>
            )}
            <button 
              onClick={() => onOpenBookingModal()}
              className="flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2.5 rounded-lg shadow-sm transition-all cursor-pointer"
            >
              <Plus className="h-4 w-4 shrink-0" />
              <span>จองห้องประชุม</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {rooms.map(room => {
            const roomInfo = getRoomStatus(room.id);
            const isAvail = roomInfo.status === 'available';
            const isOccupied = roomInfo.status === 'occupied';
            const isPending = roomInfo.status === 'pending';

            return (
              <div 
                key={room.id}
                className={`bg-white rounded-2xl border transition-all duration-200 shadow-sm hover:shadow-md flex flex-col h-full ${
                  isOccupied ? 'border-blue-200 ring-2 ring-blue-500 ring-offset-2' : 'border-slate-200'
                }`}
                id={`room-card-${room.id}`}
              >
                {/* Room Header */}
                <div className={`p-5 rounded-t-2xl border-b border-slate-100 bg-slate-50/50 flex flex-col justify-between space-y-3`}>
                  <div className="flex justify-between items-start">
                    <div className="space-y-1">
                      <h3 className="font-bold text-slate-800 text-lg">{room.name}</h3>
                    </div>
                    {/* Status Badge */}
                    <div className={`flex items-center space-x-1.5 px-3 py-1 rounded-full border text-xs font-bold ${roomInfo.color}`}>
                      <span className={`h-2 w-2 rounded-full ${roomInfo.badgeColor}`} />
                      <span>{roomInfo.label}</span>
                    </div>
                  </div>
                </div>

                {/* Card Body - Current or Next Info */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  {isOccupied && roomInfo.booking && (() => {
                    const canView = canViewBookingDetails(roomInfo.booking, currentUserEmail, isAdmin);
                    return (
                      <div className="space-y-2.5">
                        <div className="text-[11px] font-bold text-rose-500 uppercase tracking-wider flex items-center justify-between">
                          <span>กำลังใช้งานในขณะนี้</span>
                          {roomInfo.booking.isConfidential && (
                            <span className="flex items-center space-x-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <Lock className="h-3 w-3" />
                              <span>ความลับสำคัญ</span>
                            </span>
                          )}
                        </div>
                        <div className="bg-rose-50/50 p-3.5 rounded-xl border border-rose-100 space-y-2">
                          <h4 className="font-semibold text-slate-800 text-sm line-clamp-1">
                            {canView ? roomInfo.booking.title : 'ห้องประชุมไม่ว่าง'}
                          </h4>
                          <p className="text-xs text-slate-500 font-mono flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5 shrink-0" />
                            <span>
                              {new Date(roomInfo.booking.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(roomInfo.booking.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                            </span>
                          </p>
                          {canView ? (
                            <div className="flex items-center justify-between text-[11px] pt-1 border-t border-rose-100/60">
                              <span className="text-slate-500">ผู้จอง: <strong className="text-slate-700">{roomInfo.booking.creatorName}</strong></span>
                              {roomInfo.booking.meetingLink && (
                                <a 
                                  href={roomInfo.booking.meetingLink} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-indigo-600 hover:underline font-semibold flex items-center space-x-1"
                                >
                                  <Video className="h-3 w-3" />
                                  <span>เข้าสายด่วน</span>
                                </a>
                              )}
                            </div>
                          ) : (
                            <div className="text-[11px] pt-1 border-t border-rose-100/60 text-slate-400 italic">
                              ซ่อนรายละเอียดการประชุม (ความลับสำคัญ)
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {isPending && roomInfo.booking && (() => {
                    const canView = canViewBookingDetails(roomInfo.booking, currentUserEmail, isAdmin);
                    return (
                      <div className="space-y-2.5">
                        <div className="text-[11px] font-bold text-amber-500 uppercase tracking-wider flex items-center justify-between">
                          <span>อยู่ระหว่างการรออนุมัติ</span>
                          {roomInfo.booking.isConfidential && (
                            <span className="flex items-center space-x-1 text-[10px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              <Lock className="h-3 w-3" />
                              <span>ความลับสำคัญ</span>
                            </span>
                          )}
                        </div>
                        <div className="bg-amber-50/50 p-3.5 rounded-xl border border-amber-100 space-y-2">
                          <h4 className="font-semibold text-slate-800 text-sm line-clamp-1">
                            {canView ? roomInfo.booking.title : 'ห้องประชุมไม่ว่าง'}
                          </h4>
                          <p className="text-xs text-slate-500 font-mono flex items-center space-x-1.5">
                            <Clock className="h-3.5 w-3.5" />
                            <span>
                              {new Date(roomInfo.booking.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(roomInfo.booking.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                            </span>
                          </p>
                          <div className="text-[11px] pt-1 border-t border-amber-100/60 text-slate-500">
                            {canView ? (
                              <span>โดย: <strong className="text-slate-700">{roomInfo.booking.creatorName}</strong></span>
                            ) : (
                              <span className="italic text-slate-400">ซ่อนรายละเอียดการประชุม</span>
                            )}
                          </div>
                        </div>
                        {isAdmin && (
                          <button 
                            onClick={() => onSelectTab('approvals')}
                            className="w-full text-center text-xs bg-amber-600 text-white py-1.5 rounded-lg hover:bg-amber-700 transition-colors font-medium"
                          >
                            ตรวจสอบการอนุมัติการจอง
                          </button>
                        )}
                      </div>
                    );
                  })()}

                  {isAvail && (
                    <div className="space-y-3 flex-1 flex flex-col justify-center">
                      {roomInfo.nextBooking ? (() => {
                        const canView = canViewBookingDetails(roomInfo.nextBooking, currentUserEmail, isAdmin);
                        return (
                          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 space-y-1.5">
                            <div className="text-[10px] text-slate-400 font-semibold uppercase flex items-center justify-between">
                              <span>คิวถัดไปวันนี้</span>
                              {roomInfo.nextBooking.isConfidential && (
                                <span className="flex items-center space-x-1 text-[10px] text-amber-700">
                                  <Lock className="h-2.5 w-2.5" />
                                  <span>ความลับ</span>
                                </span>
                              )}
                            </div>
                            <h4 className="font-medium text-slate-700 text-xs line-clamp-1">
                              {canView ? roomInfo.nextBooking.title : 'ห้องประชุมไม่ว่าง'}
                            </h4>
                            <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono pt-1">
                              <span>
                                {new Date(roomInfo.nextBooking.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(roomInfo.nextBooking.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                              </span>
                              {canView ? (
                                <span className="font-sans text-slate-600 font-medium">{roomInfo.nextBooking.creatorName}</span>
                              ) : (
                                <span className="font-sans text-slate-400 italic">ความลับสำคัญ</span>
                              )}
                            </div>
                          </div>
                        );
                      })() : (
                        <div className="text-center py-6 text-slate-400 space-y-1.5">
                          <div className="text-sm">ไม่มีคิวจองแล้วในวันนี้</div>
                          <p className="text-[11px]">ห้องประชุมว่างตลอดทั้งวัน สามารถใช้งานได้ทันที</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Booking Button */}
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => onOpenBookingModal(room.id)}
                      className={`w-full py-2 px-4 rounded-xl text-xs font-semibold tracking-wide transition-all border flex items-center justify-center space-x-1.5 ${
                        isOccupied 
                        ? 'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200' 
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200'
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                      <span>{isOccupied ? 'จองล่วงหน้าสำหรับห้องนี้' : 'จองใช้งานห้องนี้'}</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Activity Timeline Today */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="font-bold text-slate-800 text-lg flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-indigo-600" />
            <span>ตารางการจองวันนี้ ({todayBookings.length} กิจกรรม)</span>
          </h3>
          <p className="text-xs text-slate-500">ตารางเวลาห้องประชุมทั้งหมดที่ได้รับการอนุมัติในวันนี้</p>
        </div>

        {todayBookings.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 text-xs text-slate-400 uppercase tracking-wider font-semibold">
                  <th className="py-3 px-4">ห้องประชุม</th>
                  <th className="py-3 px-4">หัวข้อประชุม</th>
                  <th className="py-3 px-4">เวลา</th>
                  <th className="py-3 px-4">ผู้จัดประชุม / ผู้เข้าร่วม</th>
                  <th className="py-3 px-4">ช่องทาง</th>
                  <th className="py-3 px-4 text-right">การจัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {todayBookings
                  .sort((a, b) => a.startTime.localeCompare(b.startTime))
                  .map(b => {
                    const roomColorMap: Record<RoomId, string> = {
                      '': 'bg-slate-100 text-slate-700 border-slate-200',
                      room1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                      room2: 'bg-indigo-50 text-indigo-700 border-indigo-200',
                      room3: 'bg-amber-50 text-amber-700 border-amber-200',
                    };

                    const platformColors: Record<string, string> = {
                      meet: 'bg-sky-50 text-sky-700 border-sky-100',
                      teams: 'bg-indigo-50 text-indigo-700 border-indigo-100',
                      zoom: 'bg-blue-50 text-blue-700 border-blue-100',
                      none: 'bg-slate-50 text-slate-500 border-slate-100'
                    };

                    const platformLabels: Record<string, string> = {
                      meet: 'Google Meet',
                      teams: 'Teams',
                      zoom: 'Zoom',
                      none: 'On-site เท่านั้น'
                    };

                    return (
                      <tr key={b.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="py-3.5 px-4 font-medium">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-md border ${roomColorMap[b.roomId] || 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                            {b.roomName ? b.roomName.split(' (')[0] : 'ไม่ระบุห้องประชุม'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          {(() => {
                            const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
                            if (!canView) {
                              return (
                                <div className="space-y-0.5">
                                  <div className="font-semibold text-slate-700 flex items-center space-x-1.5">
                                    <Lock className="h-3.5 w-3.5 text-amber-600" />
                                    <span>ห้องประชุมไม่ว่าง</span>
                                  </div>
                                  <p className="text-xs text-slate-400 italic">ความลับสำคัญ</p>
                                </div>
                              );
                            }
                            return (
                              <div>
                                <div className="font-semibold text-slate-800 flex items-center space-x-1.5">
                                  {b.isConfidential && (
                                    <span className="flex items-center space-x-1 text-[10px] text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                                      <Lock className="h-2.5 w-2.5" />
                                      <span>ความลับสำคัญ</span>
                                    </span>
                                  )}
                                  <span>{b.title}</span>
                                </div>
                                {b.description && (
                                  <p className="text-xs text-slate-400 line-clamp-1">{b.description}</p>
                                )}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                          {new Date(b.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(b.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                        </td>
                        <td className="py-3.5 px-4">
                          {(() => {
                            const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
                            if (!canView) {
                              return <span className="text-xs text-slate-400 italic">ซ่อนข้อมูล</span>;
                            }
                            const hasVIP = b.attendees && b.attendees.some(a => isKeyAttendee(a.email));
                            return (
                              <>
                                <div className="font-medium text-slate-700 flex items-center gap-1">
                                  <span>{b.creatorName}</span>
                                  {isKeyAttendee(b.creatorEmail) && (
                                    <Star className="h-3 w-3 text-amber-500 fill-amber-400" title="ผู้จองคนสำคัญ" />
                                  )}
                                </div>
                                <div 
                                  className="text-[10px] text-slate-400 flex items-center gap-1 cursor-default"
                                  title={b.attendees && b.attendees.length > 0 
                                    ? `รายชื่อผู้เข้าร่วม:\n${sortAttendeesByPriority(b.attendees).map(a => `• ${a.displayName}${a.nickname ? ` (${a.nickname})` : ''} - ${a.email}`).join('\n')}` 
                                    : ''}
                                >
                                  <span>ผู้เข้าร่วม {b.attendees.length} คน</span>
                                  {hasVIP && (
                                    <span className="inline-flex items-center gap-0.5 text-amber-700 font-bold bg-amber-50 border border-amber-200 px-1 rounded text-[9px]">
                                      <Star className="h-2 w-2 text-amber-500 fill-amber-400" />
                                      <span>มีคนสำคัญ</span>
                                    </span>
                                  )}
                                </div>
                              </>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-4">
                          {(() => {
                            const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
                            if (!canView) {
                              return <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">-</span>;
                            }
                            return b.meetingLink ? (
                              <a 
                                href={b.meetingLink} 
                                target="_blank" 
                                rel="noreferrer"
                                className={`inline-flex items-center space-x-1 text-xs px-2.5 py-1 rounded-md border font-semibold ${platformColors[b.meetingType] || 'bg-slate-50 text-slate-500'}`}
                              >
                                <Video className="h-3.5 w-3.5" />
                                <span>{platformLabels[b.meetingType] || 'เข้าร่วมสาย'}</span>
                              </a>
                            ) : (
                              <span className="text-xs text-slate-400 font-medium bg-slate-50 px-2 py-1 rounded border border-slate-100">
                                -
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-3.5 px-4 text-right space-x-1.5">
                          {(isAdmin || currentUserEmail === b.creatorEmail) && onEditBooking && (
                            <button
                              onClick={() => onEditBooking(b)}
                              className="inline-flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold transition-all cursor-pointer"
                              title="แก้ไขกิจกรรมเลื่อนเวลา"
                            >
                              <Pencil className="h-3.5 w-3.5 shrink-0" />
                              <span>แก้ไข</span>
                            </button>
                          )}
                          {(isAdmin || currentUserEmail === b.creatorEmail) && onDeleteBooking && (
                            <button
                              onClick={() => onDeleteBooking(b.id)}
                              className="inline-flex items-center space-x-1 text-xs px-2.5 py-1.5 rounded-md border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold transition-all cursor-pointer"
                              title="ลบกิจกรรมการใช้ห้องประชุม"
                            >
                              <Trash2 className="h-3.5 w-3.5 shrink-0" />
                              <span>ลบ</span>
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p className="text-slate-400 text-sm font-medium">ยังไม่มีรายการประชุมจัดขึ้นในวันนี้</p>
            <p className="text-slate-400 text-xs mt-1">คลิกที่ปุ่ม จองห้องประชุม ด้านบนเพื่อเริ่มสร้างกิจกรรมแรก</p>
          </div>
        )}
      </div>
    </div>
  );
}
