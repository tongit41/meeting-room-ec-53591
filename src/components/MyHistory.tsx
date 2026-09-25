import React, { useState, useMemo } from 'react';
import { 
  Calendar, 
  Clock, 
  CheckCircle2, 
  AlertCircle, 
  XCircle, 
  Search, 
  Filter, 
  Plus, 
  Video, 
  Pencil, 
  Trash2, 
  Repeat, 
  Users, 
  Lock, 
  MapPin, 
  History, 
  Sparkles,
  ArrowUpDown,
  CalendarCheck2
} from 'lucide-react';
import { Booking, MeetingRoom, RoomId } from '../types';
import { MEETING_ROOMS } from '../lib/firebase';
import { formatThaiDateRange } from '../lib/googleCalendar';
import { canViewBookingDetails, isKeyAttendee, sortAttendeesByPriority } from '../lib/permissions';

interface MyHistoryProps {
  bookings: Booking[];
  rooms?: MeetingRoom[];
  currentUserEmail: string | null;
  currentUserName?: string | null;
  isAdmin: boolean;
  onOpenBookingModal: (roomId?: RoomId, initialTime?: string, editingBooking?: Booking) => void;
  onEditBooking?: (booking: Booking) => void;
  onDeleteBooking?: (bookingId: string) => void;
}

export default function MyHistory({
  bookings,
  rooms = MEETING_ROOMS,
  currentUserEmail,
  currentUserName,
  isAdmin,
  onOpenBookingModal,
  onEditBooking,
  onDeleteBooking
}: MyHistoryProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'upcoming' | 'past'>('all');
  const [selectedRoom, setSelectedRoom] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest'>('newest');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const roomColors: Record<string, string> = {
    '': 'bg-slate-100 text-slate-700 border-slate-200',
    room1: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    room2: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    room3: 'bg-amber-50 text-amber-700 border-amber-200',
  };

  const platformColors: Record<string, string> = {
    meet: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
    teams: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
    zoom: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    none: 'bg-slate-50 text-slate-600 border-slate-200'
  };

  const platformLabels: Record<string, string> = {
    meet: 'Google Meet',
    teams: 'Microsoft Teams',
    zoom: 'Zoom Video',
    none: 'On-site'
  };

  // Filter all bookings that belong to current user (creator or attendee)
  const myAllBookings = useMemo(() => {
    if (!currentUserEmail) return [];
    const normalizedUserEmail = currentUserEmail.trim().toLowerCase();

    return bookings.filter(b => {
      // 1. Is creator
      const isCreator = b.creatorEmail && b.creatorEmail.trim().toLowerCase() === normalizedUserEmail;
      
      // 2. Is attendee
      const isAttendee = b.attendees && b.attendees.some(
        att => att.email && att.email.trim().toLowerCase() === normalizedUserEmail
      );

      return isCreator || isAttendee;
    });
  }, [bookings, currentUserEmail]);

  // Statistics
  const nowMs = Date.now();
  const stats = useMemo(() => {
    let upcoming = 0;
    let approved = 0;
    let pending = 0;
    let rejected = 0;

    myAllBookings.forEach(b => {
      const endMs = new Date(b.endTime || b.startTime).getTime();
      if (!isNaN(endMs) && endMs >= nowMs && b.status !== 'rejected') {
        upcoming++;
      }
      if (b.status === 'approved') approved++;
      else if (b.status === 'pending') pending++;
      else if (b.status === 'rejected') rejected++;
    });

    return {
      total: myAllBookings.length,
      upcoming,
      approved,
      pending,
      rejected
    };
  }, [myAllBookings, nowMs]);

  // Filtered and sorted list
  const filteredBookings = useMemo(() => {
    return myAllBookings.filter(b => {
      // Status filter
      if (statusFilter !== 'all' && b.status !== statusFilter) return false;

      // Timeframe filter
      const endMs = new Date(b.endTime || b.startTime).getTime();
      if (timeFilter === 'upcoming') {
        if (isNaN(endMs) || endMs < nowMs) return false;
      } else if (timeFilter === 'past') {
        if (isNaN(endMs) || endMs >= nowMs) return false;
      }

      // Room filter
      if (selectedRoom !== 'all') {
        if (selectedRoom === 'announcement') {
          if (b.entryType !== 'announcement' && !b.roomName?.includes('ประกาศ')) return false;
        } else if (b.roomId !== selectedRoom) {
          return false;
        }
      }

      // Search term
      if (searchTerm.trim()) {
        const term = searchTerm.trim().toLowerCase();
        const titleMatch = b.title?.toLowerCase().includes(term);
        const descMatch = b.description?.toLowerCase().includes(term);
        const roomMatch = b.roomName?.toLowerCase().includes(term);
        const creatorMatch = b.creatorName?.toLowerCase().includes(term);
        const attendeeMatch = b.attendees?.some(
          a => a.displayName?.toLowerCase().includes(term) || a.nickname?.toLowerCase().includes(term) || a.email?.toLowerCase().includes(term)
        );

        if (!titleMatch && !descMatch && !roomMatch && !creatorMatch && !attendeeMatch) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      const aTime = new Date(a.startTime).getTime();
      const bTime = new Date(b.startTime).getTime();
      return sortBy === 'newest' ? bTime - aTime : aTime - bTime;
    });
  }, [myAllBookings, statusFilter, timeFilter, selectedRoom, searchTerm, sortBy, nowMs]);

  const handleDeleteConfirm = (bookingId: string) => {
    if (onDeleteBooking) {
      onDeleteBooking(bookingId);
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6" id="my-history-page">
      {/* Top Header Banner */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-[0_4px_20px_-2px_rgba(15,23,42,0.05)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <span className="bg-blue-50 text-blue-600 text-xs px-3 py-0.5 rounded-full border border-blue-200 font-semibold flex items-center gap-1.5">
              <History className="w-3.5 h-3.5" />
              <span>ประวัติของฉัน</span>
            </span>
            <span className="text-xs text-slate-500">
              ({currentUserEmail})
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[#0F172A]">
            ประวัติการจองห้องประชุมของฉัน
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 max-w-2xl">
            รวมรายการจองห้องประชุมย้อนหลังและกิจกรรมที่คุณเป็นผู้ขอจองหรือเข้าร่วม สะดวกต่อการตรวจสอบและจัดการโดยไม่ต้องค้นหาในปฏิทินรวม
          </p>
        </div>

        <div className="flex items-center space-x-2 shrink-0">
          <button 
            onClick={() => onOpenBookingModal()}
            className="flex items-center space-x-1.5 bg-[#60A5FA] hover:bg-[#3B82F6] text-white text-xs font-semibold px-4 py-2.5 rounded-xl shadow-[0_4px_14px_rgba(96,165,250,0.3)] hover:shadow-[0_6px_15px_-3px_rgba(59,130,246,0.25)] transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4 shrink-0" />
            <span>+ จองห้องประชุมใหม่</span>
          </button>
        </div>
      </div>

      {/* Quick Statistics Row */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div 
          onClick={() => { setStatusFilter('all'); setTimeFilter('all'); }}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            statusFilter === 'all' && timeFilter === 'all' ? 'border-blue-400 ring-2 ring-blue-100 bg-blue-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[11px] font-semibold">รายการทั้งหมด</span>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <div className="text-xl font-bold text-slate-900">{stats.total}</div>
        </div>

        <div 
          onClick={() => { setTimeFilter('upcoming'); setStatusFilter('all'); }}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            timeFilter === 'upcoming' ? 'border-sky-400 ring-2 ring-sky-100 bg-sky-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-sky-600 mb-1">
            <span className="text-[11px] font-semibold">ที่จะมาถึง</span>
            <CalendarCheck2 className="h-4 w-4 text-sky-500" />
          </div>
          <div className="text-xl font-bold text-sky-700">{stats.upcoming}</div>
        </div>

        <div 
          onClick={() => { setStatusFilter('approved'); setTimeFilter('all'); }}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            statusFilter === 'approved' ? 'border-emerald-400 ring-2 ring-emerald-100 bg-emerald-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-emerald-600 mb-1">
            <span className="text-[11px] font-semibold">อนุมัติแล้ว</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-emerald-700">{stats.approved}</div>
        </div>

        <div 
          onClick={() => { setStatusFilter('pending'); setTimeFilter('all'); }}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs ${
            statusFilter === 'pending' ? 'border-amber-400 ring-2 ring-amber-100 bg-amber-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-amber-600 mb-1">
            <span className="text-[11px] font-semibold">รออนุมัติ</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-700">{stats.pending}</div>
        </div>

        <div 
          onClick={() => { setStatusFilter('rejected'); setTimeFilter('all'); }}
          className={`bg-white p-4 rounded-xl border transition-all cursor-pointer shadow-2xs hover:shadow-xs col-span-2 sm:col-span-1 ${
            statusFilter === 'rejected' ? 'border-rose-400 ring-2 ring-rose-100 bg-rose-50/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between text-rose-600 mb-1">
            <span className="text-[11px] font-semibold">ไม่อนุมัติ</span>
            <AlertCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-700">{stats.rejected}</div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Search box */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input 
              type="text"
              placeholder="ค้นหาชื่อการประชุม, ห้องประชุม หรือรายละเอียด..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
            />
            {searchTerm && (
              <button 
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Quick Filter buttons */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Timeframe Filter */}
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-xs">
              <button
                onClick={() => setTimeFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  timeFilter === 'all' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ทั้งหมด
              </button>
              <button
                onClick={() => setTimeFilter('upcoming')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  timeFilter === 'upcoming' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ที่จะมาถึง
              </button>
              <button
                onClick={() => setTimeFilter('past')}
                className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                  timeFilter === 'past' ? 'bg-white text-blue-600 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                ผ่านมาแล้ว
              </button>
            </div>

            {/* Room Select */}
            <select
              value={selectedRoom}
              onChange={(e) => setSelectedRoom(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="all">ทุกห้องประชุม</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>{r.name ? r.name.split(' (')[0] : r.id}</option>
              ))}
              <option value="announcement">ประกาศ / อื่นๆ</option>
            </select>

            {/* Sort Toggle */}
            <button
              onClick={() => setSortBy(prev => prev === 'newest' ? 'oldest' : 'newest')}
              className="flex items-center space-x-1 px-3 py-2 text-xs bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium rounded-xl border border-slate-200 transition-colors"
              title="เรียงลำดับเวลา"
            >
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500" />
              <span>{sortBy === 'newest' ? 'ล่าสุดก่อน' : 'เก่าสุดก่อน'}</span>
            </button>
          </div>
        </div>

        {/* Status Filter Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100 text-xs">
          <span className="text-slate-400 font-medium mr-1 flex items-center gap-1">
            <Filter className="w-3 h-3" />
            <span>สถานะ:</span>
          </span>
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
              statusFilter === 'all' 
                ? 'bg-slate-800 text-white shadow-2xs' 
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            ทั้งหมด ({myAllBookings.length})
          </button>
          <button
            onClick={() => setStatusFilter('approved')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              statusFilter === 'approved' 
                ? 'bg-emerald-600 text-white shadow-2xs' 
                : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200/50'
            }`}
          >
            <CheckCircle2 className="w-3 h-3" />
            <span>อนุมัติแล้ว ({stats.approved})</span>
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              statusFilter === 'pending' 
                ? 'bg-amber-600 text-white shadow-2xs' 
                : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200/50'
            }`}
          >
            <Clock className="w-3 h-3" />
            <span>รออนุมัติ ({stats.pending})</span>
          </button>
          <button
            onClick={() => setStatusFilter('rejected')}
            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 ${
              statusFilter === 'rejected' 
                ? 'bg-rose-600 text-white shadow-2xs' 
                : 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200/50'
            }`}
          >
            <AlertCircle className="w-3 h-3" />
            <span>ไม่อนุมัติ ({stats.rejected})</span>
          </button>
        </div>
      </div>

      {/* History Items List */}
      <div className="space-y-3.5">
        {filteredBookings.length > 0 ? (
          filteredBookings.map(b => {
            const isCreator = b.creatorEmail && b.creatorEmail.trim().toLowerCase() === currentUserEmail?.trim().toLowerCase();
            const endMs = new Date(b.endTime || b.startTime).getTime();
            const isPast = !isNaN(endMs) && endMs < nowMs;
            const isDeleting = deletingId === b.id;

            return (
              <div 
                key={b.id}
                className={`bg-white rounded-2xl border p-5 transition-all shadow-2xs hover:shadow-xs space-y-3.5 ${
                  b.status === 'rejected' 
                    ? 'border-rose-200 bg-rose-50/10' 
                    : b.status === 'pending'
                    ? 'border-amber-200 bg-amber-50/10'
                    : isPast 
                    ? 'border-slate-200 bg-white/70 opacity-90'
                    : 'border-slate-200 bg-white hover:border-blue-300'
                }`}
              >
                {/* Top row: Status, Room, Time, & Roles */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Status Badge */}
                    {b.status === 'approved' && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>อนุมัติแล้ว</span>
                      </span>
                    )}
                    {b.status === 'pending' && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                        <Clock className="w-3.5 h-3.5 text-amber-600 animate-pulse" />
                        <span>รอการอนุมัติ</span>
                      </span>
                    )}
                    {b.status === 'rejected' && (
                      <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200">
                        <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                        <span>ไม่อนุมัติ / ปฏิเสธ</span>
                      </span>
                    )}

                    {/* Room Badge */}
                    <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-md border ${
                      roomColors[b.roomId] || 'bg-slate-100 text-slate-700 border-slate-200'
                    }`}>
                      {b.roomName ? b.roomName.split(' (')[0] : 'ไม่ระบุห้องประชุม'}
                    </span>

                    {/* Creator vs Attendee Badge */}
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                      isCreator 
                        ? 'bg-blue-50 text-blue-700 border-blue-200' 
                        : 'bg-purple-50 text-purple-700 border-purple-200'
                    }`}>
                      {isCreator ? 'คุณเป็นผู้จอง' : 'คุณเป็นผู้เข้าร่วม'}
                    </span>

                    {/* Past indicator */}
                    {isPast && (
                      <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        ผ่านมาแล้ว
                      </span>
                    )}
                  </div>

                  {/* Date & Time */}
                  <div className="flex items-center space-x-1.5 text-xs text-slate-600 font-medium">
                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                    <span>{formatThaiDateRange(b.startTime, b.endTime)}</span>
                  </div>
                </div>

                {/* Main Content */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-slate-900 text-base">
                          {b.title}
                        </h3>
                        {b.isConfidential && (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            <Lock className="w-3 h-3" />
                            <span>ความลับสำคัญ</span>
                          </span>
                        )}
                      </div>

                      {b.description && (
                        <p className="text-xs text-slate-600 leading-relaxed bg-slate-50/60 p-2.5 rounded-xl border border-slate-100">
                          {b.description}
                        </p>
                      )}

                      {/* Rejection Reason notice if rejected */}
                      {b.status === 'rejected' && b.rejectionReason && (
                        <div className="bg-rose-50 border border-rose-200 p-2.5 rounded-xl text-xs text-rose-800 space-y-0.5">
                          <span className="font-bold block flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                            <span>เหตุผลที่ไม่อนุมัติ:</span>
                          </span>
                          <p className="text-rose-700">{b.rejectionReason}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Attendees and Meeting Platform Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 text-xs">
                    <div className="flex items-center gap-2 flex-wrap text-slate-500">
                      <span className="font-medium text-slate-600">ผู้จอง:</span>
                      <span className="font-semibold text-slate-800">{b.creatorName}</span>
                      {b.attendees && b.attendees.length > 0 && (
                        <>
                          <span className="text-slate-300">•</span>
                          <span className="flex items-center gap-1 font-medium">
                            <Users className="w-3 h-3 text-slate-400" />
                            <span>ผู้เข้าร่วม {b.attendees.length} คน:</span>
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {sortAttendeesByPriority(b.attendees).map((att, idx) => {
                              const isMe = att.email && att.email.toLowerCase() === currentUserEmail?.toLowerCase();
                              return (
                                <span 
                                  key={idx}
                                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                    isMe 
                                      ? 'bg-blue-50 text-blue-700 border-blue-200 font-bold' 
                                      : 'bg-slate-100 text-slate-600 border-slate-200'
                                  }`}
                                >
                                  {att.nickname || att.displayName.split(' ')[0]} {isMe && '(คุณ)'}
                                </span>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Meeting Link */}
                    {b.meetingLink && b.status === 'approved' && (
                      <div className="shrink-0">
                        <a 
                          href={b.meetingLink}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all shadow-2xs ${
                            platformColors[b.meetingType] || 'bg-slate-50 text-slate-600 border-slate-200'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5" />
                          <span>เข้าร่วมสาย {platformLabels[b.meetingType] || 'การประชุม'}</span>
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action Buttons */}
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                  <div className="text-[11px] text-slate-400">
                    บันทึกเมื่อ: {new Date(b.createdAt).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>

                  <div className="flex items-center space-x-2">
                    {/* Re-book button */}
                    <button
                      onClick={() => onOpenBookingModal(b.roomId)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-medium transition-colors cursor-pointer"
                      title="จองห้องนี้ซ้ำสำหรับวันอื่น"
                    >
                      <Repeat className="w-3 h-3 text-slate-500" />
                      <span>จองซ้ำ</span>
                    </button>

                    {/* Edit button: allowed for creator or admin if not rejected */}
                    {(isCreator || isAdmin) && b.status !== 'rejected' && onEditBooking && (
                      <button
                        onClick={() => onEditBooking(b)}
                        className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-semibold transition-colors cursor-pointer"
                        title="แก้ไขรายละเอียดการจอง"
                      >
                        <Pencil className="w-3 h-3" />
                        <span>แก้ไข</span>
                      </button>
                    )}

                    {/* Cancel/Delete button: allowed for creator or admin */}
                    {(isCreator || isAdmin) && onDeleteBooking && (
                      <button
                        onClick={() => onDeleteBooking(b.id)}
                        className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 font-semibold text-xs transition-all shadow-2xs hover:shadow-xs active:scale-95 cursor-pointer"
                        title="ยกเลิกรายการจองห้องประชุมนี้"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        <span>ยกเลิกการจอง</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white rounded-2xl border border-dashed border-slate-200 py-12 px-6 text-center space-y-3">
            <div className="w-12 h-12 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto">
              <History className="w-6 h-6 text-slate-400" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-slate-800 text-sm sm:text-base">
                {searchTerm || statusFilter !== 'all' || timeFilter !== 'all' || selectedRoom !== 'all'
                  ? 'ไม่พบรายการจองที่ตรงตามเงื่อนไขการค้นหา'
                  : 'ยังไม่มีประวัติการจองห้องประชุม'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                {searchTerm || statusFilter !== 'all' || timeFilter !== 'all' || selectedRoom !== 'all'
                  ? 'ลองเปลี่ยนคำค้นหา หรือรีเซ็ตตัวกรองเพื่อดูรายการทั้งหมด'
                  : 'เมื่อคุณทำรายการจองห้องประชุมหรือได้รับการเชิญเข้าร่วมประชุม รายการจองทั้งหมดจะแสดงที่นี่โดยอัตโนมัติ'}
              </p>
            </div>
            <div className="pt-2">
              {searchTerm || statusFilter !== 'all' || timeFilter !== 'all' || selectedRoom !== 'all' ? (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setStatusFilter('all');
                    setTimeFilter('all');
                    setSelectedRoom('all');
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-all cursor-pointer"
                >
                  ล้างตัวกรองทั้งหมด
                </button>
              ) : (
                <button
                  onClick={() => onOpenBookingModal()}
                  className="px-4 py-2 bg-[#60A5FA] hover:bg-[#3B82F6] text-white text-xs font-semibold rounded-xl shadow-[0_4px_14px_rgba(96,165,250,0.3)] transition-all cursor-pointer"
                >
                  + เริ่มต้นจองห้องประชุม
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
