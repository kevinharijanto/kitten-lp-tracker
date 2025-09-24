import { NextResponse } from "next/server";
import { fetchKittenswapData } from "./providers";
import { isValidWalletAddress } from "./utils";

const DEFAULT_INFO_URL = "https://api.hyperliquid.xyz/info";
const DEFAULT_FALLBACK_URLS = [
  "https://api.kittenswap.finance/api/hyperliquid/lp-positions",
  "https://prod.kittenswap.finance/api/hyperliquid/lp-positions",
];

interface RequestBody {
  walletAddress?: string;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const walletAddress = body.walletAddress;

    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: "Wallet address is required." },
        { status: 400 }
      );
    }

    const infoUrl = process.env.HYPERLIQUID_INFO_URL ?? DEFAULT_INFO_URL;

    const fallbackUrlsEnv = process.env.KITTENSWAP_FALLBACK_URLS;
    const fallbackUrls = fallbackUrlsEnv
      ? fallbackUrlsEnv
          .split(",")
          .map((url) => url.trim())
          .filter(Boolean)
      : DEFAULT_FALLBACK_URLS;

    const { positions, source, attempts } = await fetchKittenswapData({
      walletAddress,
      infoUrl,
      fallbackUrls,
    });

    return NextResponse.json({
      protocol: "Kittenswap",
      network: "Hyperliquid",
      source,
      attempts,

      positions,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      {
        error: "Unable to process request.",
        details: message,
      },
      { status: 500 }
    );
  }
}
