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

// TypeScript interfaces for LP Position data
interface I32Field {
  fields: {
    bits: number;
  };
}

interface PositionFields {
  pool_id: string;
  liquidity: string;
  tick_lower_index: I32Field;
  tick_upper_index: I32Field;
  fee_growth_inside_a: string;
  fee_growth_inside_b: string;
  tokens_owed_a: string;
  tokens_owed_b: string;
}

interface PoolFields {
  current_sqrt_price: string;
  current_tick_index: number | null;
  tick_spacing: number;
  fee_rate: number;
  liquidity: string;
  fee_growth_global_a: string;
  fee_growth_global_b: string;
}

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

    // Helper function to normalize pool names (always put tokens in consistent order)
    const normalizePoolName = (poolName: string): string => {
      const tokens = poolName.split('-').map(t => t.trim());
      if (tokens.length !== 2) return poolName;
      
      // Sort tokens alphabetically, but prioritize specific ordering for known pairs
      if ((tokens.includes('SUI') && tokens.includes('USDC')) ||
          (tokens.includes('USDC') && tokens.includes('SUI'))) {
        return 'USDC-SUI'; // Always USDC first for SUI/USDC pairs
      }
      
      // For other pairs, sort alphabetically
      return tokens.sort().join('-');
    };

    // Fetch LP range data from owned objects
    const lpRangeData: { [poolName: string]: { lower: number; upper: number } } = {};
    try {
      const ownedObjects = await client.getOwnedObjects({
        owner: walletAddress,
        filter: {
          StructType: "0x70285592c97965e811e0c6f98dccc3a9c2b4ad854b3594faab9597ada267b860::position::Position"
        },
        options: {
          showContent: true,
          showType: true,
          showOwner: true,
          showPreviousTransaction: true,
        },
      });

      for (const obj of ownedObjects.data) {
        if (obj.data?.content && obj.data.content.dataType === "moveObject") {
          const content = obj.data.content;
          const fields = content.fields as unknown as PositionFields;

          if (fields && fields.pool_id && fields.liquidity) {
            // Get pool object to extract token information
            const poolObject = await client.getObject({
              id: fields.pool_id,
              options: {
                showContent: true,
                showType: true,
              },
            });

            let poolInfo = null;
            if (poolObject.data?.content && poolObject.data.content.dataType === "moveObject") {
              const poolContent = poolObject.data.content;
              const poolFields = poolContent.fields as unknown as PoolFields;
              const poolType = poolObject.data.type;
              const typeMatch = poolType?.match(/<([^>]+)>/);
              const typeArgs = typeMatch ? typeMatch[1].split(',').map(t => t.trim()) : [];

              poolInfo = {
                tokenA: typeArgs[0] || 'Unknown',
                tokenB: typeArgs[1] || 'Unknown',
                currentSqrtPrice: poolFields.current_sqrt_price || '0',
                currentTick: poolFields.current_tick_index || null,
                tickSpacing: poolFields.tick_spacing || 0,
                feeRate: poolFields.fee_rate || 0,
                liquidity: poolFields.liquidity || '0',
                protocolFeeGrowthGlobalA: poolFields.fee_growth_global_a || '0',
                protocolFeeGrowthGlobalB: poolFields.fee_growth_global_b || '0',
              };
            }

            // Helper function to convert I32 bits to signed integer
            const convertI32ToSigned = (bits: number): number => {
              const n = bits & 0xffffffff;
              return n < 0x80000000 ? n : n - 0x100000000;
            };

            // Extract tick values
            const tickLowerValue = convertI32ToSigned(fields.tick_lower_index.fields.bits);
            const tickUpperValue = convertI32ToSigned(fields.tick_upper_index.fields.bits);

            // Get token decimals and symbols
            const getTokenDecimals = (tokenType: string): number => {
              if (tokenType.includes('sui::SUI')) return 9;
              if (tokenType.includes('usdc::USDC')) return 6;
              if (tokenType.includes('usdt::USDT')) return 6;
              if (tokenType.includes('lbtc::LBTC')) return 8;
              if (tokenType.includes('x_sui::X_SUI')) return 9;
              return 9;
            };

            const getTokenSymbol = (tokenType: string): string => {
              if (tokenType.includes('sui::SUI')) return 'SUI';
              if (tokenType.includes('usdc::USDC')) return 'USDC';
              if (tokenType.includes('usdt::USDT')) return 'USDT';
              if (tokenType.includes('lbtc::LBTC')) return 'LBTC';
              if (tokenType.includes('x_sui::X_SUI')) return 'X_SUI';
              return 'UNKNOWN';
            };

            const tokenAType = poolInfo?.tokenA || '';
            const tokenBType = poolInfo?.tokenB || '';
            const tokenASymbol = getTokenSymbol(tokenAType);
            const tokenBSymbol = getTokenSymbol(tokenBType);

            // Determine token ordering following Python reference
            let decimalsToken0: number;
            let decimalsToken1: number;
            let token0Symbol: string;
            let token1Symbol: string;

            if ((tokenASymbol === 'USDC' && tokenBSymbol === 'SUI') || 
                (tokenASymbol === 'SUI' && tokenBSymbol === 'USDC')) {
              decimalsToken0 = 6; // USDC
              decimalsToken1 = 9; // SUI
              token0Symbol = 'USDC';
              token1Symbol = 'SUI';
            } else {
              decimalsToken0 = getTokenDecimals(tokenAType);
              decimalsToken1 = getTokenDecimals(tokenBType);
              token0Symbol = tokenASymbol;
              token1Symbol = tokenBSymbol;
            }

            // Calculate price ranges using Python reference logic
            const calculatePriceFromTick = (tick: number): number => {
              const priceRatio = Math.pow(1.0001, tick);
              const decimalAdjustment = Math.pow(10, decimalsToken1 - decimalsToken0);
              return priceRatio * decimalAdjustment;
            };

            const lowerPrice = calculatePriceFromTick(tickLowerValue);
            const upperPrice = calculatePriceFromTick(tickUpperValue);
            const poolName = `${token0Symbol}-${token1Symbol}`;
            const normalizedPoolName = normalizePoolName(poolName);
            
            console.log(`Original pool name: ${poolName}, Normalized: ${normalizedPoolName}`);
            
            lpRangeData[normalizedPoolName] = {
              lower: lowerPrice,
              upper: upperPrice,
            };
          }
        }
      }
    } catch (error) {
      console.error("Error fetching LP range data:", error);
    }

    // Group LP positions by pool name
    const poolsMap: { [poolName: string]: ProcessedLP[] } = {};
    for (const lp of foundLpPositions) {
      if (!poolsMap[lp.poolName]) poolsMap[lp.poolName] = [];
      poolsMap[lp.poolName].push(lp);
    }

    // Format response with separated data
    return NextResponse.json({
      // Transaction data (add/remove LP)
      transactions: Object.entries(poolsMap).map(([poolName, txs]) => ({
        name: normalizePoolName(poolName),
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
      
      // Claim fee data
      claimFees: foundClaimFees.map((tx) => ({
        poolName: normalizePoolName(tx.poolName),
        txUrl: `https://suiscan.xyz/tx/${tx.txDigest}`,
        amounts: tx.amounts,
        timestamp: tx.timestamp,
        currentWorthUSD: tx.currentWorthUSD,
        initialWorthUSD: tx.initialWorthUSD,
      })),
      
      // LP range data
      lpRanges: Object.entries(lpRangeData).map(([poolName, range]) => ({
        poolName,
        lower: range.lower,
        upper: range.upper,
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

export async function handleSuiOwnObject() {
  return NextResponse.json(
    { message: "This endpoint is not implemented yet." }, 
  )   
}