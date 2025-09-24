import { NextResponse } from "next/server";
import {
  extractKittenswapPositions,
  isValidWalletAddress,
  type KittenswapPosition,
} from "./utils";

const DEFAULT_INFO_URL = "https://api.hyperliquid.xyz/info";

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

    const apiResponse = await fetch(infoUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "spotUserState",
        user: walletAddress,
      }),
      // Hyperliquid API does not require credentials; ensure caching is disabled.
      cache: "no-store",
    });

    if (!apiResponse.ok) {
      const errorText = await apiResponse.text();
      return NextResponse.json(
        {
          error: "Failed to fetch Hyperliquid data.",
          details: `API responded with ${apiResponse.status}`,
          payload: errorText || undefined,
        },
        { status: apiResponse.status }
      );
    }

    const payload = await apiResponse.json();
    const positions: KittenswapPosition[] = extractKittenswapPositions(payload);

    return NextResponse.json({
      protocol: "Kittenswap",
      network: "Hyperliquid",
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
