// Identifies a retail product from a photo with Claude vision.
// Uses the shopkeeper's own API key, stored only in this browser.

const CATEGORIES = ['dairy', 'bakery', 'snacks', 'grocery', 'beverages', 'personal', 'household', 'other'];

const SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string', description: 'Product name as a shopkeeper would say it: brand + product + pack size, e.g. "Amul Butter 100g". Empty if no product is visible.' },
    brand: { type: 'string', description: 'Brand name, or empty string' },
    size: { type: 'string', description: 'Pack size/quantity as printed, e.g. "500 ml", "1 kg", or empty string' },
    category: { type: 'string', enum: CATEGORIES },
    mrp: { type: 'number', description: 'MRP / printed price in rupees, or 0 if not visible' },
    barcode: { type: 'string', description: 'Barcode digits if clearly readable, or empty string' },
    matched_product_id: { type: 'string', description: 'ID from the shop catalogue if this is clearly the same product (same brand and size), else empty string' },
  },
  required: ['name', 'brand', 'size', 'category', 'mrp', 'barcode', 'matched_product_id'],
  additionalProperties: false,
};

const SYSTEM = `You identify packaged retail products for a small Indian shop from a photo taken at the counter.
Read the packaging: brand, product name, pack size, and the printed MRP. Read barcode digits only if they are printed clearly.
Match to the shop catalogue only when it is clearly the same product and pack size.
If something is not visible, leave it empty (or 0 for MRP) instead of guessing.`;

export async function identifyWithClaude({ apiKey, dataUrl, products }) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true });
  const [meta, data] = dataUrl.split(',');
  const mediaType = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
  const catalogue = products.map(p => `${p.id} | ${p.name} | ${p.barcode}`).join('\n');

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
          { type: 'text', text: `Shop catalogue (ID | name | barcode):\n${catalogue}\n\nIdentify this product.` },
        ],
      }],
    });
    if (response.stop_reason === 'refusal') throw new Error('request declined');
    if (response.stop_reason === 'max_tokens') throw new Error('response was cut off');
    const text = response.content.find(b => b.type === 'text')?.text;
    if (!text) throw new Error('empty response');
    const out = JSON.parse(text);
    return {
      name: out.name || '', brand: out.brand || '', size: out.size || '',
      category: CATEGORIES.includes(out.category) ? out.category : 'other',
      mrp: Math.round(out.mrp) || 0, barcode: (out.barcode || '').replace(/\D/g, ''),
      matchedId: products.some(p => p.id === out.matched_product_id) ? out.matched_product_id : '',
    };
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error('invalid API key');
    if (err instanceof Anthropic.PermissionDeniedError) throw new Error('key not allowed');
    if (err instanceof Anthropic.RateLimitError) throw new Error('rate limited, try again shortly');
    if (err instanceof Anthropic.BadRequestError) throw new Error(err.message?.slice(0, 120) || 'bad request');
    if (err instanceof Anthropic.APIConnectionError) throw new Error('no connection');
    if (err instanceof Anthropic.APIError) throw new Error(`API error ${err.status}`);
    throw err;
  }
}
