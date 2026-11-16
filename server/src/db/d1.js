// Cloudflare D1 adapter. D1 has no interactive transactions; batch() is atomic,
// which is why all server writes are expressed as guarded statement lists.

const bindable = (args = []) =>
  args.map(a => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));

export function d1Db(d1) {
  const prepare = ({ sql, args }) => d1.prepare(sql).bind(...bindable(args));
  return {
    async batch(statements) {
      if (!statements.length) return [];
      const results = await d1.batch(statements.map(prepare));
      return results.map(r => ({ rows: r.results ?? [], changes: r.meta?.changes ?? 0 }));
    },
    async query(sql, args) {
      const result = await prepare({ sql, args }).all();
      return result.results ?? [];
    },
  };
}
