// Data model and the operations that change it. Shared by the client, which
// applies an op right away, and the server, which replays the same op on the
// latest copy of the data file, so both sides stay in agreement.

export type Day = string; // YYYY-MM-DD, local date

export interface List {
  id: string;
  name: string;
  days?: 'weekdays' | 'weekends'; // unset = every day
  hidden?: boolean;
  builtin?: 'alacarte' | 'misc';
}

export interface Item {
  id: string;
  list_id: string;
  date: Day;
  original_date: Day; // the date first given; overdue := date > original_date
  text: string;
  done: boolean; // one-off items; repeating items use done_on
  link?: string;
  notes?: string;
  // Repeating: shows on these weekdays (0 = Monday … 6 = Sunday) from `date` on.
  repeat?: number[];
  done_on?: Day[]; // repeating: days checked off
  skip?: Day[]; // repeating: days removed (× or moved to another date)
  until?: Day; // repeating: last day of the series (set when repeat is turned off or changed)
  series?: string; // repeating: shared by the pieces a series splits into when its days change
}

export interface CalEvent {
  id: string;
  date: Day; // first day
  end?: Day; // last day, if it spans several
  title: string;
}

export interface Data {
  lists: List[];
  items: Item[];
  events: CalEvent[];
  settings?: { carryOver?: boolean }; // carryOver: move unchecked past one-offs to today
}

export type Op =
  | { op: 'addItem'; id: string; list_id: string; date: Day; text: string }
  // `on` is the day being viewed: which day's copy `done` applies to. Repeat
  // changes keep days up to `on` as they were and take effect the day after;
  // new_id names the new series item that starts then.
  | {
      op: 'updateItem';
      id: string;
      on: Day;
      text?: string;
      done?: boolean;
      link?: string;
      notes?: string;
      repeat?: number[];
      new_id?: string;
    }
  | { op: 'skipDay'; id: string; date: Day } // repeating: remove one day's copy
  // Repeating: move one day's copy to another date as a new one-off item.
  | { op: 'moveDay'; id: string; from: Day; to: Day; new_id: string }
  | { op: 'deleteItem'; id: string; all?: boolean } // all: every piece of its series
  | { op: 'moveItem'; id: string; date: Day }
  // Same day: put the item in list_id, just before item `before` (null = at the end).
  | { op: 'placeItem'; id: string; list_id: string; before: string | null }
  | { op: 'addList'; id: string; name: string; days?: List['days'] }
  | { op: 'updateList'; id: string; name?: string; days?: List['days'] | null; hidden?: boolean }
  | { op: 'moveList'; id: string; before: string | null } // null = move to the end
  | { op: 'deleteList'; id: string }
  | { op: 'addEvent'; id: string; date: Day; end?: Day; title: string }
  | { op: 'updateEvent'; id: string; title?: string }
  | { op: 'deleteEvent'; id: string }
  | { op: 'setSetting'; carryOver: boolean };

export function emptyData(): Data {
  return {
    lists: [
      { id: 'alacarte', name: 'À la carte', builtin: 'alacarte' },
      { id: 'misc', name: 'Misc', builtin: 'misc' },
    ],
    items: [],
    events: [],
  };
}

// 0 = Monday … 6 = Sunday
export function weekday(day: Day): number {
  const [y, m, d] = day.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 6) % 7;
}

// Weekdays a list can show on (0 = Monday).
export function listWeekdays(list: List): number[] {
  if (list.builtin || !list.days) return [0, 1, 2, 3, 4, 5, 6];
  return list.days === 'weekends' ? [5, 6] : [0, 1, 2, 3, 4];
}

function matchesDays(list: List, day: Day): boolean {
  return listWeekdays(list).includes(weekday(day));
}

export const isRepeating = (i: Item) => !!i.repeat?.length;

export function occursOn(i: Item, day: Day): boolean {
  if (!isRepeating(i)) return i.date === day;
  if (day < i.date || (i.until && day > i.until)) return false;
  return i.repeat!.includes(weekday(day)) && !i.skip?.includes(day);
}

export function nextDay(day: Day): Day {
  const [y, m, d] = day.split('-').map(Number);
  const t = new Date(y, m - 1, d + 1);
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
}

export function isDone(i: Item, day: Day): boolean {
  return isRepeating(i) ? !!i.done_on?.includes(day) : i.done;
}

// A list shows on a day unless it's hidden, if the day matches its "shows on"
// setting or the list has items on that day (e.g. one dragged onto a Saturday).
export function showsOn(d: Data, list: List, day: Day): boolean {
  if (list.builtin) return true;
  if (list.hidden) return false;
  return matchesDays(list, day) || d.items.some((i) => i.list_id === list.id && occursOn(i, day));
}

export function eventOn(e: CalEvent, day: Day): boolean {
  return e.date <= day && day <= (e.end ?? e.date);
}

export function isOverdue(item: Item): boolean {
  return item.date > item.original_date;
}

// Mutates `d`. Ops that refer to something already gone are no-ops, so a
// replay after another device's edit never fails.
export function apply(d: Data, o: Op): void {
  const item = (id: string) => d.items.find((i) => i.id === id);
  const list = (id: string) => d.lists.find((l) => l.id === id);
  switch (o.op) {
    case 'addItem':
      if (!item(o.id) && list(o.list_id))
        d.items.push({ id: o.id, list_id: o.list_id, date: o.date, original_date: o.date, text: o.text, done: false });
      break;
    case 'updateItem': {
      const i = item(o.id);
      if (!i) break;
      if (o.text !== undefined) i.text = o.text;
      if (o.link !== undefined) i.link = o.link || undefined;
      if (o.notes !== undefined) i.notes = o.notes || undefined;
      if (o.repeat !== undefined) {
        // Days up to `on` stay as they were; the change takes effect the day after.
        const next = [...new Set(o.repeat)].filter((n) => n >= 0 && n <= 6).sort();
        const was = isRepeating(i);
        const changed = JSON.stringify(next) !== JSON.stringify(was ? i.repeat : []);
        if (changed) {
          const oldUntil = i.until;
          if (was) i.until = o.on; // end the current series on the day being viewed
          if (next.length && o.new_id && !item(o.new_id)) {
            const start = nextDay(o.on);
            // Pieces of one series share an id, so "All days" deletes them together.
            // A one-off that starts repeating stays separate.
            const series = was ? (i.series ??= i.id) : undefined;
            d.items.splice(d.items.indexOf(i) + 1, 0, {
              id: o.new_id,
              list_id: i.list_id,
              date: start,
              original_date: start,
              text: i.text,
              done: false,
              link: i.link,
              notes: i.notes,
              repeat: next,
              done_on: [],
              skip: [],
              until: oldUntil && oldUntil > o.on ? oldUntil : undefined,
              series,
            });
          }
        }
      }
      if (o.done !== undefined) {
        if (isRepeating(i)) {
          const set = new Set(i.done_on ?? []);
          if (o.done) set.add(o.on);
          else set.delete(o.on);
          i.done_on = [...set].sort();
        } else i.done = o.done;
      }
      break;
    }
    case 'skipDay': {
      const i = item(o.id);
      if (i && isRepeating(i) && !i.skip?.includes(o.date)) i.skip = [...(i.skip ?? []), o.date].sort();
      break;
    }
    case 'moveDay': {
      const i = item(o.id);
      if (!i || !isRepeating(i) || item(o.new_id)) break;
      if (!i.skip?.includes(o.from)) i.skip = [...(i.skip ?? []), o.from].sort();
      d.items.splice(d.items.indexOf(i) + 1, 0, {
        id: o.new_id,
        list_id: i.list_id,
        date: o.to,
        original_date: o.from,
        text: i.text,
        done: false,
        link: i.link,
        notes: i.notes,
      });
      break;
    }
    case 'deleteItem': {
      const series = o.all ? item(o.id)?.series : undefined;
      d.items = d.items.filter((i) => i.id !== o.id && !(series && i.series === series));
      break;
    }
    case 'moveItem': {
      const i = item(o.id);
      if (!i) break;
      i.date = o.date;
      break;
    }
    case 'placeItem': {
      const i = item(o.id);
      if (!i || !list(o.list_id) || o.before === o.id) break;
      d.items.splice(d.items.indexOf(i), 1);
      i.list_id = o.list_id;
      // Order within a list is the order in d.items; each day shows the ones
      // occurring that day, in that order.
      const target = o.before ? item(o.before) : undefined;
      if (target && target.list_id === o.list_id) {
        d.items.splice(d.items.indexOf(target), 0, i);
      } else {
        let at = -1;
        d.items.forEach((x, k) => x.list_id === o.list_id && (at = k));
        d.items.splice(at + 1, 0, i);
      }
      break;
    }
    case 'addList':
      if (!list(o.id))
        d.lists.push({ id: o.id, name: o.name, days: o.days || undefined });
      break;
    case 'updateList': {
      const l = list(o.id);
      if (!l) break;
      if (o.name !== undefined && !l.builtin) l.name = o.name;
      if (o.days !== undefined && !l.builtin) l.days = o.days || undefined;
      if (o.hidden !== undefined && !l.builtin) l.hidden = o.hidden || undefined;
      break;
    }
    case 'moveList': {
      const l = list(o.id);
      const target = o.before === null ? null : list(o.before);
      if (!l || l.builtin || o.before === o.id || target === undefined || target?.builtin) break;
      d.lists.splice(d.lists.indexOf(l), 1);
      if (target) d.lists.splice(d.lists.indexOf(target), 0, l);
      else d.lists.push(l);
      break;
    }
    case 'deleteList': {
      const l = list(o.id);
      if (!l || l.builtin) break;
      d.lists = d.lists.filter((x) => x.id !== o.id);
      d.items = d.items.filter((i) => i.list_id !== o.id);
      break;
    }
    case 'addEvent':
      if (!d.events.some((e) => e.id === o.id))
        d.events.push({ id: o.id, date: o.date, end: o.end && o.end > o.date ? o.end : undefined, title: o.title });
      break;
    case 'updateEvent': {
      const e = d.events.find((x) => x.id === o.id);
      if (!e) break;
      if (o.title !== undefined) e.title = o.title;
      break;
    }
    case 'deleteEvent':
      d.events = d.events.filter((e) => e.id !== o.id);
      break;
    case 'setSetting':
      d.settings = { ...d.settings, carryOver: o.carryOver };
      break;
  }
}
