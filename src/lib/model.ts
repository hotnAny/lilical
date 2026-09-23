// Data model and the operations that change it. Shared by the client, which
// applies an op right away, and the server, which replays the same op on the
// latest copy of the data file, so both sides stay in agreement.

export type Day = string; // YYYY-MM-DD, local date

export interface List {
  id: string;
  name: string;
  start?: Day;
  end?: Day;
  builtin?: 'alacarte' | 'misc';
}

export interface Item {
  id: string;
  list_id: string;
  date: Day;
  original_date: Day; // the date first given; overdue := date > original_date
  text: string;
  done: boolean;
}

export interface CalEvent {
  id: string;
  date: Day;
  title: string;
  important: boolean;
}

export interface Data {
  lists: List[];
  items: Item[];
  events: CalEvent[];
}

export type Op =
  | { op: 'addItem'; id: string; list_id: string; date: Day; text: string }
  | { op: 'updateItem'; id: string; text?: string; done?: boolean }
  | { op: 'deleteItem'; id: string }
  // new_list_id is used only if the list isn't active on `date` and no one-day
  // list of the same name exists there yet.
  | { op: 'moveItem'; id: string; date: Day; new_list_id: string }
  | { op: 'addList'; id: string; name: string; start?: Day; end?: Day }
  | { op: 'updateList'; id: string; name?: string; start?: Day | null; end?: Day | null }
  | { op: 'deleteList'; id: string }
  | { op: 'addEvent'; id: string; date: Day; title: string; important: boolean }
  | { op: 'updateEvent'; id: string; title?: string; important?: boolean }
  | { op: 'deleteEvent'; id: string };

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

export function isActive(list: List, day: Day): boolean {
  return (!list.start || list.start <= day) && (!list.end || day <= list.end);
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
      if (o.done !== undefined) i.done = o.done;
      break;
    }
    case 'deleteItem':
      d.items = d.items.filter((i) => i.id !== o.id);
      break;
    case 'moveItem': {
      const i = item(o.id);
      const from = i && list(i.list_id);
      if (!i || !from) break;
      i.date = o.date;
      if (isActive(from, o.date)) break;
      // The list isn't on that day: use (or create) a one-day list of the same name.
      const oneDay = d.lists.find((l) => l.name === from.name && l.start === o.date && l.end === o.date);
      if (oneDay) i.list_id = oneDay.id;
      else {
        d.lists.push({ id: o.new_list_id, name: from.name, start: o.date, end: o.date });
        i.list_id = o.new_list_id;
      }
      break;
    }
    case 'addList':
      if (!list(o.id)) d.lists.push({ id: o.id, name: o.name, start: o.start || undefined, end: o.end || undefined });
      break;
    case 'updateList': {
      const l = list(o.id);
      if (!l) break;
      if (o.name !== undefined && !l.builtin) l.name = o.name;
      if (o.start !== undefined && !l.builtin) l.start = o.start || undefined;
      if (o.end !== undefined && !l.builtin) l.end = o.end || undefined;
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
        d.events.push({ id: o.id, date: o.date, title: o.title, important: o.important });
      break;
    case 'updateEvent': {
      const e = d.events.find((x) => x.id === o.id);
      if (!e) break;
      if (o.title !== undefined) e.title = o.title;
      if (o.important !== undefined) e.important = o.important;
      break;
    }
    case 'deleteEvent':
      d.events = d.events.filter((e) => e.id !== o.id);
      break;
  }
}
