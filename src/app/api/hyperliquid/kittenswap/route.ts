import { NextResponse } from "next/server";
import { fetchKittenswapData } from "./providers";
import { isValidWalletAddress, type Address } from "./utils";

export const runtime = "nodejs";
interface RequestBody {
  walletAddress?: string;
}

export async function POST(request: Request) {
  try {
    const body: RequestBody = await request.json();
    const walletAddress = body.walletAddress;

    if (!isValidWalletAddress(walletAddress)) {
      return NextResponse.json(
        { error: "A valid 0x-prefixed wallet address is required." },
        { status: 400 }
      );
    }

    const { positions, source, attempts } = await fetchKittenswapData({
      walletAddress: walletAddress as Address,
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
