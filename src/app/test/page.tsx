'use client'

import React, { useState } from "react";


export default function TestPage() {
  // --- LP Tracker logic ---
  const [walletAddress, setWalletAddress] = useState("");
  const [isLoading, setIsLoading] = useState(false);
 

  const handleTrackWallet = async () => {
    if (!walletAddress) {
      alert("Please enter a wallet address.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch("/api/sui/own-object", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress }),
      });
      const data = await response.json();
      console.log(data);
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
            className="flex-grow border rounded-md py-2 px-4"
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

    </div>
  );
}
