import React from 'react';
import { useTranslation } from 'react-i18next';
import { inr, pname, fmtDate, fmtTime } from '../../lib/format';
import { subtotalOf } from '../../lib/receipt';

/** The paper receipt. Hidden on screen; it is the only thing printed. */
export default function Receipt({ bill, shopName }) {
  const { t } = useTranslation();
  if (!bill) return null;
  return (
    <div className="print-area" aria-hidden="true">
      <h2>{shopName}</h2>
      <p>#{bill.billNo} · {fmtDate(bill.at)} {fmtTime(bill.at)}</p>
      <table>
        <tbody>
          {bill.items.map((item) => (
            <tr key={item.productId}><td>{pname(item)} × {item.qty}</td><td style={{ textAlign: 'right' }}>{inr(item.total)}</td></tr>
          ))}
        </tbody>
      </table>
      {bill.discount > 0 && (
        <>
          <p className="receipt-total"><span>{t('billing.subtotal')}</span><span>{inr(subtotalOf(bill))}</span></p>
          <p className="receipt-total"><span>{t('receipt.discount')}</span><span>−{inr(bill.discount)}</span></p>
        </>
      )}
      <p className="receipt-total"><span>{t('billing.grandTotal')}</span><span>{inr(bill.total)}</span></p>
      <p>{t(`billing.${bill.payment?.method || 'cash'}`)}</p>
      <p>{t('billing.receiptThanks')}</p>
    </div>
  );
}
