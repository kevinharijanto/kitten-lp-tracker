import {
  fetchOnchainKittenswapPositions,
  type Address,
  type AttemptLog,
  type KittenswapPosition,
} from "./utils";

interface FetchOptions {
  walletAddress: Address;
}

interface FetchOutcome {
  positions: KittenswapPosition[];
  source: string;
  attempts: AttemptLog[];
}


export async function fetchKittenswapData({ walletAddress }: FetchOptions): Promise<FetchOutcome> {
  const { positions, source, attempts } = await fetchOnchainKittenswapPositions(walletAddress);
  return { positions, source, attempts };

}
