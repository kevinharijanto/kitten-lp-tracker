import type { SuiTransaction, SuiEvent } from "@/app/api/sui/types";
import btcPriceData from "@/app/data/btc_price_data.json";
import suiPriceData from "@/app/data/sui_price_data.json";
import { SuiClient } from "@mysten/sui.js/client";

export function extractAddLiquidityFromEvents(events: SuiEvent[]) {
  const addLiquidityEvent = events.find(
    (e: SuiEvent) =>
      typeof e.type === "string" &&
      e.type.endsWith("::liquidity::AddLiquidityEvent")
  );
  if (!addLiquidityEvent || !addLiquidityEvent.parsedJson) return null;

  return {
    amount_x: addLiquidityEvent.parsedJson.amount_x,
    amount_y: addLiquidityEvent.parsedJson.amount_y,
    pool_id: addLiquidityEvent.parsedJson.pool_id,
    position_id: addLiquidityEvent.parsedJson.position_id,
  };
}

export function extractRemoveLiquidityFromEvents(events: SuiEvent[]) {
  const removeLiquidityEvent = events.find(
    (e: SuiEvent) =>
      typeof e.type === "string" &&
      e.type.endsWith("::liquidity::RemoveLiquidityEvent")
  );
  if (!removeLiquidityEvent || !removeLiquidityEvent.parsedJson) return null;

  return {
    amount_x: removeLiquidityEvent.parsedJson.amount_x,
    amount_y: removeLiquidityEvent.parsedJson.amount_y,
    pool_id: removeLiquidityEvent.parsedJson.pool_id,
    position_id: removeLiquidityEvent.parsedJson.position_id,
  };
}

export function typeToSymbolAndDecimals(type: string) {
  const t = type.toLowerCase();
  if (t.includes("sui::sui")) return { symbol: "SUI", decimals: 9 };
  if (t.includes("usdc")) return { symbol: "USDC", decimals: 6 };
  if (t.includes("usdt")) return { symbol: "USDT", decimals: 6 };
  if (t.includes("lbtc")) return { symbol: "LBTC", decimals: 8 };
  if (t.includes("x_sui")) return { symbol: "XSUI", decimals: 9 };
  return { symbol: type, decimals: 6 };
}

export function extractClaimFees(tx: SuiTransaction) {
  const claimFeeEvents = (tx.events || []).filter(
    (event: SuiEvent) =>
      typeof event.type === "string" &&
      event.type.includes("collect::FeeCollectedEvent")
  );

  // Find the MoveCall for collect::fee to get token types
  let tokenTypes: string[] = [];
  const programmableTx = tx.transaction?.data?.transaction;
  if (
    programmableTx &&
    programmableTx.kind === "ProgrammableTransaction" &&
    Array.isArray(programmableTx.transactions)
  ) {
    for (const txn of programmableTx.transactions) {
      if (
        txn.MoveCall &&
        txn.MoveCall.module === "collect" &&
        txn.MoveCall.function === "fee"
      ) {
        tokenTypes = txn.MoveCall.type_arguments || [];
        break;
      }
    }
  }

  return claimFeeEvents.map((event: SuiEvent) => {
    const { amount_x, amount_y, pool_id } = event.parsedJson || {};

    // Map token types to symbols/decimals
    const tokenX = tokenTypes[0] ? typeToSymbolAndDecimals(tokenTypes[0]) : { symbol: "TOKEN1", decimals: 6 };
    const tokenY = tokenTypes[1] ? typeToSymbolAndDecimals(tokenTypes[1]) : { symbol: "TOKEN2", decimals: 6 };

    return {
      pool: pool_id,
      [tokenX.symbol]: amount_x ? Number(amount_x) / Math.pow(10, tokenX.decimals) : 0,
      [tokenY.symbol]: amount_y ? Number(amount_y) / Math.pow(10, tokenY.decimals) : 0,
    };
  });
}

export async function getTokenPrices(): Promise<{ [symbol: string]: number }> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=sui,solana,tether,usd-coin,bitcoin&vs_currencies=usd"
  );
  const data = await res.json();
  return {
    SUI: data.sui.usd,
    XSUI: data.sui.usd,
    SOL: data.solana.usd,
    USDC: data["usd-coin"]?.usd || 1,
    USDT: data.tether?.usd || 1,
    BTC: data.bitcoin?.usd || 0,
    LBTC: data.bitcoin?.usd || 0,
  };
}

export async function getHistoricalPrice(
  symbol: string,
  timestampMs: number,
  tokenPrices: { [symbol: string]: number }
): Promise<number> {
  if (symbol === "USDC" || symbol === "USDT") return 1;
  if (symbol === "LBTC") symbol = "BTC";
  if (symbol === "XSUI") symbol = "SUI";


  const dateObj = new Date(timestampMs);
  const yyyy = dateObj.getUTCFullYear();
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  if (symbol === "BTC") {
    const found = btcPriceData.find((d: { date: string; price: string }) => d.date === dateStr);
     return found ? Number(found.price) : (tokenPrices.BTC || 0);
  }
  if (symbol === "SUI") {
    const found = suiPriceData.find((d: { date: string; price: string }) => d.date === dateStr);
    return found ? Number(found.price) : (tokenPrices.SUI || 0);
  }
  return tokenPrices[symbol] || 0;
}

/** Helper: Parse pool name from type arguments */
export function parsePoolName(poolTokens: string[]): string {
  return poolTokens
    .map((t: string) => {
      const parts = t.split("::");
      return parts[parts.length - 1];
    })
    .join("-");
}

/** Helper: Get MoveCalls from a transaction */
export function getMoveCalls(tx: SuiTransaction): { module: string; function: string; type_arguments?: string[] }[] {
  const programmableTx = tx.transaction?.data?.transaction;
  if (
    programmableTx &&
    programmableTx.kind === "ProgrammableTransaction" &&
    Array.isArray(programmableTx.transactions)
  ) {
    return programmableTx.transactions
      .filter((txn: { MoveCall?: unknown }) => txn.MoveCall)
      .map((txn) => txn.MoveCall!);
  }
  return [];
}

/** Helper: Fetch all transactions for a wallet */
export async function fetchAllTransactions(
  client: SuiClient,
  walletAddress: string
): Promise<SuiTransaction[]> {
  const allTxs: SuiTransaction[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let lastCursor: string | null = null;

  while (hasNextPage) {
    const res = await client.queryTransactionBlocks({
      filter: { FromAddress: walletAddress },
      limit: 50,
      cursor,
      options: {
        showEffects: true,
        showInput: true,
        showEvents: true,
      },
    });

    allTxs.push(
      ...(res.data as SuiTransaction[]).map((tx) => ({
        ...tx,
        events: tx.events === null ? undefined : tx.events,
      }))
    );

    if (res.data.length === 0 || res.nextCursor === lastCursor) break;
    lastCursor = cursor;
    cursor = res.nextCursor ?? null;
    hasNextPage = !!cursor;
  }
  return allTxs;
}
