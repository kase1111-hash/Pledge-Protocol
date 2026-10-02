/**
 * Market prices for fiat and crypto currencies, from CoinGecko.
 *
 * Every price is the USD value of one unit. Fiat values are derived from
 * Bitcoin's price in each currency (USD per BTC / X per BTC). Prices are
 * cached; callers say how old a price they will accept, and get an error
 * rather than a made-up rate when none is available.
 *
 * PRICE_FEED_URL overrides the API base; COINGECKO_API_KEY is sent when set.
 */

import { requestUserUrl } from "../security/outbound";

export type PriceSource = () => Promise<Record<string, number>>;

/** CoinGecko IDs of the crypto currencies we price */
const COIN_IDS: Record<string, string> = {
  USDC: "usd-coin",
  USDT: "tether",
  ETH: "ethereum",
};

/** Fiat currencies priced through BTC */
const FIATS = ["USD", "EUR", "GBP", "JPY", "CNY", "KRW", "BRL", "CAD", "AUD", "CHF", "INR", "MXN"];

const REFRESH_MS = 5 * 60 * 1000;

export class PriceFeed {
  private prices: Record<string, number> = {};
  private fetchedAt = 0;
  private loading: Promise<void> | null = null;
  private source: PriceSource;

  constructor(source?: PriceSource) {
    this.source = source ?? coinGecko;
  }

  /** Replace where prices come from (tests, other providers) */
  useSource(source: PriceSource): void {
    this.source = source;
    this.prices = {};
    this.fetchedAt = 0;
  }

  /**
   * USD value of one unit of each currency, refreshed when older than five
   * minutes. Throws if prices cannot be had within maxAgeMs.
   */
  async usdPrices(maxAgeMs: number = REFRESH_MS): Promise<{ prices: Record<string, number>; fetchedAt: number }> {
    if (Date.now() - this.fetchedAt >= Math.min(maxAgeMs, REFRESH_MS)) {
      if (!this.loading) {
        this.loading = this.source()
          .then((prices) => {
            this.prices = { ...prices, USD: 1 };
            this.fetchedAt = Date.now();
          })
          .finally(() => {
            this.loading = null;
          });
      }
      try {
        await this.loading;
      } catch (error) {
        // An older price may still be acceptable to this caller
        if (Date.now() - this.fetchedAt >= maxAgeMs) {
          throw new Error(`Exchange rates are unavailable: ${(error as Error).message}`);
        }
      }
    }
    return { prices: this.prices, fetchedAt: this.fetchedAt };
  }

  /** How many units of `to` one unit of `from` buys */
  async rate(from: string, to: string, maxAgeMs?: number): Promise<{ rate: number; fetchedAt: number }> {
    if (from === to) return { rate: 1, fetchedAt: Date.now() };
    const { prices, fetchedAt } = await this.usdPrices(maxAgeMs);
    const fromUsd = prices[from];
    const toUsd = prices[to];
    if (!fromUsd || !toUsd) {
      throw new Error(`No price for ${!fromUsd ? from : to}`);
    }
    return { rate: fromUsd / toUsd, fetchedAt };
  }
}

async function coinGecko(): Promise<Record<string, number>> {
  const base = process.env.PRICE_FEED_URL || "https://api.coingecko.com/api/v3";
  const ids = ["bitcoin", ...Object.values(COIN_IDS)].join(",");
  const vs = FIATS.map((f) => f.toLowerCase()).join(",");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (process.env.COINGECKO_API_KEY) headers["x-cg-demo-api-key"] = process.env.COINGECKO_API_KEY;

  const response = await requestUserUrl(`${base}/simple/price?ids=${ids}&vs_currencies=${vs}`, {
    method: "GET",
    headers,
    timeoutMs: 10_000,
  });
  if (response.status !== 200) {
    throw new Error(`price API returned HTTP ${response.status}`);
  }
  const data = JSON.parse(response.body) as Record<string, Record<string, number>>;

  const prices: Record<string, number> = {};
  const btc = data.bitcoin ?? {};
  for (const fiat of FIATS) {
    const perBtc = btc[fiat.toLowerCase()];
    if (perBtc && btc.usd) prices[fiat] = btc.usd / perBtc;
  }
  for (const [code, id] of Object.entries(COIN_IDS)) {
    if (data[id]?.usd) prices[code] = data[id].usd;
  }
  return prices;
}

/** Process-wide price feed */
export const priceFeed = new PriceFeed();
