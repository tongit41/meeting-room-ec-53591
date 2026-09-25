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
  CheckCircle, 
  AlertCircle, 
  Trash2, 
  Pencil, 
  Users, 
  Megaphone, 
  Lock, 
  Star,
  Copy,
  Check,
  ExternalLink,
  X,
  FileText,
  Building,
  Tv,
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
  const [selectedRoomFilter, setSelectedRoomFilter] = useState<RoomId | 'all' | 'none' | 'announcement'>('all');
  
  // Google Calendar Pop-up States
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [selectedDayForOverview, setSelectedDayForOverview] = useState<Date | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

  // Helper colors for rooms & dots
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
        return 'bg-purple-700 hover:bg-purple-800 text-white';
    }
  };

  const getRoomTextColor = (roomId?: RoomId) => {
    if (roomId === 'room1') return 'text-emerald-700 bg-emerald-50 border-emerald-200';
    if (roomId === 'room2') return 'text-indigo-700 bg-indigo-50 border-indigo-200';
    if (roomId === 'room3') return 'text-amber-700 bg-amber-50 border-amber-200';
    return 'text-purple-700 bg-purple-50 border-purple-200';
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

  // Generate calendar grid days
  const calendarDays: (Date | null)[] = [];
  for (let i = 0; i < firstDayIndex; i++) {
    calendarDays.push(null);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    calendarDays.push(new Date(year, month, d));
  }
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

  const formatShortTime = (timeStr: string) => {
    if (!timeStr || !timeStr.includes('T')) return '';
    return timeStr.split('T')[1].slice(0, 5) + ' น.';
  };

  const isTodayDate = (date: Date) => {
    return getISODateStr(date) === getISODateStr(new Date());
  };

  // Thai Date formatting helper for Google Calendar Pop-up
  const formatThaiFullDate = (dateStrOrDate: string | Date) => {
    const d = typeof dateStrOrDate === 'string' ? new Date(dateStrOrDate) : dateStrOrDate;
    if (isNaN(d.getTime())) return '';
    const weekdays = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];
    const months = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    return `${weekdays[d.getDay()]}ที่ ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear() + 543}`;
  };

  // Permissions helpers
  const isCreator = (b: Booking) => {
    return !!(currentUserEmail && b.creatorEmail?.toLowerCase().trim() === currentUserEmail.toLowerCase().trim());
  };

  const canManageBooking = (b: Booking) => {
    return isAdmin || isCreator(b);
  };

  const handleEditClick = (b: Booking) => {
    setSelectedBooking(null);
    setSelectedDayForOverview(null);
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

  const handleDeleteClick = (b: Booking) => {
    setSelectedBooking(null);
    setSelectedDayForOverview(null);
    if (onDeleteBooking) {
      onDeleteBooking(b.id);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  return (
    <div className="w-full space-y-4" id="calendar-view-root">
      {/* Calendar Main Sheet - Full Width Google Calendar Layout */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4 transition-all">
        
        {/* Top Header: Title, Today Button, Month Nav, Action Buttons */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2 border-b border-slate-100">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-50 text-[#3B82F6] rounded-xl border border-blue-100">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h2 className="text-lg sm:text-xl font-bold text-[#0F172A]">ปฏิทินบริษัท & ห้องประชุม</h2>
                <span className="text-[11px] font-semibold bg-blue-50 text-blue-700 px-2.5 py-0.5 rounded-full border border-blue-200/60">
                  Google Calendar View
                </span>
              </div>
              <p className="text-xs text-slate-500">
                คลิกที่รายการกิจกรรมเพื่อดูป๊อบอัปรายละเอียดแบบ Google Calendar ได้ทันที
              </p>
            </div>
          </div>
          
          {/* Navigation and Actions */}
          <div className="flex flex-wrap items-center gap-2">
            <button 
              onClick={navigateToday}
              className="px-3.5 py-1.5 bg-white border border-slate-300 text-xs font-bold rounded-lg text-slate-700 hover:bg-slate-50 hover:border-slate-400 transition-colors shadow-2xs cursor-pointer"
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
              <span className="text-xs sm:text-sm font-bold text-slate-800 px-3 min-w-[130px] text-center select-none">
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

            {/* Quick Create Buttons */}
            {isAdmin && onOpenAnnouncementModal && (
              <button
                onClick={() => onOpenAnnouncementModal(getISODateStr(new Date()))}
                className="px-3.5 py-1.5 bg-[#C084FC] hover:bg-[#A855F7] text-white text-xs font-semibold rounded-xl shadow-[0_4px_14px_rgba(192,132,252,0.3)] flex items-center space-x-1.5 cursor-pointer transition-all"
                title="ลงประกาศ / แจ้งไม่อยู่ ไม่ต้องเลือกห้องประชุม (เฉพาะผู้ดูแลระบบ)"
              >
                <Megaphone className="h-3.5 w-3.5" />
                <span>+ ลงประกาศ</span>
              </button>
            )}

            <button
              onClick={() => onOpenBookingModal(undefined, getISODateStr(new Date()))}
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

        {/* Calendar Month Grid - Modeled after Google Calendar full-width layout */}
        <div className="grid grid-cols-7 border-t border-l border-slate-200 bg-slate-200/80 gap-px rounded-xl overflow-hidden shadow-2xs">
          {calendarDays.map((day, idx) => {
            if (day === null) {
              return (
                <div 
                  key={`empty-${idx}`} 
                  className="bg-slate-50/50 min-h-[105px] sm:min-h-[135px] border-r border-b border-slate-200/80 p-1.5" 
                />
              );
            }

            const dayBookings = getBookingsForDay(day);
            const isToday = isTodayDate(day);

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
                onClick={() => {
                  if (allItems.length > 0) {
                    setSelectedDayForOverview(day);
                  } else {
                    onOpenBookingModal(undefined, getISODateStr(day));
                  }
                }}
                className={`bg-white min-h-[105px] sm:min-h-[135px] border-r border-b border-slate-200 p-1 sm:p-1.5 flex flex-col justify-between transition-colors cursor-pointer group hover:bg-slate-50/90 relative ${
                  isToday ? 'bg-blue-50/20' : ''
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
                    <span className="text-[11px] sm:text-xs font-semibold px-1 py-0.5 rounded leading-none text-slate-700 group-hover:text-blue-600">
                      {day.getDate()}
                    </span>
                  )}

                  {/* Plus button to add quick item on this day */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onOpenBookingModal(undefined, getISODateStr(day));
                    }}
                    className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-blue-600 transition-opacity p-0.5 rounded hover:bg-slate-200/60"
                    title={`เพิ่มการจองวันที่ ${day.getDate()}`}
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
                            setSelectedBooking(item);
                          }}
                          title={`ประกาศ: ${itemTitle}${item.description ? ` - ${item.description}` : ''}`}
                          className={`w-full text-left px-1.5 py-0.5 rounded text-[10px] sm:text-[11px] font-medium leading-tight truncate shadow-2xs transition-all flex items-center space-x-1 cursor-pointer hover:brightness-110 active:scale-[0.99] ${getAnnouncementBannerBg(item.color)}`}
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
                          setSelectedBooking(item);
                        }}
                        title={`${formatShortTime(item.startTime)} ${itemTitle} (${item.roomName ? item.roomName.split(' (')[0] : ''})`}
                        className="w-full text-left px-1 py-0.5 rounded text-[10px] sm:text-[11px] text-slate-800 hover:bg-blue-50/70 hover:text-blue-900 transition-all flex items-center space-x-1 truncate cursor-pointer active:scale-[0.99]"
                      >
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${getRoomDotColor(item.roomId, false)}`} />
                        <span className="font-semibold text-slate-600 shrink-0 text-[9px] sm:text-[10px]">
                          {formatShortTime(item.startTime)}
                        </span>
                        <span className="truncate text-slate-800 font-medium">
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
                        setSelectedDayForOverview(day);
                      }}
                      className="text-[10px] sm:text-[11px] font-semibold text-slate-600 hover:text-blue-600 hover:bg-blue-50/50 px-1.5 py-0.5 rounded block text-left transition-colors cursor-pointer"
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
            คลิกที่แถบหรือชื่อกิจกรรมเพื่อเปิดดูการ์ดข้อมูลแบบ Google Calendar
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* GOOGLE CALENDAR EVENT POPUP DIALOG (Card Pop-up) */}
      {/* ========================================================================= */}
      {selectedBooking && (() => {
        const b = selectedBooking;
        const isAnnounce = b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'));
        const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
        const canManage = canManageBooking(b);
        const isApproved = b.status === 'approved';
        const isPending = b.status === 'pending';
        const displayTitle = canView ? b.title : 'ห้องประชุมไม่ว่าง';
        const roomInfo = rooms.find(r => r.id === b.roomId);

        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setSelectedBooking(null)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[90vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Google Calendar Top Action Bar */}
              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 bg-slate-50/70">
                <div className="flex items-center space-x-2">
                  <span className={`w-3.5 h-3.5 rounded-full ${getRoomDotColor(b.roomId, isAnnounce, b.color)} shadow-2xs`} />
                  <span className="text-xs font-bold text-slate-600">
                    {isAnnounce ? 'ประกาศ / ข่าวสาร' : (b.roomName ? b.roomName.split(' (')[0] : 'การประชุม')}
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  {canManage && (
                    <button
                      onClick={() => handleEditClick(b)}
                      className="p-1.5 rounded-full hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                      title="แก้ไข"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  )}
                  {canManage && onDeleteBooking && (
                    <button
                      onClick={() => handleDeleteClick(b)}
                      className="p-1.5 rounded-full hover:bg-rose-100 text-slate-600 hover:text-rose-600 transition-colors cursor-pointer"
                      title="ลบ / ยกเลิก"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const shareText = `${displayTitle}\n${formatThaiFullDate(b.startTime)}\nเวลา: ${formatShortTime(b.startTime)} - ${formatShortTime(b.endTime)}${b.meetingLink ? `\nลิงก์ประชุม: ${b.meetingLink}` : ''}`;
                      handleCopy(shareText);
                    }}
                    className="p-1.5 rounded-full hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
                    title={copiedLink ? "คัดลอกแล้ว!" : "คัดลอกรายละเอียด"}
                  >
                    {copiedLink ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                  </button>
                  <button
                    onClick={() => setSelectedBooking(null)}
                    className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                    title="ปิด"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Main Card Content */}
              <div className="p-5 sm:p-6 overflow-y-auto space-y-4">
                {/* Title & Badges */}
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {/* Status Badge */}
                    {!isAnnounce && (
                      isApproved ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle className="h-3 w-3 mr-1 text-emerald-600" />
                          อนุมัติแล้ว
                        </span>
                      ) : isPending ? (
                        <span className="inline-flex items-center text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                          <AlertCircle className="h-3 w-3 mr-1 text-amber-600" />
                          รออนุมัติ
                        </span>
                      ) : (
                        <span className="inline-flex items-center text-[10px] font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                          ปฏิเสธ
                        </span>
                      )
                    )}

                    {/* Room Badge */}
                    <span className={`inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoomTextColor(b.roomId)}`}>
                      {isAnnounce ? 'ประกาศบริษัท' : (b.roomName || 'ประชุมออนไลน์')}
                    </span>

                    {/* Confidential Badge */}
                    {b.isConfidential && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                        <Lock className="h-2.5 w-2.5 text-amber-600" />
                        <span>ประชุมลับ</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-xl sm:text-2xl font-bold text-slate-900 leading-snug">
                    {displayTitle}
                  </h3>
                </div>

                {/* Date & Time Section (Google Calendar Style) */}
                <div className="flex items-start space-x-3 text-slate-700 pt-1">
                  <Clock className="h-4 w-4 text-slate-400 mt-1 shrink-0" />
                  <div className="space-y-0.5 text-xs sm:text-sm">
                    <p className="font-semibold text-slate-800">
                      {formatThaiFullDate(b.startTime)}
                    </p>
                    <p className="text-slate-500">
                      {b.isAllDay ? (
                        <span className="font-medium text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-100">
                          ตลอดทั้งวัน
                        </span>
                      ) : (
                        `${formatShortTime(b.startTime)} - ${formatShortTime(b.endTime)}`
                      )}
                    </p>
                  </div>
                </div>

                {/* Google Meet Video Conference Button (Google Calendar Spec) */}
                {canView && b.meetingLink && (
                  <div className="p-3.5 bg-blue-50/70 border border-blue-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2 text-blue-900 font-bold text-xs">
                        <Video className="h-4 w-4 text-blue-600" />
                        <span>Google Meet Video Conference</span>
                      </div>
                      <button
                        onClick={() => handleCopy(b.meetingLink)}
                        className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center space-x-1 cursor-pointer"
                      >
                        {copiedLink ? (
                          <>
                            <Check className="h-3 w-3 text-emerald-600" />
                            <span className="text-emerald-600">คัดลอกแล้ว</span>
                          </>
                        ) : (
                          <>
                            <Copy className="h-3 w-3" />
                            <span>คัดลอกลิงก์</span>
                          </>
                        )}
                      </button>
                    </div>

                    <a
                      href={b.meetingLink}
                      target="_blank"
                      rel="noreferrer"
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm flex items-center justify-center space-x-2 shadow-xs hover:shadow-md transition-all cursor-pointer"
                    >
                      <Video className="h-4 w-4" />
                      <span>เข้าร่วมด้วย Google Meet</span>
                      <ExternalLink className="h-3.5 w-3.5 ml-1 opacity-70" />
                    </a>
                    
                    <p className="text-[11px] text-slate-500 truncate font-mono select-all">
                      {b.meetingLink}
                    </p>
                  </div>
                )}

                {/* Location / Room Details */}
                {!isAnnounce && (
                  <div className="flex items-start space-x-3 text-slate-700 pt-1">
                    <MapPin className="h-4 w-4 text-slate-400 mt-1 shrink-0" />
                    <div className="space-y-1 text-xs sm:text-sm">
                      <p className="font-semibold text-slate-800">
                        {b.roomName || 'ประชุมออนไลน์'}
                      </p>
                      {roomInfo && (
                        <div className="space-y-1 text-xs text-slate-500">
                          <p>รองรับสูงสุด {roomInfo.capacity} ที่นั่ง</p>
                          {roomInfo.amenities && roomInfo.amenities.length > 0 && (
                            <div className="flex flex-wrap gap-1 pt-0.5">
                              {roomInfo.amenities.map((amenity, aIdx) => (
                                <span key={aIdx} className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                                  {amenity}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Organizer & Attendees Section */}
                <div className="flex items-start space-x-3 text-slate-700 pt-1">
                  <Users className="h-4 w-4 text-slate-400 mt-1 shrink-0" />
                  <div className="space-y-2 text-xs sm:text-sm flex-1">
                    {/* Organizer */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-slate-800">
                          ผู้จัด: {b.creatorName || b.creatorEmail}
                        </span>
                        {isKeyAttendee(b.creatorEmail) && (
                          <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" title="ผู้จองคนสำคัญ" />
                        )}
                      </div>
                      {b.attendees && b.attendees.length > 0 && (
                        <span className="text-xs text-slate-500 font-medium">
                          {b.attendees.length} คน
                        </span>
                      )}
                    </div>

                    {/* Attendees list chips */}
                    {b.attendees && b.attendees.length > 0 && (
                      <div className="bg-slate-50 rounded-xl p-2.5 border border-slate-200/80 space-y-1.5">
                        <span className="text-[11px] font-bold text-slate-600 block">
                          รายชื่อผู้เข้าร่วมประชุม:
                        </span>
                        <div className="flex flex-wrap gap-1.5 max-h-36 overflow-y-auto pr-1">
                          {sortAttendeesByPriority(b.attendees).map((att, aIdx) => {
                            const isVIP = isKeyAttendee(att.email);
                            return (
                              <span
                                key={aIdx}
                                className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg ${
                                  isVIP 
                                    ? 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold' 
                                    : 'bg-white text-slate-700 border border-slate-200'
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
                  </div>
                </div>

                {/* Description / Agenda */}
                {canView && b.description && (
                  <div className="flex items-start space-x-3 text-slate-700 pt-1">
                    <FileText className="h-4 w-4 text-slate-400 mt-1 shrink-0" />
                    <div className="space-y-1 text-xs sm:text-sm flex-1">
                      <span className="font-semibold text-slate-800 block">
                        รายละเอียด / วาระการประชุม:
                      </span>
                      <p className="text-slate-600 whitespace-pre-line leading-relaxed bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 text-xs">
                        {b.description}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Action Buttons */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center space-x-2">
                  {canManage && (
                    <button
                      onClick={() => handleEditClick(b)}
                      className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>แก้ไข</span>
                    </button>
                  )}
                  {canManage && onDeleteBooking && (
                    <button
                      onClick={() => handleDeleteClick(b)}
                      className="px-3 py-1.5 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>ยกเลิกการจอง</span>
                    </button>
                  )}
                </div>

                <button
                  onClick={() => setSelectedBooking(null)}
                  className="px-4 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer ml-auto"
                >
                  ปิดหน้าต่าง
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ========================================================================= */}
      {/* GOOGLE CALENDAR DAY OVERVIEW DIALOG (When clicking "+X more" or a Day cell) */}
      {/* ========================================================================= */}
      {selectedDayForOverview && (() => {
        const day = selectedDayForOverview;
        const dayBookings = getBookingsForDay(day);
        const dayAnnouncements = dayBookings.filter(
          b => b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ'))
        );
        const dayMeetings = dayBookings.filter(
          b => !(b.entryType === 'announcement' || b.isAllDay || (!b.roomId && b.roomName?.includes('ประกาศ')))
        );

        return (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
            onClick={() => setSelectedDayForOverview(null)}
          >
            <div 
              className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Day Overview Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/80">
                <div>
                  <span className="text-[10px] font-bold text-blue-600 uppercase tracking-wider block">
                    ตารางกิจกรรมประจำวัน
                  </span>
                  <h3 className="text-base font-bold text-slate-800">
                    {formatThaiFullDate(day)}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedDayForOverview(null)}
                  className="p-1.5 rounded-full hover:bg-slate-200 text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  title="ปิด"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Day Events List */}
              <div className="p-4 sm:p-5 overflow-y-auto space-y-3 flex-1">
                {dayBookings.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 space-y-2">
                    <Calendar className="h-8 w-8 mx-auto text-slate-300" />
                    <p className="text-xs font-semibold text-slate-600">ไม่มีกิจกรรมสำหรับวันนี้</p>
                    <p className="text-[11px] text-slate-400">ห้องประชุมว่างพร้อมให้คุณจองใช้งาน</p>
                  </div>
                ) : (
                  <>
                    {/* Announcements */}
                    {dayAnnouncements.length > 0 && (
                      <div className="space-y-1.5">
                        <span className="text-[11px] font-bold text-purple-800 flex items-center space-x-1">
                          <Megaphone className="h-3 w-3" />
                          <span>ประกาศ & ข่าวสาร ({dayAnnouncements.length})</span>
                        </span>
                        {dayAnnouncements.map((ann) => (
                          <div
                            key={ann.id}
                            onClick={() => {
                              setSelectedDayForOverview(null);
                              setSelectedBooking(ann);
                            }}
                            className={`p-2.5 rounded-xl border transition-all cursor-pointer shadow-2xs ${getAnnouncementBannerBg(ann.color)}`}
                          >
                            <span className="text-xs font-bold block">{ann.title}</span>
                            <span className="text-[10px] opacity-90 block">
                              {ann.isAllDay ? 'ตลอดทั้งวัน' : `${formatShortTime(ann.startTime)} - ${formatShortTime(ann.endTime)}`}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Meetings */}
                    {dayMeetings.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center space-x-1">
                          <Calendar className="h-3 w-3 text-blue-600" />
                          <span>การประชุม ({dayMeetings.length})</span>
                        </span>
                        {dayMeetings.map((b) => {
                          const canView = canViewBookingDetails(b, currentUserEmail, isAdmin);
                          const title = canView ? b.title : 'ห้องประชุมไม่ว่าง';
                          return (
                            <div
                              key={b.id}
                              onClick={() => {
                                setSelectedDayForOverview(null);
                                setSelectedBooking(b);
                              }}
                              className="p-3 bg-white hover:bg-blue-50/50 border border-slate-200 hover:border-blue-300 rounded-xl transition-all cursor-pointer shadow-2xs space-y-1"
                            >
                              <div className="flex items-center justify-between">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getRoomTextColor(b.roomId)}`}>
                                  {b.roomName ? b.roomName.split(' (')[0] : 'ออนไลน์'}
                                </span>
                                <span className="text-[10px] font-mono font-semibold text-slate-500">
                                  {formatShortTime(b.startTime)} - {formatShortTime(b.endTime)}
                                </span>
                              </div>
                              <div className="text-xs font-bold text-slate-800 flex items-center space-x-1">
                                <span className={`w-2 h-2 rounded-full shrink-0 ${getRoomDotColor(b.roomId, false)}`} />
                                <span className="truncate">{title}</span>
                                {b.isConfidential && <Lock className="h-2.5 w-2.5 text-amber-600 shrink-0 inline" />}
                              </div>
                              <div className="text-[10px] text-slate-400 flex items-center justify-between">
                                <span>ผู้จัด: {b.creatorName || b.creatorEmail}</span>
                                {b.attendees && b.attendees.length > 0 && (
                                  <span>{b.attendees.length} ผู้เข้าร่วม</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Day Overview Footer */}
              <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2">
                <button
                  onClick={() => {
                    setSelectedDayForOverview(null);
                    onOpenBookingModal(undefined, getISODateStr(day));
                  }}
                  className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg flex items-center space-x-1.5 transition-colors cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>+ จองห้องในวันนี้</span>
                </button>

                {isAdmin && onOpenAnnouncementModal && (
                  <button
                    onClick={() => {
                      setSelectedDayForOverview(null);
                      onOpenAnnouncementModal(getISODateStr(day));
                    }}
                    className="px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white text-xs font-semibold rounded-lg flex items-center space-x-1 transition-colors cursor-pointer"
                  >
                    <Megaphone className="h-3 w-3" />
                    <span>ลงประกาศ</span>
                  </button>
                )}

                <button
                  onClick={() => setSelectedDayForOverview(null)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer ml-auto"
                >
                  ปิด
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
