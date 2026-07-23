import { Booking, MeetingPlatform } from '../types';

// Helper to convert date-time string to ISO format with Asia/Bangkok (+07:00) timezone offset
export function formatToLocalISO(dateTimeStr: string): string {
  // If already contains offset, return. Otherwise, append Bangkok timezone offset (+07:00)
  if (dateTimeStr.includes('+') || dateTimeStr.endsWith('Z')) {
    return dateTimeStr;
  }
  return `${dateTimeStr}:00+07:00`;
}

/**
 * Creates an event in the user's primary Google Calendar
 * If platform is 'meet', requests Google Meet conference details.
 */
export async function createGoogleCalendarEvent(
  accessToken: string,
  booking: Omit<Booking, 'id' | 'createdAt'>,
  requestId: string
): Promise<{ eventId: string; meetingLink: string }> {
  try {
    const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    
    // Send email invites to attendees & auto-generate Meet
    url.searchParams.append('sendUpdates', 'all');
    url.searchParams.append('conferenceDataVersion', '1');

    const attendeesList = booking.attendees.map(att => ({
      email: att.email,
      displayName: att.displayName
    }));

    // Ensure the creator is also an attendee so the event shows up on their personal Google Calendar
    if (booking.creatorEmail) {
      const creatorEmailLower = booking.creatorEmail.trim().toLowerCase();
      const isCreatorPresent = attendeesList.some(
        att => (att.email || '').trim().toLowerCase() === creatorEmailLower
      );
      if (!isCreatorPresent) {
        attendeesList.push({
          email: booking.creatorEmail,
          displayName: booking.creatorName || booking.creatorEmail
        });
      }
    }

    const eventBody: any = {
      summary: booking.title,
      description: booking.description,
      location: booking.roomName,
      start: {
        dateTime: formatToLocalISO(booking.startTime),
        timeZone: 'Asia/Bangkok'
      },
      end: {
        dateTime: formatToLocalISO(booking.endTime),
        timeZone: 'Asia/Bangkok'
      },
      attendees: attendeesList,
    };

    // If platform is Google Meet, we request conference creation
    if (booking.meetingType === 'meet') {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `meet-${requestId}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      };
    }

    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Google Calendar Error: ${response.status} - ${errText}`);
    }

    const data = await response.json();
    
    // Filter out phone entry points to fulfill the user's request: "และเอาเข้าร่วมทางโทรศัพท์ออกด้วย"
    if (booking.meetingType === 'meet' && data.conferenceData?.entryPoints) {
      const originalPoints = data.conferenceData.entryPoints;
      const filteredPoints = originalPoints.filter((ep: any) => ep.entryPointType !== 'phone');
      if (filteredPoints.length !== originalPoints.length) {
        try {
          const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${data.id}?sendUpdates=all&conferenceDataVersion=1`;
          const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              conferenceData: {
                ...data.conferenceData,
                entryPoints: filteredPoints
              }
            })
          });
          if (patchRes.ok) {
            const patchedData = await patchRes.json();
            if (patchedData.conferenceData?.entryPoints) {
              data.conferenceData = patchedData.conferenceData;
            }
          }
        } catch (patchErr) {
          console.warn('Failed to remove phone entry point from Google Calendar event:', patchErr);
        }
      }
    }

    let meetingLink = booking.meetingLink;
    if (booking.meetingType === 'meet') {
      // Extract Google Meet link from conferenceData
      if (data.hangoutLink) {
        meetingLink = data.hangoutLink;
      } else if (data.conferenceData?.entryPoints) {
        const videoEntryPoint = data.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video'
        );
        if (videoEntryPoint) {
          meetingLink = videoEntryPoint.uri;
        }
      }
    }

    return {
      eventId: data.id,
      meetingLink: meetingLink || ''
    };
  } catch (error) {
    console.error('Failed to create event in Google Calendar:', error);
    throw error;
  }
}

/**
 * Deletes an event in the user's Google Calendar
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  fallbackToken?: string | null
): Promise<boolean> {
  const tryDelete = async (tokenToUse: string): Promise<{ success: boolean; status: number }> => {
    try {
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all`;
      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${tokenToUse}`
        }
      });

      if (response.status === 200 || response.status === 204 || response.status === 410) {
        return { success: true, status: response.status };
      }

      const errText = await response.text();
      console.warn(`Failed to delete Google Calendar event (${response.status}): ${errText}`);
      return { success: false, status: response.status };
    } catch (error) {
      console.error('Error deleting Google Calendar event:', error);
      return { success: false, status: 500 };
    }
  };

  if (accessToken) {
    const res = await tryDelete(accessToken);
    if (res.success) return true;
    
    if (fallbackToken && fallbackToken !== accessToken) {
      console.log('Retrying Google Calendar event deletion with fallback token...');
      const fallbackRes = await tryDelete(fallbackToken);
      if (fallbackRes.success) return true;
    }
  } else if (fallbackToken) {
    const fallbackRes = await tryDelete(fallbackToken);
    if (fallbackRes.success) return true;
  }

  return false;
}

/**
 * Updates an existing Google Calendar Event
 */
export async function updateGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  booking: Booking
): Promise<string | null> {
  try {
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all&conferenceDataVersion=1`;
    
    const attendeesList = booking.attendees.map(att => ({
      email: att.email,
      displayName: att.displayName
    }));

    // Ensure the creator is also an attendee so the event shows up on their personal Google Calendar
    if (booking.creatorEmail) {
      const creatorEmailLower = booking.creatorEmail.trim().toLowerCase();
      const isCreatorPresent = attendeesList.some(
        att => (att.email || '').trim().toLowerCase() === creatorEmailLower
      );
      if (!isCreatorPresent) {
        attendeesList.push({
          email: booking.creatorEmail,
          displayName: booking.creatorName || booking.creatorEmail
        });
      }
    }

    const eventBody: any = {
      summary: booking.title,
      description: booking.description,
      location: booking.roomName,
      start: {
        dateTime: formatToLocalISO(booking.startTime),
        timeZone: 'Asia/Bangkok'
      },
      end: {
        dateTime: formatToLocalISO(booking.endTime),
        timeZone: 'Asia/Bangkok'
      },
      attendees: attendeesList
    };

    if (booking.meetingType === 'meet') {
      eventBody.conferenceData = {
        createRequest: {
          requestId: `meet-update-${eventId}-${Date.now()}`,
          conferenceSolutionKey: {
            type: 'hangoutsMeet'
          }
        }
      };
    }

    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(eventBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn(`Failed to update Google Calendar event: ${response.status} - ${errText}`);
      return null;
    }

    const data = await response.json();

    // Filter out phone entry points to fulfill the user's request: "และเอาเข้าร่วมทางโทรศัพท์ออกด้วย"
    if (booking.meetingType === 'meet' && data.conferenceData?.entryPoints) {
      const originalPoints = data.conferenceData.entryPoints;
      const filteredPoints = originalPoints.filter((ep: any) => ep.entryPointType !== 'phone');
      if (filteredPoints.length !== originalPoints.length) {
        try {
          const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=all&conferenceDataVersion=1`;
          const patchRes = await fetch(patchUrl, {
            method: 'PATCH',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              conferenceData: {
                ...data.conferenceData,
                entryPoints: filteredPoints
              }
            })
          });
          if (patchRes.ok) {
            const patchedData = await patchRes.json();
            if (patchedData.conferenceData?.entryPoints) {
              data.conferenceData = patchedData.conferenceData;
            }
          }
        } catch (patchErr) {
          console.warn('Failed to remove phone entry point during update:', patchErr);
        }
      }
    }

    let meetingLink = booking.meetingLink;
    if (booking.meetingType === 'meet') {
      if (data.hangoutLink) {
        meetingLink = data.hangoutLink;
      } else if (data.conferenceData?.entryPoints) {
        const videoEntryPoint = data.conferenceData.entryPoints.find(
          (ep: any) => ep.entryPointType === 'video'
        );
        if (videoEntryPoint) {
          meetingLink = videoEntryPoint.uri;
        }
      }
    }
    return meetingLink;
  } catch (error) {
    console.error('Error updating Google Calendar event:', error);
    return null;
  }
}

export function formatThaiDateTime(dateTimeStr: string): string {
  try {
    const d = new Date(dateTimeStr);
    if (isNaN(d.getTime())) return dateTimeStr;
    const day = d.getDate();
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const month = thaiMonths[d.getMonth()];
    const year = d.getFullYear() + 543;
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day} ${month} ${year} เวลา ${hours}:${minutes} น.`;
  } catch {
    return dateTimeStr;
  }
}

export async function sendEmailNotification(
  accessToken: string,
  toEmail: string,
  subject: string,
  bodyHtml: string
): Promise<boolean> {
  try {
    const utf8Subject = `=?utf-8?B?${btoa(unescape(encodeURIComponent(subject)))}?=`;
    const messageParts = [
      `To: ${toEmail}`,
      'Content-Type: text/html; charset=utf-8',
      'MIME-Version: 1.0',
      `Subject: ${utf8Subject}`,
      '',
      bodyHtml
    ];
    const message = messageParts.join('\r\n');
    
    // Base64url encode the message
    const encodedMessage = btoa(unescape(encodeURIComponent(message)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    const response = await fetch('https://www.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        raw: encodedMessage
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.warn('Gmail API sending failed:', errText);
      return false;
    }

    return true;
  } catch (err) {
    console.error('Error sending email via Gmail API:', err);
    return false;
  }
}
