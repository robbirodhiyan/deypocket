import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  csvCell, makeHistoryCsv, makeMonthlyCsv, monthBounds,
  monthKey, validDay, reportFileStamp,
} from '../src/features/deypocket/report-csv.ts';

test('CSV: escaped quotes, delimiter and new lines', () => {
  assert.equal(csvCell('Alpha; "Beta"\nGamma'), '"Alpha; ""Beta""\nGamma"');
});
test('CSV: spreadsheet formulas are neutralized', () => {
  for (const expression of ['=CMD(1)', '+SUM(1,2)', '-1+2', '@NOW()', ' \t=HYPERLINK(1)']) {
    assert.equal(csvCell(expression), `"'${expression}"`);
  }
  assert.equal(csvCell(120000), '"120000"');
});
test('CSV: correct header, BOM, transfer type and Rupiah amount', () => {
  const csv = makeHistoryCsv([{
    id: 9, kind: 'transfer', title: 'Transfer dompet',
    account_name: 'Tunai → Bank', account_id: 1, to_account_id: 2,
    category_id: null, occurred_on: '2026-11-16', amount_rupiah: 125000,
    note: '=unsafe',
  }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.match(csv, /"Transfer";"Transfer dompet";"Tunai → Bank";"125000"/);
  assert.match(csv, /"'=unsafe"/);
  assert.ok(csv.endsWith('\r\n'));
});
test('CSV: monthly columns and no transfer contribution to net', () => {
  const csv = makeMonthlyCsv([{month:'2026-11',summary:{total_count:3,income:1000,expense:800,transfer:600,net:200}}]);
  assert.match(csv, /"2026-11";"3";"1000";"800";"200";"600"/);
});
test('month arithmetic handles leap days and year transitions', () => {
  assert.deepEqual(monthBounds(new Date(2024, 2, 20), -1), {from:'2024-02-01',to:'2024-02-29'});
  assert.equal(monthKey(new Date(2026,0,15),-1), '2025-12');
});
test('validate YYYY-MM-DD', () => {
  assert.equal(validDay('2026-02-29'),false);
  assert.equal(validDay('2024-02-29'),true);
  assert.equal(validDay('2026-11-16'),true);
  assert.equal(validDay('2026-11-31'),false);
  assert.match(reportFileStamp(new Date(2026,10,16,9,56,0)), /^20261116-095600$/);
});
