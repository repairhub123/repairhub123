/**
 * MOBILE REPAIR SHOP — Google Apps Script Web App
 *
 * HOW TO DEPLOY (FIRST TIME):
 * 1. Open (or create) a Google Sheet.
 * 2. Rename the active sheet to "Jobs" (or change SHEET_NAME below).
 * 3. Extensions → Apps Script → paste this file, Save.
 * 4. Run setupHeaders() once from the Apps Script editor (authorise when asked).
 * 5. Deploy → New deployment → Type: Web app
 *      Execute as: Me  |  Who has access: Anyone
 * 6. Copy the Web App URL → put into /app/backend/.env as GOOGLE_SHEET_WEBAPP_URL.
 * 7. `sudo supervisorctl restart backend`.
 *
 * IF YOUR SHEET COLUMNS ARE OUT OF ORDER:
 *   Open the Apps Script editor and run migrateHeaders() once.
 *   It safely rearranges existing data so every column matches the canonical order below.
 *   Save a copy of the sheet first if you want an extra backup (Data is already preserved).
 *
 * Canonical column order (15 strict + 3 additive):
 *   1-ID | 2-Name | 3-Phone | 4-Model | 5-Work | 6-Cost | 7-Amount | 8-Profit |
 *   9-Percentage | 10-Share | 11-Status | 12-received_date | 13-received_time |
 *   14-completed_date | 15-completed_time | 16-Photo | 17-technician_share | 18-boss_share
 */

const SHEET_NAME = "Jobs";
const COLUMNS = [
  "ID", "Name", "Phone", "Model", "Work", "Cost", "Amount", "Profit",
  "Percentage", "Share", "Status",
  "received_date", "received_time", "completed_date", "completed_time",
  "Photo",
  "technician_share", "boss_share",
  "added_by"
];
const NUMERIC = new Set(["Cost", "Amount", "Profit", "Percentage", "Share", "technician_share", "boss_share"]);

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
    sh.setFrozenRows(1);
  } else {
    // Additive migration: ensure all expected columns exist at the end
    const header = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    COLUMNS.forEach(c => {
      if (header.indexOf(c) === -1) {
        sh.getRange(1, sh.getLastColumn() + 1).setValue(c);
      }
    });
  }
  return sh;
}

function setupHeaders() {
  const sh = getSheet_();
  sh.getRange(1, 1, 1, COLUMNS.length).setValues([COLUMNS]);
  sh.setFrozenRows(1);
}

/**
 * SAFE MIGRATION: rearrange existing data so columns match the canonical COLUMNS order.
 * Use this when your sheet has columns in the wrong positions (e.g. boss_share at column K).
 * It reads every row by its current header name, then re-writes it in the correct order.
 * Unknown headers are preserved at the tail so no data is lost.
 */
function migrateHeaders() {
  const sh = getSheet_();
  const lastRow = sh.getLastRow();
  const lastCol = sh.getLastColumn();
  const currentHeader = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);

  // Read all current data by header name into an array of objects.
  const rows = [];
  if (lastRow >= 2) {
    const data = sh.getRange(2, 1, lastRow - 1, lastCol).getValues();
    for (let r = 0; r < data.length; r++) {
      const obj = {};
      for (let c = 0; c < currentHeader.length; c++) {
        obj[currentHeader[c]] = data[r][c];
      }
      rows.push(obj);
    }
  }

  // Preserve any unknown columns at the end
  const extras = currentHeader.filter(h => h && COLUMNS.indexOf(h) === -1);
  const finalHeader = COLUMNS.concat(extras);

  // Clear sheet then write canonical header + reordered data
  sh.clear();
  sh.getRange(1, 1, 1, finalHeader.length).setValues([finalHeader]);
  sh.setFrozenRows(1);

  if (rows.length > 0) {
    const out = rows.map(obj =>
      finalHeader.map(h => {
        const v = obj[h];
        if (v === undefined || v === null) return NUMERIC.has(h) ? 0 : "";
        return v;
      })
    );
    sh.getRange(2, 1, out.length, finalHeader.length).setValues(out);
  }

  return `Migrated ${rows.length} row(s) into ${finalHeader.length} columns.`;
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
          // Generic: any column name present in body is applied.
          // Sheet column names are the canonical keys (ID, Name, ..., Photo).
          // We ignore "action" and "id" from the body.
          Object.keys(body).forEach(k => {
            if (k === "action" || k === "id") return;
            const c = COLUMNS.indexOf(k);
            if (c < 0) return;
            const val = NUMERIC.has(k) ? Number(body[k] || 0) : body[k];
            sh.getRange(rowIndex, c + 1).setValue(val);
          });
          // Backward-compat lowercase aliases from earlier clients
          const aliases = {
            status: "Status",
            completed_date: "completed_date",
            completed_time: "completed_time"
          };
          Object.keys(aliases).forEach(k => {
            if (body[k] === undefined) return;
            if (Object.prototype.hasOwnProperty.call(body, aliases[k])) return; // canonical already set
            const c = COLUMNS.indexOf(aliases[k]);
            if (c >= 0) sh.getRange(rowIndex, c + 1).setValue(body[k]);
          });
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
