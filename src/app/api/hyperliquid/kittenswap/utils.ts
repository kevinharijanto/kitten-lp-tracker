import { keccak_256 } from "@noble/hashes/sha3";
import { utf8ToBytes } from "@noble/hashes/utils";

export type Address = `0x${string}`;
export type Hex = `0x${string}`;

export interface KittenswapPosition {
  poolName: string;
  totalValueUsd: number;
  sharePercent?: number;
  tokenAmounts: Record<string, number>;
  accruedFeesUsd?: number;
  accruedFeesTokens: Record<string, number>;
  rewardKitten?: number;
  rewardKittenUsd?: number;
  priceLower?: number;
  priceUpper?: number;
  priceCurrent?: number;
  tickLower?: number;
  tickUpper?: number;
  inRange: boolean;
  isActive: boolean;
  lastUpdated?: string;
}

export interface AttemptLog {
  step: string;
  success: boolean;
  details?: string;
  error?: string;
}

const RPC_URL = process.env.HYPEREVM_RPC || "https://rpc.hyperliquid.xyz/evm";

const NONFUNGIBLE_POSITION_MANAGER: Address = "0x9ea4459c8DefBF561495d95414b9CF1E2242a3E2";
const ALGEBRA_FACTORY: Address = "0x5f95E92c338e6453111Fc55ee66D4AafccE661A7";
const FARMING_CENTER: Address = "0x211BD8917d433B7cC1F4497AbA906554Ab6ee479";

const START_BLOCK = BigInt(process.env.START_BLOCK || "0");
const CHUNK_SPAN = BigInt(process.env.CHUNK_SPAN || "800");

const TRANSFER_TOPIC: Hex =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const MAX_U128 = (1n << 128n) - 1n;

const SELECTORS = {
  balanceOf: methodSelector("balanceOf(address)"),
  tokenOfOwnerByIndex: methodSelector("tokenOfOwnerByIndex(address,uint256)"),
  positions: methodSelector("positions(uint256)"),
  globalState: methodSelector("globalState()"),
  decimals: methodSelector("decimals()"),
  symbol: methodSelector("symbol()"),
  poolByPair: methodSelector("poolByPair(address,address)"),
  deposits: methodSelector("deposits(uint256)"),
};

function methodSelector(signature: string) {
  return Buffer.from(keccak_256(utf8ToBytes(signature))).toString("hex").slice(0, 8);
}

function padHex(value: string, length = 64) {
  return value.padStart(length, "0");
}

function encodeAddress(address: Address) {
  return padHex(address.toLowerCase().replace(/^0x/, ""));
}

function encodeUint(value: bigint) {
  return padHex(value.toString(16));
}

function hexToBigInt(hex: string) {
  return hex ? BigInt(`0x${hex}`) : 0n;
}

function hexToAddress(word: string): Address {
  return (`0x${word.slice(-40)}` as Address).toLowerCase() as Address;
}

function hexToSigned(word: string, bits: number) {
  const mask = (1n << BigInt(bits)) - 1n;
  const raw = BigInt(`0x${word}`) & mask;
  const signBit = 1n << (BigInt(bits) - 1n);
  const signed = raw & signBit ? raw - (mask + 1n) : raw;
  return Number(signed);
}

function chunkWords(data: Hex) {
  const hex = data.replace(/^0x/, "");
  const words: string[] = [];
  for (let i = 0; i < hex.length; i += 64) {
    words.push(hex.slice(i, i + 64).padEnd(64, "0"));
  }
  return words;
}

function decodeString(data: Hex) {
  const hex = data.replace(/^0x/, "");
  if (!hex) return "";
  const offset = Number(hexToBigInt(hex.slice(0, 64)));
  const length = Number(hexToBigInt(hex.slice(offset * 2, offset * 2 + 64)));
  const start = offset * 2 + 64;
  const end = start + length * 2;
  const slice = hex.slice(start, end);
  return Buffer.from(slice, "hex").toString("utf8").replace(/\u0000+$/g, "");
}

async function rpcCall(method: string, params: unknown[]) {
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });

  if (!response.ok) {
    throw new Error(`RPC ${method} failed with status ${response.status}`);
  }

  const payload = await response.json();
  if (payload.error) {
    throw new Error(payload.error.message || `RPC ${method} error`);
  }

  return payload.result;
}

async function ethCall(address: Address, data: Hex) {
  return (await rpcCall("eth_call", [
    { to: address, data },
    "latest",
  ])) as Hex;
}

async function getBlockNumber() {
  const result = (await rpcCall("eth_blockNumber", [])) as Hex;
  return BigInt(result);
}

async function getLogs(address: Address, fromBlock: bigint, toBlock: bigint, topics: (Hex | null)[]) {
  return (await rpcCall("eth_getLogs", [
    {
      address,
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${toBlock.toString(16)}`,
      topics,
    },
  ])) as { topics: Hex[] }[];
}

async function readBalanceOf(wallet: Address) {
  const data = `0x${SELECTORS.balanceOf}${encodeAddress(wallet)}` as Hex;
  const response = await ethCall(NONFUNGIBLE_POSITION_MANAGER, data);
  return hexToBigInt(response.replace(/^0x/, ""));
}

async function readTokenOfOwnerByIndex(wallet: Address, index: bigint) {
  const data =
    `0x${SELECTORS.tokenOfOwnerByIndex}${encodeAddress(wallet)}${encodeUint(index)}` as Hex;
  const response = await ethCall(NONFUNGIBLE_POSITION_MANAGER, data);
  return hexToBigInt(response.replace(/^0x/, ""));
}

async function readPositions(tokenId: bigint) {
  const data = `0x${SELECTORS.positions}${encodeUint(tokenId)}` as Hex;
  const response = await ethCall(NONFUNGIBLE_POSITION_MANAGER, data);
  const words = chunkWords(response);

  const base = {
    token0: hexToAddress(words[2]),
    token1: hexToAddress(words[3]),
    tickLower: hexToSigned(words[4], 24),
    tickUpper: hexToSigned(words[5], 24),
    liquidity: hexToBigInt(words[6]),
    owed0: hexToBigInt(words[9] ?? "0"),
    owed1: hexToBigInt(words[10] ?? "0"),
  };

  // Some variants include pool at index 4.
  if (!plausible(base.tickLower, base.tickUpper, base.liquidity) && words.length >= 12) {
    return {
      token0: hexToAddress(words[2]),
      token1: hexToAddress(words[3]),
      tickLower: hexToSigned(words[5], 24),
      tickUpper: hexToSigned(words[6], 24),
      liquidity: hexToBigInt(words[7]),
      owed0: hexToBigInt(words[10] ?? "0"),
      owed1: hexToBigInt(words[11] ?? "0"),
    };
  }

  return base;
}

async function readGlobalState(pool: Address) {
  const data = `0x${SELECTORS.globalState}` as Hex;
  const response = await ethCall(pool, data);
  const words = chunkWords(response);
  const tick = hexToSigned(words[1], 24);
  return { currentTick: tick };
}

async function readDecimals(token: Address) {
  const data = `0x${SELECTORS.decimals}` as Hex;
  const response = await ethCall(token, data);
  return Number(hexToBigInt(response.replace(/^0x/, "")));
}

async function readSymbol(token: Address) {
  const data = `0x${SELECTORS.symbol}` as Hex;
  const response = await ethCall(token, data);
  const raw = response.replace(/^0x/, "");
  if (raw.length <= 64) {
    const buffer = Buffer.from(raw.slice(-64), "hex");
    const text = buffer.toString("utf8").replace(/\u0000+$/g, "");
    return text || "TKN";
  }
  const decoded = decodeString(response);
  return decoded || "TKN";
}

async function readPoolByPair(token0: Address, token1: Address) {
  const data =
    `0x${SELECTORS.poolByPair}${encodeAddress(token0)}${encodeAddress(token1)}` as Hex;
  const response = await ethCall(ALGEBRA_FACTORY, data);
  const decoded = hexToAddress(response.replace(/^0x/, ""));
  if (decoded === "0x0000000000000000000000000000000000000000") {
    throw new Error("Pool address not found for token pair");
  }
  return decoded;
}

async function readDepositPool(tokenId: bigint) {
  const data = `0x${SELECTORS.deposits}${encodeUint(tokenId)}` as Hex;
  try {
    const response = await ethCall(FARMING_CENTER, data);
    const words = chunkWords(response);
    return hexToAddress(words[3]);
  } catch {
    return undefined;
  }
}

function toTopicAddress(address: Address): Hex {
  return (`0x${padHex(address.toLowerCase().replace(/^0x/, ""), 64)}` as Hex).toLowerCase() as Hex;
}

function plausible(tickLower: number, tickUpper: number, liquidity: bigint) {
  const abs = (n: number) => (n < 0 ? -n : n);
  return abs(tickLower) < 3_000_000 && abs(tickUpper) < 3_000_000 && liquidity > 0n && liquidity <= MAX_U128;
}

function tickToPrice(tick: number) {
  return Math.pow(1.0001, tick);
}

function tickToSqrtPrice(tick: number) {
  return Math.sqrt(tickToPrice(tick));
}

function amountsFromLiquidity(liquidity: bigint, currentTick: number, tickLower: number, tickUpper: number) {
  let sqrtP = tickToSqrtPrice(currentTick);
  let sqrtA = tickToSqrtPrice(tickLower);
  let sqrtB = tickToSqrtPrice(tickUpper);
  if (sqrtA > sqrtB) [sqrtA, sqrtB] = [sqrtB, sqrtA];

  if (!Number.isFinite(sqrtP) || sqrtP <= 0) {
    sqrtP = (sqrtA + sqrtB) / 2;
  }

  const L = Number(liquidity);
  if (!Number.isFinite(L) || L <= 0) {
    return { amount0: 0, amount1: 0 };
  }

  if (sqrtP <= sqrtA) {
    return { amount0: L * ((sqrtB - sqrtA) / (sqrtA * sqrtB)), amount1: 0 };
  }

  if (sqrtP >= sqrtB) {
    return { amount0: 0, amount1: L * (sqrtB - sqrtA) };
  }

  return {
    amount0: L * ((sqrtB - sqrtP) / (sqrtP * sqrtB)),
    amount1: L * (sqrtP - sqrtA),
  };
}

function isStable(symbol: string) {
  const upper = symbol.toUpperCase();
  return ["USD", "USDT", "USDC", "DAI", "USDE"].some((needle) => upper.includes(needle));
}

function clampPrecision(value: number) {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  if (abs >= 1e9) {
    return Number(value.toExponential(4));
  }
  return Number(value.toFixed(6));
}

async function tryEnumerableTokenIds(wallet: Address) {
  try {
    const balance = await readBalanceOf(wallet);
    const ids: number[] = [];
    for (let i = 0n; i < balance; i++) {
      const tokenId = await readTokenOfOwnerByIndex(wallet, i);
      ids.push(Number(tokenId));
    }
    return ids;
  } catch {
    return [];
  }
}

async function scanTransferLogsForIds(wallet: Address) {
  const ids = new Set<number>();
  const latest = await getBlockNumber();
  const toTopics: (Hex | null)[] = [TRANSFER_TOPIC, null, toTopicAddress(wallet)];
  const fromTopics: (Hex | null)[] = [TRANSFER_TOPIC, toTopicAddress(wallet), null];

  for (const topics of [toTopics, fromTopics]) {
    let from = START_BLOCK;
    while (from <= latest) {
      const to = from + CHUNK_SPAN > latest ? latest : from + CHUNK_SPAN;
      try {
        const logs = await getLogs(NONFUNGIBLE_POSITION_MANAGER, from, to, topics);
        for (const log of logs) {
          const topic = log.topics?.[3];
          if (topic) {
            ids.add(Number(BigInt(topic)));
          }
        }
      } catch {
        const mid = from + CHUNK_SPAN / 2n;
        try {
          const first = await getLogs(NONFUNGIBLE_POSITION_MANAGER, from, mid, topics);
          const second = await getLogs(NONFUNGIBLE_POSITION_MANAGER, mid + 1n, to, topics);
          for (const log of [...first, ...second]) {
            const topic = log.topics?.[3];
            if (topic) ids.add(Number(BigInt(topic)));
          }
        } catch {
          // ignore and continue
        }
      }
      from = to + 1n;
    }
  }

  return [...ids].sort((a, b) => a - b);
}

async function resolveOwnedTokenIds(wallet: Address, attempts: AttemptLog[]) {
  const enumerationAttempt: AttemptLog = {
    step: "enumerate-token-ids",
    success: false,
    details: "Attempting ERC-721 enumeration",
  };

  const viaEnum = await tryEnumerableTokenIds(wallet);
  if (viaEnum.length > 0) {
    enumerationAttempt.success = true;
    enumerationAttempt.details = `Found ${viaEnum.length} tokenIds via enumeration`;
    attempts.push(enumerationAttempt);
    return viaEnum;
  }

  enumerationAttempt.details = "Enumeration failed, falling back to log scan";
  attempts.push(enumerationAttempt);

  const scanAttempt: AttemptLog = {
    step: "scan-transfer-logs",
    success: false,
    details: `Scanning transfer logs with span ${CHUNK_SPAN}`,
  };

  const viaLogs = await scanTransferLogsForIds(wallet);
  if (viaLogs.length > 0) {
    scanAttempt.success = true;
    scanAttempt.details = `Recovered ${viaLogs.length} tokenIds from logs`;
  } else {
    scanAttempt.error = "No tokenIds recovered from logs";
  }
  attempts.push(scanAttempt);

  return viaLogs;
}

async function resolvePoolAddress(token0: Address, token1: Address, tokenId: number) {
  const poolFromFarm = await readDepositPool(BigInt(tokenId));
  if (poolFromFarm) return poolFromFarm;
  return readPoolByPair(token0, token1);
}

function toKittenswapPosition(params: {
  symbol0: string;
  symbol1: string;
  decimals0: number;
  decimals1: number;
  amount0: number;
  amount1: number;
  owed0: bigint;
  owed1: bigint;
  tick: number;
  tickLower: number;
  tickUpper: number;
  liquidity: bigint;
  tokenId: number;
}) {
  const {
    symbol0,
    symbol1,
    decimals0,
    decimals1,
    amount0,
    amount1,
    owed0,
    owed1,
    tick,
    tickLower,
    tickUpper,
    liquidity,
    tokenId,
  } = params;
  const poolName = `${symbol0}/${symbol1} • #${tokenId}`;

  const symbol0Upper = symbol0.toUpperCase();
  const symbol1Upper = symbol1.toUpperCase();

  const sortedLower = Math.min(tickLower, tickUpper);
  const sortedUpper = Math.max(tickLower, tickUpper);

  const priceScale = Math.pow(10, decimals0 - decimals1);
  const safeScale = Number.isFinite(priceScale) && priceScale > 0 ? priceScale : 1;
  const priceNowRaw = tickToPrice(tick);
  const priceLowerRaw = tickToPrice(sortedLower);
  const priceUpperRaw = tickToPrice(sortedUpper);

  const priceCurrent = Number.isFinite(priceNowRaw * safeScale) ? priceNowRaw * safeScale : undefined;
  const priceLower = Number.isFinite(priceLowerRaw * safeScale) ? priceLowerRaw * safeScale : undefined;
  const priceUpper = Number.isFinite(priceUpperRaw * safeScale) ? priceUpperRaw * safeScale : undefined;

  const baseStable = isStable(symbol0Upper);
  const quoteStable = isStable(symbol1Upper);

  const owed0Human = Number(formatUnitsClamp(owed0, decimals0));
  const owed1Human = Number(formatUnitsClamp(owed1, decimals1));

  const token0ToUsd = baseStable
    ? (value: number) => value
    : quoteStable && priceCurrent && priceCurrent > 0
      ? (value: number) => value * priceCurrent
      : undefined;

  const token1ToUsd = quoteStable
    ? (value: number) => value
    : baseStable && priceCurrent && priceCurrent > 0
      ? (value: number) => value / priceCurrent
      : undefined;

  const totalValueParts: number[] = [];
  if (token0ToUsd) totalValueParts.push(token0ToUsd(amount0));
  if (token1ToUsd) totalValueParts.push(token1ToUsd(amount1));
  const totalValueUsd = totalValueParts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);

  const accruedUsdParts: number[] = [];
  if (token0ToUsd) accruedUsdParts.push(token0ToUsd(owed0Human));
  if (token1ToUsd) accruedUsdParts.push(token1ToUsd(owed1Human));
  const accruedFeesUsd =
    accruedUsdParts.length > 0
      ? accruedUsdParts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0)
      : undefined;

  let rewardKitten: number | undefined;
  let rewardKittenUsd: number | undefined;
  if (symbol0Upper.includes("KITTEN")) {
    rewardKitten = clampPrecision(owed0Human);
    if (token0ToUsd) {
      rewardKittenUsd = token0ToUsd(owed0Human);
    }
  } else if (symbol1Upper.includes("KITTEN")) {
    rewardKitten = clampPrecision(owed1Human);
    if (token1ToUsd) {
      rewardKittenUsd = token1ToUsd(owed1Human);
    }
  }

  if (rewardKittenUsd !== undefined && !Number.isFinite(rewardKittenUsd)) {
    rewardKittenUsd = undefined;
  }

  const accruedFeesTokens: Record<string, number> = {
    [symbol0Upper]: clampPrecision(owed0Human),
    [symbol1Upper]: clampPrecision(owed1Human),
  };

  return {
    poolName,
    totalValueUsd: Number.isFinite(totalValueUsd) && totalValueUsd > 0 ? totalValueUsd : 0,
    sharePercent: undefined,
    tokenAmounts: {
      [symbol0Upper]: clampPrecision(amount0),
      [symbol1Upper]: clampPrecision(amount1),
    },
    accruedFeesUsd,
    accruedFeesTokens,
    rewardKitten,
    rewardKittenUsd,
    priceLower,
    priceUpper,
    priceCurrent,
    tickLower: sortedLower,
    tickUpper: sortedUpper,
    inRange: tick >= sortedLower && tick <= sortedUpper,
    isActive: liquidity > 0n,
    lastUpdated: new Date().toISOString(),
  } satisfies KittenswapPosition;
}

function formatUnitsClamp(value: bigint, decimals: number) {
  const negative = value < 0n;
  const bigintValue = negative ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = bigintValue / base;
  const fraction = bigintValue % base;
  const fractionStr = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  const result = `${negative ? "-" : ""}${whole.toString()}${fractionStr ? `.${fractionStr}` : ""}`;
  return parseFloat(result);
}

async function resolvePosition(tokenId: number, attempts: AttemptLog[]) {
  const attempt: AttemptLog = { step: `decode-position-${tokenId}`, success: false };
  try {
    const position = await readPositions(BigInt(tokenId));
    const pool = await resolvePoolAddress(position.token0, position.token1, tokenId);
    const { currentTick } = await readGlobalState(pool);
    const [decimals0, decimals1] = await Promise.all([
      readDecimals(position.token0).catch(() => 18),
      readDecimals(position.token1).catch(() => 18),
    ]);
    const [symbol0, symbol1] = await Promise.all([
      readSymbol(position.token0).catch(() => "TKN"),
      readSymbol(position.token1).catch(() => "TKN"),
    ]);

    const { amount0, amount1 } = amountsFromLiquidity(
      position.liquidity,
      currentTick,
      Math.min(position.tickLower, position.tickUpper),
      Math.max(position.tickLower, position.tickUpper)
    );

    attempt.success = true;
    attempt.details = `${symbol0}/${symbol1} tokenId #${tokenId}`;
    attempts.push(attempt);

    return toKittenswapPosition({
      symbol0,
      symbol1,
      decimals0,
      decimals1,
      amount0,
      amount1,
      owed0: position.owed0,
      owed1: position.owed1,
      tick: currentTick,
      tickLower: Math.min(position.tickLower, position.tickUpper),
      tickUpper: Math.max(position.tickLower, position.tickUpper),
      liquidity: position.liquidity,
      tokenId,
    });
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempts.push(attempt);
    return null;
  }
}

export async function fetchOnchainKittenswapPositions(walletAddress: Address) {
  const attempts: AttemptLog[] = [];
  const tokenIds = await resolveOwnedTokenIds(walletAddress, attempts);

  if (tokenIds.length === 0) {
    attempts.push({
      step: "no-token-ids",
      success: false,
      error: `No KittenSwap LP NFTs found for ${walletAddress}`,
    });
    return { positions: [], attempts, source: `HyperEVM RPC ${RPC_URL}` };
  }

  const positions: KittenswapPosition[] = [];
  for (const tokenId of tokenIds) {
    const position = await resolvePosition(tokenId, attempts);
    if (position) {
      positions.push(position);
    }
  }

  if (positions.length === 0) {
    attempts.push({
      step: "positions-empty",
      success: false,
      error: "Unable to decode any KittenSwap positions",
    });
  }

  return { positions, attempts, source: `HyperEVM RPC ${RPC_URL}` };
}

export function isValidWalletAddress(address: unknown): address is Address {
  if (typeof address !== "string") {
    return false;
  }
  const trimmed = address.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(trimmed);
}
