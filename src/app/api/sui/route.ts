// File: app/api/track/route.ts
import { NextResponse } from "next/server";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import btcPriceData from "@/app/data/btc_price_data.json";
import suiPriceData from "@/app/data/sui_price_data.json";

// Initialize Sui Client
const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

interface ProcessedLP {
  protocol: string;
  poolName: string;
  initialWorthUSD: number;
  txDigest: string;
  type: "add" | "remove" | "claim";
  timestamp: string;
  amounts: { [coinType: string]: string };
  currentWorthUSD?: number;
}

function extractAddLiquidityFromEvents(events: any[]) {
  const addLiquidityEvent = events.find(
    (e: any) =>
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

function extractRemoveLiquidityFromEvents(events: any[]) {
  const removeLiquidityEvent = events.find(
    (e: any) =>
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

function extractClaimFees(tx: any) {
  const claimFeeEvents = (tx.events || []).filter(
    (event: any) =>
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

  // Helper to map type to symbol and decimals
  function typeToSymbolAndDecimals(type: string) {
    const t = type.toLowerCase();
    if (t.includes("sui::sui")) return { symbol: "SUI", decimals: 9 };
    if (t.includes("usdc")) return { symbol: "USDC", decimals: 6 };
    if (t.includes("usdt")) return { symbol: "USDT", decimals: 6 };
    if (t.includes("lbtc")) return { symbol: "LBTC", decimals: 8 };
    return { symbol: type, decimals: 6 };
  }

  return claimFeeEvents.map((event: any) => {
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

async function getTokenPrices(): Promise<{ [symbol: string]: number }> {
  const res = await fetch(
    "https://api.coingecko.com/api/v3/simple/price?ids=sui,solana,tether,usd-coin,bitcoin&vs_currencies=usd"
  );
  const data = await res.json();
  return {
    SUI: data.sui.usd,
    SOL: data.solana.usd,
    USDC: data["usd-coin"]?.usd || 1,
    USDT: data.tether?.usd || 1,
    BTC: data.bitcoin?.usd || 0,
    LBTC: data.bitcoin?.usd || 0,
  };
}

async function getHistoricalPrice(
  symbol: string,
  timestampMs: number,
  tokenPrices: { [symbol: string]: number }
): Promise<number> {
  if (symbol === "USDC" || symbol === "USDT") return 1;
  if (symbol === "LBTC") symbol = "BTC";

  const dateObj = new Date(timestampMs);
  const yyyy = dateObj.getUTCFullYear();
  const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dateObj.getUTCDate()).padStart(2, "0");
  const dateStr = `${yyyy}-${mm}-${dd}`;

  if (symbol === "BTC") {
    const found = btcPriceData.find((d: any) => d.date === dateStr);
     return found ? Number(found.price) : (tokenPrices.BTC || 0);
  }
  if (symbol === "SUI") {
    const found = suiPriceData.find((d: any) => d.date === dateStr);
    
    return found ? Number(found.price) : (tokenPrices.SUI || 0);
  }
  return tokenPrices[symbol] || 0;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const walletAddress: string = body.walletAddress;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Alamat wallet diperlukan" },
        { status: 400 }
      );
    }

    // --- SUI LOGIC ONLY ---
    const allTxs: any[] = [];
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
      allTxs.push(...res.data);

      if (res.data.length === 0 || res.nextCursor === lastCursor) {
        break;
      }

      lastCursor = cursor;
      cursor = res.nextCursor ?? null;
      hasNextPage = !!cursor;
    }

    const foundLpPositions: ProcessedLP[] = [];
    const foundClaimFees: ProcessedLP[] = []; // <-- Add this

    const tokenPrices = await getTokenPrices();

    for (const tx of allTxs) {
      const programmableTx = tx.transaction?.data.transaction;
      let moveCalls: any[] = [];
      if (
        programmableTx &&
        programmableTx.kind === "ProgrammableTransaction" &&
        Array.isArray(programmableTx.transactions)
      ) {
        moveCalls = programmableTx.transactions
          .filter((txn: any) => txn.MoveCall)
          .map((txn: any) => txn.MoveCall);
      }

      // --- ADD LP ---
      const addLiquidityCalls = moveCalls.filter(
        (call) =>
          call.module === "liquidity" && call.function === "add_liquidity"
      );

      if (addLiquidityCalls.length > 0) {
        const addLiquidityData = extractAddLiquidityFromEvents(tx.events || []);

        if (addLiquidityData) {
          const poolTokens = addLiquidityCalls[0].type_arguments || [];
          const poolName = poolTokens
            .map((t: string) => {
              const parts = t.split("::");
              return parts[parts.length - 1];
            })
            .join("-");

          const amounts: { [coinType: string]: string } = {};
          let initialWorthUSD = 0;
          let currentWorthUSD = 0;
          if (poolTokens.length === 2) {
            amounts[poolTokens[0]] = addLiquidityData.amount_x;
            amounts[poolTokens[1]] = addLiquidityData.amount_y;

            const tokenMeta = [
              { type: poolTokens[0], amount: addLiquidityData.amount_x },
              { type: poolTokens[1], amount: addLiquidityData.amount_y },
            ];

            for (const { type, amount } of tokenMeta) {
              let symbol = "";
              let decimals = 9;
              if (type.toLowerCase().includes("sui::sui")) {
                symbol = "SUI";
                decimals = 9;
              } else if (type.toLowerCase().includes("usdc")) {
                symbol = "USDC";
                decimals = 6;
              } else if (type.toLowerCase().includes("usdt")) {
                symbol = "USDT";
                decimals = 6;
              } else if (type.toLowerCase().includes("lbtc")) {
                symbol = "LBTC";
                decimals = 8;
              }
              const histPrice = await getHistoricalPrice(
                symbol,
                parseInt(tx.timestampMs ?? "0"),
                tokenPrices
              );
              initialWorthUSD +=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) *
                histPrice;
              const currPrice = tokenPrices[symbol] || 0;
              currentWorthUSD +=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) *
                currPrice;
            }
          }

          foundLpPositions.push({
            protocol: "Momentum Finance",
            poolName: poolName,
            type: "add",
            initialWorthUSD: initialWorthUSD,
            txDigest: tx.digest,
            timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
            amounts,
            currentWorthUSD,
          });
        }
      }

      // --- REMOVE LP ---
      const removeLiquidityCalls = moveCalls.filter(
        (call) =>
          call.module === "liquidity" && call.function === "remove_liquidity"
      );

      if (removeLiquidityCalls.length > 0) {
        const removeLiquidityData = extractRemoveLiquidityFromEvents(
          tx.events || []
        );
        if (removeLiquidityData) {
          const poolTokens = removeLiquidityCalls[0].type_arguments || [];
          const poolName = poolTokens
            .map((t: string) => {
              const parts = t.split("::");
              return parts[parts.length - 1];
            })
            .join("-");

          const amounts: { [coinType: string]: string } = {};
          let initialWorthUSD = 0;
          let currentWorthUSD = 0;
          if (poolTokens.length === 2) {
            amounts[poolTokens[0]] = removeLiquidityData.amount_x;
            amounts[poolTokens[1]] = removeLiquidityData.amount_y;

            const tokenMeta = [
              { type: poolTokens[0], amount: removeLiquidityData.amount_x },
              { type: poolTokens[1], amount: removeLiquidityData.amount_y },
            ];

            for (const { type, amount } of tokenMeta) {
              let symbol = "";
              let decimals = 9;
              if (type.toLowerCase().includes("sui::sui")) {
                symbol = "SUI";
                decimals = 9;
              } else if (type.toLowerCase().includes("usdc")) {
                symbol = "USDC";
                decimals = 6;
              } else if (type.toLowerCase().includes("usdt")) {
                symbol = "USDT";
                decimals = 6;
              } else if (type.toLowerCase().includes("lbtc")) {
                symbol = "LBTC";
                decimals = 8;
              }
              const histPrice = await getHistoricalPrice(
                symbol,
                parseInt(tx.timestampMs ?? "0"),
                tokenPrices
              );
              initialWorthUSD -=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) *
                histPrice;
              const currPrice = tokenPrices[symbol] || 0;
              currentWorthUSD -=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) *
                currPrice;
            }
          }

          foundLpPositions.push({
            protocol: "Momentum Finance",
            poolName: poolName,
            type: "remove",
            initialWorthUSD: initialWorthUSD,
            txDigest: tx.digest,
            timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
            amounts,
            currentWorthUSD: initialWorthUSD, // we using initial worth as current for remove for zero-sum
          });
        }
      }

      // --- CLAIM FEES ---
      const claimFeeData = extractClaimFees(tx);
      for (const fee of claimFeeData) {
        const poolName = fee.pool;
        const amounts = { ...fee };
        delete amounts.pool;

        let initialWorthUSD = 0;
        let currentWorthUSD = 0;

        for (const [symbol, amount] of Object.entries(amounts)) {
          if (typeof amount !== "number" || isNaN(amount)) continue;
          // Historical price
          const histPrice = await getHistoricalPrice(
            symbol,
            parseInt(tx.timestampMs ?? "0"),
            tokenPrices
          );
          initialWorthUSD += amount * histPrice;
          // Current price
          const currPrice = tokenPrices[symbol] || 0;
          currentWorthUSD += amount * currPrice;
        }

        foundClaimFees.push({
          protocol: "Momentum Finance",
          poolName: poolName,
          type: "claim",
          initialWorthUSD,
          txDigest: tx.digest,
          timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
          amounts,
          currentWorthUSD,
        });
      }
    }

    const poolsMap: { [poolName: string]: ProcessedLP[] } = {};
    for (const lp of foundLpPositions) {
      if (!poolsMap[lp.poolName]) poolsMap[lp.poolName] = [];
      poolsMap[lp.poolName].push(lp);
    }

    return NextResponse.json({
      sui: Object.entries(poolsMap).map(([poolName, txs]) => ({
        name: poolName,
        transactions: txs.map((tx) => ({
          type: tx.type,
          txUrl: `https://suiscan.xyz/tx/${tx.txDigest}`,
          initialWorth: tx.initialWorthUSD,
          currentWorth: tx.currentWorthUSD,
          amounts: Object.entries(tx.amounts || {}).reduce(
            (acc, [key, value]) => {
              let symbol = "";
              let decimals = 9;
              if (key.toLowerCase().includes("sui::sui")) {
                symbol = "SUI";
                decimals = 9;
              } else if (key.toLowerCase().includes("usdc")) {
                symbol = "USDC";
                decimals = 6;
              } else if (key.toLowerCase().includes("usdt")) {
                symbol = "USDT";
                decimals = 6;
              } else if (key.toLowerCase().includes("lbtc")) {
                symbol = "LBTC";
                decimals = 8;
              }
              if (symbol) {
                acc[symbol] = (acc[symbol] || 0) + parseFloat(value) / Math.pow(10, decimals);
              }
              return acc;
            },
            {} as Record<string, number>
          ),
          timestamp: tx.timestamp,
        })),
      })),
      claimFee: foundClaimFees.map((tx) => ({
        poolName: tx.poolName,
        txUrl: `https://suiscan.xyz/tx/${tx.txDigest}`,
        amounts: tx.amounts,
        timestamp: tx.timestamp,
        currentWorthUSD: tx.currentWorthUSD,
        initializeWorthUSD: tx.initialWorthUSD
      })),
    });
  } catch (error) {
    console.error("Error processing Sui transactions:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan pada server";
    return NextResponse.json(
      { error: "Gagal memproses transaksi.", details: errorMessage },
      { status: 500 }
    );
  }
}
