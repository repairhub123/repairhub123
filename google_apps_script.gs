/**
 * MOBILE REPAIR SHOP — Google Apps Script Web App
 *
 * HOW TO DEPLOY:
 * 1. Create (or open) a Google Sheet.
 * 2. Rename the active sheet to "Jobs" (or change SHEET_NAME below).
 * 3. Extensions → Apps Script → paste this file, Save.
 * 4. Deploy → New deployment → Type: Web app
 *      - Execute as: Me
 *      - Who has access: Anyone
 * 5. Copy the Web App URL and paste into /app/backend/.env as
 *      GOOGLE_SHEET_WEBAPP_URL="..."
 * 6. Restart backend:  sudo supervisorctl restart backend
 *
 * The sheet header row (row 1) MUST be exactly (in this order):
 * ID | Name | Phone | Model | Work | Cost | Amount | Profit | Percentage | Share | Status | received_date | received_time | completed_date | completed_time
 *
 * Run `setupHeaders` once from the Apps Script editor to auto-create the header row.
 */

const SHEET_NAME = "Jobs";
const COLUMNS = [
  "ID", "Name", "Phone", "Model", "Work", "Cost", "Amount", "Profit",
  "Percentage", "Share", "Status",
  "received_date", "received_time", "completed_date", "completed_time"
];

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sh.setFrozenRows(1);
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
    const rows = readAll_();
    return ContentService
      .createTextOutput(JSON.stringify({ jobs: rows }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || "{}");
    const action = (body.action || "").toLowerCase();
    const sh = getSheet_();

    if (action === "add") {
      const row = COLUMNS.map(c => {
        if (c === "Cost" || c === "Amount" || c === "Profit" || c === "Percentage" || c === "Share") {
          return Number(body[c] || 0);
        }
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
          const statusCol = COLUMNS.indexOf("Status") + 1;
          const cdCol = COLUMNS.indexOf("completed_date") + 1;
          const ctCol = COLUMNS.indexOf("completed_time") + 1;
          if (body.status !== undefined) sh.getRange(rowIndex, statusCol).setValue(body.status);
          if (body.completed_date !== undefined) sh.getRange(rowIndex, cdCol).setValue(body.completed_date);
          if (body.completed_time !== undefined) sh.getRange(rowIndex, ctCol).setValue(body.completed_time);
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
