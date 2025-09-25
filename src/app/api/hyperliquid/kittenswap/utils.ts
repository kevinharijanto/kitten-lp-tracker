"use server";

import { keccak_256 } from "@noble/hashes/sha3";
import { utf8ToBytes } from "@noble/hashes/utils";
import { request as httpRequest } from "http";
import { request as httpsRequest } from "https";
import { connect as tlsConnect } from "tls";

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

export interface FetchResultMeta {
  kittenUsd?: number; // USD0 per KITTEN
  totalKittenFees?: number; // tokens
  totalKittenFeesUsd?: number; // USD0
}

const RPC_URL = process.env.HYPEREVM_RPC || "https://rpc.hyperliquid.xyz/evm";

const PROXY_URL =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

const NO_PROXY = process.env.NO_PROXY || process.env.no_proxy;

// ---- Token addresses (set via env) ----
// Replace placeholders with actual HyperEVM addresses (lowercase 0x…)
const KITTEN_TOKEN = (process.env.KITTEN_TOKEN || "0x0000000000000000000000000000000000000000").toLowerCase() as Address;
const USD0_TOKEN = (process.env.USD0_TOKEN || "0x0000000000000000000000000000000000000000").toLowerCase() as Address;

function shouldBypassProxy(targetUrl: string) {
  if (!NO_PROXY) return false;
  try {
    const hostname = new URL(targetUrl).hostname.toLowerCase();
    const entries = NO_PROXY.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
    return entries.some((entry) => {
      if (entry === "*") return true;
      if (hostname === entry) return true;
      if (entry.startsWith(".")) return hostname.endsWith(entry);
      return hostname.endsWith(`.${entry}`);
    });
  } catch {
    return false;
  }
}

function performHttpRequest(target: URL, body: string, proxyUrl?: URL) {
  return new Promise<{ statusCode: number; body: string }>((resolve, reject) => {
    const headers = {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(body).toString(),
    };

    const isHttps = target.protocol === "https:";

    if (!proxyUrl || shouldBypassProxy(target.href)) {
      const requestFn = isHttps ? httpsRequest : httpRequest;
      const req = requestFn(
        {
          method: "POST",
          hostname: target.hostname,
          port: target.port ? Number(target.port) : isHttps ? 443 : 80,
          path: `${target.pathname}${target.search}`,
          headers,
        },
        (res) => {
          let data = "";
          res.setEncoding("utf8");
          res.on("data", (chunk) => {
            data += chunk;
          });
          res.on("end", () => {
            resolve({ statusCode: res.statusCode ?? 0, body: data });
          });
        }
      );
      req.on("error", reject);
      req.write(body);
      req.end();
      return;
    }

    const proxy = proxyUrl;

    if (isHttps) {
      const connectReq = httpRequest({
        host: proxy.hostname,
        port: proxy.port ? Number(proxy.port) : 80,
        method: "CONNECT",
        path: `${target.hostname}:${target.port ? Number(target.port) : 443}`,
        headers: {
          Host: `${target.hostname}:${target.port ? Number(target.port) : 443}`,
          "Proxy-Connection": "keep-alive",
        },
      });

      connectReq.once("connect", (res, socket) => {
        if (res.statusCode !== 200) {
          socket.destroy();
          reject(new Error(`Proxy CONNECT failed with status ${res.statusCode}`));
          return;
        }
        const tlsSocket = tlsConnect({ socket, servername: target.hostname });
        const req = httpsRequest(
          {
            method: "POST",
            host: target.hostname,
            port: target.port ? Number(target.port) : 443,
            path: `${target.pathname}${target.search}`,
            headers,
            createConnection: () => tlsSocket,
          },
          (res) => {
            let data = "";
            res.setEncoding("utf8");
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
          }
        );
        req.on("error", (error) => {
          tlsSocket.destroy();
          reject(error);
        });
        req.write(body);
        req.end();
      });

      connectReq.once("error", reject);
      connectReq.end();
      return;
    }

    const req = httpRequest(
      {
        method: "POST",
        host: proxy.hostname,
        port: proxy.port ? Number(proxy.port) : 80,
        path: target.href,
        headers: { ...headers, Host: target.host },
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => resolve({ statusCode: res.statusCode ?? 0, body: data }));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

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
  const target = new URL(RPC_URL);
  const proxy = PROXY_URL && !shouldBypassProxy(RPC_URL) ? new URL(PROXY_URL) : undefined;
  const body = JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params });

  const { statusCode, body: responseBody } = await performHttpRequest(target, body, proxy);
  if (statusCode < 200 || statusCode >= 300) {
    throw new Error(`RPC ${method} failed with status ${statusCode}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(responseBody);
  } catch (error) {
    throw new Error(`RPC ${method} returned invalid JSON: ${(error as Error).message}`);
  }

  if (!payload || typeof payload !== "object") {
    throw new Error(`RPC ${method} returned malformed payload`);
  }

  const typed = payload as { error?: { message?: string }; result?: unknown };
  if (typed.error) {
    throw new Error(typed.error.message || `RPC ${method} error`);
  }
  return typed.result;
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
  const data = `0x${SELECTORS.tokenOfOwnerByIndex}${encodeAddress(wallet)}${encodeUint(index)}` as Hex;
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
  const data = `0x${SELECTORS.poolByPair}${encodeAddress(token0)}${encodeAddress(token1)}` as Hex;
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

/* =========================
   Q96 / TickMath BigInt math
   ========================= */
const Q96 = 1n << 96n;

function mulDiv(a: bigint, b: bigint, denominator: bigint): bigint {
  if (denominator === 0n) throw new Error("mulDiv: division by zero");
  return (a * b) / denominator;
}

// Port of Uniswap V3 TickMath.getSqrtRatioAtTick
function getSqrtRatioAtTick(tick: number): bigint {
  let absTick = BigInt(tick < 0 ? -tick : tick);
  let ratio = (absTick & 0x1n) !== 0n ? 0xfffcb933bd6fad37aa2d162d1a594001n : 0x100000000000000000000000000000000n;
  if ((absTick & 0x2n)   !== 0n) ratio = mulDiv(ratio, 0xfff97272373d413259a46990580e213an, 0x100000000000000000000000000000000n);
  if ((absTick & 0x4n)   !== 0n) ratio = mulDiv(ratio, 0xfff2e50f5f656932ef12357cf3c7fdccn, 0x100000000000000000000000000000000n);
  if ((absTick & 0x8n)   !== 0n) ratio = mulDiv(ratio, 0xffe5caca7e10e4e61c3624eaa0941cd0n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x10n)  !== 0n) ratio = mulDiv(ratio, 0xffcb9843d60f6159c9db58835c926644n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x20n)  !== 0n) ratio = mulDiv(ratio, 0xff973b41fa98c081472e6896dfb254c0n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x40n)  !== 0n) ratio = mulDiv(ratio, 0xff2ea16466c96a3843ec78b326b52861n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x80n)  !== 0n) ratio = mulDiv(ratio, 0xfe5dee046a99a2a811c461f1969c3053n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x100n) !== 0n) ratio = mulDiv(ratio, 0xfcbe86c7900a88aedcffc83b479aa3a4n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x200n) !== 0n) ratio = mulDiv(ratio, 0xf987a7253ac413176f2b074cf7815e54n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x400n) !== 0n) ratio = mulDiv(ratio, 0xf3392b0822b70005940c7a398e4b70f3n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x800n) !== 0n) ratio = mulDiv(ratio, 0xe7159475a2c29b7443b29c7fa6e889d9n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x1000n)!== 0n) ratio = mulDiv(ratio, 0xd097f3bdfd2022b8845ad8f792aa5825n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x2000n)!== 0n) ratio = mulDiv(ratio, 0xa9f746462d870fdf8a65dc1f90e061e5n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x4000n)!== 0n) ratio = mulDiv(ratio, 0x70d869a156d2a1b890bb3df62baf32f7n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x8000n)!== 0n) ratio = mulDiv(ratio, 0x31be135f97d08fd981231505542fcfa6n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x10000n)!== 0n) ratio = mulDiv(ratio, 0x9aa508b5b7a84e1c677de54f3e99bc9n, 0x100000000000000000000000000000000n);
  if ((absTick & 0x20000n)!== 0n) ratio = mulDiv(ratio, 0x5d6af8dedb81196699c329225ee604n,  0x100000000000000000000000000000000n);
  if ((absTick & 0x40000n)!== 0n) ratio = mulDiv(ratio, 0x2216e584f5fa1ea926041bedfe98n,     0x100000000000000000000000000000000n);
  if ((absTick & 0x80000n)!== 0n) ratio = mulDiv(ratio, 0x48a170391f7dc42444e8fa2n,           0x100000000000000000000000000000000n);
  if (tick > 0) {
    const two256 = 1n << 256n;
    ratio = (two256 - 1n) / ratio;
  }
  const remainderMask = (1n << 32n) - 1n;
  return (ratio >> 32n) + ((ratio & remainderMask) === 0n ? 0n : 1n);
}

function getAmount0ForLiquidity(sqrtAX96: bigint, sqrtBX96: bigint, L: bigint): bigint {
  if (sqrtAX96 > sqrtBX96) [sqrtAX96, sqrtBX96] = [sqrtBX96, sqrtAX96];
  const numerator = L << 96n; // L * 2^96
  const delta = sqrtBX96 - sqrtAX96;
  const intermediate = mulDiv(sqrtAX96, sqrtBX96, Q96); // (sqrtA * sqrtB) / Q96
  return mulDiv(numerator, delta, intermediate);
}

function getAmount1ForLiquidity(sqrtAX96: bigint, sqrtBX96: bigint, L: bigint): bigint {
  if (sqrtAX96 > sqrtBX96) [sqrtAX96, sqrtBX96] = [sqrtBX96, sqrtAX96];
  const delta = sqrtBX96 - sqrtAX96;
  return mulDiv(L, delta, Q96);
}

function amountsFromLiquidityQ96(
  liquidity: bigint,
  currentTick: number,
  tickLower: number,
  tickUpper: number
): { amount0: bigint; amount1: bigint } {
  const sqrtP = getSqrtRatioAtTick(currentTick);
  const sqrtA = getSqrtRatioAtTick(Math.min(tickLower, tickUpper));
  const sqrtB = getSqrtRatioAtTick(Math.max(tickLower, tickUpper));

  if (sqrtP <= sqrtA) return { amount0: getAmount0ForLiquidity(sqrtA, sqrtB, liquidity), amount1: 0n };
  if (sqrtP < sqrtB)
    return {
      amount0: getAmount0ForLiquidity(sqrtP, sqrtB, liquidity),
      amount1: getAmount1ForLiquidity(sqrtA, sqrtP, liquidity),
    };
  return { amount0: 0n, amount1: getAmount1ForLiquidity(sqrtA, sqrtB, liquidity) };
}

/* ========================= */

function humanPriceToken1PerToken0(tick: number, decimals0: number, decimals1: number): number {
  const p = Math.pow(1.0001, tick); // token1/token0 in raw units
  const scale = Math.pow(10, decimals1 - decimals0); // NOTE: decimals1 - decimals0
  return p * scale;
}

function isStable(symbol: string) {
  const upper = symbol.toUpperCase();
  return ["USD", "USDT", "USDC", "DAI", "USDE", "USD∅", "USD0", "USDO"].some((n) => upper.includes(n));
}

function clampPrecision(value: number) {
  if (!Number.isFinite(value)) return 0;
  const abs = Math.abs(value);
  if (abs >= 1e9) return Number(value.toExponential(4));
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
          const topic = (log as any).topics?.[3] as Hex | undefined;
          if (topic) ids.add(Number(BigInt(topic)));
        }
      } catch {
        const mid = from + CHUNK_SPAN / 2n;
        try {
          const first = await getLogs(NONFUNGIBLE_POSITION_MANAGER, from, mid, topics);
          const second = await getLogs(NONFUNGIBLE_POSITION_MANAGER, mid + 1n, to, topics);
          for (const log of [...first, ...second]) {
            const topic = (log as any).topics?.[3] as Hex | undefined;
            if (topic) ids.add(Number(BigInt(topic)));
          }
        } catch {
          // ignore span
        }
      }
      from = to + 1n;
    }
  }
  return [...ids].sort((a, b) => a - b);
}

async function resolveOwnedTokenIds(wallet: Address, attempts: AttemptLog[]) {
  const enumerationAttempt: AttemptLog = { step: "enumerate-token-ids", success: false, details: "Attempting ERC-721 enumeration" };
  const viaEnum = await tryEnumerableTokenIds(wallet);
  if (viaEnum.length > 0) {
    enumerationAttempt.success = true;
    enumerationAttempt.details = `Found ${viaEnum.length} tokenIds via enumeration`;
    attempts.push(enumerationAttempt);
    return viaEnum;
  }
  enumerationAttempt.details = "Enumeration failed, falling back to log scan";
  attempts.push(enumerationAttempt);

  const scanAttempt: AttemptLog = { step: "scan-transfer-logs", success: false, details: `Scanning transfer logs with span ${CHUNK_SPAN}` };
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
    symbol0, symbol1, decimals0, decimals1, amount0, amount1, owed0, owed1,
    tick, tickLower, tickUpper, liquidity, tokenId,
  } = params;
  const poolName = `${symbol0}/${symbol1} • #${tokenId}`;

  const symbol0Upper = symbol0.toUpperCase();
  const symbol1Upper = symbol1.toUpperCase();

  const sortedLower = Math.min(tickLower, tickUpper);
  const sortedUpper = Math.max(tickLower, tickUpper);

  // prices in human units (token1 per token0)
  const priceCurrent = humanPriceToken1PerToken0(tick, decimals0, decimals1);
  const priceLower = humanPriceToken1PerToken0(sortedLower, decimals0, decimals1);
  const priceUpper = humanPriceToken1PerToken0(sortedUpper, decimals0, decimals1);

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
  const totalValueUsdRaw = totalValueParts.reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);
  const totalValueUsd = (Number.isFinite(totalValueUsdRaw) && totalValueUsdRaw >= 0 && totalValueUsdRaw < 1e9) ? totalValueUsdRaw : 0;

  const accruedUsdParts: number[] = [];
  if (token0ToUsd) accruedUsdParts.push(token0ToUsd(owed0Human));
  if (token1ToUsd) accruedUsdParts.push(token1ToUsd(owed1Human));
  const accruedFeesUsd = accruedUsdParts.length > 0 ? accruedUsdParts.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) : undefined;

  let rewardKitten: number | undefined;
  if (symbol0Upper.includes("KITTEN")) rewardKitten = clampPrecision(owed0Human);
  else if (symbol1Upper.includes("KITTEN")) rewardKitten = clampPrecision(owed1Human);

  const accruedFeesTokens: Record<string, number> = {
    [symbol0Upper]: clampPrecision(owed0Human),
    [symbol1Upper]: clampPrecision(owed1Human),
  };

  return {
    poolName,
    totalValueUsd,
    sharePercent: undefined,
    tokenAmounts: { [symbol0Upper]: clampPrecision(amount0), [symbol1Upper]: clampPrecision(amount1) },
    accruedFeesUsd,
    accruedFeesTokens,
    rewardKitten,
    rewardKittenUsd: undefined, // filled later when we know KITTEN price
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

    const lower = Math.min(position.tickLower, position.tickUpper);
    const upper = Math.max(position.tickLower, position.tickUpper);

    const { amount0: raw0, amount1: raw1 } = amountsFromLiquidityQ96(
      position.liquidity,
      currentTick,
      lower,
      upper
    );

    const amount0 = Number(formatUnitsClamp(raw0, decimals0));
    const amount1 = Number(formatUnitsClamp(raw1, decimals1));

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
      tickLower: lower,
      tickUpper: upper,
      liquidity: position.liquidity,
      tokenId,
    });
  } catch (error) {
    attempt.error = error instanceof Error ? error.message : "Unknown error";
    attempts.push(attempt);
    return null;
  }
}

async function fetchKittenUsd0Price(): Promise<number | undefined> {
  try {
    if (KITTEN_TOKEN === ("0x0000000000000000000000000000000000000000" as Address) ||
        USD0_TOKEN === ("0x0000000000000000000000000000000000000000" as Address)) {
      return undefined;
    }
    let pool: Address | undefined;
    try { pool = await readPoolByPair(KITTEN_TOKEN, USD0_TOKEN); } catch { /* try reverse */ }
    if (!pool) {
      try { pool = await readPoolByPair(USD0_TOKEN, KITTEN_TOKEN); } catch { /* no pool */ }
    }
    if (!pool) return undefined;
    const { currentTick } = await readGlobalState(pool);
    const [decK, decU] = await Promise.all([readDecimals(KITTEN_TOKEN), readDecimals(USD0_TOKEN)]);

    // Try interpreting tick as token1/token0 with token0=KITTEN, token1=USD0
    const usd0PerKitten = humanPriceToken1PerToken0(currentTick, decK, decU);
    if (Number.isFinite(usd0PerKitten) && usd0PerKitten > 1e-12 && usd0PerKitten < 1e12) return usd0PerKitten;

    // else interpret reversed and invert
    const kittenPerUsd0 = humanPriceToken1PerToken0(currentTick, decU, decK);
    if (Number.isFinite(kittenPerUsd0) && kittenPerUsd0 > 1e-12 && kittenPerUsd0 < 1e12) return 1 / kittenPerUsd0;
    return undefined;
  } catch {
    return undefined;
  }
}

export async function fetchOnchainKittenswapPositions(walletAddress: Address) {
  const attempts: AttemptLog[] = [];
  const tokenIds = await resolveOwnedTokenIds(walletAddress, attempts);

  if (tokenIds.length === 0) {
    attempts.push({ step: "no-token-ids", success: false, error: `No KittenSwap LP NFTs found for ${walletAddress}` });
    return { positions: [], attempts, source: `HyperEVM RPC ${RPC_URL}`, meta: {} as FetchResultMeta };
  }

  const positions: KittenswapPosition[] = [];
  for (const tokenId of tokenIds) {
    const position = await resolvePosition(tokenId, attempts);
    if (position) positions.push(position);
  }

  if (positions.length === 0) {
    attempts.push({ step: "positions-empty", success: false, error: "Unable to decode any KittenSwap positions" });
  }

  // KITTEN fees valuation
  const kittenUsd = await fetchKittenUsd0Price();
  let totalKittenFees = 0;
  let totalKittenFeesUsd = 0;

  for (const p of positions) {
    const kittenFees = p.accruedFeesTokens["KITTEN"] ?? p.accruedFeesTokens["WKITTEN"] ?? 0;
    totalKittenFees += kittenFees;
    if (kittenUsd && Number.isFinite(kittenUsd)) {
      const usd = kittenFees * kittenUsd;
      totalKittenFeesUsd += usd;
      if (p.rewardKitten !== undefined && (p.rewardKittenUsd === undefined || p.rewardKittenUsd === 0)) {
        p.rewardKittenUsd = clampPrecision(p.rewardKitten * kittenUsd);
      }
    }
  }

  attempts.push({
    step: "kitten-fees-total",
    success: true,
    details: `KITTEN fees total: ${totalKittenFees} (~${kittenUsd ? clampPrecision(totalKittenFeesUsd) : "n/a"}) at price ${kittenUsd ?? "unknown"} USD0/KITTEN`,
  });

  const meta: FetchResultMeta = {
    kittenUsd: kittenUsd,
    totalKittenFees: clampPrecision(totalKittenFees),
    totalKittenFeesUsd: kittenUsd ? clampPrecision(totalKittenFeesUsd) : undefined,
  };

  return { positions, attempts, source: `HyperEVM RPC ${RPC_URL}`, meta };
}

/** Keep async because file has "use server" and Next treats exports as Server Actions. */
export async function isValidWalletAddress(address: unknown): Promise<boolean> {
  if (typeof address !== "string") return false;
  return /^0x[a-fA-F0-9]{40}$/.test(address.trim());
}
