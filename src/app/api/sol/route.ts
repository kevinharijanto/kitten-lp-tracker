// File: app/api/track/route.ts

import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

// Initialize Solana connection (mainnet)
const solanaConnection = new Connection(
  "https://solana-mainnet.g.alchemy.com/v2/i1IqtXb-Y5Y2ngF2lmKw1kl0D3A7J7-7"
);

interface ProcessedLP {
  protocol: string;
  poolName: string;
  initialWorthUSD: number;
  txDigest: string;
  type: "add" | "remove";
  timestamp: string;
  amounts: { [coinType: string]: string };
  currentWorthUSD?: number;
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

    // --- SOLANA LOGIC ONLY ---
    const pubkey = new PublicKey(walletAddress);
    let allSignatures: string[] = [];
    let before: string | undefined = undefined;
    let lastBefore: string | undefined = undefined;
    let done = false;

    // Fetch all signatures (paginated, 1000 per request)
    while (!done) {
      const sigs = await solanaConnection.getSignaturesForAddress(pubkey, {
        before,
        limit: 1000,
      });
      if (sigs.length === 0) break;
      allSignatures.push(...sigs.map((sig) => sig.signature));
      if (sigs.length < 1000) break;
      lastBefore = before;
      before = sigs[sigs.length - 1].signature;
      if (before === lastBefore) break;
    }

    const parsedTxs: any[] = [];
    let retrySignatures: string[] = [];
    const maxRetries = 3;
    const initialDelay = 1000;

    // Helper to sleep
    const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

    // Function to fetch and parse a transaction with retry on 429
    async function fetchParsedTx(
      signature: string,
      delay = initialDelay,
      attempt = 1
    ): Promise<any | null> {
      try {
        const tx = await solanaConnection.getParsedTransaction(signature, {
          maxSupportedTransactionVersion: 0,
        });
        return tx;
      } catch (err: any) {
        if (
          err &&
          err.message &&
          err.message.includes("429 Too Many Requests") &&
          attempt <= maxRetries
        ) {
          console.warn(
            `429 error for ${signature}, retrying in ${
              delay * 2
            }ms (attempt ${attempt})`
          );
          await sleep(delay * 2);
          return fetchParsedTx(signature, delay * 2, attempt + 1);
        } else {
          console.error(
            `Failed to fetch or parse transaction ${signature}:`,
            err
          );
          return null;
        }
      }
    }

    // Main fetch loop with retry list
    for (let i = 0; i < allSignatures.length; i++) {
      const signature = allSignatures[i];
      const tx = await fetchParsedTx(signature);
      if (tx) {
        parsedTxs.push({ signature, tx });
      } else {
        retrySignatures.push(signature);
      }
      // Progress log
      if ((i + 1) % 5 === 0 || i === allSignatures.length - 1) {
        console.log(
          `${parsedTxs.length} of ${allSignatures.length} tx has success to parsed`
        );
      }
      await sleep(initialDelay);
    }

    // Retry failed signatures (one more round)
    if (retrySignatures.length > 0) {
      console.log(`Retrying ${retrySignatures.length} failed signatures...`);
      for (const signature of retrySignatures) {
        const tx = await fetchParsedTx(signature, initialDelay * 2);
        if (tx) {
          parsedTxs.push({ signature, tx });
        } else {
          console.error(`Giving up on signature after retries: ${signature}`);
        }
        await sleep(initialDelay * 2);
      }
    }

    // --- Detection logic ---
    const result: ProcessedLP[] = [];
    const SOL_MINT = "So11111111111111111111111111111111111111112";
    const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
    const tokenPrices = await getTokenPrices();

    for (const { signature, tx } of parsedTxs) {
      const logs: string[] = tx?.meta?.logMessages ?? [];
      const innerInstructions = tx?.meta?.innerInstructions ?? [];
      const preTokenBalances = tx?.meta?.preTokenBalances ?? [];
      const postTokenBalances = tx?.meta?.postTokenBalances ?? [];

      // --- Primary: logMessages ---
      const isAddLPLog = logs.some(
        (log) =>
          log.includes("Instruction: AddLiquidity") ||
          log.includes("Instruction: AddLiquidityByStrategy")
      );
      const isRemoveLPLog = logs.some(
        (log) =>
          log.includes("Instruction: RemoveLiquidity") ||
          log.includes("Instruction: RemoveLiquidityByRange")
      );

      // --- Secondary: innerInstructions ---
      let transferMints = new Set<string>();
      let removeTransferMints = new Set<string>();
      for (const inner of innerInstructions) {
        for (const ix of inner.instructions ?? []) {
          if (
            ix.parsed &&
            (ix.parsed.type === "transfer" ||
              ix.parsed.type === "transferChecked")
          ) {
            if (ix.parsed.info && ix.parsed.info.mint) {
              transferMints.add(ix.parsed.info.mint);
              removeTransferMints.add(ix.parsed.info.mint);
            }
          }
        }
      }

      // --- Tertiary: Token balance changes ---
      // Add LP: user balance decreased
      let userDecreased = false;
      if (
        preTokenBalances.length === postTokenBalances.length &&
        preTokenBalances.length >= 2
      ) {
        userDecreased = preTokenBalances.some(
          (
            pre: { owner: string; uiTokenAmount: { amount: any } },
            idx: string | number
          ) => {
            const post = postTokenBalances[idx];
            return (
              pre.owner === walletAddress &&
              post.owner === walletAddress &&
              Number(pre.uiTokenAmount.amount) >
                Number(postTokenBalances[idx].uiTokenAmount.amount)
            );
          }
        );
      }
      // Remove LP: user balance increased
      let userIncreased = false;
      if (
        preTokenBalances.length === postTokenBalances.length &&
        preTokenBalances.length >= 2
      ) {
        userIncreased = preTokenBalances.some(
          (
            pre: { owner: string; uiTokenAmount: { amount: any } },
            idx: string | number
          ) => {
            const post = postTokenBalances[idx];
            return (
              pre.owner === walletAddress &&
              post.owner === walletAddress &&
              Number(pre.uiTokenAmount.amount) <
                Number(postTokenBalances[idx].uiTokenAmount.amount)
            );
          }
        );
      }

      // --- Add LP ---
      if (isAddLPLog && transferMints.size >= 2 && userDecreased) {
        let solAmount = 0;
        let usdcAmount = 0;
        for (const bal of postTokenBalances) {
          if (bal.mint === SOL_MINT) {
            solAmount = Number(bal.uiTokenAmount.uiAmount || 0);
          }
          if (bal.mint === USDC_MINT) {
            usdcAmount = Number(bal.uiTokenAmount.uiAmount || 0);
          }
        }
        const currentWorthUSD =
          solAmount * (tokenPrices.SOL || 0) +
          usdcAmount * (tokenPrices.USDC || 1);

        result.push({
          protocol: "Meteora",
          poolName: "SOL-USDC",
          type: "add",
          initialWorthUSD: 0,
          txDigest: signature,
          timestamp: tx.blockTime
            ? new Date(tx.blockTime * 1000).toISOString()
            : "",
          amounts: {
            SOL: solAmount.toString(),
            USDC: usdcAmount.toString(),
          },
          currentWorthUSD,
        });
      }

      // --- Remove LP ---
      if (isRemoveLPLog && removeTransferMints.size >= 2 && userIncreased) {
        let solAmount = 0;
        let usdcAmount = 0;
        for (const bal of postTokenBalances) {
          if (bal.mint === SOL_MINT) {
            solAmount = Number(bal.uiTokenAmount.uiAmount || 0);
          }
          if (bal.mint === USDC_MINT) {
            usdcAmount = Number(bal.uiTokenAmount.uiAmount || 0);
          }
        }
        const currentWorthUSD =
          solAmount * (tokenPrices.SOL || 0) +
          usdcAmount * (tokenPrices.USDC || 1);

        result.push({
          protocol: "Meteora",
          poolName: "SOL-USDC",
          type: "remove",
          initialWorthUSD: 0,
          txDigest: signature,
          timestamp: tx.blockTime
            ? new Date(tx.blockTime * 1000).toISOString()
            : "",
          amounts: {
            SOL: solAmount.toString(),
            USDC: usdcAmount.toString(),
          },
          currentWorthUSD,
        });
      }
    }

    // Group by poolName
    const poolsMap: { [poolName: string]: ProcessedLP[] } = {};
    for (const lp of result) {
      if (!poolsMap[lp.poolName]) poolsMap[lp.poolName] = [];
      poolsMap[lp.poolName].push(lp);
    }

    return NextResponse.json({
      sui: [],
      sol: Object.entries(poolsMap).map(([poolName, txs]) => ({
        name: poolName,
        transactions: txs.map((tx) => ({
          type: tx.type,
          txUrl: `https://solscan.io/tx/${tx.txDigest}`,
          initialWorth: tx.initialWorthUSD,
          currentWorth: tx.currentWorthUSD,
          amounts: tx.amounts,
          timestamp: tx.timestamp,
        })),
      })),
    });
  } catch (error) {
    console.error("Error processing Solana transactions:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Terjadi kesalahan pada server";
    return NextResponse.json(
      { error: "Gagal memproses transaksi.", details: errorMessage },
      { status: 500 }
    );
  }
}
