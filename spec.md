# lilical — spec

Lists of to-do lists in a calendar. A calendar-based app for managing daily to-do lists.

Source: `.agent/refs/IMG_3048.JPG` (notebook sketch, dated 9/23 09:56). Items marked
**[interp]** are my reading of the sketch; items marked **[open]** are not specified.

## 1. Layout

Two panes side by side.

### 1.1 Left pane: navigation

From top to bottom:

1. **Month calendar** (small), labeled "calendar".
   - `<` / `>` arrows above it go to the previous / next month.
   - Today is circled.
   - Past days with unchecked items show their date in **red**.
2. **Week strip**: seven stacked rows, `M T W Th F Sa Su` (weeks start Monday).
   - The selected day is shaded (W in the sketch; 9/23/2026 is a Wednesday).
   - Every row has a **dot** to its left. It's empty by default. Clicking it opens a
     popup for adding events to that day. Once the day has an event, the dot is
     colored (shown on W and F).
   - A **red dot** means that day has unchecked items and the day is in the past.
   - `<` / `>` arrows below the strip go to the previous / next week.
   - Clicking a row selects that day, and the right pane shows that day.
   - Clicking a date in the month calendar jumps the week strip to that week.

### 1.2 Right pane: the selected day

1. **Important-event banner** across the top, e.g. `XXX DEADLINE`.
   - Shows events marked *important* (§3.3), with one stacked banner per event.
2. **User lists** as cards, laid out in columns, e.g. *My Research*, *Anything Goes*,
   *Human Writes*.
   - Each card has a title and items, each item with a circular checkbox.
   - Each card **always shows an empty text box as its last row** for adding a new item.
   - Items are edited inline: click the text to edit it, and hover to show a `×` for
     deleting it. Checked items stay visible, struck through.
   - Card **size fits its content**. The cards are laid out responsively to fill all the
     space left of the fixed column, packed according to their sizes (masonry-style).
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
| UCLA Blue | `#2774AE` | selected day, today's circle, events, checkboxes/focus |
| UCLA Gold | `#FFD100` | *important* events: banner and dot |
| Red | `#C8102E` | overdue: moved items, unchecked past days |

**Week-strip dot** (combines the two dot meanings from §1.1):

- *Fill* shows events: empty (grey outline) = none, blue = at least one event,
  gold = at least one important event.
- *Ring* shows unchecked items: a red ring if the day is past and still has unchecked
  items. So a day with both shows a blue or gold dot with a red ring.

**Month calendar:** past dates with unchecked items are in red text. Today is circled
in blue.

**Overdue item** (§3.1): red text or a red left border on the item row.

## 2. Settings

- **A list of lists.** Each list has:
  - `name` (required)
  - `start date` (optional)
  - `end date` (optional)
- A list appears on a day only if the day falls in its [start, end] range. A missing
  date leaves that side of the range open, and the list appears on every day in the
  open range. With neither date set, it appears every day.
- **Misc** and **À la carte** are two default lists that are always present. They have
  no start or end date. They can't be deleted or renamed.
  - **Misc**: unimportant chores.
  - **À la carte**: one-off tasks.
  - Apart from that, they behave exactly like any other list: items belong to a date,
    can be dragged, and so on.

## 3. Features

### 3.1 Drag an item to another date

- Drag an item onto a different date: a row in the week strip or a day in the month
  calendar.
- On that date the item automatically goes into **the same list** it came from.
- If that list isn't active on the target date (outside its start/end range), a list
  with the same name is **created just for that day** to hold the item.
- It is **highlighted to show that it's overdue**, but only when it's moved to a
  *later* date than the one it was first given. Moving it earlier doesn't mark it.

### 3.2 Item lifetime

- Items belong to their date. An unchecked item **stays on its day** when that day
  passes. It isn't carried forward. Dragging (§3.1) is how you reschedule it.
- Days in the past that still have unchecked items are flagged: a red dot in the week
  strip and a red date in the month calendar (§1.1).

### 3.3 Events

- Events are **entered in the app** through the popup on the week strip's dot (§1.1).
  There is no calendar import.
- Every event puts a dot on its day. Events marked *important* also appear in the
  banner at the top of the right pane.

## 4. Data model (derived)

```
List    { id, name, start_date?, end_date?, builtin: bool }
        # a one-day list (from a drop outside the range) has start_date = end_date
Item    { id, list_id, date, original_date, text, done: bool }
        # overdue := date > original_date
Event   { id, date, title, important: bool }
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
