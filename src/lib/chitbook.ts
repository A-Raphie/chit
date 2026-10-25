/**
 * ChitBook contract config — address set via VITE_CHITBOOK_ADDRESS after deploy.
 * ABI imported from the Foundry artifact.
 */
import type { Abi } from "viem";

// Loaded lazily so the app works even before deploy (address undefined).
export const CHITBOOK_ADDRESS = import.meta.env
  .VITE_CHITBOOK_ADDRESS as `0x${string}` | undefined;

export const CHITBOOK_ABI = [
  {
    type: "constructor",
    inputs: [{ name: "usdcToken", type: "address" }],
    stateMutability: "nonpayable",
  },
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
    type: "function",
    name: "receiptsOf",
    inputs: [{ name: "party", type: "address" }],
    outputs: [{ name: "", type: "uint256[]" }],
    stateMutability: "view",
  },
  {
    type: "function",
    name: "receiptCount",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
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
  {
    type: "error",
    name: "ZeroAddress",
    inputs: [],
  },
  {
    type: "error",
    name: "ZeroAmount",
    inputs: [],
  },
  {
    type: "error",
    name: "InvalidReceiptId",
    inputs: [],
  },
] as const satisfies Abi;

export interface ChitReceipt {
  id: bigint;
  payer: `0x${string}`;
  payee: `0x${string}`;
  amount: bigint;
  claimHash: `0x${string}`;
  memo: string;
  timestamp: bigint;
}

export function formatClaimRef(input: string): `0x${string}` {
  // keccak256 of UTF-8 bytes — done in the browser via viem
  // We return the raw input as a label; the hash is computed in the component.
  return input as `0x${string}`;
}
