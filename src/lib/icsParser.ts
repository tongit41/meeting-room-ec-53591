export interface ParsedIcsEvent {
  id: string;
  title: string;
  description: string;
  startTime: string; // 'YYYY-MM-DDTHH:mm:ss' local
  endTime: string; // 'YYYY-MM-DDTHH:mm:ss' local
  location: string;
  meetingLink: string;
  isAllDay: boolean;
}

/**
 * Unescape text values according to RFC 5545
 */
function unescapeText(str: string): string {
  if (!str) return '';
  return str
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');
}

/**
 * Formats a Date object to local ISO string (YYYY-MM-DDTHH:mm:ss) without the 'Z' offset
 */
function toLocalISOString(date: Date): string {
  const tzOffset = date.getTimezoneOffset() * 60000;
  const localTime = new Date(date.getTime() - tzOffset);
  return localTime.toISOString().slice(0, 19);
}

/**
 * Parses iCalendar date-time values into a local ISO string (YYYY-MM-DDTHH:mm:ss)
 */
function parseIcalDateTime(value: string): { isoStr: string; isAllDay: boolean } {
  // Strip timezone details, e.g., "VALUE=DATE:20260715" or "TZID=Asia/Bangkok:20260715T100000"
  const cleanVal = value.trim();

  // Case 1: Date only (All day event) e.g., "20260715"
  if (/^\d{8}$/.test(cleanVal)) {
    const y = cleanVal.substring(0, 4);
    const m = cleanVal.substring(4, 6);
    const d = cleanVal.substring(6, 8);
    return {
      isoStr: `${y}-${m}-${d}T00:00:00`,
      isAllDay: true
    };
  }

  // Case 2: UTC date-time e.g., "20260715T030000Z"
  const utcMatch = cleanVal.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (utcMatch) {
    const [_, y, m, d, hh, mm, ss] = utcMatch;
    const date = new Date(Date.UTC(+y, +m - 1, +d, +hh, +mm, +ss));
    return {
      isoStr: toLocalISOString(date),
      isAllDay: false
    };
  }

  // Case 3: Floating / Local date-time e.g., "20260715T100000"
  const localMatch = cleanVal.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/);
  if (localMatch) {
    const [_, y, m, d, hh, mm, ss] = localMatch;
    return {
      isoStr: `${y}-${m}-${d}T${hh}:${mm}:${ss}`,
      isAllDay: false
    };
  }

  // Fallback to JS parsing if possible
  try {
    const parsedDate = new Date(cleanVal);
    if (!isNaN(parsedDate.getTime())) {
      return {
        isoStr: toLocalISOString(parsedDate),
        isAllDay: false
      };
    }
  } catch (e) {}

  return { isoStr: '', isAllDay: false };
}

/**
 * Extract links that look like online meetings (Google Meet, MS Teams, Zoom)
 */
function extractMeetingLink(description: string, location: string): { type: 'meet' | 'teams' | 'zoom' | 'external' | 'none'; link: string } {
  const fullText = `${location}\n${description}`;
  
  // Google Meet pattern
  const meetMatch = fullText.match(/https?:\/\/meet\.google\.com\/[a-z0-9-]+/i);
  if (meetMatch) {
    return { type: 'meet', link: meetMatch[0] };
  }
  
  // Teams pattern
  const teamsMatch = fullText.match(/https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[a-z0-9%._-]+/i);
  if (teamsMatch) {
    return { type: 'teams', link: teamsMatch[0] };
  }
  
  // Zoom pattern
  const zoomMatch = fullText.match(/https?:\/\/([a-z0-9-]+\.)?zoom\.us\/j\/[0-9?=&a-z_-]+/i);
  if (zoomMatch) {
    return { type: 'zoom', link: zoomMatch[0] };
  }

  // Generic URL in location
  const genericUrlMatch = location.match(/https?:\/\/[^\s]+/i);
  if (genericUrlMatch) {
    return { type: 'external', link: genericUrlMatch[0] };
  }

  return { type: 'none', link: '' };
}

/**
 * Parses raw .ics string and returns an array of events
 */
export function parseIcsContent(icsText: string): ParsedIcsEvent[] {
  // 1. Unfold lines (unfolding merges wrapped lines)
  const unfolded = icsText.replace(/\r?\n[ \t]/g, '');
  
  // 2. Split into lines
  const lines = unfolded.split(/\r?\n/);
  const events: ParsedIcsEvent[] = [];
  
  let currentEvent: Partial<ParsedIcsEvent> | null = null;
  let inVevent = false;

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (!trimmedLine) continue;

    if (trimmedLine === 'BEGIN:VEVENT') {
      inVevent = true;
      currentEvent = {
        id: Math.random().toString(36).substring(2, 11),
        title: 'กิจกรรมไม่มีชื่อ',
        description: '',
        location: '',
        meetingLink: '',
        isAllDay: false
      };
      continue;
    }

    if (trimmedLine === 'END:VEVENT') {
      if (currentEvent && currentEvent.startTime && currentEvent.endTime) {
        events.push(currentEvent as ParsedIcsEvent);
      }
      inVevent = false;
      currentEvent = null;
      continue;
    }

    if (inVevent && currentEvent) {
      // Find the first colon `:` but be aware of parameters with colons (e.g., DTSTART;TZID=...:...)
      const colonIndex = trimmedLine.indexOf(':');
      if (colonIndex === -1) continue;

      const keyPart = trimmedLine.substring(0, colonIndex);
      const valuePart = trimmedLine.substring(colonIndex + 1);

      // Extract the key without parameters (e.g. "DTSTART;TZID=Asia/Bangkok" -> "DTSTART")
      const key = keyPart.split(';')[0].toUpperCase();

      switch (key) {
        case 'SUMMARY':
          currentEvent.title = unescapeText(valuePart);
          break;
        case 'DESCRIPTION':
          currentEvent.description = unescapeText(valuePart);
          break;
        case 'LOCATION':
          currentEvent.location = unescapeText(valuePart);
          break;
        case 'DTSTART': {
          const { isoStr, isAllDay } = parseIcalDateTime(valuePart);
          currentEvent.startTime = isoStr;
          currentEvent.isAllDay = isAllDay;
          break;
        }
        case 'DTEND': {
          const { isoStr } = parseIcalDateTime(valuePart);
          currentEvent.endTime = isoStr;
          break;
        }
      }
    }
  }

  // Post-process to extract meeting links and handle all-day fallbacks
  return events.map(evt => {
    const meetDetails = extractMeetingLink(evt.description, evt.location);
    
    // If it's an all day event, let's default to standard business hours (09:00 - 17:00) so it's a valid timed booking
    let start = evt.startTime;
    let end = evt.endTime;
    if (evt.isAllDay && start) {
      const datePart = start.split('T')[0];
      start = `${datePart}T09:00:00`;
      end = `${datePart}T17:00:00`;
    }

    return {
      ...evt,
      startTime: start,
      endTime: end || start, // Fallback if no DTEND
      meetingLink: meetDetails.link
    } as ParsedIcsEvent;
  });
}
