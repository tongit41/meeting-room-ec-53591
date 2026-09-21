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
  Trash2, 
  Pencil, 
  Users, 
  Megaphone, 
  Maximize2, 
  Minimize2, 
  Lock, 
  Star,
  Plane,
  UserMinus,
  Sparkles
} from 'lucide-react';
import { Booking, RoomId, MeetingRoom } from '../types';
import { MEETING_ROOMS } from '../lib/firebase';
import { 
  sortAttendeesByPriority, 
  isKeyAttendee, 
  canViewBookingDetails 
} from '../lib/permissions';

interface CalendarViewProps {
  bookings: Booking[];
  rooms: MeetingRoom[];
  onOpenBookingModal: (roomId?: RoomId, initialTime?: string) => void;
  onOpenAnnouncementModal?: (initialDate?: string, booking?: Booking) => void;
  currentUserEmail: string | null;
  isAdmin: boolean;
  onDeleteBooking?: (bookingId: string) => void;
  onEditBooking?: (booking: Booking) => void;
}

export default function CalendarView({
  bookings,
  rooms = MEETING_ROOMS,
  onOpenBookingModal,
  onOpenAnnouncementModal,
  currentUserEmail,
  isAdmin,
  onDeleteBooking,
  onEditBooking
}: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<RoomId | 'all' | 'none' | 'announcement'>('all');
  const [isFullWidth, setIsFullWidth] = useState(false);

  // Helper colors for rooms
  const getRoomDotColor = (roomId?: RoomId, isAnnouncement?: boolean, customColor?: string) => {
    if (isAnnouncement) {
      if (customColor === 'purple') return 'bg-purple-600';
      if (customColor === 'indigo') return 'bg-indigo-600';
      if (customColor === 'emerald') return 'bg-emerald-600';
      if (customColor === 'amber') return 'bg-amber-600';
      if (customColor === 'rose') return 'bg-rose-600';
      if (customColor === 'sky') return 'bg-sky-600';
      return 'bg-purple-600';
    }
    if (roomId === 'room1') return 'bg-emerald-500';
    if (roomId === 'room2') return 'bg-indigo-500';
    if (roomId === 'room3') return 'bg-amber-500';
    return 'bg-purple-500';
  };

  const getAnnouncementBannerBg = (customColor?: string) => {
    switch (customColor) {
      case 'indigo':
        return 'bg-indigo-600 hover:bg-indigo-700 text-white';
      case 'emerald':
        return 'bg-emerald-600 hover:bg-emerald-700 text-white';
      case 'amber':
        return 'bg-amber-600 hover:bg-amber-700 text-white';
      case 'rose':
        return 'bg-rose-600 hover:bg-rose-700 text-white';
      case 'sky':
        return 'bg-sky-600 hover:bg-sky-700 text-white';
      case 'purple':
      default:
        // Matches deep purple in Google Calendar screenshot ("ซ้อไปใต้")
        return 'bg-purple-700 hover:bg-purple-800 text-white';
    }
  };

  const getRoomTextColor = (roomId?: RoomId) => {
    if (roomId === 'room1') return 'text-emerald-700 bg-emerald-50 border-emerald-100';
    if (roomId === 'room2') return 'text-indigo-700 bg-indigo-50 border-indigo-100';
    if (roomId === 'room3') return 'text-amber-700 bg-amber-50 border-amber-100';
    return 'text-purple-700 bg-purple-50 border-purple-100';
  };

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

  // Helper to format ISO Date string (using local timezone values to prevent offset shifts)
  const getISODateStr = (date: Date) => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // Generate calendar grid days (including trailing days for grid alignment)
  const calendarDays: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }
  // Fill remaining cells to make full rows of 7
  while (calendarDays.length % 7 !== 0) {
    calendarDays.push(null);
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

  // Check if booking matches the active filter
  const isBookingMatchingFilter = (b: Booking) => {
    if (b.status === 'rejected') return false;
    const isAnnouncement = b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'));

    if (selectedRoomFilter === 'all') return true;
    if (selectedRoomFilter === 'announcement') return isAnnouncement;
    if (selectedRoomFilter === 'none') return !b.roomId && !isAnnouncement;
    return b.roomId === selectedRoomFilter;
  };

  // Get bookings for a specific day
  const getBookingsForDay = (date: Date) => {
    const dateStr = getISODateStr(date);
    return bookings.filter(b => {
      const bStartDate = b.startTime.split('T')[0];
      const bEndDate = b.endTime ? b.endTime.split('T')[0] : bStartDate;
      return dateStr >= bStartDate && dateStr <= bEndDate && isBookingMatchingFilter(b);
    });
  };

  // Filtered bookings to show on the selected day list
  const selectedDayBookings = getBookingsForDay(selectedDate);
  const selectedDayAnnouncements = selectedDayBookings.filter(
    b => b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'))
  );
  const selectedDayMeetings = selectedDayBookings.filter(
    b => !(b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ')))
  );

  const formatShortTime = (timeStr: string) => {
    if (!timeStr || !timeStr.includes('T')) return '';
    return timeStr.split('T')[1].slice(0, 5) + ' น.';
  };

  const isTodayDate = (date: Date) => {
    return getISODateStr(date) === getISODateStr(new Date());
  };

  const isSelectedDate = (date: Date) => {
    return getISODateStr(date) === getISODateStr(selectedDate);
  };

  const handleEdit = (b: Booking) => {
    if (b.entryType === 'announcement') {
      if (isAdmin && onOpenAnnouncementModal) {
        onOpenAnnouncementModal(undefined, b);
      } else if (isAdmin && onEditBooking) {
        onEditBooking(b);
      }
    } else {
      if (onEditBooking) {
        onEditBooking(b);
      }
    }
  };

  return (
    <div className={`grid grid-cols-1 ${isFullWidth ? 'lg:grid-cols-1' : 'lg:grid-cols-3'} gap-6`} id="calendar-view-root">
      {/* Calendar Main Sheet */}
      <div className={`${isFullWidth ? 'lg:col-span-1' : 'lg:col-span-2'} bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-5 transition-all`}>
        
        {/* Top Header: Title, Today Button, Month Nav, Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-[#3B82F6] rounded-xl border border-blue-100">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-bold text-[#0F172A]">ปฏิทินบริษัท & ห้องประชุม</h2>
                <span className="text-[11px] font-semibold bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full border border-slate-200">
                  Google Calendar View
                </span>
              </div>
              <p className="text-xs text-slate-500">
                รวมตารางใช้ห้องประชุมและประกาศข่าวสาร (ไปต่างจังหวัด, ลา, ไม่อยู่)
              </p>
            </div>
          </div>
          
          {/* Navigation and Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={navigateToday}
              className="px-3 py-1.5 bg-white border border-slate-300 text-xs font-bold rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
            >
              วันนี้
            </button>

            <div className="flex items-center bg-slate-50 rounded-lg border border-slate-200 p-0.5 shadow-2xs">
              <button 
                onClick={navigatePrevMonth}
                className="p-1.5 hover:bg-slate-200 rounded-md transition-colors cursor-pointer text-slate-600"
                title="เดือนก่อนหน้า"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-bold text-slate-800 px-3 min-w-[120px] text-center select-none">
                {getThaiMonthName(month)} {year + 543}
              </span>
              <button 
                onClick={navigateNextMonth}
                className="p-1.5 hover:bg-slate-200 rounded-md transition-colors cursor-pointer text-slate-600"
                title="เดือนถัดไป"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* View Width Toggle */}
            <button
              onClick={() => setIsFullWidth(!isFullWidth)}
              className="p-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200 rounded-lg transition-colors cursor-pointer hidden md:flex items-center space-x-1 text-xs font-medium"
              title={isFullWidth ? "แสดงแถบรายละเอียดด้านข้าง" : "ขยายเต็มหน้าจอ"}
            >
              {isFullWidth ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>

            {/* Quick Create Buttons */}
            {isAdmin && onOpenAnnouncementModal && (
              <button
                onClick={() => onOpenAnnouncementModal(getISODateStr(selectedDate))}
                className="px-3.5 py-1.5 bg-[#C084FC] hover:bg-[#A855F7] text-white text-xs font-semibold rounded-xl shadow-[0_4px_14px_rgba(192,132,252,0.3)] flex items-center space-x-1.5 cursor-pointer transition-all"
                title="ลงประกาศ / แจ้งไม่อยู่ ไม่ต้องเลือกห้องประชุม (เฉพาะผู้ดูแลระบบ)"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span>+ ลงประกาศ</span>
              </button>
            )}

            <button
              onClick={() => onOpenBookingModal(undefined, getISODateStr(selectedDate))}
              className="px-3.5 py-1.5 bg-[#60A5FA] hover:bg-[#3B82F6] text-white text-xs font-semibold rounded-xl shadow-[0_4px_14px_rgba(96,165,250,0.3)] hover:shadow-[0_6px_15px_-3px_rgba(59,130,246,0.25)] flex items-center space-x-1.5 cursor-pointer transition-all"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ จองห้องประชุม</span>
            </button>
          </div>
        </div>

        {/* Filter Toolbar: Rooms + Announcements */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/80">
          <div className="flex items-center space-x-2 text-slate-500 text-xs font-medium shrink-0">
            <Filter className="h-3.5 w-3.5" />
            <span>แสดงบนปฏิทิน:</span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              onClick={() => setSelectedRoomFilter('all')}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                selectedRoomFilter === 'all'
                ? 'bg-slate-800 text-white border-slate-800 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ทั้งหมด
            </button>

            <button
              onClick={() => setSelectedRoomFilter('announcement')}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all flex items-center space-x-1 cursor-pointer ${
                selectedRoomFilter === 'announcement'
                ? 'bg-purple-700 text-white border-purple-700 shadow-2xs'
                : 'bg-white text-purple-700 border-purple-200 hover:bg-purple-50'
              }`}
            >
              <Megaphone className="h-3 w-3" />
              <span>ประกาศ & ข่าวสาร</span>
            </button>

            {rooms.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRoomFilter(r.id)}
                className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  selectedRoomFilter === r.id
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {r.name.includes('(') ? r.name.split('(')[0].trim() : r.name}
              </button>
            ))}

            <button
              onClick={() => setSelectedRoomFilter('none')}
              className={`text-[11px] font-bold px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                selectedRoomFilter === 'none'
                ? 'bg-slate-700 text-white border-slate-700 shadow-2xs'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              ออนไลน์ / อื่นๆ
            </button>
          </div>
        </div>

        {/* Days of Week Header (Google Calendar Style) */}
        <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 border-b border-slate-200 pb-2">
          <div className="text-rose-500">อา.</div>
          <div>จ.</div>
          <div>อ.</div>
          <div>พ.</div>
          <div>พฤ.</div>
          <div>ศ.</div>
          <div className="text-indigo-500">ส.</div>
        </div>

        {/* Calendar Month Grid - Modeled after Google Calendar */}
        <div className="grid grid-cols-7 border-t border-l border-slate-200 bg-slate-100 gap-px rounded-xl overflow-hidden shadow-2xs">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return (
                <div 
                  key={`empty-${idx}`} 
                  className="bg-slate-50/50 min-h-[95px] sm:min-h-[125px] border-r border-b border-slate-200/80 p-1.5" 
                />
              );
            }

            const dayBookings = getBookingsForDay(day);
            const isToday = isTodayDate(day);
            const isSelected = isSelectedDate(day);

            // Separate All-Day/Announcements vs. Timed Events (as in Google Calendar)
            const allDayOrAnnouncements = dayBookings.filter(
              b => b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'))
            );
            const timedEvents = dayBookings
              .filter(b => !(b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'))))
              .sort((a, b) => a.startTime.localeCompare(b.startTime));

            // Combined ordered items for display limit
            const allItems = [...allDayOrAnnouncements, ...timedEvents];
            const MAX_DISPLAY = 3;
            const visibleItems = allItems.slice(0, MAX_DISPLAY);
            const hiddenCount = allItems.length - MAX_DISPLAY;

            return (
              <div
                key={`day-${idx}`}
                onClick={() => setSelectedDate(day)}
                className={`bg-white min-h-[95px] sm:min-h-[125px] border-r border-b border-slate-200 p-1 sm:p-1.5 flex flex-col justify-between transition-colors cursor-pointer group hover:bg-slate-50/90 relative ${
                  isSelected 
                    ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/30' 
                    : isToday 
                      ? 'bg-blue-50/30' 
                      : ''
                }`}
              >
                {/* Day Header: Day Number */}
                <div className="flex items-center justify-between mb-1">
                  {isToday ? (
                    // Google Calendar today badge: round blue circle with white text
                    <div className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-blue-600 text-white font-bold text-[11px] sm:text-xs flex items-center justify-center shadow-xs">
                      {day.getDate()}
                    </div>
                  ) : (
                    <span className={`text-[11px] sm:text-xs font-semibold px-1 py-0.5 rounded leading-none ${
                      isSelected ? 'text-indigo-700 font-bold bg-indigo-100' : 'text-slate-700 group-hover:text-blue-600'
                    }`}>
                      {day.getDate()}
                    </span>
                  )}

                  {/* Plus button to add quick item on this day */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedDate(day);
                      onOpenBookingModal(undefined, getISODateStr(day));
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-indigo-600 transition-opacity p-0.5 rounded hover:bg-slate-200/60"
                    title={`เพิ่มกิจกรรมวันที่ ${day.getDate()}`}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Event Items Inside Day Cell (Google Calendar Layout) */}
                <div className="space-y-1 flex-1 overflow-hidden">
                  {visibleItems.map((item, itemIdx) => {
                    const isAnnounce = item.entryType === 'announcement' || item.isAllDay || (!item.roomId && item.roomName?.includes('ประกาศ'));
                    const canView = canViewBookingDetails(item, currentUserEmail, isAdmin);
                    const itemTitle = canView ? item.title : 'ห้องประชุมไม่ว่าง';

                    if (isAnnounce) {
                      // Solid Color Banner like "ซ้อไปใต้" in Google Calendar
                      return (
                        <div
                          key={`item-${item.id || itemIdx}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedDate(day);
                          }}
                          title={`ประกาศ: ${itemTitle}${item.description ? ` - ${item.description}` : ''}`}
                          className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium leading-tight truncate shadow-2xs transition-all flex items-center space-x-1 ${getAnnouncementBannerBg(item.color)}`}
                        >
                          <span className="truncate">{itemTitle}</span>
                        </div>
                      );
                    }

                    // Timed Event: Dot + Time + Title (e.g. 09:00 น. ประชุมฝ่ายโฮมแคร์)
                    return (
                      <div
                        key={`item-${item.id || itemIdx}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedDate(day);
                        }}
                        title={`${formatShortTime(item.startTime)} ${itemTitle} (${item.roomName ? item.roomName.split(' (')[0] : ''})`}
                        className="w-full text-left px-1 py-0.5 rounded text-[10px] sm:text-[11px] text-slate-800 hover:bg-slate-100 transition-colors flex items-center space-x-1 truncate"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getRoomDotColor(item.roomId, false)}`} />
                        <span className="font-semibold text-slate-600 shrink-0 text-[9px] sm:text-[10px]">
                          {formatShortTime(item.startTime)}
                        </span>
                        <span className="truncate text-slate-800">
                          {itemTitle}
                        </span>
                        {item.isConfidential && (
                          <Lock className="h-2.5 w-2.5 text-amber-600 shrink-0 inline ml-0.5" />
                        )}
                      </div>
                    );
                  })}

                  {/* "อีก X รายการ" link if items exceed display limit, exactly like Google Calendar */}
                  {hiddenCount > 0 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedDate(day);
                      }}
                      className="text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-slate-100 px-1.5 py-0.5 rounded block text-left transition-colors cursor-pointer"
                    >
                      อีก {hiddenCount} รายการ
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Calendar Footer Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center space-x-1.5">
              <span className="w-3 h-3 rounded bg-purple-700 inline-block" />
              <span className="text-[11px]">แถบประกาศ / ข่าวสาร (ไม่ต้องเลือกห้อง)</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span className="text-[11px]">ห้องประชุม 1</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 inline-block" />
              <span className="text-[11px]">ห้องประชุม 2</span>
            </div>
            <div className="flex items-center space-x-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span className="text-[11px]">ห้องประชุม 3</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-400">
            คลิกที่ช่องวันที่เพื่อดูหรือจัดการรายการกิจกรรมทั้งหมด
          </div>
        </div>
      </div>

      {/* Selected Day Details Panel (Sidebar) */}
      {!isFullWidth && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm flex flex-col justify-between space-y-5">
          <div className="space-y-4">
            {/* Header of selected day */}
            <div className="space-y-1 pb-4 border-b border-slate-100">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 block">
                  ตารางกิจกรรม & ประกาศ
                </span>
                {isTodayDate(selectedDate) && (
                  <span className="text-[10px] font-bold px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full">
                    วันนี้
                  </span>
                )}
              </div>
              <h3 className="font-bold text-slate-800 text-lg leading-tight">
                {selectedDate.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </h3>
              <p className="text-xs text-slate-500">
                รวม {selectedDayBookings.length} รายการ (ประกาศ {selectedDayAnnouncements.length}, ประชุม {selectedDayMeetings.length})
              </p>
            </div>

            {/* Content List for Selected Day */}
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {/* 1. Announcements section */}
              {selectedDayAnnouncements.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-purple-800">
                    <Megaphone className="h-3.5 w-3.5" />
                    <span>ประกาศ / แจ้งไม่อยู่ ({selectedDayAnnouncements.length})</span>
                  </div>
                  {selectedDayAnnouncements.map((announce) => {
                    const isCreator = currentUserEmail && announce.creatorEmail?.toLowerCase() === currentUserEmail.toLowerCase();
                    const canManage = isAdmin || isCreator;
                    return (
                      <div
                        key={announce.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-2 ${getAnnouncementBannerBg(announce.color)} bg-opacity-95 shadow-2xs`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-md bg-white/20 text-white">
                              {announce.isAllDay ? 'ตลอดทั้งวัน' : `${formatShortTime(announce.startTime)} - ${formatShortTime(announce.endTime)}`}
                            </span>
                            <h4 className="font-bold text-white text-sm leading-snug">
                              {announce.title}
                            </h4>
                          </div>
                          {canManage && (
                            <div className="flex items-center space-x-1 shrink-0">
                              <button
                                onClick={() => handleEdit(announce)}
                                className="p-1 rounded-md bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
                                title="แก้ไขประกาศ"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                              {onDeleteBooking && (
                                <button
                                  onClick={() => onDeleteBooking(announce.id)}
                                  className="p-1 rounded-md bg-white/20 hover:bg-rose-600 text-white transition-colors cursor-pointer"
                                  title="ลบประกาศ"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {announce.description && (
                          <p className="text-xs text-white/90 leading-relaxed">
                            {announce.description}
                          </p>
                        )}

                        <div className="pt-2 border-t border-white/20 flex items-center justify-between text-[11px] text-white/80">
                          <span>แจ้งโดย: {announce.creatorName || announce.creatorEmail}</span>
                          {announce.attendees && announce.attendees.length > 0 && (
                            <span className="font-semibold text-white">
                              {announce.attendees.map(a => a.nickname || a.displayName.split(' ')[0]).join(', ')}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 2. Meeting Bookings section */}
              {selectedDayMeetings.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center space-x-1.5 text-xs font-bold text-slate-700">
                    <Calendar className="h-3.5 w-3.5 text-indigo-600" />
                    <span>การใช้ห้องประชุม ({selectedDayMeetings.length})</span>
                  </div>
                  {selectedDayMeetings.map((b) => {
                    const isApproved = b.status === 'approved';
                    const isPending = b.status === 'pending';
                    const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
                    const isCreator = currentUserEmail && b.creatorEmail?.toLowerCase() === currentUserEmail.toLowerCase();
                    const canManage = isAdmin || isCreator;

                    return (
                      <div
                        key={b.id}
                        className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                          isApproved 
                            ? 'bg-slate-50/60 border-slate-200/80 hover:border-slate-300' 
                            : isPending 
                              ? 'bg-amber-50/40 border-amber-200' 
                              : 'bg-rose-50/30 border-rose-200'
                        }`}
                      >
                        {/* Room and Status */}
                        <div className="flex justify-between items-start gap-2">
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${getRoomTextColor(b.roomId)}`}>
                            {b.roomName ? b.roomName.split(' (')[0] : 'ประชุมออนไลน์'}
                          </span>
                          <div className="flex items-center space-x-1">
                            {isApproved ? (
                              <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-100">
                                <CheckCircle className="h-3 w-3 mr-0.5" />
                                อนุมัติแล้ว
                              </span>
                            ) : isPending ? (
                              <span className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                                <AlertCircle className="h-3 w-3 mr-0.5" />
                                รออนุมัติ
                              </span>
                            ) : (
                              <span className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100">
                                ปฏิเสธ
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Title */}
                        <div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <h4 className="font-bold text-slate-800 text-sm">
                              {canView ? b.title : 'ห้องประชุมไม่ว่าง'}
                            </h4>
                            {b.isConfidential && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded">
                                <Lock className="h-2.5 w-2.5 text-amber-600" />
                                <span>ประชุมลับ</span>
                              </span>
                            )}
                          </div>
                          {canView && b.description && (
                            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{b.description}</p>
                          )}
                        </div>

                        {/* Time & Creator */}
                        <div className="flex items-center justify-between text-xs text-slate-500 pt-1.5 border-t border-slate-100">
                          <div className="flex items-center space-x-1 font-mono text-slate-600">
                            <Clock className="h-3.5 w-3.5 text-slate-400" />
                            <span>
                              {new Date(b.startTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} - {new Date(b.endTime).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.
                            </span>
                          </div>
                          <div className="font-medium text-slate-700 flex items-center gap-1">
                            <span>{b.creatorName || 'ผู้จองภายใน'}</span>
                            {isKeyAttendee(b.creatorEmail) && (
                              <Star className="h-3 w-3 text-amber-500 fill-amber-400" title="ผู้จองคนสำคัญ" />
                            )}
                          </div>
                        </div>

                        {/* Attendees List */}
                        {b.attendees && b.attendees.length > 0 && (
                          <div className="pt-1.5 border-t border-slate-100 space-y-1">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                              <span className="flex items-center space-x-1">
                                <Users className="h-3 w-3 text-indigo-500" />
                                <span>ผู้เข้าร่วมประชุม ({b.attendees.length} ท่าน):</span>
                              </span>
                            </div>
                            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                              {sortAttendeesByPriority(b.attendees).map((att, aIdx) => {
                                const isVIP = isKeyAttendee(att.email);
                                return (
                                  <span
                                    key={aIdx}
                                    className={`inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-md ${
                                      isVIP 
                                        ? 'bg-amber-100 text-amber-900 border border-amber-300 font-bold' 
                                        : 'bg-slate-100 text-slate-700'
                                    }`}
                                  >
                                    {isVIP && <Star className="h-2.5 w-2.5 fill-amber-500 text-amber-500" />}
                                    <span>{att.displayName}{att.nickname ? ` (${att.nickname})` : ''}</span>
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex gap-2 pt-1.5">
                          {canView && b.meetingLink && isApproved && (
                            <a
                              href={b.meetingLink}
                              target="_blank"
                              rel="noreferrer"
                              className="flex-1 py-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs flex items-center justify-center space-x-1 transition-colors"
                            >
                              <Video className="h-3 w-3" />
                              <span>เข้าร่วมสายประชุม</span>
                            </a>
                          )}
                          {canManage && onEditBooking && (
                            <button
                              onClick={() => handleEdit(b)}
                              className="p-1 px-2 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              title="แก้ไขกิจกรรม"
                            >
                              <Pencil className="h-3 w-3" />
                              <span>แก้ไข</span>
                            </button>
                          )}
                          {canManage && onDeleteBooking && (
                            <button
                              onClick={() => onDeleteBooking(b.id)}
                              className="p-1 px-2 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                              title="ลบกิจกรรม"
                            >
                              <Trash2 className="h-3 w-3" />
                              {(!b.meetingLink || !isApproved || !canView) && <span>ลบ</span>}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Empty state */}
              {selectedDayBookings.length === 0 && (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 space-y-2">
                  <Calendar className="h-8 w-8 mx-auto text-slate-300" />
                  <p className="text-xs font-semibold text-slate-600">ไม่มีกิจกรรมหรือประกาศสำหรับวันนี้</p>
                  <p className="text-[11px] text-slate-400">ห้องประชุมว่างทุกห้องพร้อมใช้งาน</p>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Action Buttons */}
          <div className={`pt-3 border-t border-slate-100 grid ${isAdmin && onOpenAnnouncementModal ? 'grid-cols-2' : 'grid-cols-1'} gap-2`}>
            {isAdmin && onOpenAnnouncementModal && (
              <button
                onClick={() => onOpenAnnouncementModal(getISODateStr(selectedDate))}
                className="py-2.5 px-3 bg-purple-700 hover:bg-purple-800 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span>+ ลงประกาศวันนี้</span>
              </button>
            )}

            <button
              onClick={() => onOpenBookingModal(undefined, getISODateStr(selectedDate))}
              className={`py-2.5 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center justify-center space-x-1.5 cursor-pointer ${
                !(isAdmin && onOpenAnnouncementModal) ? 'col-span-1' : ''
              }`}
            >
              <Plus className="h-3.5 w-3.5" />
              <span>+ จองห้องวันนี้</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
