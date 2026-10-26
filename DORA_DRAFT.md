# DoraHacks submission draft — Arc Microgrants 2 (NOT SUBMITTED YET)

Submit at https://dorahacks.io/hackathon/arc-microgrants-2/ after the mainnet
deployment + demo tx land. Every field below is final-copy ready; swap the
MAINNET placeholders when they exist.

## One-liner

Chit is the receipt layer for agent-to-agent USDC payments on Arc: pay with a
claim reference, get an onchain receipt, prove settlement with one curl.

## Description

Agents paying agents is about to be the largest machine economy on stablecoin
rails, and it runs on vibes: a payment lands, both sides log whatever they
want, and nobody can prove anything. Invoices get disputed, reconciliation is
manual, and an auditor has to trust both parties' databases.

Chit turns every USDC payment into a self-proving receipt:

- **Issue**: the payer pays USDC with a plain-text claim reference ("invoice-417",
  "api calls batch 417"). ChitBook moves USDC payer to payee and writes the
  receipt in the same transaction. The contract never holds funds.
- **Receipt**: every chit carries a number, both addresses, the amount, the
  keccak256 claim hash, an optional memo, and the timestamp, onchain forever.
- **Verify**: anyone resolves any receipt four ways: chit number, the plain
  claim text, the claim hash, or the tx hash. In the app, or with one curl:

  `curl https://chit-sigma-khaki.vercel.app/api/receipt/1`

- **Integrate**: the HTTP verification endpoint returns receipt JSON with no
  key and no login, so a payee agent can check an inbound payment
  programmatically before releasing work.

The claim text never goes onchain, only its hash: counterparties can prove
what a payment settled for without leaking the wording.

## Criteria mapping

- **USDC payment on Arc mainnet (30%)**: MAINNET_TX_PLACEHOLDER (real USDC
  moved payer to payee through ChitBook, receipt minted in the same tx).
- **Built with Arc Studio (25%)**: the contract and app were built in Arc
  Studio (project: https://studio.arc.io/app/355cd223-1f8a-4932-8eab-20b459fd8d6a);
  the repo carries the Studio watermark and the full session history.
- **Working product (25%)**: live app + HTTP verification API, deployed and
  chain-verifiable today: `bash verify.sh` re-checks every claim against the
  RPC (6/6 PASS).
- **Potential (20%)**: every x402 / agent-commerce payment needs exactly this
  primitive; receipts are chain-agnostic and the claim-hash pattern extends
  to any stablecoin rail.

## Links block

- Live app: https://chit-sigma-khaki.vercel.app
- Repo: https://github.com/A-Raphie/chit
- Arc Studio project: https://studio.arc.io/app/355cd223-1f8a-4932-8eab-20b459fd8d6a
- Mainnet contract: MAINNET_CONTRACT_PLACEHOLDER
- Mainnet demo tx: MAINNET_TX_PLACEHOLDER
- Demo video: VIDEO_PLACEHOLDER (YouTube, Raphie channel)

## Media checklist at submit time

- [ ] thumbnail.png (16:9 money-moment, from docs/media/receipt.jpg base)
- [ ] 3-6 screenshots in screenshots/ (front door, pay form + live preview,
      receipt money moment, verify proof, curl result, verify.sh 6/6)
- [ ] public video link embedded (upload to YouTube as Raphie, unlisted ok)
- [ ] builder profile complete on DoraHacks

## Video script (60-75s, ai33 "Honest Man" VO)

1. (0:00) HOOK, on receipt money-moment: "When an AI agent pays another
   agent, how does either side prove it happened?"
2. (0:08) PROBLEM, b-roll listicle-style: "The payment lands. Both sides log
   whatever they want. Nobody can prove anything. Reconciliation is manual."
3. (0:18) PRODUCT, live front door: "Chit mints a receipt for every USDC
   payment on Arc. Pay with a claim reference, and the receipt is written in
   the same transaction. The contract never holds the money."
4. (0:32) MONEY MOMENT, live payment + receipt opening: "Both sides get a
   chit: number, addresses, amount, claim hash, timestamp. Onchain forever."
5. (0:45) VERIFY, live lookup + terminal: "Anyone can verify it four ways,
   or with one curl. No key, no login, no trusting anyone's database."
6. (0:55) CLOSE, Studio project + repo: "Built in Arc Studio. Contract,
   app, and a one-command prover in the repo. Chit: pay, receipt, proof."
