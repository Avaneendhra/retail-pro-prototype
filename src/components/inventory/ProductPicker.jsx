import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { inr } from '../../lib/format';
import { loadProductList } from '../../lib/productList';

/**
 * For a barcode the product list does not have: the products of the brand
 * whose barcodes start the same way, and a search over the whole list.
 * Tapping one fills in its name, price, category and picture.
 */
export default function ProductPicker({ barcode, hint = '', onPick }) {
  const { t } = useTranslation();
  const [list, setList] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let gone = false;
    loadProductList().then((l) => { if (!gone) setList(l); });
    return () => { gone = true; };
  }, []);

  const brands = useMemo(() => (list && barcode ? list.brandsOfBarcode(barcode) : []), [list, barcode]);
  const suggestions = useMemo(() => (list && brands.length ? list.productsOfBrands(brands, hint, 12) : []), [list, brands, hint]);
  const results = useMemo(() => (list && query.trim().length >= 3 ? list.search(query, 12) : null), [list, query]);

  if (!list) return null;
  const shown = results || suggestions;

  return (
    <section className="mb-5" aria-label={t('addStock.pickTitle')}>
      <h3 className="field-label !mb-1">{t('addStock.pickTitle')}</h3>
      {brands.length > 0 && !results && (
        <p className="text-sm text-[var(--text-secondary)] mb-2">{t('addStock.pickBrands', { brands: brands.slice(0, 3).join(', ') })}</p>
      )}
      <input
        type="search" className="form-input mb-2" value={query} onChange={(e) => setQuery(e.target.value)}
        placeholder={t('addStock.pickSearch', { count: list.size.toLocaleString('en-IN') })} aria-label={t('addStock.pickSearch', { count: list.size.toLocaleString('en-IN') })}
      />
      {shown.length > 0 ? (
        <ul className="max-h-72 overflow-y-auto divide-y divide-[var(--border)] rounded-xl border border-[var(--border)]">
          {shown.map((p) => (
            <li key={`${p.barcode}|${p.name}`}>
              <button type="button" className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--surface-2)]" onClick={() => onPick(p)}>
                {p.image ? <img src={p.image} alt="" loading="lazy" className="w-10 h-10 rounded-lg object-contain bg-white shrink-0" /> : <span className="w-10 h-10 rounded-lg bg-[var(--surface-2)] shrink-0" />}
                <span className="min-w-0 flex-1 text-sm leading-snug">{p.name}</span>
                <span className="font-mono text-sm shrink-0">{p.price > 0 ? inr(p.price) : '—'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        (results || brands.length > 0) && <p className="text-sm text-[var(--text-muted)]">{t('addStock.pickNone')}</p>
      )}
    </section>
  );
}
