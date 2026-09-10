import { Booking } from '../types';

// Important attendee emails that need special highlight badges
export const KEY_ATTENDEE_EMAILS: string[] = [
  "meechai.c@ec.co.th", "meechai.chun@gmail.com",
  "supanee.c@ec.co.th", "supanee.chun@gmail.com",
  "supamet.c@ec.co.th",
  "achira.c@ec.co.th",
  "chanatip.h@ec.co.th", "chanatip@gmail.com",
  "chompoonuch.s@ec.co.th",
  "tassanee.t@ec.co.th"
];

export const isKeyAttendee = (email?: string): boolean => {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  const cleanPrefix = clean.split('@')[0];
  return KEY_ATTENDEE_EMAILS.some(keyEmail => {
    const kClean = keyEmail.toLowerCase().trim();
    return kClean === clean || kClean.split('@')[0] === cleanPrefix;
  });
};

export const ATTENDEE_PRIORITY_ORDER: string[] = [
  "meechai.c@ec.co.th", "meechai.chun@gmail.com",
  "supanee.c@ec.co.th", "supanee.chun@gmail.com",
  "supamet.c@ec.co.th",
  "achira.c@ec.co.th",
  "chanatip.h@ec.co.th", "chanatip@gmail.com",
  "chompoonuch.s@ec.co.th",
  "tassanee.t@ec.co.th",
  "anchuleeporn.a@ec.co.th",
  "teerawat.s@ec.co.th",
  "karunaporn.c@ec.co.th",
  "auttawit.t@ec.co.th",
  "chayanon.t@ec.co.th",
  "samphan.t@ec.co.th",
  "pattarapon.n@ec.co.th",
  "suthipong.d@ec.co.th",
  "phuriwat.t@ec.co.th",
  "suttipong.i@ec.co.th",
  "qc@ec.co.th",
  "wanwisa.c@ec.co.th",
  "architecture@ec.co.th",
  "nuttapagun.t@ec.co.th",
  "purchase@ec.co.th",
  "it@ec.co.th",
  "rental@ec.co.th",
  "homecare@ec.co.th",
  "hr@ec.co.th"
];

export const getAttendeePriorityIndex = (email?: string): number => {
  if (!email) return 999999;
  const clean = email.toLowerCase().trim();
  const cleanPrefix = clean.split('@')[0];

  const idx = ATTENDEE_PRIORITY_ORDER.findIndex(p => {
    const pClean = p.toLowerCase().trim();
    return pClean === clean || pClean.split('@')[0] === cleanPrefix;
  });
  return idx === -1 ? 999999 : idx;
};

export function sortAttendeesByPriority<T extends { email: string; displayName?: string; nickname?: string }>(
  attendees?: T[]
): T[] {
  if (!attendees || attendees.length === 0) return [];
  return [...attendees].sort((a, b) => {
    const idxA = getAttendeePriorityIndex(a.email);
    const idxB = getAttendeePriorityIndex(b.email);

    if (idxA !== idxB) {
      return idxA - idxB;
    }
    return (a.displayName || '').localeCompare(b.displayName || '', 'th');
  });
}

/**
 * Check if the user can see confidential details of a booking:
 * - If booking is not confidential, everyone can see details.
 * - If booking is confidential:
 *    - Admin can see details.
 *    - Creator of booking can see details.
 *    - Attendees chosen for the meeting can see details.
 *    - Regular users (employee role) who are NOT in the attendee list will ONLY see that the room is busy ("ห้องประชุมไม่ว่าง (ความลับสำคัญ)"), hiding title, description, and online links.
 */
export const canViewBookingDetails = (
  booking: Booking,
  currentUserEmail: string | null,
  isAdmin: boolean
): boolean => {
  if (!booking.isConfidential) return true;
  if (isAdmin) return true;
  if (!currentUserEmail) return false;

  const userEmail = currentUserEmail.toLowerCase().trim();
  if (booking.creatorEmail && booking.creatorEmail.toLowerCase().trim() === userEmail) {
    return true;
  }

  if (booking.attendees && booking.attendees.some(att => (att.email || '').toLowerCase().trim() === userEmail)) {
    return true;
  }

  return false;
};
