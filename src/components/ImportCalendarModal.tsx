import React, { useState, useRef } from 'react';
import { 
  FileUp, 
  X, 
  Calendar, 
  AlertTriangle, 
  Check, 
  Loader2, 
  Info, 
  Video, 
  ChevronRight,
  ShieldCheck
} from 'lucide-react';
import { Booking, RoomId, UserAccount } from '../types';
import { parseIcsContent, ParsedIcsEvent } from '../lib/icsParser';
import { MEETING_ROOMS } from '../lib/firebase';

interface ImportCalendarModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookings: Booking[];
  userProfile: UserAccount | null;
  onImportConfirm: (eventsToImport: Omit<Booking, 'id' | 'createdAt'>[]) => Promise<void>;
}

interface SelectedImportEvent {
  id: string;
  title: string;
  description: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingType: 'meet' | 'teams' | 'zoom' | 'external' | 'none';
  meetingLink: string;
  selectedRoomId: RoomId;
  isSelected: boolean;
  conflictDetails?: Booking;
}

export default function ImportCalendarModal({
  isOpen,
  onClose,
  bookings,
  userProfile,
  onImportConfirm
}: ImportCalendarModalProps) {
  const [dragActive, setDragActive] = useState(false);
  const [parsedEvents, setParsedEvents] = useState<SelectedImportEvent[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const matchRoomFromLocation = (location: string): RoomId => {
    const loc = (location || '').toLowerCase();
    if (loc.includes('focus') || loc.includes('ห้องประชุม 1') || loc.includes('ห้อง 1') || loc.includes('room 1')) {
      return 'room1';
    }
    if (loc.includes('synergy') || loc.includes('ห้องประชุม 2') || loc.includes('ห้อง 2') || loc.includes('room 2')) {
      return 'room2';
    }
    if (loc.includes('vision') || loc.includes('ห้องประชุม 3') || loc.includes('ห้อง 3') || loc.includes('room 3')) {
      return 'room3';
    }
    return 'room1'; // Default
  };

  const getMeetingTypeFromLink = (link: string): 'meet' | 'teams' | 'zoom' | 'external' | 'none' => {
    if (!link) return 'none';
    if (link.includes('meet.google.com')) return 'meet';
    if (link.includes('teams.microsoft.com')) return 'teams';
    if (link.includes('zoom.us')) return 'zoom';
    return 'external';
  };

  const checkConflictsForEvents = (events: SelectedImportEvent[], currentBookings: Booking[]): SelectedImportEvent[] => {
    return events.map(evt => {
      // Find overlap with existing bookings (excluding rejected)
      const conflict = currentBookings.find(b => {
        if (b.status === 'rejected') return false;
        if (b.roomId !== evt.selectedRoomId) return false;
        return b.startTime < evt.endTime && evt.startTime < b.endTime;
      });

      return {
        ...evt,
        conflictDetails: conflict,
        // Auto deselect if there is a conflict
        isSelected: conflict ? false : evt.isSelected
      };
    });
  };

  const processIcsText = (text: string) => {
    try {
      setErrorMessage(null);
      const rawEvents = parseIcsContent(text);
      if (rawEvents.length === 0) {
        setErrorMessage('ไม่พบข้อมูลกิจกรรมการประชุมในไฟล์นี้ กรุณาตรวจสอบว่าไฟล์มีรูปแบบที่ถูกต้อง (.ics)');
        return;
      }

      const initialEvents: SelectedImportEvent[] = rawEvents.map(evt => {
        const selectedRoomId = matchRoomFromLocation(evt.location);
        const meetingType = getMeetingTypeFromLink(evt.meetingLink);
        return {
          id: evt.id,
          title: evt.title || 'กิจกรรมไม่มีชื่อ',
          description: evt.description || '',
          startTime: evt.startTime,
          endTime: evt.endTime,
          location: evt.location || '',
          meetingType,
          meetingLink: evt.meetingLink || '',
          selectedRoomId,
          isSelected: true
        };
      });

      // Run conflict checking
      const withConflicts = checkConflictsForEvents(initialEvents, bookings);
      setParsedEvents(withConflicts);
    } catch (err: any) {
      setErrorMessage('เกิดข้อผิดพลาดในการอ่านไฟล์: ' + (err?.message || String(err)));
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          processIcsText(event.target.result);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (!file.name.endsWith('.ics')) {
        setErrorMessage('รองรับเฉพาะไฟล์ปฏิทินนามสกุล .ics เท่านั้นค่ะ');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target && typeof event.target.result === 'string') {
          processIcsText(event.target.result);
        }
      };
      reader.readAsText(file);
    }
  };

  const handleRoomChange = (id: string, roomId: RoomId) => {
    const updated = parsedEvents.map(evt => {
      if (evt.id === id) {
        const updatedEvt = { ...evt, selectedRoomId: roomId };
        // Re-check conflict for this specific event
        const conflict = bookings.find(b => {
          if (b.status === 'rejected') return false;
          if (b.roomId !== roomId) return false;
          return b.startTime < updatedEvt.endTime && updatedEvt.startTime < b.endTime;
        });
        return {
          ...updatedEvt,
          conflictDetails: conflict,
          isSelected: conflict ? false : updatedEvt.isSelected
        };
      }
      return evt;
    });
    setParsedEvents(updated);
  };

  const handleToggleSelect = (id: string) => {
    setParsedEvents(prev => prev.map(evt => {
      if (evt.id === id) {
        // Allow toggle but warn if it is a conflict
        return { ...evt, isSelected: !evt.isSelected };
      }
      return evt;
    }));
  };

  const handleSelectAll = () => {
    const hasUncheckedNonConflicting = parsedEvents.some(evt => !evt.isSelected && !evt.conflictDetails);
    setParsedEvents(prev => prev.map(evt => ({
      ...evt,
      isSelected: evt.conflictDetails ? false : hasUncheckedNonConflicting
    })));
  };

  const handleImportSubmit = async () => {
    const selected = parsedEvents.filter(e => e.isSelected);
    if (selected.length === 0) return;

    if (!userProfile) {
      setErrorMessage('กรุณาลงชื่อเข้าใช้งานก่อนทำการนำเข้าค่ะ');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      // Build proper Booking objects
      const itemsToImport = selected.map(evt => {
        const matchedRoom = MEETING_ROOMS.find(r => r.id === evt.selectedRoomId)!;
        return {
          title: evt.title,
          description: evt.description,
          roomId: evt.selectedRoomId,
          roomName: matchedRoom.name,
          startTime: evt.startTime,
          endTime: evt.endTime,
          creatorEmail: userProfile.email,
          creatorName: userProfile.displayName,
          status: userProfile.role === 'admin' ? ('approved' as const) : ('pending' as const),
          attendees: [],
          meetingType: evt.meetingType,
          meetingLink: evt.meetingLink,
          approvedBy: userProfile.role === 'admin' ? userProfile.displayName : ''
        };
      });

      await onImportConfirm(itemsToImport);
      setParsedEvents([]);
      onClose();
    } catch (err: any) {
      setErrorMessage(err?.message || 'เกิดข้อผิดพลาดในการนำเข้า กรุณาลองใหม่อีกครั้ง');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatThaiDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'short',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      }) + ' น.';
    } catch (e) {
      return dateStr;
    }
  };

  const conflictingCount = parsedEvents.filter(e => e.conflictDetails).length;
  const readyToImportCount = parsedEvents.filter(e => e.isSelected).length;

  return (
    <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 overflow-y-auto">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-4xl w-full flex flex-col my-8 max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
              <Calendar className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-800">นำเข้าปฏิทินประชุมสำเร็จรูป (.ics)</h3>
              <p className="text-xs text-slate-500">นำเข้าตารางกิจกรรมที่ส่งออกจาก Google Calendar หรือโปรแกรมปฏิทินอื่น ๆ ได้ทันที</p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            disabled={isSubmitting}
            className="p-1.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {errorMessage && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-start space-x-2.5">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Step 1: Upload Dropzone (if no events loaded yet) */}
          {parsedEvents.length === 0 ? (
            <div className="space-y-4">
              <div 
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center flex flex-col items-center justify-center space-y-4 transition-all cursor-pointer ${
                  dragActive 
                  ? 'border-indigo-600 bg-indigo-50/50' 
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/30'
                }`}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".ics" 
                  onChange={handleFileChange}
                  className="hidden" 
                />
                <div className="p-4 bg-indigo-50 text-indigo-600 rounded-full">
                  <FileUp className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800">ลากไฟล์ปฏิทิน .ics มาวางที่นี่ หรือคลิกเพื่อเลือกไฟล์</p>
                  <p className="text-xs text-slate-400 mt-1">รองรับเฉพาะนามสกุล .ics ที่ส่งออกจากระบบ Google Calendar เท่านั้นค่ะ</p>
                </div>
              </div>

              {/* Instructions */}
              <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 text-xs text-amber-900 space-y-2">
                <p className="font-bold flex items-center space-x-1.5 text-amber-800">
                  <Info className="h-4 w-4 shrink-0" />
                  <span>วิธีส่งออกปฏิทินจาก Google Calendar:</span>
                </p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>เปิด <a href="https://calendar.google.com" target="_blank" rel="noreferrer" className="underline font-semibold hover:text-indigo-600">Google Calendar</a> ในคอมพิวเตอร์ของคุณ</li>
                  <li>ไปที่ <strong>การตั้งค่า (Settings)</strong> &gt; <strong>นำเข้าและส่งออก (Import & Export)</strong> &gt; คลิกปุ่ม <strong>ส่งออก (Export)</strong></li>
                  <li>คุณจะได้ไฟล์เป็นไฟล์บีบอัด .zip ให้ทำการแตกไฟล์ออกมาก่อน จะพบไฟล์นามสกุล <code>.ics</code> ของแต่ละปฏิทิน</li>
                  <li>นำไฟล์ <code>.ics</code> ดังกล่าวมาอัปโหลดที่ระบบห้องประชุมแห่งนี้ได้ทันทีค่ะ</li>
                </ol>
              </div>
            </div>
          ) : (
            /* Step 2: List of Parsed Events for Review */
            <div className="space-y-4">
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 bg-slate-50 p-4 rounded-xl border border-slate-100">
                <div className="text-xs text-slate-600 space-y-1">
                  <div>ตรวจพบกิจกรรมประชุมทั้งหมด: <span className="font-bold text-slate-800">{parsedEvents.length} รายการ</span></div>
                  <div className="flex items-center space-x-3 mt-1.5">
                    {conflictingCount > 0 && (
                      <span className="inline-flex items-center space-x-1 text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 font-medium">
                        <AlertTriangle className="h-3 w-3" />
                        <span>ชนเวลาจองเดิม {conflictingCount} รายการ (ระบบปิดเลือกให้อัตโนมัติ)</span>
                      </span>
                    )}
                    <span className="inline-flex items-center space-x-1 text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 font-medium">
                      <ShieldCheck className="h-3 w-3" />
                      <span>พร้อมนำเข้า {parsedEvents.length - conflictingCount} รายการ</span>
                    </span>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <button 
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 rounded-lg transition-all cursor-pointer"
                  >
                    {parsedEvents.every(e => e.isSelected || e.conflictDetails) ? 'ยกเลิกทั้งหมด' : 'เลือกทั้งหมด'}
                  </button>
                  <button 
                    onClick={() => { setParsedEvents([]); setErrorMessage(null); }}
                    className="px-3 py-1.5 text-xs font-bold border border-slate-200 bg-white text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                  >
                    ล้างไฟล์ใหม่
                  </button>
                </div>
              </div>

              {/* Event Cards Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[45vh] overflow-y-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 sticky top-0 text-xs text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-3 px-4 w-10">เลือก</th>
                      <th className="py-3 px-4">รายละเอียดกิจกรรม</th>
                      <th className="py-3 px-4">วันและเวลาประชุม</th>
                      <th className="py-3 px-4 w-44">ห้องประชุมปลายทาง</th>
                      <th className="py-3 px-4">ออนไลน์/วิดีโอคอล</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {parsedEvents.map(evt => {
                      const roomOptions = MEETING_ROOMS;
                      const hasConflict = !!evt.conflictDetails;

                      return (
                        <tr 
                          key={evt.id} 
                          className={`hover:bg-slate-50/50 transition-colors ${
                            hasConflict ? 'bg-amber-50/20' : ''
                          } ${evt.isSelected ? 'bg-indigo-50/5' : ''}`}
                        >
                          <td className="py-3.5 px-4 text-center">
                            <input 
                              type="checkbox" 
                              checked={evt.isSelected}
                              onChange={() => handleToggleSelect(evt.id)}
                              disabled={isSubmitting}
                              className="h-4 w-4 rounded text-indigo-600 border-slate-300 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                            />
                          </td>
                          <td className="py-3.5 px-4 max-w-xs">
                            <div className="font-bold text-slate-800 truncate" title={evt.title}>
                              {evt.title}
                            </div>
                            {evt.description && (
                              <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">{evt.description}</p>
                            )}
                            {evt.location && (
                              <p className="text-[10px] text-slate-400 mt-1 italic">Location ในไฟล์: {evt.location}</p>
                            )}
                          </td>
                          <td className="py-3.5 px-4 font-mono text-xs text-slate-600">
                            <div>{formatThaiDate(evt.startTime)}</div>
                            <div className="text-[10px] text-slate-400">ถึง {formatThaiDate(evt.endTime)}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <div className="space-y-1.5">
                              <select 
                                value={evt.selectedRoomId}
                                onChange={(e) => handleRoomChange(evt.id, e.target.value as RoomId)}
                                disabled={isSubmitting}
                                className="w-full text-xs font-semibold px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 focus:ring-1 focus:ring-indigo-500"
                              >
                                {roomOptions.map(r => (
                                  <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                              </select>
                              
                              {hasConflict && evt.conflictDetails && (
                                <div className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 rounded px-2 py-1 flex items-start space-x-1">
                                  <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                                  <div className="leading-tight">
                                    <span className="font-bold block">เวลาทับซ้อนจองเดิม:</span>
                                    <span>{evt.conflictDetails.title} ({evt.conflictDetails.creatorName})</span>
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="py-3.5 px-4">
                            {evt.meetingLink ? (
                              <div className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-700 border border-emerald-100 text-xs px-2 py-1 rounded">
                                <Video className="h-3.5 w-3.5" />
                                <span className="truncate max-w-[100px]" title={evt.meetingLink}>มีวิดีโอคอล</span>
                              </div>
                            ) : (
                              <span className="text-slate-400 text-xs font-medium">-</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex justify-between items-center rounded-b-2xl">
          <div className="text-xs text-slate-500">
            {parsedEvents.length > 0 && (
              <span>
                เลือกแล้ว <strong className="text-indigo-600">{readyToImportCount}</strong> จากทั้งหมด {parsedEvents.length} รายการ
              </span>
            )}
          </div>
          <div className="flex space-x-3">
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 border border-slate-200 bg-white text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 transition-colors cursor-pointer"
            >
              ยกเลิก
            </button>
            {parsedEvents.length > 0 && (
              <button
                onClick={handleImportSubmit}
                disabled={isSubmitting || readyToImportCount === 0}
                className="flex items-center space-x-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg shadow-md transition-colors disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>กำลังนำเข้า...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>นำเข้า {readyToImportCount} กิจกรรม</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
