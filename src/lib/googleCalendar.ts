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
    
    // Do not send Google's default plain invitation email (our system sends custom branded HTML emails instead)
    url.searchParams.append('sendUpdates', 'none');
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
      attendees: attendeesList,
    };

    if (booking.isAllDay) {
      const startDate = booking.startTime.split('T')[0];
      const endDate = booking.endTime ? booking.endTime.split('T')[0] : startDate;
      // In Google Calendar API, all-day end date is exclusive, so add 1 day
      const endObj = new Date(endDate);
      endObj.setDate(endObj.getDate() + 1);
      const nextDayStr = endObj.toISOString().split('T')[0];
      eventBody.start = { date: startDate };
      eventBody.end = { date: nextDayStr };
    } else {
      eventBody.start = {
        dateTime: formatToLocalISO(booking.startTime),
        timeZone: 'Asia/Bangkok'
      };
      eventBody.end = {
        dateTime: formatToLocalISO(booking.endTime),
        timeZone: 'Asia/Bangkok'
      };
    }

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
          const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${data.id}?sendUpdates=none&conferenceDataVersion=1`;
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
  fallbackToken?: string | null,
  sendUpdates: 'none' | 'all' = 'none'
): Promise<boolean> {
  const tryDelete = async (tokenToUse: string): Promise<{ success: boolean; status: number }> => {
    try {
      // Use sendUpdates=none by default so Google does not send its plain default cancellation email;
      // our application dispatches the official branded cancellation form to both creator and attendees.
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=${sendUpdates}`;
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
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=none&conferenceDataVersion=1`;
    
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
          const patchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}?sendUpdates=none&conferenceDataVersion=1`;
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

export function formatThaiDateRange(startStr: string, endStr: string): string {
  try {
    const s = new Date(startStr);
    const e = new Date(endStr);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) {
      return `${formatThaiDateTime(startStr)} - ${formatThaiDateTime(endStr)}`;
    }
    const thaiMonths = [
      'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
      'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
    ];
    const sDay = s.getDate();
    const sMonth = thaiMonths[s.getMonth()];
    const sYear = s.getFullYear() + 543;
    const sHours = String(s.getHours()).padStart(2, '0');
    const sMinutes = String(s.getMinutes()).padStart(2, '0');

    const eDay = e.getDate();
    const eMonth = thaiMonths[e.getMonth()];
    const eYear = e.getFullYear() + 543;
    const eHours = String(e.getHours()).padStart(2, '0');
    const eMinutes = String(e.getMinutes()).padStart(2, '0');

    // If on the same calendar day, format as: "25 กันยายน 2569 เวลา 09:00 น. - 10:00 น."
    if (s.getFullYear() === e.getFullYear() && s.getMonth() === e.getMonth() && s.getDate() === e.getDate()) {
      return `${sDay} ${sMonth} ${sYear} เวลา ${sHours}:${sMinutes} น. - ${eHours}:${eMinutes} น.`;
    }

    // If across different days
    return `${sDay} ${sMonth} ${sYear} เวลา ${sHours}:${sMinutes} น. - ${eDay} ${eMonth} ${eYear} เวลา ${eHours}:${eMinutes} น.`;
  } catch {
    return `${startStr} - ${endStr}`;
  }
}

export async function sendEmailNotification(
  accessToken: string,
  toEmail: string,
  subject: string,
  bodyHtml: string,
  fallbackToken?: string | null
): Promise<boolean> {
  const trySend = async (tokenToUse: string): Promise<boolean> => {
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
          'Authorization': `Bearer ${tokenToUse}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedMessage
        })
      });

      if (!response.ok) {
        const errText = await response.text();
        console.warn(`Gmail API sending failed (${response.status}):`, errText);
        return false;
      }

      return true;
    } catch (err) {
      console.error('Error sending email via Gmail API:', err);
      return false;
    }
  };

  if (accessToken) {
    const sent = await trySend(accessToken);
    if (sent) return true;
    if (fallbackToken && fallbackToken !== accessToken) {
      console.log('Retrying Gmail API sending with fallback token...');
      return await trySend(fallbackToken);
    }
  } else if (fallbackToken) {
    return await trySend(fallbackToken);
  }

  return false;
}

/**
 * Builds custom branded HTML email matching the official confirmation form
 * Used for both the booking creator and attendees (with tailored greeting)
 */
export function buildBookingEmailHtml(
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  recipientName: string,
  isAttendee: boolean
): { subject: string; html: string } {
  const subject = isAttendee 
    ? `[แจ้งเตือนการประชุม] ขอเชิญเข้าร่วม: ${booking.title} (${booking.roomName})`
    : `[ยืนยันการจอง] รายการจองห้องประชุมสำเร็จ: ${booking.title}`;

  let meetSection = '';
  if (booking.meetingType === 'meet' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #166534; font-size: 15px;">ลิงก์เข้าร่วมประชุม Google Meet</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);">เข้าร่วมผ่าน Google Meet</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #15803d; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  } else if (booking.meetingType === 'teams' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #f0f5ff; border: 1px solid #dbeafe; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e40af; font-size: 15px;">ลิงก์เข้าร่วมประชุม Microsoft Teams</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">เข้าร่วมผ่าน Teams</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #1d4ed8; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  } else if (booking.meetingType === 'zoom' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #fdfaf2; border: 1px solid #fef3c7; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #92400e; font-size: 15px;">ลิงก์เข้าร่วมประชุม Zoom</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.2);">เข้าร่วมผ่าน Zoom</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #b45309; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  }

  const attendeesHtml = booking.attendees && booking.attendees.length > 0 ? `
    <tr>
      <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9; vertical-align: top;">ผู้เข้าร่วม:</td>
      <td style="padding: 10px 0; color: #334155; border-bottom: 1px solid #f1f5f9;">
        ${booking.attendees.map(a => a.nickname ? `${a.displayName} (${a.nickname})` : a.displayName).join(', ')}
      </td>
    </tr>
  ` : '';

  const creatorRowHtml = isAttendee ? `
    <tr>
      <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9;">ผู้จัดประชุม:</td>
      <td style="padding: 10px 0; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${booking.creatorName} (${booking.creatorEmail})</td>
    </tr>
  ` : '';

  const html = `
    <div style="font-family: 'Prompt', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #16a34a;">
        <h2 style="color: #16a34a; margin: 0; font-size: 22px; font-weight: bold;">
          ${isAttendee ? 'แจ้งเตือนการนัดหมายการประชุม' : 'ยืนยันการจองห้องประชุมสำเร็จ'}
        </h2>
        ${isAttendee ? '<p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px;">คุณได้รับเชิญเข้าร่วมการประชุมห้องประชุม EC</p>' : ''}
      </div>
      
      <div style="padding: 24px 0; color: #334155; line-height: 1.6;">
        <p style="font-size: 15px; margin-top: 0;">เรียน คุณ <strong>${recipientName}</strong>,</p>
        <p style="margin-bottom: 18px;">
          ${isAttendee 
            ? `คุณได้รับเชิญเข้าร่วมการประชุม โดยมีคุณ <strong>${booking.creatorName}</strong> (${booking.creatorEmail}) เป็นผู้จัดประชุม มีรายละเอียดดังต่อไปนี้:`
            : 'รายการจองห้องประชุมของคุณได้รับการยืนยันและเปิดจองในระบบเรียบร้อย มีรายละเอียดดังต่อไปนี้:'
          }
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0 20px 0; font-size: 14px;">
          <tr>
            <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9;">หัวข้อกิจกรรม:</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a; font-size: 15px; border-bottom: 1px solid #f1f5f9;">${booking.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; border-bottom: 1px solid #f1f5f9;">ห้องประชุม:</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="background-color: #f0fdf4; color: #166534; padding: 4px 10px; border-radius: 6px; font-weight: bold;">${booking.roomName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; border-bottom: 1px solid #f1f5f9;">วันและเวลา:</td>
            <td style="padding: 10px 0; color: #1e293b; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${formatThaiDateRange(booking.startTime, booking.endTime)}</td>
          </tr>
          ${creatorRowHtml}
          ${attendeesHtml}
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; vertical-align: top;">รายละเอียด:</td>
            <td style="padding: 10px 0; color: #334155;">${booking.description || '-'}</td>
          </tr>
        </table>

        ${meetSection}
      </div>

      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">อีเมลส่งโดยระบบอัตโนมัติจากห้องประชุม EC</p>
      </div>
    </div>
  `;

  return { subject, html };
}

/**
 * Sends branded notification emails to the creator and all meeting attendees
 */
export async function sendBookingNotifications(
  token: string,
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  options?: { skipCreator?: boolean }
): Promise<{ creatorSent: boolean; attendeesSentCount: number }> {
  let creatorSent = false;
  let attendeesSentCount = 0;

  // 1. Send confirmation email to creator
  if (!options?.skipCreator && booking.creatorEmail) {
    try {
      const creatorEmailData = buildBookingEmailHtml(booking, booking.creatorName || booking.creatorEmail, false);
      const sent = await sendEmailNotification(token, booking.creatorEmail, creatorEmailData.subject, creatorEmailData.html);
      if (sent) creatorSent = true;
    } catch (e) {
      console.warn('Failed to send email to creator:', e);
    }
  }

  // 2. Send invitation email to attendees
  if (booking.attendees && booking.attendees.length > 0) {
    const creatorEmailLower = (booking.creatorEmail || '').trim().toLowerCase();
    for (const att of booking.attendees) {
      const attEmail = (att.email || '').trim().toLowerCase();
      // Skip sending duplicate to creator if creator is in attendees list
      if (attEmail && attEmail !== creatorEmailLower) {
        try {
          const recipientName = att.nickname ? `${att.displayName} (${att.nickname})` : att.displayName || att.email;
          const attendeeEmailData = buildBookingEmailHtml(booking, recipientName, true);
          const sent = await sendEmailNotification(token, att.email, attendeeEmailData.subject, attendeeEmailData.html);
          if (sent) attendeesSentCount++;
        } catch (e) {
          console.warn(`Failed to send email to attendee ${att.email}:`, e);
        }
      }
    }
  }

  return { creatorSent, attendeesSentCount };
}

/**
 * Builds custom branded HTML reminder email for 15 minutes before meeting starts
 * Sent to both creator and attendees with tailored messages
 */
export function buildMeetingReminderEmailHtml(
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  recipientName: string,
  isAttendee: boolean,
  minutesLeft: number = 15
): { subject: string; html: string } {
  const subject = `[แจ้งเตือนการประชุม] "${booking.title}" จะเริ่มขึ้นในอีก ${minutesLeft} นาที (${booking.roomName})`;

  let meetSection = '';
  if (booking.meetingType === 'meet' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #166534; font-size: 15px;">ลิงก์เข้าร่วมประชุม Google Meet</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #16a34a; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(22, 163, 74, 0.2);">เข้าร่วมผ่าน Google Meet ทันที</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #15803d; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  } else if (booking.meetingType === 'teams' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #f0f5ff; border: 1px solid #dbeafe; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #1e40af; font-size: 15px;">ลิงก์เข้าร่วมประชุม Microsoft Teams</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #2563eb; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(37, 99, 235, 0.2);">เข้าร่วมผ่าน Teams ทันที</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #1d4ed8; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  } else if (booking.meetingType === 'zoom' && booking.meetingLink) {
    meetSection = `
      <div style="margin: 20px 0; padding: 18px; background-color: #fdfaf2; border: 1px solid #fef3c7; border-radius: 10px; text-align: center;">
        <p style="margin: 0 0 10px 0; font-weight: bold; color: #92400e; font-size: 15px;">ลิงก์เข้าร่วมประชุม Zoom</p>
        <a href="${booking.meetingLink}" style="display: inline-block; background-color: #d97706; color: #ffffff; padding: 11px 24px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px; box-shadow: 0 2px 4px rgba(217, 119, 6, 0.2);">เข้าร่วมผ่าน Zoom ทันที</a>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #b45309; word-break: break-all;">${booking.meetingLink}</p>
      </div>
    `;
  }

  const attendeesHtml = booking.attendees && booking.attendees.length > 0 ? `
    <tr>
      <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9; vertical-align: top;">ผู้เข้าร่วม:</td>
      <td style="padding: 10px 0; color: #334155; border-bottom: 1px solid #f1f5f9;">
        ${booking.attendees.map(a => a.nickname ? `${a.displayName} (${a.nickname})` : a.displayName).join(', ')}
      </td>
    </tr>
  ` : '';

  const creatorRowHtml = isAttendee ? `
    <tr>
      <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9;">ผู้จัดประชุม:</td>
      <td style="padding: 10px 0; color: #1e293b; border-bottom: 1px solid #f1f5f9;">${booking.creatorName} (${booking.creatorEmail})</td>
    </tr>
  ` : '';

  const html = `
    <div style="font-family: 'Prompt', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fed7aa; border-radius: 12px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #f59e0b;">
        <div style="display: inline-block; background-color: #fef3c7; color: #b45309; font-weight: bold; font-size: 12px; padding: 4px 14px; border-radius: 9999px; margin-bottom: 8px; border: 1px solid #fde68a;">
          ⏰ แจ้งเตือนล่วงหน้า ${minutesLeft} นาที
        </div>
        <h2 style="color: #d97706; margin: 0; font-size: 22px; font-weight: bold;">
          การประชุมใกล้จะเริ่มขึ้นแล้ว
        </h2>
        <p style="margin: 6px 0 0 0; color: #64748b; font-size: 13px;">กรุณาเตรียมตัวและอุปกรณ์สำหรับการเข้าร่วมประชุม</p>
      </div>
      
      <div style="padding: 24px 0; color: #334155; line-height: 1.6;">
        <p style="font-size: 15px; margin-top: 0;">เรียน คุณ <strong>${recipientName}</strong>,</p>
        <p style="margin-bottom: 18px;">
          ${isAttendee 
            ? `การประชุมที่คุณได้รับเชิญเข้าร่วม โดยคุณ <strong>${booking.creatorName}</strong> (${booking.creatorEmail}) กำลังจะเริ่มขึ้นในอีกประมาณ <strong>${minutesLeft} นาที</strong> รายละเอียดการประชุมมีดังนี้:`
            : `รายการจองห้องประชุมของคุณกำลังจะเริ่มขึ้นในอีกประมาณ <strong>${minutesLeft} นาที</strong> กรุณาเตรียมเปิดห้องและเข้าใช้งานตามรายละเอียดดังนี้:`
          }
        </p>

        <table style="width: 100%; border-collapse: collapse; margin: 16px 0 20px 0; font-size: 14px;">
          <tr>
            <td style="padding: 10px 0; font-weight: bold; width: 120px; color: #64748b; border-bottom: 1px solid #f1f5f9;">หัวข้อกิจกรรม:</td>
            <td style="padding: 10px 0; font-weight: bold; color: #0f172a; font-size: 15px; border-bottom: 1px solid #f1f5f9;">${booking.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; border-bottom: 1px solid #f1f5f9;">ห้องประชุม:</td>
            <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
              <span style="background-color: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 6px; font-weight: bold; border: 1px solid #fde68a;">${booking.roomName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; border-bottom: 1px solid #f1f5f9;">วันและเวลา:</td>
            <td style="padding: 10px 0; color: #1e293b; font-weight: 600; border-bottom: 1px solid #f1f5f9;">${formatThaiDateRange(booking.startTime, booking.endTime)}</td>
          </tr>
          ${creatorRowHtml}
          ${attendeesHtml}
          <tr>
            <td style="padding: 10px 0; font-weight: bold; color: #64748b; vertical-align: top;">รายละเอียด:</td>
            <td style="padding: 10px 0; color: #334155;">${booking.description || '-'}</td>
          </tr>
        </table>

        ${meetSection}
      </div>

      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">อีเมลแจ้งเตือนอัตโนมัติ 15 นาทีก่อนเริ่มประชุม จากระบบจองห้องประชุม EC</p>
      </div>
    </div>
  `;

  return { subject, html };
}

/**
 * Sends branded 15-minute upcoming meeting reminder emails to creator and attendees
 */
export async function send15MinuteMeetingReminderEmails(
  token: string,
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  minutesLeft: number = 15
): Promise<{ creatorSent: boolean; attendeesSentCount: number }> {
  let creatorSent = false;
  let attendeesSentCount = 0;

  // 1. Send reminder email to creator
  if (booking.creatorEmail) {
    try {
      const creatorEmailData = buildMeetingReminderEmailHtml(booking, booking.creatorName || booking.creatorEmail, false, minutesLeft);
      const sent = await sendEmailNotification(token, booking.creatorEmail, creatorEmailData.subject, creatorEmailData.html);
      if (sent) creatorSent = true;
    } catch (e) {
      console.warn('Failed to send 15m reminder email to creator:', e);
    }
  }

  // 2. Send reminder email to all attendees
  if (booking.attendees && booking.attendees.length > 0) {
    const creatorEmailLower = (booking.creatorEmail || '').trim().toLowerCase();
    for (const att of booking.attendees) {
      const attEmail = (att.email || '').trim().toLowerCase();
      if (attEmail && attEmail !== creatorEmailLower) {
        try {
          const recipientName = att.nickname ? `${att.displayName} (${att.nickname})` : att.displayName || att.email;
          const attendeeEmailData = buildMeetingReminderEmailHtml(booking, recipientName, true, minutesLeft);
          const sent = await sendEmailNotification(token, att.email, attendeeEmailData.subject, attendeeEmailData.html);
          if (sent) attendeesSentCount++;
        } catch (e) {
          console.warn(`Failed to send 15m reminder email to attendee ${att.email}:`, e);
        }
      }
    }
  }

  return { creatorSent, attendeesSentCount };
}

/**
 * Checks and verifies if a Google Calendar Access Token is active and authorized
 */
export async function verifyGoogleCalendarToken(accessToken: string): Promise<{ valid: boolean; status: number; error?: string }> {
  if (!accessToken || !accessToken.trim()) {
    return { valid: false, status: 401, error: 'ยังไม่มี Access Token' };
  }
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    if (res.ok) {
      return { valid: true, status: res.status };
    }
    let errMessage = `HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        errMessage = errJson.error.message;
      }
    } catch {
      // fallback
    }
    return { valid: false, status: res.status, error: errMessage };
  } catch (err: any) {
    return { valid: false, status: 0, error: err?.message || 'Network error' };
  }
}

/**
 * Builds custom branded HTML cancellation email
 * Matching the exact form layout, red cancellation header, reason banner, and details table
 * Used for both the booking creator and participants/attendees (with tailored greeting)
 */
export function buildCancellationEmailHtml(
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  recipientName: string,
  isAttendee: boolean,
  cancelledByName?: string,
  reason?: string
): { subject: string; html: string } {
  const subject = `[แจ้งยกเลิกการจอง] รายการ "${booking.title}" ถูกยกเลิกเรียบร้อยแล้ว`;

  const attendeesHtml = booking.attendees && booking.attendees.length > 0 ? `
    <tr>
      <td style="padding: 10px 14px; font-weight: bold; width: 130px; color: #64748b; border-bottom: 1px solid #e2e8f0; vertical-align: top;">ผู้เข้าร่วม:</td>
      <td style="padding: 10px 14px; color: #334155; border-bottom: 1px solid #e2e8f0;">
        ${booking.attendees.map(a => a.nickname ? `${a.displayName} (${a.nickname})` : a.displayName || a.email).join(', ')}
      </td>
    </tr>
  ` : '';

  const creatorRowHtml = `
    <tr>
      <td style="padding: 10px 14px; font-weight: bold; width: 130px; color: #64748b; border-bottom: 1px solid #e2e8f0;">ผู้จอง / ผู้จัด:</td>
      <td style="padding: 10px 14px; color: #334155; border-bottom: 1px solid #e2e8f0;">
        ${booking.creatorName ? `${booking.creatorName} (${booking.creatorEmail})` : booking.creatorEmail}
      </td>
    </tr>
  `;

  const cancelledByRowHtml = cancelledByName ? `
    <tr>
      <td style="padding: 10px 14px; font-weight: bold; width: 130px; color: #64748b; border-bottom: 1px solid #e2e8f0;">ผู้ดำเนินการยกเลิก:</td>
      <td style="padding: 10px 14px; color: #334155; border-bottom: 1px solid #e2e8f0;">${cancelledByName}</td>
    </tr>
  ` : '';

  const descriptionRowHtml = booking.description ? `
    <tr>
      <td style="padding: 10px 14px; font-weight: bold; color: #64748b; vertical-align: top;">รายละเอียดเดิม:</td>
      <td style="padding: 10px 14px; color: #475569;">${booking.description}</td>
    </tr>
  ` : '';

  const reasonHtml = reason ? `
    <div style="background-color: #fef2f2; border-left: 4px solid #ef4444; padding: 14px 18px; border-radius: 8px; margin: 18px 0; border-top: 1px solid #fee2e2; border-right: 1px solid #fee2e2; border-bottom: 1px solid #fee2e2;">
      <span style="font-size: 12px; font-weight: bold; color: #991b1b; text-transform: uppercase; letter-spacing: 0.5px;">เหตุผลในการยกเลิก:</span>
      <p style="margin: 4px 0 0 0; font-size: 14px; color: #b91c1c; font-weight: bold;">${reason}</p>
    </div>
  ` : '';

  const onlineMeetingCancelledNotice = booking.meetingLink ? `
    <div style="margin: 16px 0; padding: 10px 14px; background-color: #fff1f2; border: 1px dashed #fda4af; border-radius: 8px; font-size: 13px; color: #9f1239; text-align: center;">
      🚫 ลิงก์การประชุมออนไลน์ (${(booking.meetingType || 'Online').toUpperCase()}) ได้ถูกยกเลิกและนำออกจากปฏิทินเรียบร้อยแล้ว
    </div>
  ` : '';

  const greetingMessage = isAttendee
    ? `ขอแจ้งให้ทราบว่ารายการประชุม <strong>"${booking.title}"</strong> ที่ท่านได้รับเชิญเข้าร่วม ได้รับการยกเลิกเรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:`
    : `ขอแจ้งให้ทราบว่ารายการประชุม <strong>"${booking.title}"</strong> ได้รับการยกเลิกเรียบร้อยแล้ว โดยมีรายละเอียดดังนี้:`;

  const html = `
    <div style="font-family: 'Prompt', 'Sarabun', 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #334155; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.03);">
      <div style="text-align: center; padding-bottom: 20px; border-bottom: 2px solid #ef4444;">
        <div style="display: inline-block; background-color: #fee2e2; color: #ef4444; padding: 6px 16px; border-radius: 20px; font-weight: bold; font-size: 13px; margin-bottom: 8px; border: 1px solid #fecaca;">
          🚫 CANCELLATION NOTICE
        </div>
        <h2 style="color: #ef4444; margin: 0; font-size: 22px; font-weight: bold;">แจ้งยกเลิกการจองห้องประชุม</h2>
        <p style="color: #64748b; font-size: 13px; margin: 6px 0 0 0;">รายการจองห้องประชุมได้รับการยกเลิกและนำออกจากระบบเรียบร้อยแล้ว</p>
      </div>

      <div style="padding: 20px 0; line-height: 1.6;">
        <p style="margin-top: 0; font-size: 15px; color: #0f172a;">เรียน คุณ <strong>${recipientName}</strong>,</p>
        <p style="font-size: 14px; color: #475569;">
          ${greetingMessage}
        </p>

        ${reasonHtml}

        <table style="width: 100%; border-collapse: collapse; margin: 18px 0; font-size: 14px; background-color: #f8fafc; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
          <tr>
            <td style="padding: 10px 14px; font-weight: bold; width: 130px; color: #64748b; border-bottom: 1px solid #e2e8f0;">หัวข้อการประชุม:</td>
            <td style="padding: 10px 14px; font-weight: bold; color: #0f172a; border-bottom: 1px solid #e2e8f0;">${booking.title}</td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0;">ห้องประชุม:</td>
            <td style="padding: 10px 14px; border-bottom: 1px solid #e2e8f0;">
              <span style="background-color: #e0e7ff; color: #3730a3; padding: 3px 8px; border-radius: 6px; font-weight: bold; font-size: 12px; border: 1px solid #c7d2fe;">${booking.roomName}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 10px 14px; font-weight: bold; color: #64748b; border-bottom: 1px solid #e2e8f0;">วันและเวลาเดิม:</td>
            <td style="padding: 10px 14px; color: #334155; font-weight: 600; border-bottom: 1px solid #e2e8f0;">${formatThaiDateRange(booking.startTime, booking.endTime)}</td>
          </tr>
          ${creatorRowHtml}
          ${cancelledByRowHtml}
          ${attendeesHtml}
          ${descriptionRowHtml}
        </table>

        ${onlineMeetingCancelledNotice}

        <p style="margin-top: 20px; font-size: 13px; color: #64748b; background-color: #f1f5f9; padding: 12px 14px; border-radius: 8px; line-height: 1.5; border: 1px solid #e2e8f0;">
          💡 หากท่านต้องการจองห้องประชุมช่วงเวลาดังกล่าวใหม่ สามารถเข้าใช้งานและทำรายการจองผ่านระบบห้องประชุม EC ได้ทันที
        </p>
      </div>

      <div style="text-align: center; padding-top: 18px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8;">
        <p style="margin: 0;">ระบบจัดการห้องประชุมอัตโนมัติ บริษัท อี.ซี.ฯ</p>
      </div>
    </div>
  `;

  return { subject, html };
}

/**
 * Sends unified branded cancellation emails to the creator and all meeting attendees
 * Guarantees that both the booker and all participants receive the exact same official cancellation form
 */
export async function sendBookingCancellationNotifications(
  token: string,
  booking: {
    title: string;
    roomName: string;
    startTime: string;
    endTime: string;
    creatorName: string;
    creatorEmail: string;
    description?: string;
    meetingType?: string;
    meetingLink?: string;
    attendees?: Array<{ email: string; displayName: string; nickname?: string }>;
  },
  cancelledByName?: string,
  reason?: string,
  fallbackToken?: string | null
): Promise<{ creatorSent: boolean; attendeesSentCount: number }> {
  let creatorSent = false;
  let attendeesSentCount = 0;

  // 1. Send cancellation email to creator (ผู้จอง)
  if (booking.creatorEmail) {
    try {
      const creatorName = booking.creatorName || booking.creatorEmail;
      const creatorEmailData = buildCancellationEmailHtml(
        booking,
        creatorName,
        false,
        cancelledByName,
        reason
      );
      const sent = await sendEmailNotification(
        token,
        booking.creatorEmail,
        creatorEmailData.subject,
        creatorEmailData.html,
        fallbackToken
      );
      if (sent) creatorSent = true;
    } catch (e) {
      console.warn('Failed to send cancellation email to creator:', e);
    }
  }

  // 2. Send cancellation email to all attendees (ผู้เข้าร่วม) using the EXACT same form
  if (booking.attendees && booking.attendees.length > 0) {
    const creatorEmailLower = (booking.creatorEmail || '').trim().toLowerCase();
    for (const att of booking.attendees) {
      const attEmail = (att.email || '').trim().toLowerCase();
      // Avoid duplicate send if creator is also listed in attendees
      if (attEmail && attEmail !== creatorEmailLower) {
        try {
          const recipientName = att.nickname
            ? `${att.displayName} (${att.nickname})`
            : att.displayName || att.email;
          const attendeeEmailData = buildCancellationEmailHtml(
            booking,
            recipientName,
            true,
            cancelledByName,
            reason
          );
          const sent = await sendEmailNotification(
            token,
            att.email,
            attendeeEmailData.subject,
            attendeeEmailData.html,
            fallbackToken
          );
          if (sent) attendeesSentCount++;
        } catch (e) {
          console.warn(`Failed to send cancellation email to attendee ${att.email}:`, e);
        }
      }
    }
  }

  return { creatorSent, attendeesSentCount };
}
