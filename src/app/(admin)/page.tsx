'use client'

import React, { useState } from "react";
import { EcommerceMetrics } from "@/components/ecommerce/SummaryCard";
import MonthlyTarget from "@/components/ecommerce/MonthlyTarget";
import RecentOrders from "@/components/ecommerce/TransactionDetail";

// Transaction type for LPResult
interface Transaction {
  type: "add" | "remove";
  txUrl: string;
  initialWorth: number;
  currentWorth: number;
  amounts: Record<string, number>;
  timestamp: string;
}

// LPResult type
interface LPResult {
  name: string;
  transactions: Transaction[];
}

// LP Range type
interface LPRange {
  poolName: string;
  lower: number;
  upper: number;
}

// ClaimFee transaction type
interface ClaimFeeTransaction {
  poolName: string;
  txUrl: string;
  amounts: Record<string, string>;
  timestamp: string;
  currentWorthUSD: number;
  initialWorthUSD: number;
}


export default function Ecommerce() {
  // --- LP Tracker logic ---
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lpResults, setLpResults] = useState<LPResult[]>([]);
  const [claimFees, setClaimFees] = useState<ClaimFeeTransaction[]>([]);
  const [lpRanges, setLpRanges] = useState<LPRange[]>([]);

  const handleTrackWallet = async () => {
    if (!walletAddress) {
      alert("Please enter a wallet address.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/sui", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      
      const data = await response.json();
      
      setLpResults(data?.transactions ?? []);
      setClaimFees(data?.claimFees ?? []);
      setLpRanges(data?.lpRanges ?? []);
    } catch (err) {
      alert(err);
    }
    setIsLoading(false);
  };
  
  return (
    <div className="grid grid-cols-12 gap-4 md:gap-6">
      <div className="col-span-12">
        {/* Wallet Address Input */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <input
            name="walletAddress"
            type="text"
            value={walletAddress}
            onChange={(e) => setWalletAddress(e.target.value)}
            placeholder="Enter SUI wallet address..."
            className="flex-grow border rounded-md py-2 px-4  dark:text-gray-300"
          />
          <button
            onClick={handleTrackWallet}
            disabled={isLoading}
            className="bg-brand-500 text-white px-6 py-2 rounded-md"
          >
            {isLoading ? "Loading..." : "Track LP"}
          </button>
        </div>
      </div>

      <div className="col-span-12 space-y-6 xl:col-span-7">
        <EcommerceMetrics lpResults={{ sui: lpResults }}  />
      </div>

      <div className="col-span-12 xl:col-span-5">
        {/* Pass totalClaimFee to MonthlyTarget */}
        <MonthlyTarget lpResults={lpResults} claimFees={claimFees.map(fee => ({
          ...fee,
          initializeWorthUSD: fee.initialWorthUSD
        }))} />
      </div>
      
      <div className="col-span-12">
        <RecentOrders
          lpResults={{
            sui: lpResults.map(pool => ({
              ...pool,
              transactions: pool.transactions.map(tx => ({
                ...tx,
                amounts: Object.fromEntries(
                  Object.entries(tx.amounts).map(([k, v]) => [k, v.toString()])
                ),
              })),
            })),
          }}
          lpRanges={lpRanges}
          isLoading={isLoading}
        />
      </div>
    </div>
  );
}
