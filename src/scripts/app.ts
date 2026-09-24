// Client: renders everything from `data`, applies each op locally right away,
// then sends it to /api/data. Ops are sent one batch at a time, in order.

import {
  apply,
  eventOn,
  isDone,
  isOverdue,
  isRepeating,
  listWeekdays,
  nextDay,
  occursOn,
  showsOn,
  type CalEvent,
  type Data,
  type Day,
  type List,
  type Op,
} from '../lib/model';

let data: Data = JSON.parse(document.getElementById('initial')!.textContent!);

// ---- dates (local) ----
const pad = (n: number) => String(n).padStart(2, '0');
const fmt = (d: Date): Day => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s: Day) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (s: Day, n: number) => {
  const d = parse(s);
  d.setDate(d.getDate() + n);
  return fmt(d);
};
const sunday = (s: Day) => addDays(s, -parse(s).getDay());
const today = () => fmt(new Date());
const WD = ['Su', 'M', 'T', 'W', 'Th', 'F', 'Sa'];
// Indexed like the model: 0 = Monday. Weeks display Sunday first.
const WEEKDAY = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ---- view state ----
let selected: Day = today();
let viewMonth = selected.slice(0, 7); // YYYY-MM shown in the month calendar
let view: 'day' | 'settings' = 'day';
let focusAfter: string | null = null; // selector to focus after the next render
let confirmDelete: string | null = null; // list id awaiting a second click
let dlgDay: Day | null = null;
let dragId: string | null = null;

const $ = <T extends HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel)!;
const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const uid = () => crypto.randomUUID();

// ---- sync ----
let queue: Op[] = [];
let sending = false;

function run(...ops: Op[]) {
  for (const o of ops) apply(data, o);
  queue.push(...ops);
  render();
  void flush();
}

async function flush() {
  if (sending || queue.length === 0) return;
  sending = true;
  const ops = queue;
  queue = [];
  try {
    const res = await fetch('/api/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops }),
    });
    if (res.status === 401) return void location.assign('/login');
    if (!res.ok) throw new Error(await res.text());
    const saved = (await res.json()) as Data;
    // Only redraw if another device changed something meanwhile.
    if (queue.length === 0 && JSON.stringify(saved) !== JSON.stringify(data)) {
      data = saved;
      render();
    }
  } catch (e) {
    console.error(e);
    toast('Save failed. Reloaded the latest data.');
    queue = [];
    await refresh();
  } finally {
    sending = false;
    void flush();
  }
}

async function refresh() {
  const res = await fetch('/api/data', { cache: 'no-store' });
  if (res.status === 401) return void location.assign('/login');
  if (!res.ok) return;
  data = await res.json();
  render();
}

// Pick up edits from other devices when coming back to the tab.
window.addEventListener('focus', () => {
  const editing = document.activeElement instanceof HTMLInputElement;
  if (!sending && queue.length === 0 && !editing) void refresh().then(carryOver);
});

// Settings option: move unchecked one-off items from past days to today, same
// list. They then show as overdue (red). Repeating items and hidden lists stay put.
function carryOver() {
  if (!data.settings?.carryOver) return;
  const t = today();
  const hidden = new Set(data.lists.filter((l) => l.hidden).map((l) => l.id));
  const ops: Op[] = data.items
    .filter((i) => !isRepeating(i) && !i.done && i.date < t && !hidden.has(i.list_id))
    .map((i) => ({ op: 'moveItem', id: i.id, date: t }));
  if (ops.length) run(...ops);
}

function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3000);
}

// ---- derived ----
function lateDays(): Set<Day> {
  const t = today();
  const hidden = new Set(data.lists.filter((l) => l.hidden).map((l) => l.id));
  // Repeating items never flag a day.
  return new Set(
    data.items.filter((i) => !isRepeating(i) && !i.done && i.date < t && !hidden.has(i.list_id)).map((i) => i.date),
  );
}
const eventsOn = (d: Day) => data.events.filter((e) => eventOn(e, d));
const md = (d: Day) => `${parse(d).getMonth() + 1}/${parse(d).getDate()}`;
const span = (e: CalEvent) => (e.end ? `${md(e.date)}–${md(e.end)}` : '');

// ---- render ----
function render() {
  // Keep focus and any half-typed text in an add box across the redraw.
  const active = document.activeElement as HTMLInputElement | null;
  const typing = active?.dataset.add ? { sel: `[data-add="${active.dataset.add}"]`, value: active.value } : null;
  $('#settingsBtn').classList.toggle('on', view === 'settings');
  renderMonth();
  renderWeek();
  if (view === 'day') renderDay();
  else renderSettings();
  if (dlgDay) renderDialog();
  if (typing && !focusAfter) {
    const el = document.querySelector<HTMLInputElement>(typing.sel);
    if (el) {
      el.value = typing.value;
      el.focus();
    }
  }
  if (focusAfter) {
    document.querySelector<HTMLElement>(focusAfter)?.focus();
    focusAfter = null;
  }
}

function renderMonth() {
  const [y, m] = viewMonth.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const start = sunday(fmt(first));
  const late = lateDays();
  const t = today();
  const label = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  let cells = WD.map((w) => `<div class="wdh">${w}</div>`).join('');
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i);
    if (i === 35 && d.slice(0, 7) !== viewMonth) break; // drop a 6th row that's all next month
    const cls = ['mday', d.slice(0, 7) !== viewMonth && 'other', late.has(d) && 'late', d === t && 'today', d === selected && 'sel']
      .filter(Boolean)
      .join(' ');
    cells += `<button class="${cls}" data-day="${d}">${parse(d).getDate()}</button>`;
  }
  $('#month').innerHTML = `
    <div class="mhead">
      <button class="arrow" data-month="-1" aria-label="Previous month">‹</button>
      <span>${label}</span>
      <button class="arrow" data-month="1" aria-label="Next month">›</button>
    </div>
    <div class="mgrid">${cells}</div>`;
}

function renderWeek() {
  const start = sunday(selected);
  const late = lateDays();
  const t = today();
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const evs = eventsOn(d);
    const dot = ['dot', evs.length > 0 && 'ev', late.has(d) && 'late']
      .filter(Boolean)
      .join(' ');
    const title = evs.length ? evs.map((e) => e.title).join(', ') : 'Add an event';
    rows += `
      <div class="wk-row${d === selected ? ' sel' : ''}${d === t ? ' today' : ''}" data-day="${d}">
        <button class="${dot}" data-dot="${d}" title="${esc(title)}" aria-label="Events on ${d}"></button>
        <span class="wd">${WEEKDAY[(i + 6) % 7]}</span>
        <span class="dn">${parse(d).getMonth() + 1}/${parse(d).getDate()}</span>
      </div>`;
  }
  $('#week').innerHTML = `
    <div class="wk">${rows}</div>
    <div class="wknav">
      <button class="arrow" data-week="-1" aria-label="Previous week">‹</button>
      <button class="link" id="todayBtn">Today</button>
      <button class="arrow" data-week="1" aria-label="Next week">›</button>
    </div>`;
}

// Escaped item text with each URL replaced by a link icon (the URL is its tooltip).
const LINK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.5 1.5"/><path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.5-1.5"/></svg>';
function withLinks(text: string): string {
  return text
    .split(/(https?:\/\/[^\s<>"']+)/)
    .map((part, i) =>
      i % 2
        ? `<a class="url" href="${esc(part)}" target="_blank" rel="noopener noreferrer" title="${esc(part)}" draggable="false">${LINK}</a>`
        : esc(part),
    )
    .join('');
}

function card(l: List): string {
  const items = data.items
    .filter((i) => i.list_id === l.id && occursOn(i, selected))
    .map((i) => {
      const done = isDone(i, selected);
      // An unchecked one-off on a past day turns red (repeating items don't).
      const late = !done && !isRepeating(i) && i.date < today();
      const link = i.link
        ? ` <a class="url" href="${esc(i.link)}" target="_blank" rel="noopener noreferrer" title="${esc(i.link)}" draggable="false">${LINK}</a>`
        : '';
      const rep = isRepeating(i) ? `<span class="rep" title="Repeats">↻</span> ` : '';
      return `
      <li class="item${done ? ' done' : ''}${isOverdue(i) ? ' overdue' : ''}${late ? ' late' : ''}" data-item="${i.id}"
          ${isOverdue(i) ? `title="Moved from ${i.original_date}"` : ''}>
        <span class="ihandle" draggable="true" data-ihandle title="Drag to another day, list, or position" aria-label="Drag">⠿</span>
        <input type="checkbox" class="chk" data-toggle="${i.id}" ${done ? 'checked' : ''} aria-label="Done" />
        <span class="text" data-edit="${i.id}">${rep}${withLinks(i.text)}${link}</span>
        <button class="more${i.notes ? ' has' : ''}" data-more="${i.id}" title="${i.notes ? 'Details (has notes)' : 'Details'}" aria-label="Details">⋯</button>
      </li>`;
    })
    .join('');
  return `
    <section class="card" data-list="${l.id}">
      <h3>${esc(l.name)}</h3>
      <ul>${items}</ul>
      <input class="add" data-add="${l.id}" aria-label="New item in ${esc(l.name)}" />
    </section>`;
}

function renderDay() {
  const lists = data.lists.filter((l) => !l.builtin && showsOn(data, l, selected));
  const alacarte = data.lists.find((l) => l.builtin === 'alacarte')!;
  const misc = data.lists.find((l) => l.builtin === 'misc')!;
  const tags = eventsOn(selected)
    .map((e) => `<span class="tag">${esc(e.title)}${e.end ? ` <span class="span">${span(e)}</span>` : ''}</span>`)
    .join('');
  const head = parse(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#main').innerHTML = `
    <div class="dayhead">${head}${tags}</div>
    <div class="board">
      <div class="cards"></div>
      <div class="fixed">${card(alacarte)}${card(misc)}</div>
    </div>`;
  // One column, stacked top to bottom in Settings order.
  $('#main .cards').innerHTML = lists.length
    ? lists.map(card).join('')
    : '<p class="empty">No lists on this day. Add one in Settings.</p>';
}

function renderSettings() {
  const rows = data.lists
    .map((l) => {
      if (l.builtin)
        return `<tr><td></td><td><strong>${esc(l.name)}</strong></td><td colspan="2" class="empty">always shown</td><td></td></tr>`;
      const n = data.items.filter((i) => i.list_id === l.id).length;
      const del =
        confirmDelete === l.id
          ? `<button class="btn danger" data-dellist="${l.id}">Delete it and its ${n} item${n === 1 ? '' : 's'}</button>
             <button class="link" data-canceldel>cancel</button>`
          : `<button class="icon" data-askdel="${l.id}" title="Delete list" aria-label="Delete list">${BIN}</button>`;
      return `<tr data-lrow="${l.id}"${l.hidden ? ' class="hid"' : ''}>
        <td><span class="grip" draggable="true" data-grip="${l.id}" title="Drag to reorder" aria-label="Drag to reorder">⠿</span></td>
        <td><input data-lname="${l.id}" value="${esc(l.name)}" aria-label="Name" /></td>
        <td>${daysSelect(`data-ldays="${l.id}"`, l.days)}</td>
        <td><button class="icon eye${l.hidden ? ' off' : ''}" data-lshow="${l.id}" aria-pressed="${!l.hidden}"
              title="${l.hidden ? 'Hidden: click to show' : 'Shown: click to hide'}" aria-label="Shown">${EYE}</button></td>
        <td>${del}</td>
      </tr>`;
    })
    .join('');
  $('#main').innerHTML = `
    <div class="settings">
      <div class="dayhead">Settings</div>
      <label class="opt"><input type="checkbox" id="optCarry" ${data.settings?.carryOver ? 'checked' : ''} />
        Move unchecked items from past days to today (same list, shown in red)</label>
      <h3 class="shead">Lists</h3>
      <p class="empty">Drag ⠿ to reorder. Lists appear on the day view in this order, top to bottom.
        A hidden list disappears from every day; its items are kept.</p>
      <table>
        <tr><th></th><th>Name</th><th>Shows on</th><th></th><th></th></tr>
        ${rows}
        <tr>
          <td></td>
          <td><input id="newName" placeholder="New list" aria-label="New list name" /></td>
          <td>${daysSelect('id="newDays"')}</td>
          <td></td>
          <td><button class="btn" id="addList">Add</button></td>
        </tr>
      </table>
    </div>`;
}

const EYE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';
const BIN = '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/></svg>';

function daysSelect(attr: string, days?: List['days']): string {
  const opt = (v: string, label: string) => `<option value="${v}"${(days ?? '') === v ? ' selected' : ''}>${label}</option>`;
  return `<select ${attr} aria-label="Shows on">${opt('', 'All days')}${opt('weekdays', 'Weekdays')}${opt('weekends', 'Weekends')}</select>`;
}

function renderDialog() {
  const d = dlgDay!;
  const rows = eventsOn(d)
    .map(
      (e) => `
      <div class="evrow">
        <span class="t">${esc(e.title)}${e.end ? ` <span class="empty">${span(e)}</span>` : ''}</span>
        <button class="link" data-delev="${e.id}" aria-label="Delete">×</button>
      </div>`,
    )
    .join('');
  const label = parse(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#eventDlg').innerHTML = `
    <h4>Events · ${label}</h4>
    ${rows || '<p class="empty">No events yet.</p>'}
    <form class="evform" id="evForm">
      <label for="evTitle">Event</label>
      <input type="text" id="evTitle" placeholder="New event" required />
      <label for="evStart">Dates</label>
      <div class="evdates">
        <input type="date" id="evStart" value="${d}" aria-label="From" required />
        <span>–</span>
        <input type="date" id="evEnd" value="${d}" aria-label="To" required />
      </div>
      <div class="evfoot">
        <button type="button" class="link" id="evClose">Close</button>
        <button class="btn primary">Add</button>
      </div>
    </form>`;
}

// ---- item details popup ----
const WD_SHORT = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const URL_RE = /https?:\/\/[^\s<>"']+/;
let itemDlgId: string | null = null;

function openItem(id: string) {
  const i = data.items.find((x) => x.id === id);
  const l = i && data.lists.find((x) => x.id === i.list_id);
  if (!i || !l) return;
  itemDlgId = id;
  // A URL typed into the text moves to the Link field.
  const found = i.link ? null : i.text.match(URL_RE)?.[0];
  const label = found ? i.text.replace(found, '').replace(/\s{2,}/g, ' ').trim() : i.text;
  const link = i.link ?? found ?? '';
  const allowed = listWeekdays(l);
  const circles = [6, 0, 1, 2, 3, 4, 5].map((n) => {
    const w = WD_SHORT[n];
    const ok = allowed.includes(n);
    const on = ok && !!i.repeat?.includes(n);
    return `<button type="button" class="wdc${on ? ' on' : ''}" data-wd="${n}" ${ok ? '' : 'disabled'}
      aria-pressed="${on}" title="${WEEKDAY[n]}${ok ? '' : ` (${esc(l.name)} doesn't show)`}">${w}</button>`;
  }).join('');
  $('#itemDlg').innerHTML = `
    <h4>Item details</h4>
    <form class="evform" id="itemForm">
      <label for="itLabel">Label</label>
      <input type="text" id="itLabel" value="${esc(label)}" />
      <label for="itLink">Link</label>
      <input type="url" id="itLink" value="${esc(link)}" placeholder="optional" />
      <label for="itNotes" class="top">Notes</label>
      <textarea id="itNotes" rows="4" placeholder="optional">${esc(i.notes ?? '')}</textarea>
      <label class="top">Repeat</label>
      <div>
        <div class="wdcs">${circles}</div>
        <p class="hint empty">${
          isRepeating(i)
            ? `Repeating since ${md(i.date)}. Changes start ${md(nextDay(selected))}; earlier days stay as they are.`
            : `Starts repeating ${md(nextDay(selected))}; this item stays on ${md(selected)}. Each day is checked off separately.`
        }</p>
      </div>
      <div class="evfoot">
        <button type="button" class="link danger" id="itDel">Delete</button>
        <span class="grow"></span>
        <button type="button" class="link" id="itCancel">Cancel</button>
        <button class="btn primary">Save</button>
      </div>
      <div class="evfoot delask" id="itDelAsk" hidden>
        <span class="grow">Delete this repeating item on…</span>
        <button type="button" class="btn danger" id="itDelDay">Only ${md(selected)}</button>
        <button type="button" class="btn danger" id="itDelAll">All days</button>
        <button type="button" class="link" id="itDelBack">Cancel</button>
      </div>
    </form>`;
  $<HTMLDialogElement>('#itemDlg').showModal();
  $('#itLabel').focus();
}

function saveItem() {
  const i = data.items.find((x) => x.id === itemDlgId);
  if (!i) return;
  const text = $<HTMLInputElement>('#itLabel').value.trim();
  const link = $<HTMLInputElement>('#itLink').value.trim();
  const notes = $<HTMLTextAreaElement>('#itNotes').value.trim();
  const repeat = [...document.querySelectorAll<HTMLElement>('#itemDlg .wdc.on')].map((b) => Number(b.dataset.wd));
  $<HTMLDialogElement>('#itemDlg').close();
  if (!text && !link) return run({ op: 'deleteItem', id: i.id });
  run({ op: 'updateItem', id: i.id, on: selected, text, link, notes, repeat, new_id: uid() });
}

// ---- interactions ----
function select(d: Day) {
  selected = d;
  viewMonth = d.slice(0, 7);
  view = 'day';
  render();
}

document.addEventListener('click', (ev) => {
  const t = ev.target as HTMLElement;
  const at = (a: string) => t.closest<HTMLElement>(`[${a}]`)?.getAttribute(a) ?? null;
  let v: string | null;

  if (t.closest('#settingsBtn')) {
    view = view === 'settings' ? 'day' : 'settings';
    confirmDelete = null;
    return render();
  }
  if ((v = at('data-month'))) {
    const [y, m] = viewMonth.split('-').map(Number);
    viewMonth = fmt(new Date(y, m - 1 + Number(v), 1)).slice(0, 7);
    return renderMonth();
  }
  if ((v = at('data-week'))) return select(addDays(selected, 7 * Number(v)));
  if (t.closest('#todayBtn')) return select(today());
  if ((v = at('data-dot'))) {
    dlgDay = v;
    renderDialog();
    focusAfter = '#evTitle';
    $<HTMLDialogElement>('#eventDlg').showModal();
    return $('#evTitle').focus();
  }
  if ((v = t.closest('#month') && at('data-day'))) return select(v);
  if ((v = t.closest('#week') && at('data-day'))) return select(v);

  if ((v = at('data-more'))) return openItem(v);
  if ((v = at('data-wd'))) {
    const b = t.closest<HTMLButtonElement>('[data-wd]')!;
    b.classList.toggle('on');
    return b.setAttribute('aria-pressed', String(b.classList.contains('on')));
  }
  if (t.closest('#itCancel')) return $<HTMLDialogElement>('#itemDlg').close();
  if (t.closest('#itDel')) {
    const series = !!data.items.find((x) => x.id === itemDlgId && isRepeating(x));
    if (series) {
      // Ask: only this day, or all days.
      document.querySelector<HTMLElement>('#itemForm .evfoot:not(.delask)')!.hidden = true;
      return void ($('#itDelAsk').hidden = false);
    }
    // A one-off: the first click warns, the second deletes.
    const b = t.closest<HTMLButtonElement>('#itDel')!;
    if (!b.dataset.sure) {
      b.dataset.sure = '1';
      b.classList.add('sure');
      return void (b.textContent = 'Click again to delete');
    }
    $<HTMLDialogElement>('#itemDlg').close();
    return run({ op: 'deleteItem', id: itemDlgId! });
  }
  if (t.closest('#itDelBack')) {
    document.querySelector<HTMLElement>('#itemForm .evfoot:not(.delask)')!.hidden = false;
    return void ($('#itDelAsk').hidden = true);
  }
  if (t.closest('#itDelDay')) {
    $<HTMLDialogElement>('#itemDlg').close();
    return run({ op: 'skipDay', id: itemDlgId!, date: selected });
  }
  if (t.closest('#itDelAll')) {
    $<HTMLDialogElement>('#itemDlg').close();
    return run({ op: 'deleteItem', id: itemDlgId!, all: true });
  }
  if (t.closest('a.url')) return; // open the link, don't start editing
  if ((v = at('data-edit'))) return startEdit(t.closest('[data-edit]') as HTMLElement, v);

  if ((v = at('data-lshow'))) {
    const l = data.lists.find((x) => x.id === v)!;
    return run({ op: 'updateList', id: v, hidden: !l.hidden });
  }
  if ((v = at('data-askdel'))) {
    confirmDelete = v;
    return render();
  }
  if (t.closest('[data-canceldel]')) {
    confirmDelete = null;
    return render();
  }
  if ((v = at('data-dellist'))) {
    confirmDelete = null;
    return run({ op: 'deleteList', id: v });
  }
  if (t.closest('#addList')) {
    const name = $<HTMLInputElement>('#newName').value.trim();
    if (!name) return $('#newName').focus();
    return run({
      op: 'addList',
      id: uid(),
      name,
      days: ($<HTMLSelectElement>('#newDays').value || undefined) as List['days'],
    });
  }

  if ((v = at('data-delev'))) return run({ op: 'deleteEvent', id: v });
  if (t.closest('#evClose')) return $<HTMLDialogElement>('#eventDlg').close();
});

$('#eventDlg').addEventListener('close', () => (dlgDay = null));

document.addEventListener('submit', (ev) => {
  if ((ev.target as HTMLElement).id === 'itemForm') {
    ev.preventDefault();
    return saveItem();
  }
  if ((ev.target as HTMLElement).id !== 'evForm') return;
  ev.preventDefault();
  const title = $<HTMLInputElement>('#evTitle').value.trim();
  if (!title || !dlgDay) return;
  focusAfter = '#evTitle';
  let start = $<HTMLInputElement>('#evStart').value || dlgDay;
  let end = $<HTMLInputElement>('#evEnd').value || start;
  if (end < start) [start, end] = [end, start];
  run({ op: 'addEvent', id: uid(), date: start, end: end > start ? end : undefined, title });
});

document.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  let v: string | null;
  if (t.id === 'optCarry') {
    run({ op: 'setSetting', carryOver: t.checked });
    return carryOver();
  }
  if ((v = t.getAttribute('data-toggle'))) return run({ op: 'updateItem', id: v, on: selected, done: t.checked });
  if ((v = t.getAttribute('data-lname'))) {
    const name = t.value.trim();
    return name ? run({ op: 'updateList', id: v, name }) : render();
  }
  if ((v = t.getAttribute('data-ldays')))
    return run({ op: 'updateList', id: v, days: (t.value || null) as List['days'] | null });
});

document.addEventListener('keydown', (ev) => {
  const t = ev.target as HTMLInputElement;
  const listId = t.getAttribute?.('data-add');
  if (listId && ev.key === 'Enter' && !ev.isComposing) {
    const text = t.value.trim();
    if (!text) return;
    focusAfter = `[data-add="${listId}"]`;
    run({ op: 'addItem', id: uid(), list_id: listId, date: selected, text });
  }
  if (t.id === 'newName' && ev.key === 'Enter') $('#addList').click();
});

// Inline edit: click the text, Enter or blur saves, Escape cancels. Clearing
// the text deletes the item.
function startEdit(span: HTMLElement, id: string) {
  const item = data.items.find((i) => i.id === id);
  if (!item) return;
  const input = document.createElement('input');
  input.className = 'edit';
  input.value = item.text;
  span.replaceWith(input);
  input.focus();
  let done = false;
  const finish = (save: boolean) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    if (!save || text === item.text) return render();
    run(text ? { op: 'updateItem', id, on: selected, text } : { op: 'deleteItem', id });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- drag an item by its handle ----
// Onto a day (week row or month cell): move it to that date, same list.
// Onto a card on the current day: move it into that list, above or below the
// item under the pointer (or to the end), which also reorders within a list.
const dayTarget = (t: EventTarget | null) =>
  (t as HTMLElement | null)?.closest?.<HTMLElement>('#week [data-day], #month [data-day]') ?? null;
const clearItemMarks = () =>
  document
    .querySelectorAll('.drop-hover, .item.drop-above, .item.drop-below')
    .forEach((e) => e.classList.remove('drop-hover', 'drop-above', 'drop-below'));

// Where in a card the item would land: before which item (null = end).
function cardSpot(ev: DragEvent): { card: HTMLElement; before: string | null; mark: HTMLElement; cls: string } | null {
  const card = (ev.target as HTMLElement).closest?.<HTMLElement>('#main .card[data-list]');
  if (!card) return null;
  const li = (ev.target as HTMLElement).closest<HTMLElement>('.item[data-item]');
  if (!li) return { card, before: null, mark: card, cls: 'drop-hover' };
  const r = li.getBoundingClientRect();
  const below = ev.clientY > r.top + r.height / 2;
  const next = below ? li.nextElementSibling : li;
  return { card, before: (next as HTMLElement | null)?.dataset.item ?? null, mark: li, cls: below ? 'drop-below' : 'drop-above' };
}

document.addEventListener('dragstart', (ev) => {
  const h = (ev.target as HTMLElement).closest?.<HTMLElement>('[data-ihandle]');
  if (!h) return;
  const li = h.closest<HTMLElement>('[data-item]')!;
  dragId = li.dataset.item!;
  ev.dataTransfer!.setData('text/plain', dragId);
  ev.dataTransfer!.effectAllowed = 'move';
  ev.dataTransfer!.setDragImage(li, 10, 10);
});
document.addEventListener('dragend', () => {
  dragId = null;
  clearItemMarks();
});
document.addEventListener('dragover', (ev) => {
  if (!dragId) return;
  const d = dayTarget(ev.target);
  const spot = d ? null : cardSpot(ev);
  if (!d && !spot) return;
  ev.preventDefault();
  ev.dataTransfer!.dropEffect = 'move';
  clearItemMarks();
  if (d) d.classList.add('drop-hover');
  else spot!.mark.classList.add(spot!.cls);
});
document.addEventListener('drop', (ev) => {
  if (!dragId) return;
  const item = data.items.find((i) => i.id === dragId);
  const d = dayTarget(ev.target);
  const spot = d ? null : cardSpot(ev);
  if (!item || (!d && !spot)) return;
  ev.preventDefault();
  if (d) {
    const to = d.dataset.day!;
    if (isRepeating(item)) {
      if (to !== selected) run({ op: 'moveDay', id: item.id, from: selected, to, new_id: uid() });
    } else if (item.date !== to) run({ op: 'moveItem', id: item.id, date: to });
  } else {
    const list_id = spot!.card.dataset.list!;
    const before = spot!.before === item.id ? null : spot!.before;
    // Skip drops that leave the item where it is.
    const same = data.items.filter((i) => i.list_id === list_id && occursOn(i, selected));
    const next = same[same.indexOf(item) + 1]?.id ?? null;
    const unchanged = item.list_id === list_id && (spot!.before === item.id || before === next);
    if (!unchanged) run({ op: 'placeItem', id: item.id, list_id, before });
  }
  dragId = null;
  clearItemMarks();
});

// ---- drag a list row by its grip to reorder (Settings) ----
let dragList: string | null = null;
const clearMarks = () =>
  document.querySelectorAll('.drop-above, .drop-below').forEach((e) => e.classList.remove('drop-above', 'drop-below'));
// Drop above or below a row, depending on which half of it the pointer is in.
const rowAt = (ev: DragEvent) => {
  const tr = (ev.target as HTMLElement).closest?.<HTMLElement>('tr[data-lrow]');
  if (!tr) return null;
  const r = tr.getBoundingClientRect();
  return { tr, below: ev.clientY > r.top + r.height / 2 };
};

document.addEventListener('dragstart', (ev) => {
  const g = (ev.target as HTMLElement).closest?.<HTMLElement>('[data-grip]');
  if (!g) return;
  dragList = g.dataset.grip!;
  ev.dataTransfer!.setData('text/plain', dragList);
  ev.dataTransfer!.effectAllowed = 'move';
  ev.dataTransfer!.setDragImage(g.closest('tr')!, 12, 12);
});
document.addEventListener('dragover', (ev) => {
  const hit = dragList && rowAt(ev);
  if (!hit) return;
  ev.preventDefault();
  clearMarks();
  hit.tr.classList.add(hit.below ? 'drop-below' : 'drop-above');
});
document.addEventListener('drop', (ev) => {
  const hit = dragList && rowAt(ev);
  if (!hit || !dragList) return;
  ev.preventDefault();
  const rows = [...document.querySelectorAll<HTMLElement>('tr[data-lrow]')].map((r) => r.dataset.lrow!);
  const i = rows.indexOf(hit.tr.dataset.lrow!) + (hit.below ? 1 : 0);
  const before = rows.slice(i).find((id) => id !== dragList) ?? null;
  const cur = rows.indexOf(dragList);
  const next = rows.slice(cur + 1)[0] ?? null;
  if (before !== next) run({ op: 'moveList', id: dragList, before });
  dragList = null;
  clearMarks();
});
document.addEventListener('dragend', () => {
  dragList = null;
  clearMarks();
});

render();
carryOver();

// Installed app (standalone window): on its first launch, shrink the window to
// the content width. Later launches keep whatever size the user set.
if (matchMedia('(display-mode: standalone)').matches) {
  try {
    if (!localStorage.getItem('lilical_fitted')) {
      const right = document.querySelector('#main .fixed')?.getBoundingClientRect().right;
      const pad = parseFloat(getComputedStyle($('#main')).paddingRight);
      if (right) window.resizeTo(Math.ceil(right + pad) + (outerWidth - innerWidth), outerHeight);
      localStorage.setItem('lilical_fitted', '1');
    }
  } catch {}
}
