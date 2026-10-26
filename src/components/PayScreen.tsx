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
import ReceiptPreview from "./ReceiptPreview";

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

const inputCls =
  "w-full font-mono text-sm bg-[#f5f0e8] border-2 border-[#2a1f0e]/25 rounded-md px-3 py-2.5 text-[#2a1f0e] placeholder:text-[#2a1f0e]/30 focus:outline-none focus:border-[#a07830] focus:ring-2 focus:ring-[#a07830]/30 disabled:opacity-50";
const labelCls =
  "block text-[10px] font-mono uppercase tracking-[0.18em] text-[#2a1f0e]/60 mb-1.5";

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

  const { data: usdcBalance } = useReadContract({
    address: usdcAddress,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!address && !!usdcAddress },
  });

  const { writeContract: approveWrite, data: approveTxHash } = useWriteContract();
  const { isLoading: approveConfirming, isSuccess: approveSuccess } =
    useWaitForTransactionReceipt({ hash: approveTxHash });

  const { writeContract: payWrite, data: payTxHash } = useWriteContract();
  const { isLoading: payConfirming, isSuccess: paySuccess, data: payReceipt } =
    useWaitForTransactionReceipt({ hash: payTxHash });

  const [issuedId, setIssuedId] = useState<bigint | undefined>();
  const { data: receiptData } = useReadContract({
    address: CHITBOOK_ADDRESS,
    abi: CHITBOOK_ABI,
    functionName: "getReceipt",
    args: issuedId ? [issuedId] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!issuedId && !!CHITBOOK_ADDRESS },
  });

  if (approveSuccess && step === "approving") {
    setStep("approved");
    toast.success("USDC approved — ready to issue chit.");
  }

  if (paySuccess && payReceipt && step === "paying") {
    setStep("done");
    const log = payReceipt.logs.find((l) =>
      l.address?.toLowerCase() === CHITBOOK_ADDRESS?.toLowerCase()
    );
    if (log) {
      const idHex = log.topics[1];
      if (idHex) setIssuedId(BigInt(idHex));
    }
  }

  if (receiptData && step === "done" && issuedId) {
    const r = receiptData;
    setStep("idle");
    setIssuedId(undefined);
    onReceiptIssued(r, payTxHash, claimRef);
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
    <div className="grid gap-8 lg:grid-cols-[1fr_360px] items-start">
      <div className="space-y-5 min-w-0">
        <div className="border-b-2 border-[#2a1f0e] pb-3">
          <h1 className="font-serif text-3xl font-bold text-[#2a1f0e] tracking-tight">
            Issue a Chit
          </h1>
          <p className="text-xs font-mono uppercase tracking-[0.14em] text-[#2a1f0e]/50 mt-1">
            Pay USDC with verifiable proof of settlement
          </p>
        </div>

        {!CHITBOOK_ADDRESS && (
          <div className="bg-[#a07830]/10 border border-[#a07830]/40 rounded-md p-4 text-sm text-[#7a5a20] font-mono">
            Contract not yet deployed. Deploy ChitBook first.
          </div>
        )}

        {isWrongChain && (
          <div className="bg-[#f5b83d]/25 border-2 border-[#a07830] rounded-md p-4 flex items-center justify-between gap-4">
            <p className="text-sm text-[#7a5a20] font-mono">Wrong network — switch to Arc Testnet.</p>
            <button
              onClick={() => switchChain({ chainId: CHAIN_ID })}
              className="bg-[#2a1f0e] text-[#f5f0e8] border-2 border-[#2a1f0e] px-4 py-2 rounded-md text-xs font-mono uppercase tracking-wider shadow-[2px_2px_0_#7a5a20] hover:-translate-y-px active:translate-y-0 active:shadow-none transition-all"
            >
              Switch
            </button>
          </div>
        )}

        <div className="bg-[#fffaf0] border-2 border-[#2a1f0e] rounded-lg shadow-[4px_4px_0_#2a1f0e] overflow-hidden">
          <div className="bg-[#2a1f0e] px-5 py-3 flex items-center justify-between">
            <span className="font-mono text-[#f5f0e8]/80 text-[11px] uppercase tracking-[0.18em]">
              New payment receipt
            </span>
            {formattedBalance !== null && (
              <span className="font-mono text-[#f5b83d] text-xs">
                {formattedBalance} USDC
              </span>
            )}
          </div>

          <div className="p-5 space-y-4">
            <div className="grid gap-4 sm:grid-cols-[1fr_180px]">
              <div>
                <label className={labelCls}>Payee address</label>
                <input
                  value={payee}
                  onChange={(e) => setPayee(e.target.value)}
                  placeholder="0x…"
                  disabled={busy}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Amount</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    placeholder="0.00"
                    disabled={busy}
                    className={`${inputCls} pr-14 text-lg tabular-nums`}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-[#7a5a20] uppercase tracking-wider">
                    USDC
                  </span>
                </div>
              </div>
            </div>

            <div>
              <label className={labelCls}>Claim reference — what this payment settles</label>
              <input
                value={claimRef}
                onChange={(e) => setClaimRef(e.target.value)}
                placeholder="e.g. invoice-417-api-calls"
                disabled={busy}
                className={inputCls}
              />
              {claimRef.trim() && (
                <p className="mt-1 text-[10px] font-mono text-[#2a1f0e]/40 break-all">
                  → {keccak256(toBytes(claimRef.trim()))}
                </p>
              )}
            </div>

            <div>
              <label className={labelCls}>
                Memo <span className="normal-case tracking-normal text-[#2a1f0e]/35">(optional)</span>
              </label>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="e.g. 1000 API calls @ 0.0005 USDC each"
                disabled={busy}
                className={inputCls}
              />
            </div>

            <div className="border-t-2 border-dashed border-[#2a1f0e]/20" />

            {/* Actions */}
            {!isConnected ? (
              <div className="space-y-3">
                <ConnectKitButton.Custom>
                  {({ show }) => (
                    <button
                      onClick={show}
                      className="w-full bg-[#f5b83d] text-[#2a1f0e] border-2 border-[#2a1f0e] py-3.5 rounded-md font-mono text-sm font-bold uppercase tracking-[0.14em] shadow-[3px_3px_0_#2a1f0e] hover:-translate-y-0.5 hover:shadow-[5px_5px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all"
                    >
                      Connect wallet to issue this chit
                    </button>
                  )}
                </ConnectKitButton.Custom>
                <p className="text-[10px] font-mono text-[#2a1f0e]/40 text-center uppercase tracking-[0.16em]">
                  Fill the form freely — nothing signs until you connect
                </p>
              </div>
            ) : step === "idle" ? (
              <div className="flex gap-3">
                <button
                  onClick={handleApprove}
                  disabled={!CHITBOOK_ADDRESS}
                  className="flex-1 bg-[#f5f0e8] border-2 border-[#2a1f0e] text-[#2a1f0e] py-3 rounded-md font-mono text-xs uppercase tracking-wider shadow-[3px_3px_0_#2a1f0e] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  1 · Approve USDC
                </button>
                <button
                  onClick={handlePay}
                  disabled={!CHITBOOK_ADDRESS}
                  className="flex-1 bg-[#f5b83d] text-[#2a1f0e] border-2 border-[#2a1f0e] py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider shadow-[3px_3px_0_#2a1f0e] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  2 · Issue chit
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {step === "approving" && (
                  <button disabled className="w-full bg-[#2a1f0e]/70 text-[#f5f0e8] py-3 rounded-md font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                    <Spinner /> Confirm in wallet…
                  </button>
                )}
                {(approveConfirming || step === "approved") && (
                  <button disabled className="w-full bg-[#a07830] text-white py-3 rounded-md font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                    {approveConfirming ? <><Spinner /> Approving…</> : "Approved"}
                  </button>
                )}
                {(step === "approved" || approveConfirming) && (
                  <button
                    onClick={handlePay}
                    disabled={!CHITBOOK_ADDRESS || approveConfirming}
                    className="w-full bg-[#f5b83d] text-[#2a1f0e] border-2 border-[#2a1f0e] py-3 rounded-md font-mono text-xs font-bold uppercase tracking-wider shadow-[3px_3px_0_#2a1f0e] hover:-translate-y-0.5 hover:shadow-[4px_4px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all disabled:opacity-40"
                  >
                    Issue chit
                  </button>
                )}
                {(step === "paying" || step === "done") && (
                  <button disabled className="w-full bg-[#2a1f0e]/70 text-[#f5f0e8] py-3 rounded-md font-mono text-xs uppercase tracking-wider flex items-center justify-center gap-2">
                    <Spinner /> {step === "done" ? "Loading receipt…" : payConfirming ? "Confirming on Arc…" : "Confirm in wallet…"}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-[10px] font-mono text-[#2a1f0e]/40 leading-relaxed">
          ChitBook never holds funds — USDC moves payer → payee in the same call, with the receipt written onchain.
        </p>
      </div>

      {/* Live receipt preview — the artifact, before it exists */}
      <div className="hidden lg:block sticky top-20">
        <ReceiptPreview payee={payee} amount={amount} claimRef={claimRef} memo={memo} />
        <p className="text-[10px] font-mono text-[#2a1f0e]/40 text-center mt-3 uppercase tracking-[0.16em]">
          This slip mints the moment the payment lands
        </p>
      </div>
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
