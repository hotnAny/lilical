// Client: renders everything from `data`, applies each op locally right away,
// then sends it to /api/data. Ops are sent one batch at a time, in order.

import { apply, isActive, isOverdue, type Data, type Day, type List, type Op } from '../lib/model';

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
const monday = (s: Day) => addDays(s, -((parse(s).getDay() + 6) % 7));
const today = () => fmt(new Date());
const WD = ['M', 'T', 'W', 'Th', 'F', 'Sa', 'Su'];

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
  if (!sending && queue.length === 0 && !editing) void refresh();
});

function toast(msg: string) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  setTimeout(() => (t.hidden = true), 3000);
}

// ---- derived ----
function lateDays(): Set<Day> {
  const t = today();
  return new Set(data.items.filter((i) => !i.done && i.date < t).map((i) => i.date));
}
const eventsOn = (d: Day) => data.events.filter((e) => e.date === d);

// ---- render ----
function render() {
  // Keep focus and any half-typed text in an add box across the redraw.
  const active = document.activeElement as HTMLInputElement | null;
  const typing = active?.dataset.add ? { sel: `[data-add="${active.dataset.add}"]`, value: active.value } : null;
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
  const start = monday(fmt(first));
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
  const start = monday(selected);
  const late = lateDays();
  const t = today();
  let rows = '';
  for (let i = 0; i < 7; i++) {
    const d = addDays(start, i);
    const evs = eventsOn(d);
    const dot = ['dot', evs.some((e) => e.important) ? 'imp' : evs.length ? 'ev' : '', late.has(d) && 'late']
      .filter(Boolean)
      .join(' ');
    const title = evs.length ? evs.map((e) => e.title).join(', ') : 'Add an event';
    rows += `
      <div class="wk-row${d === selected ? ' sel' : ''}${d === t ? ' today' : ''}" data-day="${d}">
        <button class="${dot}" data-dot="${d}" title="${esc(title)}" aria-label="Events on ${d}"></button>
        <span class="wd">${WD[i]}</span>
        <span class="dn">${parse(d).getMonth() + 1}/${parse(d).getDate()}</span>
      </div>`;
  }
  $('#week').innerHTML = `
    <div class="wk">${rows}</div>
    <div class="wknav">
      <button class="arrow" data-week="-1" aria-label="Previous week">‹</button>
      <button class="arrow" data-week="1" aria-label="Next week">›</button>
    </div>`;
}

function card(l: List): string {
  const items = data.items
    .filter((i) => i.list_id === l.id && i.date === selected)
    .map(
      (i) => `
      <li class="item${i.done ? ' done' : ''}${isOverdue(i) ? ' overdue' : ''}" draggable="true" data-item="${i.id}"
          ${isOverdue(i) ? `title="Moved from ${i.original_date}"` : ''}>
        <input type="checkbox" class="chk" data-toggle="${i.id}" ${i.done ? 'checked' : ''} aria-label="Done" />
        <span class="text" data-edit="${i.id}">${esc(i.text)}</span>
        <button class="del" data-del="${i.id}" aria-label="Delete">×</button>
      </li>`,
    )
    .join('');
  return `
    <section class="card" data-list="${l.id}">
      <h3>${esc(l.name)}</h3>
      <ul>${items}</ul>
      <input class="add" data-add="${l.id}" aria-label="New item in ${esc(l.name)}" />
    </section>`;
}

function renderDay() {
  const lists = data.lists.filter((l) => !l.builtin && isActive(l, selected));
  const alacarte = data.lists.find((l) => l.builtin === 'alacarte')!;
  const misc = data.lists.find((l) => l.builtin === 'misc')!;
  const banners = eventsOn(selected)
    .filter((e) => e.important)
    .map((e) => `<div class="banner">${esc(e.title)}</div>`)
    .join('');
  const head = parse(selected).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#main').innerHTML = `
    ${banners}
    <div class="dayhead">${head}</div>
    <div class="board">
      <div class="cards">${lists.map(card).join('') || '<p class="empty">No lists on this day. Add one in Settings.</p>'}</div>
      <div class="fixed">${card(alacarte)}${card(misc)}</div>
    </div>`;
}

function renderSettings() {
  const rows = data.lists
    .map((l) => {
      if (l.builtin)
        return `<tr><td><strong>${esc(l.name)}</strong></td><td colspan="2" class="empty">always there</td><td></td></tr>`;
      const n = data.items.filter((i) => i.list_id === l.id).length;
      const del =
        confirmDelete === l.id
          ? `<button class="btn danger" data-dellist="${l.id}">Delete it and its ${n} item${n === 1 ? '' : 's'}</button>
             <button class="link" data-canceldel>cancel</button>`
          : `<button class="link" data-askdel="${l.id}">delete</button>`;
      return `<tr>
        <td><input data-lname="${l.id}" value="${esc(l.name)}" aria-label="Name" /></td>
        <td><input type="date" data-lstart="${l.id}" value="${l.start ?? ''}" aria-label="Start date" /></td>
        <td><input type="date" data-lend="${l.id}" value="${l.end ?? ''}" aria-label="End date" /></td>
        <td>${del}</td>
      </tr>`;
    })
    .join('');
  $('#main').innerHTML = `
    <div class="settings">
      <div class="dayhead">Settings: lists</div>
      <p class="empty">A list shows on every day between its start and end date. Leave a date empty for no limit.</p>
      <table>
        <tr><th>Name</th><th>Start</th><th>End</th><th></th></tr>
        ${rows}
        <tr>
          <td><input id="newName" placeholder="New list" aria-label="New list name" /></td>
          <td><input type="date" id="newStart" aria-label="Start date" /></td>
          <td><input type="date" id="newEnd" aria-label="End date" /></td>
          <td><button class="btn" id="addList">Add</button></td>
        </tr>
      </table>
    </div>`;
}

function renderDialog() {
  const d = dlgDay!;
  const rows = eventsOn(d)
    .map(
      (e) => `
      <div class="evrow">
        <button class="star${e.important ? ' on' : ''}" data-star="${e.id}" title="Important">★</button>
        <span class="t">${esc(e.title)}</span>
        <button class="link" data-delev="${e.id}" aria-label="Delete">×</button>
      </div>`,
    )
    .join('');
  const label = parse(d).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  $('#eventDlg').innerHTML = `
    <h4>Events · ${label}</h4>
    ${rows || '<p class="empty">No events yet.</p>'}
    <form class="evform" id="evForm">
      <input type="text" id="evTitle" placeholder="New event" aria-label="Event title" required />
      <label><input type="checkbox" id="evImp" /> important</label>
      <button class="btn">Add</button>
    </form>
    <div style="text-align:right;margin-top:12px"><button class="link" id="evClose">Close</button></div>`;
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
  if ((v = at('data-dot'))) {
    dlgDay = v;
    renderDialog();
    focusAfter = '#evTitle';
    $<HTMLDialogElement>('#eventDlg').showModal();
    return $('#evTitle').focus();
  }
  if ((v = t.closest('#month') && at('data-day'))) return select(v);
  if ((v = t.closest('#week') && at('data-day'))) return select(v);

  if ((v = at('data-del'))) return run({ op: 'deleteItem', id: v });
  if ((v = at('data-edit'))) return startEdit(t.closest('[data-edit]') as HTMLElement, v);

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
      start: $<HTMLInputElement>('#newStart').value || undefined,
      end: $<HTMLInputElement>('#newEnd').value || undefined,
    });
  }

  if ((v = at('data-star'))) {
    const e = data.events.find((x) => x.id === v)!;
    return run({ op: 'updateEvent', id: v, important: !e.important });
  }
  if ((v = at('data-delev'))) return run({ op: 'deleteEvent', id: v });
  if (t.closest('#evClose')) return $<HTMLDialogElement>('#eventDlg').close();
});

$('#eventDlg').addEventListener('close', () => (dlgDay = null));

document.addEventListener('submit', (ev) => {
  if ((ev.target as HTMLElement).id !== 'evForm') return;
  ev.preventDefault();
  const title = $<HTMLInputElement>('#evTitle').value.trim();
  if (!title || !dlgDay) return;
  focusAfter = '#evTitle';
  run({ op: 'addEvent', id: uid(), date: dlgDay, title, important: $<HTMLInputElement>('#evImp').checked });
});

document.addEventListener('change', (ev) => {
  const t = ev.target as HTMLInputElement;
  let v: string | null;
  if ((v = t.getAttribute('data-toggle'))) return run({ op: 'updateItem', id: v, done: t.checked });
  if ((v = t.getAttribute('data-lname'))) {
    const name = t.value.trim();
    return name ? run({ op: 'updateList', id: v, name }) : render();
  }
  if ((v = t.getAttribute('data-lstart'))) return run({ op: 'updateList', id: v, start: t.value || null });
  if ((v = t.getAttribute('data-lend'))) return run({ op: 'updateList', id: v, end: t.value || null });
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
    run(text ? { op: 'updateItem', id, text } : { op: 'deleteItem', id });
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) finish(true);
    if (e.key === 'Escape') finish(false);
  });
  input.addEventListener('blur', () => finish(true));
}

// ---- drag an item onto a day (week row or month cell) ----
const dropTarget = (t: EventTarget | null) =>
  (t as HTMLElement | null)?.closest<HTMLElement>('#week [data-day], #month [data-day]') ?? null;

document.addEventListener('dragstart', (ev) => {
  const li = (ev.target as HTMLElement).closest?.<HTMLElement>('[data-item]');
  if (!li) return;
  dragId = li.dataset.item!;
  ev.dataTransfer!.setData('text/plain', dragId);
  ev.dataTransfer!.effectAllowed = 'move';
});
document.addEventListener('dragend', () => {
  dragId = null;
  document.querySelectorAll('.drop-hover').forEach((e) => e.classList.remove('drop-hover'));
});
document.addEventListener('dragover', (ev) => {
  const d = dragId && dropTarget(ev.target);
  if (!d) return;
  ev.preventDefault();
  ev.dataTransfer!.dropEffect = 'move';
  document.querySelectorAll('.drop-hover').forEach((e) => e !== d && e.classList.remove('drop-hover'));
  d.classList.add('drop-hover');
});
document.addEventListener('drop', (ev) => {
  const d = dropTarget(ev.target);
  if (!d || !dragId) return;
  ev.preventDefault();
  const day = d.dataset.day!;
  const item = data.items.find((i) => i.id === dragId);
  if (item && item.date !== day) run({ op: 'moveItem', id: item.id, date: day, new_list_id: uid() });
  dragId = null;
});

render();
