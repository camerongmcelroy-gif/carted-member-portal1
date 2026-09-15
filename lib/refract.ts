export type DiscordWebhookPayload = {
  content?: unknown;
  username?: unknown;
  avatar_url?: unknown;
  embeds?: unknown;
  components?: unknown;
};

type EmbedField = { name?: unknown; value?: unknown };
type Embed = {
  title?: unknown;
  description?: unknown;
  timestamp?: unknown;
  fields?: unknown;
  image?: { url?: unknown };
  thumbnail?: { url?: unknown };
};

export type ParsedCheckout = {
  product: string;
  retailer: string;
  priceCents: number | null;
  quantity: number | null;
  imageUrl: string | null;
  checkoutEmail: string | null;
  orderReference: string | null;
  checkedOutAt: string;
  warning: boolean;
};

const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeImageUrl(value: unknown) {
  const candidate = text(value);
  if (!candidate || candidate.length > 2048) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function fieldMap(embed: Embed) {
  const map = new Map<string, string[]>();
  if (!Array.isArray(embed.fields)) return map;
  for (const raw of embed.fields as EmbedField[]) {
    const name = text(raw?.name).toLowerCase().replace(/[*_`]/g, "");
    const value = text(raw?.value);
    if (!name || !value) continue;
    map.set(name, [...(map.get(name) ?? []), value]);
  }
  return map;
}

function firstField(fields: Map<string, string[]>, ...names: string[]) {
  for (const name of names) {
    const value = fields.get(name)?.[0];
    if (value) return value;
  }
  return "";
}

function retailerName(title: string, fields: Map<string, string[]>) {
  const source = `${title} ${firstField(fields, "retailer", "store", "site")}`.toLowerCase();
  if (source.includes("walmart")) return "Walmart CA";
  if (source.includes("pokemon") || source.includes("pokémon")) return "Pokémon Center CA";
  if (source.includes("costco")) return "Costco CA";
  if (source.includes("amazon")) return "Amazon CA";
  return "Other";
}

function parsePrice(value: string) {
  const match = value.match(/(?:ca\$|cad\s*\$?|\$)\s*([0-9][0-9,]*(?:\.\d{1,2})?)/i);
  if (!match) return null;
  const amount = Number(match[1].replaceAll(",", ""));
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

function parseQuantity(value: string) {
  const amount = Number.parseInt(value.match(/\d+/)?.[0] ?? "", 10);
  return Number.isInteger(amount) && amount >= 1 && amount <= 100 ? amount : null;
}

function validDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? new Date().toISOString() : date.toISOString();
}

export function parseRefractPayload(payload: DiscordWebhookPayload): ParsedCheckout[] {
  if (!Array.isArray(payload.embeds)) return [];

  return (payload.embeds as Embed[]).flatMap((embed) => {
    const title = text(embed?.title);
    if (!/successful\s+checkout/i.test(title)) return [];

    const fields = fieldMap(embed);
    const product = firstField(fields, "product", "item", "product name");
    if (!product || product.length > 300) return [];

    const allValues = Array.from(fields.values()).flat().join("\n");
    const email = firstField(fields, "email", "account email").match(EMAIL)?.[0]
      ?? allValues.match(EMAIL)?.[0]
      ?? null;
    const warningText = `${text(embed.description)}\n${allValues}`.toLowerCase();
    const warning = [
      "could not confirm",
      "manually check",
      "manual check",
      "verification might be needed",
      "payment verification",
      "unavailable",
    ].some((phrase) => warningText.includes(phrase));

    return [{
      product,
      retailer: retailerName(title, fields),
      priceCents: parsePrice(firstField(fields, "price", "total")),
      quantity: parseQuantity(firstField(fields, "quantity", "qty")),
      imageUrl: safeImageUrl(embed.image?.url) ?? safeImageUrl(embed.thumbnail?.url),
      checkoutEmail: email?.toLowerCase() ?? null,
      orderReference: text(firstField(fields, "order number", "order id", "order")) || null,
      checkedOutAt: validDate(text(embed.timestamp)),
      warning,
    }];
  });
}
