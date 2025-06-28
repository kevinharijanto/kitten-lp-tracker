// File: app/api/track/route.ts
import { NextResponse } from "next/server";
import { SuiClient, getFullnodeUrl } from "@mysten/sui.js/client";
import {
  extractAddLiquidityFromEvents,
  extractRemoveLiquidityFromEvents,
  getTokenPrices,
  extractClaimFees,
  getHistoricalPrice,
  parsePoolName,
  getMoveCalls,
  fetchAllTransactions,
  typeToSymbolAndDecimals,
} from "@/app/api/sui/utils";
import type { ProcessedLP } from "@/app/api/sui/types";

// Initialize Sui Client
const client = new SuiClient({ url: getFullnodeUrl("mainnet") });

export async function handleSuiPost(request: Request) {
  try {
    const body = await request.json();
    const walletAddress: string = body.walletAddress;

    if (!walletAddress) {
      return NextResponse.json(
        { error: "Alamat wallet diperlukan" },
        { status: 400 }
      );
    }

    // Fetch all transactions
    const allTxs = await fetchAllTransactions(client, walletAddress);

    const foundLpPositions: ProcessedLP[] = [];
    const foundClaimFees: ProcessedLP[] = [];
    const tokenPrices = await getTokenPrices();

    for (const tx of allTxs) {
      const moveCalls = getMoveCalls(tx);

      // --- ADD LP ---
      const addLiquidityCalls = moveCalls.filter(
        (call) => call.module === "liquidity" && call.function === "add_liquidity"
      );
      if (addLiquidityCalls.length > 0) {
        const addLiquidityData = extractAddLiquidityFromEvents(tx.events || []);
        if (addLiquidityData) {
          const poolTokens = addLiquidityCalls[0].type_arguments || [];
          const poolName = parsePoolName(poolTokens);

          const amounts: { [coinType: string]: string } = {};
          let initialWorthUSD = 0;
          let currentWorthUSD = 0;
          if (poolTokens.length === 2) {
            amounts[poolTokens[0]] = addLiquidityData.amount_x ?? "";
            amounts[poolTokens[1]] = addLiquidityData.amount_y ?? "";

            for (const { type, amount } of [
              { type: poolTokens[0], amount: addLiquidityData.amount_x },
              { type: poolTokens[1], amount: addLiquidityData.amount_y },
            ]) {
              const { symbol, decimals } = typeToSymbolAndDecimals(type);
              const histPrice = await getHistoricalPrice(
                symbol,
                parseInt(tx.timestampMs ?? "0"),
                tokenPrices
              );
          
              initialWorthUSD +=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) * histPrice;
              const currPrice = tokenPrices[symbol] || 0;
              currentWorthUSD +=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) * currPrice;
            }
          }

          foundLpPositions.push({
            protocol: "Momentum Finance",
            poolName: poolName ?? "",
            type: "add",
            initialWorthUSD,
            txDigest: tx.digest,
            timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
            amounts,
            currentWorthUSD,
          });
        }
      }

      // --- REMOVE LP ---
      const removeLiquidityCalls = moveCalls.filter(
        (call) => call.module === "liquidity" && call.function === "remove_liquidity"
      );
      if (removeLiquidityCalls.length > 0) {
        const removeLiquidityData = extractRemoveLiquidityFromEvents(tx.events || []);
        if (removeLiquidityData) {
          const poolTokens = removeLiquidityCalls[0].type_arguments || [];
          const poolName = parsePoolName(poolTokens);

          const amounts: { [coinType: string]: string } = {};
          let initialWorthUSD = 0;
          if (poolTokens.length === 2) {
            amounts[poolTokens[0]] = removeLiquidityData.amount_x ?? "";
            amounts[poolTokens[1]] = removeLiquidityData.amount_y ?? "";

            for (const { type, amount } of [
              { type: poolTokens[0], amount: removeLiquidityData.amount_x },
              { type: poolTokens[1], amount: removeLiquidityData.amount_y },
            ]) {
              const { symbol, decimals } = typeToSymbolAndDecimals(type);
              const histPrice = await getHistoricalPrice(
                symbol,
                parseInt(tx.timestampMs ?? "0"),
                tokenPrices
              );
              initialWorthUSD -=
                (parseFloat(amount || "0") / Math.pow(10, decimals)) * histPrice;
            }
          }

          foundLpPositions.push({
            protocol: "Momentum Finance",
            poolName,
            type: "remove",
            initialWorthUSD,
            txDigest: tx.digest,
            timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
            amounts,
            currentWorthUSD: initialWorthUSD, // use initial worth as current for remove
          });
        }
      }

      // --- CLAIM FEES ---
      const claimFeeData = extractClaimFees(tx);
      for (const fee of claimFeeData) {
        const poolName = fee.pool ?? "";
        // Convert all values to strings and remove undefined values and pool key
        const amounts: { [coinType: string]: string } = Object.entries(fee)
          .filter(([key, value]) => key !== "pool" && value !== undefined)
          .reduce((acc, [key, value]) => {
            acc[key] = String(value);
            return acc;
          }, {} as { [coinType: string]: string });

        let initialWorthUSD = 0;
        let currentWorthUSD = 0;

        for (const [symbol, amountStr] of Object.entries(amounts)) {
          const amount = parseFloat(amountStr);
          if (isNaN(amount)) continue;
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
          poolName,
          type: "claim",
          initialWorthUSD,
          txDigest: tx.digest,
          timestamp: new Date(parseInt(tx.timestampMs ?? "0")).toISOString(),
          amounts,
          currentWorthUSD,
        });
      }
    }

    // Group LP positions by pool name
    const poolsMap: { [poolName: string]: ProcessedLP[] } = {};
    for (const lp of foundLpPositions) {
      if (!poolsMap[lp.poolName]) poolsMap[lp.poolName] = [];
      poolsMap[lp.poolName].push(lp);
    }

    // Format response
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
              const { symbol, decimals } = typeToSymbolAndDecimals(key);
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
        initializeWorthUSD: tx.initialWorthUSD,
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

export async function handleSuiOwnObject(request: Request) {
  try {
    const body = await request.json();
    const walletAddress: string = body.walletAddress;

    if (!walletAddress) {
      return NextResponse.json({ error: "Alamat wallet diperlukan" }, { status: 400 });
    }

    return NextResponse.json(
      { error: walletAddress },
      { status: 200 }
    );
  } catch (error) {
    console.error("Error fetching own objects:", error);
    return NextResponse.json(
      { error: "Gagal mengambil objek milik sendiri." },
      { status: 500 }
    );
  }
}