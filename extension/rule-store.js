export const RULE_TTL = 30 * 24 * 60 * 60 * 1000;
export function normalizeRules(input, now = Date.now()) {
  if (!Array.isArray(input)) return [];
  const result = new Map();
  for (const rule of input.slice(-200)) {
    if (!rule || typeof rule.key !== 'string' || rule.key.length > 2000 || typeof rule.selector !== 'string' || rule.selector.length > 300) continue;
    // Only a single escaped ID, never arbitrary selectors or executable code.
    if (!/^#(?:[\w-]|\\.)+$/.test(rule.selector) || !Number.isFinite(rule.updatedAt) || rule.updatedAt > now || now - rule.updatedAt > RULE_TTL) continue;
    result.set(rule.key, { key: rule.key, selector: rule.selector, updatedAt: rule.updatedAt });
  }
  return [...result.values()].slice(-50);
}

export function ruleScope(sender) {
  try {
    const url = new URL(sender?.url);
    return /^https?:$/.test(url.protocol) ? `formRules:${url.origin}` : null;
  } catch { return null; }
}
