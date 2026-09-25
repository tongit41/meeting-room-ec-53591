/**
 * Web Push Notification & Audio Chime Helper
 * Handles browser desktop notifications and alert sounds 15 minutes before meeting start
 */
import { Booking } from '../types';

export type NotificationPermissionStatus = 'granted' | 'denied' | 'default' | 'unsupported';

export function getNotificationPermission(): NotificationPermissionStatus {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermissionStatus> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    const perm = await Notification.requestPermission();
    return perm;
  } catch (err) {
    console.warn('Notification permission request error:', err);
    return Notification.permission;
  }
}

/**
 * Plays a clean, pleasant notification chime using Web Audio API (no external file needed)
 */
export function playNotificationChime() {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();

    // 2-tone melodic chime: C5 (523.25 Hz) then G5 (783.99 Hz)
    const playTone = (freq: number, startTime: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(0.2, startTime + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + duration);
    };

    const now = ctx.currentTime;
    playTone(523.25, now, 0.4);       // C5
    playTone(783.99, now + 0.18, 0.6); // G5
  } catch (e) {
    // AudioContext may be restricted before user interaction, safely ignore
  }
}

const NOTIFIED_CACHE_KEY = 'ec_notified_meeting_15m_';
const NOTIFIED_EMAIL_CACHE_KEY = 'ec_notified_email_15m_';

/**
 * Checks if a specific meeting has already been notified via desktop push
 */
export function hasNotifiedMeeting(bookingId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(NOTIFIED_CACHE_KEY + bookingId) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks a meeting as notified so user is not spammed repeatedly via desktop push
 */
export function markMeetingAsNotified(bookingId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(NOTIFIED_CACHE_KEY + bookingId, 'true');
  } catch {}
}

/**
 * Checks if 15-minute reminder email has already been sent for this meeting
 */
export function hasSentReminderEmail(bookingId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return sessionStorage.getItem(NOTIFIED_EMAIL_CACHE_KEY + bookingId) === 'true';
  } catch {
    return false;
  }
}

/**
 * Marks 15-minute reminder email as sent in session storage
 */
export function markSentReminderEmail(bookingId: string): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(NOTIFIED_EMAIL_CACHE_KEY + bookingId, 'true');
  } catch {}
}

/**
 * Triggers a desktop push notification for a meeting starting in 15 minutes
 */
export function triggerMeetingPushNotification(booking: Booking, minutesRemaining: number) {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;

  if (hasNotifiedMeeting(booking.id)) return;
  markMeetingAsNotified(booking.id);

  playNotificationChime();

  const title = minutesRemaining <= 1 
    ? `🔔 การประชุม "${booking.title}" กำลังจะเริ่มขึ้นแล้ว!`
    : `⏰ เตรียมตัว! การประชุมจะเริ่มในอีก ${minutesRemaining} นาที`;

  const timeOnly = booking.startTime.includes('T') 
    ? booking.startTime.split('T')[1].slice(0, 5) 
    : '';

  const body = `ห้อง: ${booking.roomName || 'ไม่ระบุห้อง'}\nเวลา: ${timeOnly} น.\nผู้จัด: ${booking.creatorName}`;

  try {
    const notif = new Notification(title, {
      body,
      icon: '/favicon.ico',
      tag: `booking-15m-${booking.id}`,
      requireInteraction: false
    });

    notif.onclick = () => {
      window.focus();
      if (booking.meetingLink) {
        window.open(booking.meetingLink, '_blank');
      }
      notif.close();
    };
  } catch (e) {
    console.warn('Failed to display browser notification:', e);
  }
}
