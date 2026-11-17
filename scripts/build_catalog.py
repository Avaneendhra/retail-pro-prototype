"""Builds public/catalog/products.json from the product dataset spreadsheets.

Usage:  python scripts/build_catalog.py "C:/path/to/archive"

Every product_data.xlsx under the folder is read. The output is compact:
  { "v": 1, "subs": [sub-category names], "rows": [[barcode, name, brand, size, mrp, category, sub, image], ...] }
barcode is "" when the row has no real, scannable barcode (the dataset's
"EAN Code" is often the shop's own product number); those rows are matched by name.
image is the picture's file name; the app puts imageBase in front of it.
"""
import glob
import json
import os
import re
import sys

import openpyxl

IMG_BASE = 'https://www.bigbasket.com/media/uploads/p/l/'
# The same picture, small (about 5 KB), from the shop's image server.
IMAGE_URL = 'https://www.bbassets.com/media/uploads/p/s/'
OUT = os.path.join(os.path.dirname(__file__), '..', 'public', 'catalog', 'products.json')

# App categories: dairy, bakery, snacks, grocery, beverages, personal, household, other
CATEGORY_RULES = [
    ('dairy', r'dairy|cheese'),
    ('bakery', r'bakery|bread|cakes|rusk|cookies, rusk'),
    ('beverages', r'^beverages|drinks|coffee|tea|water|juice'),
    ('personal', r'^beauty|^baby|maternity'),
    ('household', r'^cleaning|^kitchen|household'),
    ('snacks', r'snack|biscuit|chocolate|candies|mithai|namkeen'),
    ('grocery', r'foodgrains|cereal|noodle|pasta|pickle|spread|sauce|ready to cook|frozen|cooking|oils|tinned|masala|dry fruit|eggs, meat|world food'),
]


def category_of(top, sub):
    for name, rule in CATEGORY_RULES:
        if re.search(rule, sub) or re.search(rule, top):
            return name
    return 'other'


def check_digit_ok(code):
    digits = [int(c) for c in code]
    check = digits.pop()
    total = sum(d * (3 if i % 2 == 0 else 1) for i, d in enumerate(reversed(digits)))
    return (10 - total % 10) % 10 == check


def real_barcode(raw, link):
    """The scannable barcode in the 'EAN Code' cell, as 8 or 13 digits, or ''."""
    code = re.sub(r'\D', '', str(raw or '').split('.')[0])
    if f'/pd/{code}/' in str(link or ''):
        return ''  # the shop's own product number, not printed on the pack
    if len(code) in (7, 11):
        code = '0' + code  # a leading zero lost in the spreadsheet
    if len(code) == 14 and code.startswith('0'):
        code = code[1:]
    if len(code) == 12:
        code = '0' + code  # UPC-A is EAN-13 with a leading zero
    if len(code) not in (8, 13) or set(code) == {'0'} or not check_digit_ok(code):
        return ''
    return code


def mrp_of(value):
    text = re.sub(r'[^\d.]', '', str(value or ''))
    try:
        return round(float(text), 2) if text else 0
    except ValueError:
        return 0


def tidy(value):
    return re.sub(r'\s+', ' ', str(value or '')).strip()


def main(folder):
    subs, sub_index = [], {}
    by_code, by_name = {}, {}
    files = sorted(glob.glob(os.path.join(folder, '**', 'product_data.xlsx'), recursive=True))
    total = 0
    for path in files:
        sheet = openpyxl.load_workbook(path, read_only=True).active
        rows = sheet.iter_rows(values_only=True)
        next(rows)
        for r in rows:
            total += 1
            top, sub, _sub2, link, ean, img, brand, name, size, mrp = (r + (None,) * 11)[:10]
            name = tidy(name)
            if not name:
                continue
            top, sub = tidy(top).lower(), tidy(sub).lower()
            if sub not in sub_index:
                sub_index[sub] = len(subs)
                subs.append(sub)
            image = str(img or '')
            image = image[len(IMG_BASE):] if image.startswith(IMG_BASE) else ''
            code = real_barcode(ean, link)
            row = [code, name, tidy(brand), tidy(size), mrp_of(mrp), category_of(top, sub), sub_index[sub], image]
            if code:
                old = by_code.get(code)
                if not old or (not old[4] and row[4]):
                    by_code[code] = row
            else:
                key = re.sub(r'[^a-z0-9]', '', name.lower())
                old = by_name.get(key)
                if not old or (not old[4] and row[4]):
                    by_name[key] = row
    rows = list(by_code.values()) + list(by_name.values())
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'v': 1, 'imageBase': IMAGE_URL, 'subs': subs, 'rows': rows}, f, ensure_ascii=False, separators=(',', ':'))
    priced = sum(1 for r in rows if r[4])
    print(f'{len(files)} files, {total} rows read -> {len(rows)} products '
          f'({len(by_code)} with a barcode, {len(by_name)} by name only, {priced} with an MRP), '
          f'{os.path.getsize(OUT) / 1e6:.1f} MB')


if __name__ == '__main__':
    main(sys.argv[1] if len(sys.argv) > 1 else '.')
