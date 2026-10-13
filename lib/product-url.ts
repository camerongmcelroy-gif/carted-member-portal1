export type RetailerId = "amazon" | "walmart" | "pokemon-center";

const allowedDomains: Record<RetailerId, string[]> = {
  amazon: ["amazon.ca", "amzn.to"],
  walmart: ["walmart.ca"],
  "pokemon-center": ["pokemoncenter.com", "pokemoncenter.ca"],
};

export function validateRetailerProductUrl(value: string, retailer: RetailerId): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid retailer product link");
  }
  const allowed = allowedDomains[retailer].some(domain =>
    url.hostname === domain || url.hostname.endsWith(`.${domain}`),
  );
  if (url.protocol !== "https:" || !allowed) {
    throw new Error("Use a secure product link from the selected retailer");
  }
  return url.toString();
}
