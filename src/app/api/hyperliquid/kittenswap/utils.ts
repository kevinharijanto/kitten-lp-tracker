export interface KittenswapPosition {
  poolName: string;
  totalValueUsd: number;
  sharePercent?: number;
  tokenAmounts: Record<string, number>;
  accruedFeesUsd?: number;
  lastUpdated?: string;
}

type AnyRecord = Record<string, unknown>;

const LOWER_KITTEN = "kitten";

const numberCandidates = [
  "usdValue",
  "valueUsd",
  "lpTokenValue",
  "tokenValueUsd",
  "totalValueUsd",
  "positionValueUsd",
  "totalUsd",
  "value",
];

const shareCandidates = [
  "share",
  "sharePercent",
  "sharePct",
  "ownership",
  "ownershipPct",
  "poolShare",
  "percentShare",
  "lpShare",
];

const feeCandidates = [
  "feesUsd",
  "accruedFeesUsd",
  "pendingFeesUsd",
  "unclaimedFeesUsd",
  "claimableFeesUsd",
];

const timeCandidates = [
  "timestamp",
  "lastUpdated",
  "updatedAt",
  "time",
  "blockTimestamp",
  "blockTime",
];

const poolNameCandidates = [
  "poolName",
  "name",
  "pool",
  "market",
  "pair",
  "symbol",
  "marketName",
  "amm",
  "dex",
  "venue",
];

const tokenArrayCandidates = [
  "assets",
  "amounts",
  "tokenAmounts",
  "tokens",
  "assetAmounts",
  "balances",
  "positions",
];

const baseAmountCandidates = [
  "baseAmount",
  "baseBalance",
  "baseQty",
  "base",
  "baseSize",
  "amountBase",
];

const quoteAmountCandidates = [
  "quoteAmount",
  "quoteBalance",
  "quoteQty",
  "quote",
  "quoteSize",
  "amountQuote",
];

const baseSymbolCandidates = [
  "baseSymbol",
  "base",
  "baseAsset",
  "token0",
  "coin0",
  "baseTicker",
  "tokenBase",
  "baseCoin",
];

const quoteSymbolCandidates = [
  "quoteSymbol",
  "quote",
  "quoteAsset",
  "token1",
  "coin1",
  "quoteTicker",
  "tokenQuote",
  "quoteCoin",
];

const nestedPoolCandidates = ["pool", "poolInfo", "amm", "marketInfo", "pairInfo"];

const nestedSourceCandidates = ["source", "dex", "protocol", "venue", "amm", "market"];

const nestedSymbolCandidates = [
  "name",
  "symbol",
  "pair",
  "displayName",
  "poolName",
  "marketName",
];

function isRecord(value: unknown): value is AnyRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (!Number.isNaN(num)) {
      return num;
    }
  }
  return undefined;
}

function parseTimestamp(value: unknown): string | undefined {
  const numeric = parseNumber(value);
  if (numeric !== undefined) {
    // Values could be seconds or milliseconds; treat <= 10 digits as seconds.
    const date = new Date(numeric < 1e12 ? numeric * 1000 : numeric);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }
  if (typeof value === "string" && value.trim() !== "") {
    const date = new Date(value);
    if (!Number.isNaN(date.valueOf())) {
      return date.toISOString();
    }
  }
  return undefined;
}

function normaliseSymbol(symbol: string | undefined): string | undefined {
  if (!symbol) return undefined;
  return symbol.toUpperCase().replace(/[^A-Z0-9_]/g, "");
}

function valueContainsKitten(value: unknown): boolean {
  if (typeof value === "string") {
    return value.toLowerCase().includes(LOWER_KITTEN);
  }
  if (Array.isArray(value)) {
    return value.some((item) => valueContainsKitten(item));
  }
  if (isRecord(value)) {
    return Object.values(value).some((val) => valueContainsKitten(val));
  }
  return false;
}

function isKittenswapPosition(record: AnyRecord): boolean {
  for (const key of [...poolNameCandidates, ...nestedSourceCandidates]) {
    const value = record[key];
    if (valueContainsKitten(value)) {
      return true;
    }
  }

  for (const key of nestedPoolCandidates) {
    const nested = record[key];
    if (valueContainsKitten(nested)) {
      return true;
    }
  }

  // Fallback: check every value for the keyword.
  return Object.values(record).some((value) => valueContainsKitten(value));
}

function extractPoolName(record: AnyRecord): string {
  for (const key of poolNameCandidates) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  for (const candidate of nestedPoolCandidates) {
    const nested = record[candidate];
    if (isRecord(nested)) {
      for (const key of [...poolNameCandidates, ...nestedSymbolCandidates]) {
        const nestedValue = nested[key];
        if (typeof nestedValue === "string" && nestedValue.trim()) {
          return nestedValue.trim();
        }
      }

      const base = findFirstString(nested, baseSymbolCandidates);
      const quote = findFirstString(nested, quoteSymbolCandidates);
      if (base && quote) {
        return `${base}-${quote}`;
      }
    }
  }

  const base = findFirstString(record, baseSymbolCandidates);
  const quote = findFirstString(record, quoteSymbolCandidates);
  if (base && quote) {
    return `${base}-${quote}`;
  }

  return "Unknown Pool";
}

function findFirstString(record: AnyRecord, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function extractNumberFrom(record: AnyRecord, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];
    const parsed = parseNumber(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

function extractTimestamp(record: AnyRecord): string | undefined {
  for (const key of timeCandidates) {
    const value = record[key];
    const parsed = parseTimestamp(value);
    if (parsed) {
      return parsed;
    }
  }

  for (const candidate of nestedPoolCandidates) {
    const nested = record[candidate];
    if (isRecord(nested)) {
      for (const key of timeCandidates) {
        const value = nested[key];
        const parsed = parseTimestamp(value);
        if (parsed) {
          return parsed;
        }
      }
    }
  }

  return undefined;
}

function collectTokenAmounts(record: AnyRecord): Record<string, number> {
  const tokens: Record<string, number> = {};
  const addToken = (symbol: string | undefined, value: unknown) => {
    const normalised = normaliseSymbol(symbol);
    const amount = parseNumber(value);
    if (!normalised || amount === undefined) return;
    tokens[normalised] = (tokens[normalised] || 0) + amount;
  };

  for (const key of tokenArrayCandidates) {
    const candidate = record[key];
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (!isRecord(entry)) continue;
        const symbol =
          entry.symbol ??
          entry.token ??
          entry.coin ??
          entry.asset ??
          entry.name ??
          entry.ticker ??
          entry.currency;
        const amount =
          entry.amount ??
          entry.balance ??
          entry.size ??
          entry.quantity ??
          entry.value ??
          entry.usd;
        addToken(typeof symbol === "string" ? symbol : undefined, amount);
      }
    } else if (isRecord(candidate)) {
      for (const [symbol, amount] of Object.entries(candidate)) {
        addToken(symbol, amount);
      }
    }
  }

  const baseSymbol = findFirstString(record, baseSymbolCandidates);
  const baseAmount = extractNumberFrom(record, baseAmountCandidates);
  if (baseSymbol && baseAmount !== undefined) {
    addToken(baseSymbol, baseAmount);
  }

  const quoteSymbol = findFirstString(record, quoteSymbolCandidates);
  const quoteAmount = extractNumberFrom(record, quoteAmountCandidates);
  if (quoteSymbol && quoteAmount !== undefined) {
    addToken(quoteSymbol, quoteAmount);
  }

  return tokens;
}

function findLpPositions(payload: unknown): unknown[] {
  const visited = new Set<unknown>();
  const queue: unknown[] = [payload];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray((current as AnyRecord).lpPositions)) {
      return (current as AnyRecord).lpPositions as unknown[];
    }

    if (isRecord(current)) {
      for (const value of Object.values(current)) {
        if (typeof value === "object" && value !== null) {
          queue.push(value);
        }
      }
    }
  }

  return [];
}

export function extractKittenswapPositions(payload: unknown): KittenswapPosition[] {
  const rawPositions = findLpPositions(payload).filter(isRecord);

  const kittenswapPositions = rawPositions.filter((record) =>
    isKittenswapPosition(record as AnyRecord)
  );

  return kittenswapPositions.map((record) => {
    const totalValue =
      extractNumberFrom(record as AnyRecord, numberCandidates) ?? 0;
    const sharePercent = extractNumberFrom(record as AnyRecord, shareCandidates);
    const accruedFees = extractNumberFrom(record as AnyRecord, feeCandidates);
    const lastUpdated = extractTimestamp(record as AnyRecord);
    const tokenAmounts = collectTokenAmounts(record as AnyRecord);

    return {
      poolName: extractPoolName(record as AnyRecord),
      totalValueUsd: totalValue,
      sharePercent: sharePercent,
      accruedFeesUsd: accruedFees,
      tokenAmounts,
      lastUpdated,
    };
  });
}

export function isValidWalletAddress(address: unknown): address is string {
  return typeof address === "string" && address.trim().length > 0;
}

