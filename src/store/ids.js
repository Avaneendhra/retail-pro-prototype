// Ids made on a device. Each device of a shop has a number (1, 2, 3 …) written as
// letters (A, B, C …) in front of its counters, so two devices can never make the
// same bill, product or order id. Without an account there is no letter.

/** 1 → A, 26 → Z, 27 → AA. 0 (no account) → ''. */
export function deviceCode(no) {
  let code = '';
  for (let n = Math.floor(Number(no)) || 0; n > 0; n = Math.floor((n - 1) / 26)) {
    code = String.fromCharCode(65 + ((n - 1) % 26)) + code;
  }
  return code;
}

export const billNo = (code, n) => `${code}${n}`;
export const billId = (code, n) => `B${code}${n}`;
export const productId = (code, n) => `P${code}${n}`;
export const poNo = (code, n) => `${code}${n}`;
export const poId = (code, n) => `PO${code}${n}`;
