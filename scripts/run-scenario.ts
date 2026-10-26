/**
 * Live end-to-end scenario runner for Chit.
 *
 * Generates an ephemeral payer wallet, requests testnet USDC via faucet,
 * approves ChitBook, calls pay(), confirms ReceiptIssued, then hits /receipt/1.
 *
 * Run: bun run scripts/run-scenario.ts
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  erc20Abi,
  keccak256,
  toBytes,
  parseAbiItem,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ONCHAIN_CHAINS, getUsdc } from "../src/onchain-facts.ts";

// ---------------------------------------------------------------------------
// Chain + contract config
// ---------------------------------------------------------------------------
const CHAIN_ID = 5042002;
const arc = ONCHAIN_CHAINS.find((c) => c.chainId === CHAIN_ID);
if (!arc) throw new Error("Arc Testnet not in onchain-facts");

const RPC_URL = (() => {
  const proxyChains = (process.env.RPC_PROXY_CHAINS ?? "").split(",");
  if (process.env.RPC_PROXY_BASE_URL && proxyChains.includes("Arc_Testnet")) {
    return `${process.env.RPC_PROXY_BASE_URL}/api/rpc/Arc_Testnet?_rpc_token=${process.env.RPC_PROXY_TOKEN}`;
  }
  return arc.rpcUrls[0]; // public fallback
})();

const VIEMCHAIN = {
  id: CHAIN_ID,
  name: arc.name,
  nativeCurrency: {
    name: arc.nativeCurrency.symbol,
    symbol: arc.nativeCurrency.symbol,
    decimals: arc.nativeCurrency.decimals,
  },
  rpcUrls: { default: { http: [RPC_URL] as [string] } },
} as const;

const CHITBOOK = process.env.VITE_CHITBOOK_ADDRESS as Hex;
if (!CHITBOOK) throw new Error("VITE_CHITBOOK_ADDRESS not set in .env");

const usdcFact = getUsdc(CHAIN_ID);
if (!usdcFact) throw new Error("USDC not in onchain-facts for Arc Testnet");
const USDC = usdcFact.address as Hex;
const USDC_DECIMALS = usdcFact.decimals; // 6

const CHITBOOK_ABI = [
  {
    type: "function",
    name: "pay",
    inputs: [
      { name: "payee", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "claimHash", type: "bytes32" },
      { name: "memo", type: "string" },
    ],
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
  },
  {
    type: "function",
    name: "getReceipt",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [
      {
        components: [
          { name: "id", type: "uint256" },
          { name: "payer", type: "address" },
          { name: "payee", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "claimHash", type: "bytes32" },
          { name: "memo", type: "string" },
          { name: "timestamp", type: "uint256" },
        ],
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
  },
  {
    type: "event",
    name: "ReceiptIssued",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "payer", type: "address", indexed: true },
      { name: "payee", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
      { name: "claimHash", type: "bytes32", indexed: false },
      { name: "memo", type: "string", indexed: false },
    ],
  },
] as const;

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------
// Well-known Hardhat test key #0 — testnet only.
// Address 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266 already holds testnet USDC.
const PAYER_PK: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const payerAccount = privateKeyToAccount(PAYER_PK);

// Service B payee — fresh address not on Circle's blocklist
const payeeAccount = privateKeyToAccount(
  "0xac2a13dfbace2c0a4c14fe677343c8d99a10828fc7741b0f676d4a53f6e76619"
);

const publicClient = createPublicClient({
  chain: VIEMCHAIN,
  transport: http(RPC_URL),
});

const walletClient = createWalletClient({
  account: payerAccount,
  chain: VIEMCHAIN,
  transport: http(RPC_URL),
});

// ---------------------------------------------------------------------------
// Wait for USDC balance >= minUnits
// ---------------------------------------------------------------------------
async function waitForBalance(address: Hex, minUnits: bigint, label: string) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const bal = await publicClient.readContract({
      address: USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    console.log(`    ${label} USDC balance: ${bal} units`);
    if (bal >= minUnits) return bal;
    await new Promise((r) => setTimeout(r, 3000));
  }
  throw new Error(`Timeout waiting for balance >= ${minUnits} units`);
}

// ---------------------------------------------------------------------------
// Main scenario
// ---------------------------------------------------------------------------
async function main() {
  console.log("=== Chit end-to-end scenario ===");
  console.log(`Payer:  ${payerAccount.address}`);
  console.log(`Payee:  ${payeeAccount.address}`);
  console.log(`ChitBook: ${CHITBOOK}`);
  console.log(`USDC:     ${USDC} (${USDC_DECIMALS} decimals)`);

  // 1. Confirm payer already has USDC on Arc Testnet
  console.log("\n[1] Checking payer USDC balance …");
  const initialPayeeBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payeeAccount.address],
  });
  const payerBal = await waitForBalance(payerAccount.address, 500_000n, "Payer");
  console.log(`    Confirmed payer has ${payerBal} units USDC`);

  // 3. Approve ChitBook to spend 0.5 USDC
  console.log("\n[3] Approving ChitBook to spend 0.5 USDC …");
  const approveTx = await walletClient.writeContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "approve",
    args: [CHITBOOK, 500_000n],
  });
  console.log(`    Approve tx: ${approveTx}`);

  // Wait for approval to land
  const approveReceipt = await publicClient.waitForTransactionReceipt({
    hash: approveTx,
  });
  console.log(
    `    Approve confirmed in block ${approveReceipt.blockNumber} (status: ${approveReceipt.status})`
  );

  // 4. call pay()
  const claimRef = "invoice-417-api-calls";
  const memo = "api calls batch 417";
  const claimHash = keccak256(toBytes(claimRef));
  console.log(`\n[4] Calling pay() with claim "${claimRef}" …`);
  console.log(`    claimHash: ${claimHash}`);

  const payTx = await walletClient.writeContract({
    address: CHITBOOK,
    abi: CHITBOOK_ABI,
    functionName: "pay",
    args: [payeeAccount.address, 500_000n, claimHash, memo],
  });
  console.log(`    pay() tx submitted: ${payTx}`);

  const payReceiptOnchain = await publicClient.waitForTransactionReceipt({
    hash: payTx,
  });
  console.log(
    `    pay() confirmed in block ${payReceiptOnchain.blockNumber} (status: ${payReceiptOnchain.status})`
  );

  if (payReceiptOnchain.status !== "success") {
    throw new Error("pay() transaction reverted!");
  }

  // 5. Confirm ReceiptIssued event
  console.log("\n[5] Confirming ReceiptIssued event …");
  const eventLog = payReceiptOnchain.logs.find(
    (l) => l.address.toLowerCase() === CHITBOOK.toLowerCase()
  );
  const receiptId = eventLog?.topics[1]
    ? BigInt(eventLog.topics[1])
    : undefined;
  console.log(`    ReceiptIssued id: ${receiptId?.toString()}`);

  // 6. getReceipt(1)
  console.log("\n[6] Reading receipt from contract …");
  const receiptStruct = (await publicClient.readContract({
    address: CHITBOOK,
    abi: CHITBOOK_ABI,
    functionName: "getReceipt",
    args: [1n],
  })) as {
    id: bigint;
    payer: string;
    payee: string;
    amount: bigint;
    claimHash: string;
    memo: string;
    timestamp: bigint;
  };
  console.log("    Receipt:", {
    id: receiptStruct.id.toString(),
    payer: receiptStruct.payer,
    payee: receiptStruct.payee,
    amount: receiptStruct.amount.toString(),
    amountUsdc: (Number(receiptStruct.amount) / 10 ** USDC_DECIMALS).toFixed(6),
    claimHash: receiptStruct.claimHash,
    memo: receiptStruct.memo,
    timestamp: receiptStruct.timestamp.toString(),
    timestampIso: new Date(Number(receiptStruct.timestamp) * 1000).toISOString(),
  });

  // 7. Verify payee received +0.5 USDC
  console.log("\n[7] Verifying payee balance …");
  const finalPayeeBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [payeeAccount.address],
  });
  console.log(
    `    Payee delta: ${finalPayeeBalance - initialPayeeBalance} units (expected 500000)`
  );

  // 8. Verify contract holds 0 USDC
  const contractBalance = await publicClient.readContract({
    address: USDC,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [CHITBOOK],
  });
  console.log(`    ChitBook USDC balance: ${contractBalance} (expected 0)`);

  // 9. Hit /api/receipt/1
  console.log("\n[8] Fetching http://localhost:3001/receipt/1 …");
  const apiRes = await fetch("http://localhost:3001/receipt/1");
  const apiJson = await apiRes.json();
  console.log(`    HTTP ${apiRes.status}:`, JSON.stringify(apiJson, null, 2));

  // 10. Verify by claim hash (scan events)
  console.log("\n[9] Verifying by claim hash from events …");
  const head = await publicClient.getBlockNumber();
  const fromBlock = head > 5000n ? head - 5000n : 0n;
  const logs = await publicClient.getLogs({
    address: CHITBOOK,
    event: parseAbiItem(
      "event ReceiptIssued(uint256 indexed id, address indexed payer, address indexed payee, uint256 amount, bytes32 claimHash, string memo)"
    ),
    fromBlock,
    toBlock: head,
  });
  const matchByHash = logs.find((l) => l.args.claimHash === claimHash);
  console.log(
    `    Match by claimHash: receipt id ${matchByHash?.args.id?.toString() ?? "NOT FOUND"}`
  );

  // Final summary
  console.log("\n=== SUMMARY ===");
  console.log(`Payment tx:    ${payTx}`);
  console.log(
    `Explorer:      https://explorer.testnet.arc.io/tx/${payTx}`
  );
  console.log(`claimHash:     ${claimHash}`);
  console.log(`Receipt JSON:  ${JSON.stringify({
    id: receiptStruct.id.toString(),
    payer: receiptStruct.payer,
    payee: receiptStruct.payee,
    amount: receiptStruct.amount.toString(),
    amountUsdc: (Number(receiptStruct.amount) / 10 ** USDC_DECIMALS).toFixed(6),
    claimHash: receiptStruct.claimHash,
    memo: receiptStruct.memo,
    timestamp: receiptStruct.timestamp.toString(),
    timestampIso: new Date(Number(receiptStruct.timestamp) * 1000).toISOString(),
    txHash: payTx,
    explorerUrl: `https://explorer.testnet.arc.io/tx/${payTx}`,
  }, null, 2)}`);
  console.log("\nAll steps PASSED.");
}

main().catch((e) => {
  console.error("SCENARIO FAILED:", e);
  process.exit(1);
});
