#!/usr/bin/env python3
"""One-time migration v1 -> v2: sessions (maintenance periods) become visits
(one shop visit per date, receipt-shaped).

Rules:
- Each distinct line-item date within a session becomes one visit.
- Visit label = 'Perawatan ke-N' from the old session; Vixion's refurbishment
  session gets label 'Refurbishment paska beli' and per-date vendors taken
  from the receipts (vendor suffixes stripped from descriptions).
- Session odometer goes to the visit on the session's own date, else to the
  session's earliest visit. The Vixion 24 Apr visit gets 47084 (handwritten
  on the work order).
- Sessionless items (aksesoris/administratif) group into visits by date.
- Items with NULL date inherit the session date (logged).

Usage: python3 scripts/migrate_v2.py --local | --remote
Writes migration-v2.sql, applies it, prints verification totals.
"""
import json
import subprocess
import sys

TARGET = sys.argv[1] if len(sys.argv) > 1 else None
if TARGET not in ('--local', '--remote'):
    sys.exit('usage: migrate_v2.py --local|--remote')

VIXION_VENDORS = {
    '2026-04-09': 'Mekar Motor Cibinong',
    '2026-04-11': 'Smart Ban Cibinong',
    '2026-04-24': 'Mekar Motor Cibinong',
    '2026-05-25': 'Modifikasi Ori Speedshop',
}
VIXION_EXTRA_ODOMETER = {'2026-04-24': 47084}  # handwritten on work order
VIXION_LABEL = 'Refurbishment paska beli'
VENDOR_SUFFIXES = [' — Mekar Motor', ' — Smart Ban', ' — Modifikasi Ori Speedshop']


def q(sql):
    out = subprocess.run(
        ['npx', 'wrangler', 'd1', 'execute', 'vehicle-maintenance', TARGET,
         '--json', '--command', sql],
        capture_output=True, text=True, check=True,
    ).stdout
    return json.loads(out)[0]['results']


def sql_str(v):
    if v is None:
        return 'NULL'
    return "'" + str(v).replace("'", "''") + "'"


def sql_num(v):
    return 'NULL' if v is None else str(v)


def main():
    vehicles = q('SELECT * FROM vehicles ORDER BY id')
    sessions = q('SELECT * FROM sessions ORDER BY id')
    items = q('SELECT * FROM line_items ORDER BY id')
    is_vixion = {v['id'] for v in vehicles if 'Vixion' in v['name']}

    visits = []     # dicts with temp key
    visit_key = {}  # (kind, session_id_or_vehicle, date) -> visit index

    def get_visit(vehicle_id, date, session):
        if session is not None:
            key = ('s', session['id'], date)
        else:
            key = ('x', vehicle_id, date)
        if key in visit_key:
            return visit_key[key]
        vendor = None
        label = None
        odo = None
        if session is not None:
            if vehicle_id in is_vixion:
                label = VIXION_LABEL
                vendor = VIXION_VENDORS.get(date)
                odo = VIXION_EXTRA_ODOMETER.get(date)
            else:
                label = f"Perawatan ke-{session['seq']}"
        visits.append(dict(vehicle_id=vehicle_id, date=date, odometer_km=odo,
                           vendor=vendor, label=label, session_id=session['id'] if session else None))
        visit_key[key] = len(visits) - 1
        return visit_key[key]

    sess_by_id = {s['id']: s for s in sessions}
    new_items = []
    for it in items:
        session = sess_by_id.get(it['session_id']) if it['session_id'] else None
        date = it['date']
        if date is None:
            if session is None:
                sys.exit(f"item {it['id']} has no date and no session — cannot place")
            date = session['date']
            print(f"  item {it['id']} ({it['description'][:30]!r}): NULL date -> session date {date}", file=sys.stderr)
        desc = it['description']
        if it['vehicle_id'] in is_vixion:
            for suf in VENDOR_SUFFIXES:
                if desc.endswith(suf):
                    desc = desc[: -len(suf)]
        vi = get_visit(it['vehicle_id'], date, session)
        new_items.append(dict(visit_index=vi, description=desc,
                              unit_price=it['unit_price'], qty=it['qty'], total=it['total'],
                              category=it['category'], checkpoint_note=it['checkpoint_note'],
                              due_date=it['due_date'], due_km=it['due_km'],
                              checkpoint_done=it['checkpoint_done']))

    # session odometer -> visit on session date, else earliest visit of session
    for s in sessions:
        candidates = [i for i, v in enumerate(visits) if v['session_id'] == s['id']]
        if not candidates:
            print(f"  session {s['id']} (seq {s['seq']}) has no items — odometer kept via synthetic visit", file=sys.stderr)
            visits.append(dict(vehicle_id=s['vehicle_id'], date=s['date'], odometer_km=s['odometer_km'],
                               vendor=None, label=f"Perawatan ke-{s['seq']}", session_id=s['id']))
            continue
        exact = [i for i in candidates if visits[i]['date'] == s['date']]
        target = exact[0] if exact else min(candidates, key=lambda i: visits[i]['date'])
        if visits[target]['odometer_km'] is None:
            visits[target]['odometer_km'] = s['odometer_km']

    # ---- emit SQL ----
    lines = []
    lines.append('''CREATE TABLE visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id),
  date TEXT NOT NULL,
  odometer_km INTEGER,
  vendor TEXT,
  label TEXT
);''')
    lines.append('''CREATE TABLE line_items_v2 (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  description TEXT NOT NULL,
  unit_price INTEGER NOT NULL,
  qty REAL NOT NULL,
  total INTEGER NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('rutin', 'aksesoris', 'administratif')),
  checkpoint_note TEXT,
  due_date TEXT,
  due_km INTEGER,
  checkpoint_done INTEGER NOT NULL CHECK (checkpoint_done IN (0, 1))
);''')
    lines.append('''CREATE TABLE attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visit_id INTEGER NOT NULL REFERENCES visits(id),
  r2_key TEXT NOT NULL UNIQUE,
  filename TEXT NOT NULL,
  content_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  uploaded_at TEXT NOT NULL
);''')

    # visits sorted by vehicle then date for tidy ids
    order = sorted(range(len(visits)), key=lambda i: (visits[i]['vehicle_id'], visits[i]['date']))
    visit_id_of_index = {}
    for new_id, idx in enumerate(order, 1):
        v = visits[idx]
        visit_id_of_index[idx] = new_id
        lines.append(
            'INSERT INTO visits (id, vehicle_id, date, odometer_km, vendor, label) VALUES '
            f"({new_id}, {v['vehicle_id']}, {sql_str(v['date'])}, {sql_num(v['odometer_km'])}, "
            f"{sql_str(v['vendor'])}, {sql_str(v['label'])});"
        )
    for it in new_items:
        lines.append(
            'INSERT INTO line_items_v2 (visit_id, description, unit_price, qty, total, category, '
            'checkpoint_note, due_date, due_km, checkpoint_done) VALUES '
            f"({visit_id_of_index[it['visit_index']]}, {sql_str(it['description'])}, {it['unit_price']}, "
            f"{it['qty']}, {it['total']}, {sql_str(it['category'])}, {sql_str(it['checkpoint_note'])}, "
            f"{sql_str(it['due_date'])}, {sql_num(it['due_km'])}, {it['checkpoint_done']});"
        )
    lines.append('DROP TABLE line_items;')
    lines.append('DROP TABLE sessions;')
    lines.append('ALTER TABLE line_items_v2 RENAME TO line_items;')
    lines.append('CREATE INDEX idx_visits_vehicle ON visits(vehicle_id, date);')
    lines.append('CREATE INDEX idx_line_items_visit ON line_items(visit_id);')
    lines.append('CREATE INDEX idx_line_items_due ON line_items(checkpoint_done, due_date, due_km);')
    lines.append('CREATE INDEX idx_attachments_visit ON attachments(visit_id);')

    with open('migration-v2.sql', 'w') as f:
        f.write('\n'.join(lines) + '\n')
    print(f'wrote migration-v2.sql: {len(visits)} visits, {len(new_items)} items', file=sys.stderr)

    # totals before
    before = q('''SELECT v.id, v.name, COALESCE((SELECT SUM(li.total) FROM line_items li
                  WHERE li.vehicle_id = v.id), 0) AS spend FROM vehicles v ORDER BY v.id''')

    subprocess.run(['npx', 'wrangler', 'd1', 'execute', 'vehicle-maintenance', TARGET,
                    '--file', 'migration-v2.sql', '-y'], check=True, capture_output=True, text=True)
    print('migration applied', file=sys.stderr)

    after = q('''SELECT v.id, v.name, COALESCE((SELECT SUM(li.total) FROM line_items li
                 JOIN visits vi ON li.visit_id = vi.id WHERE vi.vehicle_id = v.id), 0) AS spend,
                 (SELECT COUNT(*) FROM visits vi WHERE vi.vehicle_id = v.id) AS visit_count
                 FROM vehicles v ORDER BY v.id''')
    ok = True
    for b, a in zip(before, after):
        match = '✓' if b['spend'] == a['spend'] else '✗ MISMATCH'
        if b['spend'] != a['spend']:
            ok = False
        print(f"  {a['name']}: Rp {a['spend']:,} ({a['visit_count']} visits) {match}", file=sys.stderr)
    if not ok:
        sys.exit('TOTALS MISMATCH — investigate before deploying')
    print('all totals match', file=sys.stderr)


if __name__ == '__main__':
    main()
