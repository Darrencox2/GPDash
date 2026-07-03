'use client';

import { useState } from 'react';

const TYPE_LABELS = {
  partners: 'Partners Meeting',
  practice: 'Practice Meeting',
  clinical_governance: 'Clinical Governance Meeting',
  plt: 'PLT / Protected Learning Time',
  other: 'Meeting',
};

function fmtLong(iso) {
  if (!iso) return '';
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  } catch { return iso; }
}

// Build a plain-text agenda for copy-to-clipboard (email friendly).
function buildAgendaText(meeting, items, practiceName) {
  const lines = [];
  lines.push((practiceName ? practiceName + ' — ' : '') + (TYPE_LABELS[meeting.meeting_type] || 'Meeting'));
  lines.push(meeting.title);
  lines.push(fmtLong(meeting.meeting_date) + (meeting.start_time ? ` at ${meeting.start_time}` : ''));
  if (meeting.location) lines.push(meeting.location);
  lines.push('');
  lines.push('AGENDA');
  lines.push('');
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title}${it.owner_name ? `  (${it.owner_name})` : ''}`);
    if (it.pre_notes) lines.push(`   ${it.pre_notes.replace(/\n/g, '\n   ')}`);
  });
  return lines.join('\n');
}

// Build a plain-text minutes document.
function buildMinutesText(meeting, items, actions, practiceName) {
  const lines = [];
  lines.push((practiceName ? practiceName + ' — ' : '') + (TYPE_LABELS[meeting.meeting_type] || 'Meeting'));
  lines.push('MINUTES: ' + meeting.title);
  lines.push(fmtLong(meeting.meeting_date) + (meeting.start_time ? ` at ${meeting.start_time}` : ''));
  if (meeting.location) lines.push(meeting.location);
  if (Array.isArray(meeting.attendees) && meeting.attendees.length) {
    const present = meeting.attendees.filter((a) => a.present !== false).map((a) => a.name).filter(Boolean);
    if (present.length) lines.push('Present: ' + present.join(', '));
  }
  lines.push('');
  items.forEach((it, i) => {
    lines.push(`${i + 1}. ${it.title}`);
    if (it.minute_note) lines.push(`   ${it.minute_note.replace(/\n/g, '\n   ')}`);
    if (it.outcome) lines.push(`   Outcome: ${it.outcome.charAt(0).toUpperCase() + it.outcome.slice(1)}`);
    lines.push('');
  });
  const open = (actions || []).filter((a) => a.status !== 'cancelled');
  if (open.length) {
    lines.push('ACTIONS');
    open.forEach((a) => {
      const who = a.assignee_name ? ` — ${a.assignee_name}` : '';
      const due = a.due_date ? ` (by ${a.due_date})` : '';
      lines.push(`• ${a.description}${who}${due}`);
    });
  }
  return lines.join('\n');
}

// Printable HTML in a new window (user can save as PDF via the print dialog).
function openPrintable(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; max-width: 720px; margin: 40px auto; padding: 0 24px; color: #1a1a1a; line-height: 1.5; }
    h1 { font-size: 20px; margin: 0 0 2px; }
    h2 { font-size: 15px; margin: 0 0 16px; font-weight: normal; color: #555; }
    .meta { color: #555; font-size: 13px; margin-bottom: 24px; }
    ol { padding-left: 22px; }
    li { margin-bottom: 12px; }
    .note { color: #444; font-size: 14px; margin-top: 3px; white-space: pre-wrap; }
    .outcome { color: #2563eb; font-size: 13px; font-weight: 600; margin-top: 2px; }
    .actions { margin-top: 28px; border-top: 1px solid #ddd; padding-top: 16px; }
    .actions h3 { font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px; }
    .actions ul { padding-left: 20px; }
    @media print { body { margin: 0; } }
  </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  setTimeout(() => w.print(), 300);
}

export default function AgendaDocument({ meeting, items, actions, practiceName, mode = 'agenda' }) {
  const [copied, setCopied] = useState('');

  const confirmedItems = items.filter((it) => it.item_status !== 'proposed');

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
      setTimeout(() => setCopied(''), 1800);
    } catch { /* ignore */ }
  };

  const doAgenda = () => {
    const html = `
      <h1>${TYPE_LABELS[meeting.meeting_type] || 'Meeting'}</h1>
      <h2>${escapeHtml(meeting.title)}</h2>
      <div class="meta">${fmtLong(meeting.meeting_date)}${meeting.start_time ? ` at ${meeting.start_time}` : ''}${meeting.location ? ` · ${escapeHtml(meeting.location)}` : ''}</div>
      <ol>
        ${confirmedItems.map((it) => `<li><strong>${escapeHtml(it.title)}</strong>${it.owner_name ? ` <span style="color:#777">(${escapeHtml(it.owner_name)})</span>` : ''}${it.pre_notes ? `<div class="note">${escapeHtml(it.pre_notes)}</div>` : ''}</li>`).join('')}
      </ol>`;
    openPrintable(`Agenda — ${meeting.title}`, html);
  };

  const doMinutes = () => {
    const open = (actions || []).filter((a) => a.status !== 'cancelled');
    const html = `
      <h1>Minutes — ${TYPE_LABELS[meeting.meeting_type] || 'Meeting'}</h1>
      <h2>${escapeHtml(meeting.title)}</h2>
      <div class="meta">${fmtLong(meeting.meeting_date)}${meeting.start_time ? ` at ${meeting.start_time}` : ''}${meeting.location ? ` · ${escapeHtml(meeting.location)}` : ''}</div>
      <ol>
        ${confirmedItems.map((it) => `<li><strong>${escapeHtml(it.title)}</strong>${it.minute_note ? `<div class="note">${escapeHtml(it.minute_note)}</div>` : ''}${it.outcome ? `<div class="outcome">Outcome: ${it.outcome.charAt(0).toUpperCase() + it.outcome.slice(1)}</div>` : ''}</li>`).join('')}
      </ol>
      ${open.length ? `<div class="actions"><h3>Actions</h3><ul>${open.map((a) => `<li>${escapeHtml(a.description)}${a.assignee_name ? ` — <strong>${escapeHtml(a.assignee_name)}</strong>` : ''}${a.due_date ? ` (by ${a.due_date})` : ''}</li>`).join('')}</ul></div>` : ''}`;
    openPrintable(`Minutes — ${meeting.title}`, html);
  };

  return (
    <div className="flex gap-2 flex-wrap items-center">
      {mode === 'agenda' ? (
        <>
          <button onClick={doAgenda} style={btn}>Print / PDF agenda</button>
          <button onClick={() => copy(buildAgendaText(meeting, confirmedItems, practiceName), 'agenda')} style={ghost}>
            {copied === 'agenda' ? 'Copied' : 'Copy agenda'}
          </button>
        </>
      ) : (
        <>
          <button onClick={doMinutes} style={btn}>Print / PDF minutes</button>
          <button onClick={() => copy(buildMinutesText(meeting, confirmedItems, actions, practiceName), 'minutes')} style={ghost}>
            {copied === 'minutes' ? 'Copied' : 'Copy minutes'}
          </button>
        </>
      )}
    </div>
  );
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

const btn = {
  padding: '7px 13px', borderRadius: 'var(--r-md)', border: 'none',
  background: 'var(--accent, #6366f1)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
const ghost = {
  padding: '7px 13px', borderRadius: 'var(--r-md)', border: '1px solid var(--g-border)',
  background: 'transparent', color: 'var(--g-text-mid)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
};
