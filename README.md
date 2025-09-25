# Hyperliquid Kittenswap LP Tracker

Welcome to the **Hyperliquid Kittenswap LP Tracker** project!
This app helps you inspect Kittenswap liquidity provider (LP) positions for any Hyperliquid wallet.

---

## About

This project is a work-in-progress tool for tracking Hyperliquid Kittenswap liquidity provider activity, including:

- **LP Positions**: View all detected Kittenswap pools for a wallet and their USD values.
- **Token Exposure**: See the token amounts that make up each LP position.
- **Fees**: Inspect any accrued or claimable fees if Hyperliquid exposes them.
- **Timestamps**: Check when each position was last updated according to the payload data.

The frontend is built using [TailAdmin](https://tailadmin.com) (Next.js + Tailwind CSS), providing a modern, responsive dashboard UI.

---

## Tech Stack

- **Frontend**: Next.js 15, React 19, Tailwind CSS 4 (TailAdmin template)
- **Backend**: Next.js API routes, TypeScript
- **Charts**: ApexCharts for React

---

## Status

🚧 **This project is still in progress!**  
If you find bugs or have suggestions, please open an issue or feedback on this repo.

---

## How to Run

1. **Clone the repo:**
    ```bash
    git clone https://github.com/your-username/kitten-lp-tracker.git
    cd kitten-lp-tracker
    ```

2. **Install dependencies:**
    ```bash
    npm install
    ```

3. **(Optional) Configure on-chain RPC settings:**
   The tracker now decodes KittenSwap Algebra CLMM NFTs directly from HyperEVM. You can tweak the RPC and log scanning behaviour in `.env.local` if needed:
    ```bash
    # Override the default HyperEVM RPC endpoint
    HYPEREVM_RPC=https://rpc.hyperliquid.xyz/evm

    # (Optional) Optimise transfer log scanning when enumeration fails
    START_BLOCK=0
    CHUNK_SPAN=800
    ```
   The defaults work for most setups, but operators running their own archival RPCs can lower `CHUNK_SPAN` or raise `START_BLOCK` to improve responsiveness.

4. **Start the development server:**
    ```bash
    npm run dev
    ```

5. **Open the tracker:**
   Visit [http://localhost:3000/admin](http://localhost:3000/admin) and enter any Hyperliquid wallet address to fetch its Kittenswap LP positions.

---

## Feedback & Contribution

- Found a bug? Have a feature request?  
  Please open an issue or PR on this repository!

---

## Donations

If you love this project and want to support development, you can donate to:

- **SOL:** `CgG6PVaQYCogRyQ1mQNTjdus9QGHejFN2SwQQ14Vq7ot`
- **ETH:** `0x84a99E6Fc00157795D7316d8C8bF88AbF600C755`
- **SUI:** `0x6940126d04e8b2b7931bb541608b9de258e882336526c839cb0f3190a678302e`

---

## Credits

- **Frontend UI:** [TailAdmin](https://tailadmin.com)
- **Love From:** Adexe 💙

---

## License
