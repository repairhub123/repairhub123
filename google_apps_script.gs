/**
 * MOBILE REPAIR SHOP — Google Apps Script Web App
 *
 * HOW TO DEPLOY:
 * 1. Open (or create) a Google Sheet.
 * 2. Rename the active sheet to "Jobs" (or change SHEET_NAME below).
 * 3. Extensions → Apps Script → paste this file, Save.
 * 4. Run setupHeaders() once from the Apps Script editor (authorise when asked).
 * 5. Deploy → New deployment → Type: Web app
 *      Execute as: Me  |  Who has access: Anyone
 * 6. Copy the Web App URL → put into /app/backend/.env as GOOGLE_SHEET_WEBAPP_URL.
 * 7. `sudo supervisorctl restart backend`.
 *
 * Column order (strict, additive — column 16 "Photo" is added without changing 1-15):
 * ID | Name | Phone | Model | Work | Cost | Amount | Profit | Percentage | Share | Status |
 * received_date | received_time | completed_date | completed_time | Photo
 */

const SHEET_NAME = "Jobs";
const COLUMNS = [
  "ID", "Name", "Phone", "Model", "Work", "Cost", "Amount", "Profit",
  "Percentage", "Share", "Status",
  "received_date", "received_time", "completed_date", "completed_time",
  "Photo"
];
const NUMERIC = new Set(["Cost", "Amount", "Profit", "Percentage", "Share"]);

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sh.setFrozenRows(1);
  } else {
    // Ensure Photo column exists (backward-compatible additive migration)
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    if (header.indexOf("Photo") === -1) {
      sh.getRange(1, header.length + 1).setValue("Photo");
    }
  }
  return sh;
}

function setupHeaders() {
  const sh = getSheet_();
  sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  sh.setFrozenRows(1);
}

function readAll_() {
  const sh = getSheet_();
  const last = sh.getLastRow();
  if (last < 2) return [];
  const values = sh.getRange(2, 1, last - 1, COLUMNS.length).getValues();
  return values.map(row => {
    const obj = {};
    COLUMNS.forEach((c, i) => { obj[c] = row[i]; });
    return obj;
  });
}

function doGet(e) {
  try {
    return ok_({ jobs: readAll_() });
  } catch (err) {
    return ok_({ error: String(err) });
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = (body.action || "").toLowerCase();
    const sh = getSheet_();

    if (action === "add") {
      const row = COLUMNS.map(c => {
        if (NUMERIC.has(c)) return Number(body[c] || 0);
        return body[c] === undefined || body[c] === null ? "" : String(body[c]);
      });
      sh.appendRow(row);
      return ok_({ ok: true, id: body.ID });
    }

    if (action === "update") {
      const last = sh.getLastRow();
      if (last < 2) return ok_({ ok: false, error: "empty sheet" });
      const ids = sh.getRange(2, 1, last - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) === String(body.id)) {
          const rowIndex = i + 2;
          const setCol = (name, val) => {
            const c = COLUMNS.indexOf(name);
            if (c >= 0 && val !== undefined) sh.getRange(rowIndex, c + 1).setValue(val);
          };
          setCol("Status", body.status);
          setCol("completed_date", body.completed_date);
          setCol("completed_time", body.completed_time);
          return ok_({ ok: true, id: body.id });
        }
      }
      return ok_({ ok: false, error: "id not found" });
    }

    return ok_({ ok: false, error: "unknown action" });
  } catch (err) {
    return ok_({ ok: false, error: String(err) });
  }
}

function ok_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}
