// Reads a supplier invoice image with Claude vision.
// The shopkeeper's own API key is used directly from the browser (it is
// stored only in this browser's localStorage, never sent anywhere else).

const SCHEMA = {
  type: 'object',
  properties: {
    supplier: { type: 'string', description: 'Supplier / distributor name printed on the invoice, or empty string' },
    invoice_number: { type: 'string', description: 'Invoice or bill number, or empty string' },
    date: { type: 'string', description: 'Invoice date as printed, or empty string' },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Item name exactly as printed' },
          quantity: { type: 'number', description: 'Quantity received (units, not amount)' },
          unit_price: { type: 'number', description: 'Purchase rate per unit, or 0 if not printed' },
          matched_product_id: { type: 'string', description: 'ID from the shop catalogue that this item is, or empty string if none fits' },
        },
        required: ['name', 'quantity', 'unit_price', 'matched_product_id'],
        additionalProperties: false,
      },
    },
  },
  required: ['supplier', 'invoice_number', 'date', 'items'],
  additionalProperties: false,
};

const SYSTEM = `You read photos of supplier invoices for a small Indian retail shop.
Extract the supplier name, invoice number, date and every purchased item line.
For each item give the quantity of units received (not the line amount) and the per-unit rate.
Match each item to the shop catalogue when it is clearly the same product (brand and size may be written differently); otherwise leave matched_product_id empty.
Skip totals, taxes, discounts and headers. If something is unreadable, leave that field empty rather than guessing.`;

export async function extractWithClaude({ apiKey, dataUrl, products }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });

  const [meta, data] = dataUrl.split(',');
  const mediaType = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const catalogue = products.map(p => `${p.id} | ${p.name} | code ${p.code}`).join('\n');

  try {
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: { type: 'json_schema', schema: SCHEMA } },
      system: SYSTEM,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data } },
          { type: 'text', text: `Shop catalogue (ID | name | short code):\n${catalogue}\n\nExtract this invoice.` },
        ],
      }],
    });

    if (response.stop_reason === 'refusal') throw new Error('request declined');
    if (response.stop_reason === 'max_tokens') throw new Error('response was cut off');
    const text = response.content.find(b => b.type === 'text')?.text;
    if (!text) throw new Error('empty response');
    const out = JSON.parse(text);
    return {
      supplier: out.supplier || '',
      invoiceNo: out.invoice_number || '',
      date: out.date || '',
      items: (out.items || []).map(i => ({
        raw: i.name, name: i.name, qty: Math.round(i.quantity) || 0, unitPrice: i.unit_price || 0,
        matchedId: products.some(p => p.id === i.matched_product_id) ? i.matched_product_id : '',
      })),
    };
  } catch (err) {
    // Typed SDK errors -> short readable reasons for the UI
    if (err instanceof Anthropic.AuthenticationError) throw new Error('invalid API key');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('key not allowed');
    if (err instanceof Anthropic.RateLimitError) throw new Error('rate limited, try again shortly');
    if (err instanceof Anthropic.BadRequestError) throw new Error(err.message?.slice(0, 120) || 'bad request');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('no connection');
    if (err instanceof Anthropic.APIError) throw new Error(`API error ${err.status}`);
    throw err;
  }
}
