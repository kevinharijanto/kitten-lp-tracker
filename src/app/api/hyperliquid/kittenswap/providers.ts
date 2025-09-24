import { extractKittenswapPositions, type KittenswapPosition } from "./utils";

interface FetchOptions {
  walletAddress: string;
  infoUrl: string;
  fallbackUrls: string[];
}

interface AttemptLog {
  source: string;
  method: string;
  url: string;
  status?: number;
  error?: string;
}

interface FetchOutcome {
  positions: KittenswapPosition[];
  payload: unknown;
  source: string;
  attempts: AttemptLog[];
}

function buildFallbackCandidates(baseUrl: string, walletAddress: string) {
  const trimmedBase = baseUrl.replace(/\s+/g, "");
  if (!trimmedBase) {
    return [] as { method: string; url: string; body?: unknown }[];
  }

  const url = trimmedBase.replace(/\/$/, "");
  const encoded = encodeURIComponent(walletAddress);

  const candidates = [
    { method: "GET", url: `${url}?wallet=${encoded}` },
    { method: "GET", url: `${url}?walletAddress=${encoded}` },
    { method: "GET", url: `${url}?address=${encoded}` },
    { method: "GET", url: `${url}?owner=${encoded}` },
    { method: "GET", url: `${url}/${encoded}` },
    { method: "POST", url, body: { wallet: walletAddress } },
    { method: "POST", url, body: { walletAddress } },
    { method: "POST", url, body: { address: walletAddress } },
    { method: "POST", url, body: { owner: walletAddress } },
  ];

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.method}:${candidate.url}:$${candidate.body ? JSON.stringify(candidate.body) : ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function attemptJsonFetch(
  url: string,
  init: RequestInit,
  attempt: AttemptLog
): Promise<{ payload: unknown; attempt: AttemptLog }> {
  try {
    const response = await fetch(url, init);
    const nextAttempt: AttemptLog = {
      ...attempt,
      status: response.status,
    };

    if (!response.ok) {
      nextAttempt.error = `HTTP ${response.status}`;
      return { payload: undefined, attempt: nextAttempt };
    }

    const payload = await response.json();
    return { payload, attempt: nextAttempt };
  } catch (error) {
    const nextAttempt: AttemptLog = {
      ...attempt,
      error: error instanceof Error ? error.message : "Unknown network error",
    };
    return { payload: undefined, attempt: nextAttempt };
  }
}

export async function fetchKittenswapData({
  walletAddress,
  infoUrl,
  fallbackUrls,
}: FetchOptions): Promise<FetchOutcome> {
  const attempts: AttemptLog[] = [];

  const infoInit: RequestInit = {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "spotUserState",
      user: walletAddress,
    }),
    cache: "no-store",
  };

  const infoAttempt: AttemptLog = {
    source: "Hyperliquid info",
    method: infoInit.method ?? "POST",
    url: infoUrl,
  };

  const infoResult = await attemptJsonFetch(infoUrl, infoInit, infoAttempt);
  attempts.push(infoResult.attempt);

  if (!infoResult.attempt.error) {
    const positions = extractKittenswapPositions(infoResult.payload);
    return {
      positions,
      payload: infoResult.payload,
      source: infoAttempt.source,
      attempts,
    };
  }

  for (const baseUrl of fallbackUrls) {
    const candidates = buildFallbackCandidates(baseUrl, walletAddress);
    for (const candidate of candidates) {
      const init: RequestInit = {
        method: candidate.method,
        headers: {
          "Content-Type": "application/json",
        },
        cache: "no-store",
      };

      if (candidate.method === "POST" && candidate.body) {
        init.body = JSON.stringify(candidate.body);
      }

      const attempt: AttemptLog = {
        source: `Kittenswap fallback (${baseUrl})`,
        method: candidate.method,
        url: candidate.url,
      };

      const result = await attemptJsonFetch(candidate.url, init, attempt);
      attempts.push(result.attempt);

      if (!result.attempt.error) {
        const positions = extractKittenswapPositions(result.payload);
        return {
          positions,
          payload: result.payload,
          source: attempt.source,
          attempts,
        };
      }
    }
  }

  const combinedError = attempts
    .map((attempt) => {
      const status = attempt.status ? ` status=${attempt.status}` : "";
      const error = attempt.error ? ` error=${attempt.error}` : "";
      return `${attempt.source} ${attempt.method} ${attempt.url}${status}${error}`.trim();
    })
    .join("; ");

  throw new Error(
    combinedError || "Unable to retrieve Kittenswap LP data from Hyperliquid or fallback endpoints."
  );
}
