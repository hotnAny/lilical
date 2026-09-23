# lilical — spec

Lists of to-do lists in a calendar. A calendar-based app for managing daily to-do lists.

Source: `.agent/refs/IMG_3048.JPG` (notebook sketch, dated 9/23 09:56). Items marked
**[interp]** are my reading of the sketch; items marked **[open]** are not specified.

## 1. Layout

Two panes side by side.

### 1.1 Left pane: navigation

The lily icon and the name *lilical* sit at the top left. A gear icon at the top opens Settings (§2); it's highlighted while Settings is open.

From top to bottom:

1. **Month calendar** (small), labeled "calendar".
   - `<` / `>` arrows above it go to the previous / next month.
   - Today is circled.
   - Past days with unchecked items show their date in **red**.
2. **Week strip**: seven stacked rows labeled with full day names, Monday to Sunday
   (weeks start Monday).
   - The selected day is shaded (W in the sketch; 9/23/2026 is a Wednesday).
   - Every row has a **dot** to its left. By default it's a grey dotted outline, so it
     doesn't look like a radio button. Clicking it opens a
     popup for adding events to that day. Once the day has an event, the dot is
     colored (shown on W and F).
   - A **red dot** means that day has unchecked items and the day is in the past.
   - `<` / `>` arrows below the strip go to the previous / next week, with a **Today**
     link between them that jumps back to today.
   - Clicking a row selects that day, and the right pane shows that day.
   - Clicking a date in the month calendar jumps the week strip to that week.

### 1.2 Right pane: the selected day

1. **Date heading** with the day's **event tags** to its right: one gold pill per event
   (§3.3), e.g. `XXX DEADLINE`. (The sketch drew a full-width banner; replaced by tags.)
2. **User lists** as cards, laid out in columns, e.g. *My Research*, *Anything Goes*,
   *Human Writes*.
   - Each card has a title and items. Each item has a drag handle ⠿ on its left, then a
     circular checkbox.
   - Each card **always shows an empty text box as its last row** for adding a new item.
   - A URL in an item's text shows as a link icon that opens it in a new tab; hovering
     shows the URL. Editing the item shows the full text, URL included.
   - Items are edited inline: click the text to edit it. Deleting happens in the
     item's details popup (§3.4). Checked items stay visible, struck through.
   - Card **size fits its content**. The cards fill the space left of the fixed column
     in as many columns as fit, and read **in Settings order, left to right, then top
     to bottom**: card *i* goes into column *i* mod *n*.
3. **Fixed column** on the right with two built-in lists:
   - **À la carte** (top)
   - **Misc** (bottom)
   - "Fixed" means this column is always the rightmost one and never reflows with the
     user lists.
   - A round `+` "add list" button was drawn in the bottom corner of Misc and then
     **crossed out**. There is no add-list button on the main view. Lists are managed
     in Settings.

### 1.3 Colors

Each color has one meaning.

| Color | Value | Used for |
|---|---|---|
| Black | `#111111` | text |
| Grey | `#8A8A8A` (lines `#D9D9D9`) | secondary text, card borders, empty dots |
| White | `#FFFFFF` (panes `#F7F7F7`) | background |
| UCLA Blue | `#2774AE` | selected day, today's circle, checkboxes/focus |
| UCLA Gold | `#FFD100` | events: tag and dot |
| Red | `#C8102E` | overdue: moved items, unchecked past days |

**Week-strip dot** (combines the two dot meanings from §1.1):

- *Fill* shows events: empty (grey dotted outline) = none, gold = at least one event.
- *Ring* shows unchecked items: a red ring if the day is past and still has unchecked
  items. So a day with both shows a gold dot with a red ring.

**Month calendar:** past dates with unchecked items are in red text. Today is circled
in blue.

**Overdue item** (§3.1): red text or a red left border on the item row.

## 2. Settings

- **Option: move unchecked items to today.** When on, unchecked one-off items from
  past days move to today, into the same list, and show as overdue (red). This runs
  when the app opens, when you return to its tab, and when you turn the option on.
  Repeating items, checked items and items in hidden lists stay where they are.
  Turning it off stops future moves; items already moved stay where they are. The
  option is saved with the data, so it applies on every device.

- **A list of lists.** Each list has:
  - `name` (required)
  - `shows on`: all days (default), weekdays only, or weekends only
  - `shown` / hidden flag (replaces the old start and end dates), toggled by an eye
    icon: full opacity when shown, half when hidden
- A trash icon deletes a list, after a confirmation click.
- Lists are **ordered** by dragging each row's ⠿ handle. The day view follows that order (§1.2).
- A list appears on a day if it isn't hidden **and** either the day matches its
  `shows on` setting or the list has items on that day.
- A **hidden** list disappears from every day, and its unchecked items stop causing
  red flags. Its items are kept, and showing the list again brings them back.
- **Misc** and **À la carte** are two default lists that are always present. They are
  always shown, and they can't be hidden, reordered, deleted or renamed.
  - **Misc**: unimportant chores.
  - **À la carte**: one-off tasks.
  - Apart from that, they behave exactly like any other list: items belong to a date,
    can be dragged, and so on.

## 3. Features

### 3.1 Drag an item to another date

- Drag an item **by its handle** ⠿ onto a different date: a row in the week strip or a
  day in the month calendar.
- On that date the item automatically goes into **the same list** it came from.
- If the list doesn't normally show on that date (e.g. a weekday list dropped onto a
  Saturday), it still appears there because it now has an item on that day (§2).
- It is **highlighted to show that it's overdue**, but only when it's moved to a
  *later* date than the one it was first given. Moving it earlier doesn't mark it.

- Drag it onto another card on the same day to move it into that list, or within its
  own card to reorder. A blue line shows where it will land. Neither counts as
  overdue, because the date doesn't change.

### 3.2 Item lifetime

- Items belong to their date. By default an unchecked item **stays on its day** when
  that day passes; dragging (§3.1) is how you reschedule it. The Settings option
  (§2) can instead move it to today automatically.
- Days in the past that still have unchecked items are flagged: a red dot in the week
  strip and a red date in the month calendar (§1.1).
- On a past day, each unchecked one-off item is shown in **red text**. Repeating items
  aren't (§3.4). Items that were moved later (overdue) also get a red left border.

### 3.3 Events

- Events are **entered in the app** through the popup on the week strip's dot (§1.1).
  There is no calendar import.
- The popup lists the day's events, then a form: *Event* title, *Dates* (from – to),
  and Close / Add at the bottom right. Both dates default to the clicked day. Setting a
  later "to" date makes one **multi-day event**, so you don't have to add it again on
  each day.
- An event puts a gold dot on every day it covers and appears as a tag next to the date
  on each of those days. Multi-day tags show their range (e.g. `9/23–9/26`). There is no
  "important" flag.

### 3.4 Item details and Repeat

- **⋯** at the end of an item (on hover, or always and in blue if it has notes) opens
  **Item details**: *Label*, *Link* (optional), *Notes* (optional), *Repeat*, then
  Delete · Cancel · Save.
- A URL typed into an item's text moves to the Link field when the popup opens. A
  link shows as a link icon on the card.
- **Repeat** is a row of small weekday circles, Monday to Sunday, muted (pale with grey
  letters) until chosen, then solid blue. Weekdays where the item's list doesn't show
  are faded further and can't be selected. A repeating item shows ↻ before its label.
- A repeating item appears on the chosen weekdays and each day is checked off
  separately.
- **Repeat changes never rewrite the past.** On the day you're viewing (V):
  - one-off → repeating: the one-off stays on V; a new series starts the day after V.
  - repeating → not repeating: the series keeps its days up to and including V, and
    nothing appears after V.
  - different weekdays: days up to V keep the old pattern; the new pattern starts
    the day after V. The pieces stay linked as one series.
- Missed days of a repeating item **don't** turn a day red (§3.2).
- There is one **Delete** button. For a one-off, the first click turns it into
  "Click again to delete" and the second click deletes. For a repeating
  item it asks **Only <this day>** / **All days** (every linked piece of the series) /
  Cancel.
- **Dragging** one day's copy onto another date moves only that copy: it becomes a
  one-off item there (overdue if later), and the series continues. Dragging it to
  another list or position changes the whole series.

## 4. Data model (derived)

```
List    { id, name, days?: weekdays | weekends, hidden?: bool, builtin: bool }
        # order = position in the lists array
Item    { id, list_id, date, original_date, text, done: bool, link?, notes?,
          repeat?: weekday[] (0 = Mon), done_on?: date[], skip?: date[], until?, series? }
        # repeating: occurs on repeat weekdays from date to until, minus skip;
        # pieces split by a weekday change share `series`
        # overdue := date > original_date
Event   { id, date, end?, title }
Settings { carryOver?: bool }   # date = first day, end = last day
```

## 5. Platform

Same stack as `~/dev/teaching`:

- **Astro** (`output: 'server'`) with the `@astrojs/vercel` adapter, hosted on
  **Vercel**.
- Data lives as JSON files in a **GitHub repo** and is read and written through the
  GitHub Contents API (`GITHUB_TOKEN`, `GITHUB_REPO` env vars). Cross-device sync
  comes from that.
- Local dev fallback: without credentials, read and write files on disk (the same
  pattern as `teaching/src/lib/github.ts`).
- Unlike teaching, which only creates new files, lilical **updates** existing files.
  Every write has to send the file's current `sha`, and a stale `sha` (an edit made
  on another device) has to be handled.
- **Two repos.** Code goes in repo A (`lilical`, which Vercel deploys). Data goes in
  repo B (e.g. `lilical-data`, private). The server code running on Vercel reads and
  writes B over the GitHub API: `GITHUB_REPO=<owner>/lilical-data`, and `GITHUB_TOKEN`
  is a fine-grained token with Contents read/write on B only. B is just a remote
  store. Vercel watches only A, so data commits to B never trigger a deploy, and no
  `[skip ci]` / `ignoreCommand` is needed. (teaching keeps data in its own repo, which
  is why it needs those.)
- **Access**: a passphrase stored in a Vercel env var. The app checks it once and
  then sets a cookie. Every read and write endpoint requires that cookie.

## 6. Open questions

None at the moment.
