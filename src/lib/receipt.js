import { inr, pname, fmtDate, fmtTime } from './format';

/** The bill's items before any discount. */
export const subtotalOf = (bill) => bill.items.reduce((sum, item) => sum + item.total, 0);

/** A plain-text receipt, for sharing in a chat app. */
export function receiptText(bill, shopName, t) {
  const lines = [
    shopName,
    `${t('receipt.bill', { no: bill.billNo })} · ${fmtDate(bill.at)} ${fmtTime(bill.at)}`,
    '',
    ...bill.items.map((item) => `${pname(item)} × ${item.qty}  ${inr(item.total)}`),
    '',
  ];
  if (bill.discount) lines.push(`${t('receipt.discount')}: −${inr(bill.discount)}`);
  lines.push(`${t('receipt.total')}: ${inr(bill.total)} (${t(`billing.${bill.payment?.method || 'cash'}`)})`, '', t('billing.receiptThanks'));
  return lines.join('\n');
}

/** Opens WhatsApp with the text ready to send; the shopkeeper picks the contact. */
export const whatsappLink = (text) => `https://wa.me/?text=${encodeURIComponent(text)}`;
