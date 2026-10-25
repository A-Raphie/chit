import { useState } from "react";
import { ConnectKitButton } from "connectkit";
import {
  useAccount,
  useWriteContract,
  useWaitForTransactionReceipt,
  useReadContract,
  useSwitchChain,
} from "wagmi";
import { erc20Abi, keccak256, toBytes, isAddress } from "viem";
import { toast } from "sonner";
import { getUsdc } from "@/onchain-facts";
import { Amount, parseAmount, usdcDecimalsFor } from "@/onchain-money";
import { CHITBOOK_ADDRESS, CHITBOOK_ABI, type ChitReceipt } from "@/lib/chitbook";

const CHAIN_ID = 5042002 as const; // Arc Testnet

interface Props {
  onReceiptIssued: (receipt: ChitReceipt, txHash?: `0x${string}`, claimRef?: string) => void;
}

function parseOnchainError(error: unknown): string {
  const msg = (error instanceof Error ? error.message : String(error)).toLowerCase();
  if (msg.includes("user rejected") || msg.includes("user denied")) return "Transaction cancelled.";
  if (msg.includes("insufficient") || msg.includes("exceeds balance")) return "Insufficient USDC balance.";
  if (msg.includes("zeroaddress")) return "Invalid payee address.";
  if (msg.includes("zeroamount")) return "Amount must be greater than zero.";
  if (msg.includes("reverted")) return "Transaction reverted. Check approvals and try again.";
  if (msg.includes("allowance") || msg.includes("transfer amount exceeds")) return "Allowance too low — please approve the amount first.";
  return "Something went wrong. Please try again.";
}

type Step = "idle" | "approving" | "approved" | "paying" | "done";

export default function PayScreen({ onReceiptIssued }: Props) {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();

  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [claimRef, setClaimRef] = useState("");
  const [memo, setMemo] = useState("");
  const [step, setStep] = useState<Step>("idle");

  const usdcFact = getUsdc(CHAIN_ID);
  const usdcAddress = usdcFact?.address as `0x${string}` | undefined;

  // USDC balance
  const { data: usdcBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!usdcAddress },
  });

  // Approve
  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  // Pay
  const { writeContract: payWrite, data: payTxHash } = useWriteContract();
  const { isLoading: payConfirming, isSuccess: paySuccess, data: payReceipt } =
    useWaitForTransactionReceipt({ hash: payTxHash });

  // Read back the receipt once pay lands
  const [issuedId, setIssuedId] = useState<bigint | undefined>();
  const { data: receiptData } = useReadContract({
    address: CHITBOOK_ADDRESS,
    abi: CHITBOOK_ABI,
    functionName: "getReceipt",
    args: issuedId ? [issuedId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!issuedId && !!CHITBOOK_ADDRESS },
  });

  // Watch for approve confirm
  if (approveSuccess && step === "approving") {
    setStep("approved");
    toast.success("USDC approved — ready to issue chit.");
  }

  // Watch for pay confirm
  if (paySuccess && payReceipt && step === "paying") {
    setStep("done");
    // Extract the id from ReceiptIssued event logs
    const log = payReceipt.logs.find((l) =>
      l.address?.toLowerCase() === CHITBOOK_ADDRESS?.toLowerCase()
    );
    if (log) {
      // First indexed topic (after event sig) is the receipt id
      const idHex = log.topics[1];
      if (idHex) {
        const id = BigInt(idHex);
        setIssuedId(id);
      }
    }
  }

  // Navigate once receiptData loaded
  if (receiptData && step === "done" && issuedId) {
    const r = receiptData;
    setStep("idle");
    setIssuedId(undefined);
    onReceiptIssued(r, payTxHash, claimRef);
    // reset form
    setPayee("");
    setAmount("");
    setClaimRef("");
    setMemo("");
  }

  const isWrongChain = isConnected && chainId !== CHAIN_ID;

  function handleApprove() {
    if (!usdcAddress || !CHITBOOK_ADDRESS) return;
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount."); return; }
    const parsed = parseAmount(CHAIN_ID, amount);
    setStep("approving");
    approveWrite(
      {
        address: usdcAddress,
        abi: erc20Abi,
        functionName: "approve",
        args: [CHITBOOK_ADDRESS, parsed.raw],
        chainId: CHAIN_ID,
      },
      {
        onError(e) {
          setStep("idle");
          toast.error(parseOnchainError(e));
        },
      }
    );
  }

  function handlePay() {
    if (!CHITBOOK_ADDRESS) return;
    if (isWrongChain) { switchChain({ chainId: CHAIN_ID }); return; }
    if (!isAddress(payee)) { toast.error("Enter a valid payee address."); return; }
    if (!amount || Number(amount) <= 0) { toast.error("Enter a valid amount."); return; }
    if (!claimRef.trim()) { toast.error("Claim reference is required."); return; }
    const parsed = parseAmount(CHAIN_ID, amount);
    const claimHash = keccak256(toBytes(claimRef.trim()));
    setStep("paying");
    payWrite(
      {
        address: CHITBOOK_ADDRESS,
        abi: CHITBOOK_ABI,
        functionName: "pay",
        args: [payee, parsed.raw, claimHash, memo.trim()],
        chainId: CHAIN_ID,
      },
      {
        onError(e) {
          setStep("idle");
          toast.error(parseOnchainError(e));
        },
      }
    );
  }

  const formattedBalance = usdcBalance !== undefined
    ? Amount.fromRaw(usdcBalance, usdcDecimalsFor(CHAIN_ID)).toFixed(2)
    : null;

  const busy = step === "approving" || step === "approved" || step === "paying" || step === "done";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-serif text-3xl font-bold text-[#2a1f0e] tracking-tight">
          Issue a Chit
        </h1>
        <p className="text-sm text-[#2a1f0e]/50 mt-1">
          Pay with verifiable proof of settlement.
        </p>
      </div>

      {!CHITBOOK_ADDRESS && (
        <div className="bg-[#a07830]/10 border border-[#a07830]/30 rounded-lg p-4 text-sm text-[#a07830] font-mono">
          Contract not yet deployed. Deploy ChitBook first.
        </div>
      )}

      {!isConnected ? (
        <div className="border-2 border-dashed border-[#2a1f0e]/20 rounded-xl p-10 text-center">
          <p className="text-[#2a1f0e]/50 text-sm mb-3">Connect your wallet to issue chits</p>
          <ConnectKitButton />
        </div>
      ) : isWrongChain ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 text-center space-y-3">
          <p className="text-amber-700 text-sm font-mono">Wrong network. Switch to Arc Testnet.</p>
          <button
            onClick={() => switchChain({ chainId: CHAIN_ID })}
            className="bg-[#2a1f0e] text-[#f5f0e8] px-5 py-2 rounded-lg text-sm font-mono hover:bg-[#2a1f0e]/80 transition-colors"
          >
            Switch Network
          </button>
        </div>
      ) : (
        <div className="bg-white/80 border border-[#2a1f0e]/10 rounded-xl shadow-sm overflow-hidden">
          {/* Paper receipt header stripe */}
          <div className="bg-[#2a1f0e] px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-[#f5f0e8]/80 text-xs uppercase tracking-[0.14em]">
              New Payment Receipt
            </span>
            {formattedBalance !== null && (
              <span className="font-mono text-[#a07830] text-xs">
                Balance: {formattedBalance} USDC
              </span>
            )}
          </div>

          <div className="p-5 space-y-4">
            {/* Payee */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 mb-1">
                Payee Address
              </label>
              <input
                value={payee}
                onChange={(e) => setPayee(e.target.value)}
                placeholder="0x..."
                disabled={busy}
                className="w-full font-mono text-sm bg-[#f5f0e8] border border-[#2a1f0e]/15 rounded-lg px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/25 focus:outline-none focus:ring-2 focus:ring-[#a07830]/40 disabled:opacity-50"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 mb-1">
                Amount (USDC)
              </label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  disabled={busy}
                  className="w-full font-mono text-xl tabular-nums bg-[#f5f0e8] border border-[#2a1f0e]/15 rounded-lg px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/20 focus:outline-none focus:ring-2 focus:ring-[#a07830]/40 pr-16 disabled:opacity-50"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#2a1f0e]/40 uppercase">
                  USDC
                </span>
              </div>
            </div>

            {/* Claim reference */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 mb-1">
                Claim Reference
              </label>
              <input
                value={claimRef}
                onChange={(e) => setClaimRef(e.target.value)}
                placeholder="e.g. invoice-417-api-calls"
                disabled={busy}
                className="w-full font-mono text-sm bg-[#f5f0e8] border border-[#2a1f0e]/15 rounded-lg px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/25 focus:outline-none focus:ring-2 focus:ring-[#a07830]/40 disabled:opacity-50"
              />
              {claimRef.trim() && (
                <p className="mt-1 text-[10px] font-mono text-[#2a1f0e]/30 break-all">
                  hash: {keccak256(toBytes(claimRef.trim()))}
                </p>
              )}
            </div>

            {/* Memo */}
            <div>
              <label className="block text-xs font-mono uppercase tracking-wider text-[#2a1f0e]/50 mb-1">
                Memo{" "}
                <span className="normal-case text-[#2a1f0e]/30">(optional)</span>
              </label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. 1000 API calls @ 0.0005 USDC each"
                disabled={busy}
                className="w-full text-sm bg-[#f5f0e8] border border-[#2a1f0e]/15 rounded-lg px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/25 focus:outline-none focus:ring-2 focus:ring-[#a07830]/40 disabled:opacity-50"
              />
            </div>

            {/* Dashed divider */}
            <div className="border-t-2 border-dashed border-[#2a1f0e]/10 my-2" />

            {/* Two-step action */}
            <div className="flex gap-3">
              {step === "idle" && (
                <>
                  <button
                    onClick={handleApprove}
                    disabled={!CHITBOOK_ADDRESS}
                    className="flex-1 bg-[#f5f0e8] border border-[#2a1f0e]/20 text-[#2a1f0e] py-3 rounded-lg font-mono text-sm uppercase tracking-wider hover:bg-[#2a1f0e]/5 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    1. Approve USDC
                  </button>
                  <button
                    onClick={handlePay}
                    disabled={!CHITBOOK_ADDRESS}
                    className="flex-1 bg-[#2a1f0e] text-[#f5f0e8] py-3 rounded-lg font-mono text-sm uppercase tracking-wider hover:bg-[#2a1f0e]/80 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                  >
                    2. Issue Chit
                  </button>
                </>
              )}
              {step === "approving" && (
                <button disabled className="flex-1 bg-[#2a1f0e]/50 text-[#f5f0e8] py-3 rounded-lg font-mono text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                  <Spinner /> Confirm in wallet…
                </button>
              )}
              {(approveConfirming || step === "approved") && (
                <button disabled className="flex-1 bg-[#a07830] text-white py-3 rounded-lg font-mono text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                  {approveConfirming ? <><Spinner /> Approving…</> : "Approved — now Issue Chit"}
                </button>
              )}
              {step === "paying" && (
                <button disabled className="flex-1 bg-[#2a1f0e]/50 text-[#f5f0e8] py-3 rounded-lg font-mono text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                  <Spinner /> {payConfirming ? "Confirming on Arc…" : "Confirm in wallet…"}
                </button>
              )}
              {step === "done" && (
                <button disabled className="flex-1 bg-emerald-600 text-white py-3 rounded-lg font-mono text-sm uppercase tracking-wider flex items-center justify-center gap-2">
                  <Spinner /> Loading receipt…
                </button>
              )}
            </div>

            {/* One-shot shortcut when already approved */}
            {step === "approved" && (
              <button
                onClick={handlePay}
                disabled={!CHITBOOK_ADDRESS}
                className="w-full bg-[#2a1f0e] text-[#f5f0e8] py-3 rounded-lg font-mono text-sm uppercase tracking-wider hover:bg-[#2a1f0e]/80 transition-colors shadow-sm disabled:opacity-40"
              >
                Issue Chit
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}
