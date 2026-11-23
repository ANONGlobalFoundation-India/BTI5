# ANON Internship Leaderboard

A live leaderboard and batch journey for the ANON Global Foundation internship, on free GitHub Pages.
Team leads work in a Google Sheet; the website reads that sheet by itself. No database, no server, and
the leads never need GitHub access.

```
Team leads type in the Google Sheet  ──►  the website reads it (within a few minutes)  ──►  interns see grades and reasons
```

## What is in this folder

| File | What it is |
|---|---|
| `index.html` | The website. |
| `assets/config.js` | The list of batches and the link to each batch's Google Sheet. The only file you edit. |
| `assets/app.js`, `assets/style.css` | How the site works and looks. No need to touch. |
| `data/bti3.json`, `data/bti4.json` | Saved copies of the finished BTI 3 and BTI 4 batches. |
| `template/ANON-Leaderboard-Batch-Template.xlsx` | The Google Sheet template for a new batch. |

## Part 1: Put the website online (once, about 10 minutes)

1. On GitHub create a **new public repository**, for example `Intern-Leaderboard`.
2. Unzip, open the `anon-leaderboard` folder, select everything inside it and **drag it** onto
   **Add file → Upload files**, then **Commit changes**. The first screen of the repository must show `index.html`.
3. **Settings → Pages → Deploy from a branch → main → / (root) → Save.**
4. After a minute or two the site is at `https://YOUR-USERNAME.github.io/Intern-Leaderboard/`.
   BTI 3 and BTI 4 work straight away; BTI 5 says "not connected" until Part 2 is done.

## Part 2: Create the BTI 5 sheet (once per batch, about 15 minutes)

1. **Upload the template:** in ANON's Google Drive choose **New → File upload** and pick
   `ANON-Leaderboard-Batch-Template.xlsx`. Open it, then **File → Save as Google Sheets**.
   Work only in the new Google Sheets copy from now on; delete the .xlsx copy.
2. **Settings tab:** fill in the Period and Tagline.
3. **Let the website read it:** **Share → General access → Anyone with the link → Viewer.**
   This is what lets the website read the sheet, which also means anyone with the link can view it.
   Never type phone numbers, email addresses or private remarks anywhere in this sheet.
4. **Give each lead access:** **Share → add the lead's Gmail → Editor.** Untick "Notify" if you prefer.
5. **Lock each team tab to its lead** (so the Connect lead cannot edit Impact):
   **Data → Protect sheets and ranges → Add a sheet or range → Sheet → Team Connect → Set permissions →
   Restrict who can edit → Custom → tick only yourself and the Connect lead.** Repeat for Team Impact and Team Expression.
   Also protect **Settings** and **Work Types** so only you can change the points.
   Leave **Work Log** open so all leads can add to it; Events, Winners, Stories and EC are your choice.
6. **Connect it to the website:** on GitHub open `assets/config.js`, press the pencil, and paste the sheet's
   address between the quotes on the BTI 5 line:
   ```js
   { id: 'bti5', label: 'BTI 5', sheet: 'https://docs.google.com/spreadsheets/d/…/edit' },
   ```
   Commit. In a minute or two the BTI 5 leaderboard appears, and from then on it updates by itself.

**When a lead's tenure ends:** Share → find their email → Remove. That is all. Google keeps a full
version history (**File → Version history**), so any mistake or damage can be undone.

## Part 3: What the leads do

Send them the sheet link and this short version:

- Your tab is your team's tab. Add each intern once: **Name, Institution, Status**.
- Record work as **numbers** in the work columns (e.g. 7 under *Graphic designing*), and raise the number as work comes in.
- Or add a row to **Work Log** for each finished piece: date, intern, work type, count, link. The website adds these up,
  and the link appears on the intern's card.
- The website suggests a grade. Put your final grade in **Lead grade**. If it differs from the suggestion,
  write why in **Lead's reason**. Interns see this.
- To spot mistakes, open the website with `?check=1` added to the address
  (e.g. `…github.io/Intern-Leaderboard/?check=1`). It lists misspelt names, unknown work types and missing reasons.

### Faster logging from a phone (optional): a Google Form

So leads don't have to open the sheet for every graphic:

1. In the sheet: **Tools → Create a new form.** Google links it to the sheet automatically.
2. Add these questions, with **exactly these titles**: `Intern` (short answer or a dropdown of names),
   `Work type` (dropdown, using the names in the Work Types tab), `Count` (short answer), `Link` (short answer), `Note` (short answer).
3. In the form's **Settings → Responses**, keep **Collect email addresses: Do not collect**. Otherwise emails would become public.
4. Back in the sheet, delete the empty **Work Log** tab and rename the new **Form Responses 1** tab to **Work Log**.
5. Share the form link only with the leads. Each finished piece of work then takes about 15 seconds to log.

## How grades work

- Every kind of work earns points in the **Work Types** tab. Longer work earns more: a podcast episode is 20, an
  ANONTalks episode 10, a reel 10, a graphic 5, a piece of copy 3. This keeps Team Expression's long projects
  fair against Team Connect's volume.
- **Suggested grade:** O needs 110+ points from at least 3 different kinds of work; A needs 45+ points; otherwise B.
  Inactive or dropped interns are B and not ranked.
- **Final grade:** the lead's grade. If it differs from the suggestion, the page shows both, plus the lead's reason
  (or "No reason given yet").
- **Stricter or looser:** change the numbers in **Settings**. A separate bar for one team: add a row such as
  `O needs points (Team Expression)` with its own number.
- On real BTI 4 work, these defaults suggest 6 O, 13 A and 8 B, against the 6 O, 16 A and 4 B that were given.
  They are stricter at the bottom and favour Team Connect's volume a little, so review the Impact points after the first month.

## Adding to the journey

- **Events:** one row per event, with Status Completed, Upcoming, Planned or Cancelled. New events show up as soon as they are added.
- **Winners:** Event, Activity, Position (1st, 2nd, 3rd, Winner, Special mention), Name, Team.
- **Stories:** any **Section** name you type becomes its own section on the site, e.g. Monthly highlights,
  Monthly presentations, Interns Chronicles, Fit & Wealthy, or something new.
- **EC:** Name, Role, Area. Grouped by role on the site.

## A new batch (BTI 6 and later)

1. In Google Sheets: **File → Make a copy** of the BTI 5 sheet, then clear the interns, Work Log and journey rows.
   Redo the sharing and tab protection from Part 2 for the new leads.
2. In `assets/config.js` add a line at the top of the list and point `defaultBatch` to it:
   ```js
   { id: 'bti6', label: 'BTI 6', sheet: 'https://docs.google.com/spreadsheets/d/…/edit' },
   ```
3. The finished batch can stay on its sheet (it stays live), or be frozen as a saved copy like BTI 3 and BTI 4.

## Credential Hub link

Put an intern's certificate ID in the **Certificate ID** column and their card shows **Verify certificate**,
opening their page on the ANON Credential Hub. The Hub's address is in `assets/config.js` (`credentialHubUrl`).

## Things to know

- **Everything in the sheet's tabs is public** once shared for viewing. Keep private notes in a different file.
- **Updates appear within a few minutes.** An open page re-reads the sheet every 5 minutes.
- **If the page says it cannot read the sheet,** check Part 2 step 3 (Anyone with the link → Viewer).
- **Do not rename tabs or the headings in row 1.** To add a new kind of work, add it to Work Types, then add a column
  with exactly the same name to the team tab.
- **Rankings for BTI 4** use the new points table; BTI 4 did not publish ranks at the time. Its grades are unchanged.
- The reading of Google Sheets uses Google's public "gviz" CSV link. It is widely used and free, but it is not a paid
  service with guarantees; if Google ever changes it, the site will show a clear "cannot read" message.
