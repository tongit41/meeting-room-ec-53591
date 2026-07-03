import React, { useState } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar, 
  Clock, 
  MapPin, 
  Plus, 
  Filter, 
  Video, 
  Info,
  CheckCircle,
  AlertCircle,
  Trash2
} from 'lucide-react';
import { Booking, RoomId, MeetingRoom } from '../types';
import { MEETING_ROOMS } from '../lib/firebase';

interface CalendarViewProps {
  bookings: Booking[];
  rooms: MeetingRoom[];
  onOpenBookingModal: (roomId?: RoomId, initialTime?: string) => void;
  currentUserEmail: string | null;
  isAdmin: boolean;
  onDeleteBooking?: (bookingId: string) => void;
}

export default function CalendarView({
  bookings,
  rooms = MEETING_ROOMS,
  onOpenBookingModal,
  currentUserEmail,
  isAdmin,
  onDeleteBooking
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<RoomId | 'all'>('all');

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getThaiMonthName = (m: number) => {
    const months = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    return months[m];
  };

  const getDaysInMonth = (y: number, m: number) => {
    return new Date(y, m + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (y: number, m: number) => {
    return new Date(y, m, 1).getDay();
  };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDayIndex = getFirstDayOfMonth(year, month);

  // Generate calendar days
  const calendarDays: (Date | null)[] = [];
  // Empty spaces for previous month's alignment
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  // Fill actual days of this month
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }

  const navigatePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const navigateNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const navigateToday = () => {
    const today = new Date();
    setCurrentDate(today);
    setSelectedDate(today);
  };

  // Helper to format ISO Date string (using local timezone values to prevent offset shifts)
  const getISODateStr = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Get bookings for a specific day
  const getBookingsForDay = (date: Date) => {
    const dateStr = getISODateStr(date);
    return bookings.filter(b => {
      const bDateStr = b.startTime.split('T')[0];
      const matchRoom = selectedRoomFilter === 'all' || b.roomId === selectedRoomFilter;
      return bDateStr === dateStr && matchRoom && b.status !== 'rejected';
    });
  };

  // Filtered bookings to show on the selected day list
  const selectedDayBookings = getBookingsForDay(selectedDate);

  const roomColors: Record<RoomId, string> = {
    room1: 'bg-emerald-500',
    room2: 'bg-indigo-500',
    room3: 'bg-amber-500'
  };

  const roomTextColors: Record<RoomId, string> = {
    room1: 'text-emerald-700 bg-emerald-50 border-emerald-100',
    room2: 'text-indigo-700 bg-indigo-50 border-indigo-100',
    room3: 'text-amber-700 bg-amber-50 border-amber-100'
  };

  const roomMap = rooms.reduce((acc, r) => {
    acc[r.id] = r.name;
    return acc;
  }, {} as Record<RoomId, string>);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8" id="calendar-view-root">
      {/* Grid Left: Calendar Sheet */}
      <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
        
        {/* Header Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-1">
            <h2 className="text-xl font-bold text-slate-800">ปฏิทินห้องประชุม</h2>
            <p className="text-xs text-slate-500">เรียกดู กำหนดตาราง หรือซิงค์ข้อมูลกับระบบ</p>
          </div>
          
          <div className="flex items-center space-x-2">
            <button 
              onClick={navigateToday}
              className="px-3 py-1.5 bg-slate-50 border border-slate-200 text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
            >
              วันนี้
            </button>
            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 p-0.5">
              <button 
                onClick={navigatePrevMonth}
                className="p-1 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ChevronLeft className="h-4 w-4 text-slate-600" />
              </button>
              <span className="text-xs font-bold text-slate-800 px-3 min-w-[100px] text-center">
                {getThaiMonthName(month)} {year + 543}
              </span>
              <button 
                onClick={navigateNextMonth}
                className="p-1 hover:bg-slate-200 rounded-md transition-colors"
              >
                <ChevronRight className="h-4 w-4 text-slate-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Room Filter Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-100">
          <div className="flex items-center space-x-2 text-slate-500 text-xs font-medium shrink-0">
            <Filter className="h-3.5 w-3.5" />
            <span>กรองตามห้องประชุม:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedRoomFilter('all')}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all ${
                selectedRoomFilter === 'all'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              ทั้งหมด
            </button>
            {rooms.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRoomFilter(r.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-md border transition-all ${
                  selectedRoomFilter === r.id
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {r.name.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Days of Week Header */}
        <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-400 border-b border-slate-100 pb-3 uppercase tracking-wider">
          <div>อา.</div>
          <div>จ.</div>
          <div>อ.</div>
          <div>พ.</div>
          <div>พฤ.</div>
          <div>ศ.</div>
          <div>ส.</div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2.5">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="aspect-square bg-slate-50/20 rounded-xl" />;
            }

            const dayBookings = getBookingsForDay(day);
            const isToday = getISODateStr(day) === getISODateStr(new Date());
            const isSelected = getISODateStr(day) === getISODateStr(selectedDate);

            return (
              <button
                key={`day-${idx}`}
                onClick={() => setSelectedDate(day)}
                className={`aspect-square p-2 rounded-xl flex flex-col justify-between text-left transition-all border relative ${
                  isSelected 
                  ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/20' 
                  : isToday 
                    ? 'bg-slate-950 border-slate-950 text-white shadow' 
                    : 'bg-white border-slate-100 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                <span className={`text-xs font-bold leading-none ${
                  isSelected ? 'text-indigo-700' : isToday ? 'text-white' : 'text-slate-700'
                }`}>
                  {day.getDate()}
                </span>

                {/* Booking Dots Container */}
                <div className="flex flex-wrap gap-1 mt-1 max-h-[16px] overflow-hidden">
                  {dayBookings.slice(0, 3).map((b, bIdx) => (
                    <span 
                      key={bIdx}
                      title={`${b.title} (${b.roomName})`}
                      className={`h-1.5 w-1.5 rounded-full ${
                        b.status === 'approved' 
                        ? roomColors[b.roomId] 
                        : 'bg-amber-400 animate-pulse'
                      }`} 
                    />
                  ))}
                  {dayBookings.length > 3 && (
                    <span className="text-[8px] text-slate-400 leading-none font-bold">
                      +{dayBookings.length - 3}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Grid Right: Meetings sidebar on selected day */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6 flex flex-col justify-between">
        <div className="space-y-5">
          <div className="space-y-1.5 pb-4 border-b border-slate-100">
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 block">ตารางการประชุม</span>
            <h3 className="font-bold text-slate-800 text-lg">
              วันที่ {selectedDate.toLocaleDateString('th-TH', {day: 'numeric', month: 'long', year: 'numeric'})}
            </h3>
            <p className="text-xs text-slate-500 font-medium">
              มีคิวจองที่ได้รับการอนุมัติและรอดำเนินการ {selectedDayBookings.length} รายการ
            </p>
          </div>

          {/* Booking List for Day */}
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-1">
            {selectedDayBookings.length > 0 ? (
              selectedDayBookings
                .sort((a, b) => a.startTime.localeCompare(b.startTime))
                .map(b => {
                  const isApproved = b.status === 'approved';
                  const isPending = b.status === 'pending';
                  const isRejected = b.status === 'rejected';

                  return (
                    <div 
                      key={b.id} 
                      className={`p-4 rounded-xl border transition-all space-y-3 ${
                        isApproved 
                        ? 'bg-slate-50/50 border-slate-100 hover:border-slate-200' 
                        : isPending 
                          ? 'bg-amber-50/30 border-amber-100 hover:border-amber-200' 
                          : 'bg-rose-50/20 border-rose-100'
                      }`}
                    >
                      {/* Top Header Row */}
                      <div className="flex justify-between items-start gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${roomTextColors[b.roomId]}`}>
                          {b.roomName.split(' (')[0]}
                        </span>
                        
                        <div className="flex items-center space-x-1">
                          {isApproved ? (
                            <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                              <CheckCircle className="h-3 w-3 mr-0.5 shrink-0" />
                              อนุมัติแล้ว
                            </span>
                          ) : isPending ? (
                            <span className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                              <AlertCircle className="h-3 w-3 mr-0.5 shrink-0" />
                              รออนุมัติ
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                              ปฏิเสธ
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Title and details */}
                      <div className="space-y-1">
                        <h4 className="font-bold text-slate-800 text-sm line-clamp-1">{b.title}</h4>
                        {b.description && (
                          <p className="text-xs text-slate-500 line-clamp-2">{b.description}</p>
                        )}
                      </div>

                      {/* Time and Organizer */}
                      <div className="pt-2 border-t border-slate-100/60 flex items-center justify-between text-xs text-slate-500">
                        <div className="flex items-center space-x-1 font-mono text-slate-600">
                          <Clock className="h-3.5 w-3.5 text-slate-400" />
                          <span>
                            {new Date(b.startTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})} - {new Date(b.endTime).toLocaleTimeString('th-TH', {hour: '2-digit', minute: '2-digit'})}
                          </span>
                        </div>
                        <div className="font-medium text-slate-700">
                          {b.creatorName}
                        </div>
                      </div>

                      {/* Action Links */}
                      <div className="flex gap-2 pt-2">
                        {b.meetingLink && isApproved && (
                          <a 
                            href={b.meetingLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 text-center py-1.5 px-3 bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold rounded-lg text-xs hover:bg-indigo-100 transition-all flex items-center justify-center space-x-1"
                          >
                            <Video className="h-3.5 w-3.5" />
                            <span>เข้าร่วมสายประชุมออนไลน์</span>
                          </a>
                        )}
                        {(isAdmin || currentUserEmail === b.creatorEmail) && onDeleteBooking && (
                          <button
                            onClick={() => onDeleteBooking(b.id)}
                            className="p-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-all cursor-pointer flex items-center justify-center text-xs gap-1 font-semibold px-2.5"
                            title="ลบกิจกรรมการใช้ห้องประชุม"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {(!b.meetingLink || !isApproved) && <span>ลบกิจกรรม</span>}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
            ) : (
              <div className="text-center py-14 bg-slate-50 rounded-xl border border-dashed border-slate-200/80 text-slate-400 space-y-1.5">
                <p className="text-sm">ไม่มีกิจกรรมสำหรับวันนี้</p>
                <p className="text-xs">ห้องประชุมว่างพร้อมให้จอง</p>
              </div>
            )}
          </div>
        </div>

        {/* Quick action button bottom */}
        <div className="pt-4 border-t border-slate-100">
          <button
            onClick={() => {
              // Extract target date as local YYYY-MM-DD
              const localYear = selectedDate.getFullYear();
              const localMonth = String(selectedDate.getMonth() + 1).padStart(2, '0');
              const localDay = String(selectedDate.getDate()).padStart(2, '0');
              const formattedDate = `${localYear}-${localMonth}-${localDay}`;
              onOpenBookingModal(undefined, formattedDate);
            }}
            className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center justify-center space-x-2"
          >
            <Plus className="h-4 w-4" />
            <span>สร้างการจองสำหรับวันที่เลือก</span>
          </button>
        </div>

      </div>
    </div>
  );
}
