import { useState } from "react";
import { buildTxExplorerUrl } from "@/onchain-facts";
import { Amount, usdcDecimalsFor } from "@/onchain-money";
import type { ChitReceipt } from "@/lib/chitbook";
import { ExternalLink, Copy, Check, ArrowLeft } from "lucide-react";

const CHAIN_ID = 5042002;

interface Props {
  receipt: ChitReceipt;
  txHash?: `0x${string}`;
  claimRef?: string;
  onBack?: () => void;
}

function shortAddr(addr: string) {
  return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
}

function formatTs(ts: bigint) {
  return new Date(Number(ts) * 1000).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function ReceiptView({ receipt, txHash, claimRef, onBack }: Props) {
  const [copied, setCopied] = useState(false);

  function copyText(text: string) {
    return navigator.clipboard.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {}
    );
  }

  const explorerUrl = txHash
    ? buildTxExplorerUrl(CHAIN_ID, txHash)
    : undefined;

  const amountFormatted = Amount.fromRaw(receipt.amount, usdcDecimalsFor(CHAIN_ID)).toFixed(6);

  const json = JSON.stringify(
    {
      chitNumber: receipt.id.toString(),
      payer: receipt.payer,
      payee: receipt.payee,
      amountUsdc: amountFormatted,
      claimRef: claimRef ?? null,
      claimHash: receipt.claimHash,
      memo: receipt.memo,
      timestamp: receipt.timestamp.toString(),
      timestampIso: new Date(Number(receipt.timestamp) * 1000).toISOString(),
      txHash: txHash ?? null,
      explorerUrl: explorerUrl ?? null,
    },
    null,
    2
  );

  function copyJson() {
    void navigator.clipboard.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="space-y-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-[#2a1f0e]/50 hover:text-[#2a1f0e] transition-colors font-mono uppercase tracking-wider"
        >
          <ArrowLeft size={14} />
          Back
        </button>
      )}

      {/* The voucher slip */}
      <div className="bg-[#fffaf0] border-2 border-[#2a1f0e] rounded-lg shadow-[5px_5px_0_#2a1f0e] overflow-hidden font-mono">
        {/* perforated tear edge */}
        <div
          aria-hidden
          className="h-3 bg-[#f5f0e8]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 7px 8px, #f5f0e8 5px, transparent 5px), radial-gradient(circle at 7px 8px, #2a1f0e 5px, transparent 5px)",
            backgroundSize: "14px 16px",
            backgroundPosition: "0 0, 0 1px",
          }}
        />
        {/* Header stripe */}
        <div className="bg-[#2a1f0e] px-6 py-4 text-center">
          <p className="text-[#f5f0e8]/70 text-[10px] uppercase tracking-[0.2em]">
            Arc Testnet · ChitBook
          </p>
          <p className="text-[#f5b83d] text-4xl font-bold tabular-nums mt-1 tracking-tight">
            #{receipt.id.toString()}
          </p>
          <p className="text-[#a07830] text-xs mt-1 tracking-[0.1em] uppercase">
            Payment Receipt
          </p>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4 text-[#2a1f0e]">
          {/* Amount — big display */}
          <div className="text-center py-3 border-y-2 border-dashed border-[#2a1f0e]/25">
            <p className="text-[10px] uppercase tracking-[0.16em] text-[#2a1f0e]/55 mb-1">
              Amount Settled
            </p>
            <p className="text-4xl font-bold tabular-nums tracking-tight text-[#2a1f0e]">
              {amountFormatted}
            </p>
            <p className="text-xs text-[#7a5a20] mt-0.5 tracking-[0.3em] uppercase">USDC settled</p>
          </div>

          {/* Fields */}
          <ReceiptRow label="Payer" value={shortAddr(receipt.payer)} full={receipt.payer} />
          <ReceiptRow label="Payee" value={shortAddr(receipt.payee)} full={receipt.payee} />

          <div className="border-t border-dashed border-[#2a1f0e]/10 pt-4 space-y-3">
            {claimRef && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/55 mb-0.5">
                  Claim Reference
                </p>
                <p className="text-sm text-[#2a1f0e] break-all">{claimRef}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/55 mb-0.5">
                Claim Hash (keccak256)
              </p>
              <button
                onClick={() => void copyText(receipt.claimHash)}
                title="Copy claim hash"
                className="text-[11px] text-[#2a1f0e]/70 hover:text-[#a07830] transition-colors break-all leading-relaxed text-left group"
              >
                {receipt.claimHash}
                <Copy size={10} className="inline ml-1 opacity-0 group-hover:opacity-60 align-middle" />
              </button>
            </div>

            {receipt.memo && (
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/55 mb-0.5">
                  Memo
                </p>
                <p className="text-sm text-[#2a1f0e] italic">&ldquo;{receipt.memo}&rdquo;</p>
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/55 mb-0.5">
                Timestamp
              </p>
              <p className="text-sm">{formatTs(receipt.timestamp)}</p>
            </div>
          </div>

          {/* Tear line + tx hash */}
          {txHash && (
            <>
              <div className="relative my-4">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t-2 border-dashed border-[#2a1f0e]/10" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-[#fffaf0] px-3 text-[10px] uppercase tracking-[0.2em] text-[#2a1f0e]/50 border border-[#2a1f0e]/20 rounded-sm">
                    Transaction
                  </span>
                </div>
              </div>

              <div className="pt-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/55 mb-1">
                  Tx Hash
                </p>
                <button
                  onClick={() => txHash && void copyText(txHash)}
                  title="Copy tx hash"
                  className="text-[11px] text-[#2a1f0e]/70 hover:text-[#a07830] transition-colors break-all leading-relaxed text-left group"
                >
                  {txHash}
                  <Copy size={10} className="inline ml-1 opacity-0 group-hover:opacity-60 align-middle" />
                </button>
                {explorerUrl && (
                  <a
                    href={explorerUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#7a5a20] border-2 border-[#2a1f0e] bg-[#f5f0e8] px-3 py-1.5 rounded-md shadow-[2px_2px_0_#2a1f0e] hover:-translate-y-px hover:shadow-[3px_3px_0_#2a1f0e] active:translate-y-0 active:shadow-none transition-all font-mono uppercase tracking-wider"
                  >
                    View on Explorer <ExternalLink size={11} />
                  </a>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#f5f0e8] px-6 py-3 border-t-2 border-[#2a1f0e]/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span aria-hidden className="inline-block w-6 h-6 rounded-full border-2 border-[#a07830] flex items-center justify-center shrink-0">
              <span className="block w-2.5 h-2.5 rounded-full bg-[#f5b83d]" />
            </span>
            <p className="text-[9px] uppercase tracking-[0.18em] text-[#2a1f0e]/50">
              Issued via ChitBook · Arc
            </p>
          </div>
          <button
            onClick={copyJson}
            className="flex items-center gap-1.5 text-xs text-[#2a1f0e]/50 hover:text-[#2a1f0e] transition-colors"
          >
            {copied ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
            {copied ? "Copied!" : "Copy as JSON"}
          </button>
        </div>

        {/* Perforated bottom edge — tear here */}
        <div
          aria-hidden
          className="h-3 bg-[#f5f0e8]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 7px 8px, #f5f0e8 5px, transparent 5px), radial-gradient(circle at 7px 8px, #2a1f0e 5px, transparent 5px)",
            backgroundSize: "14px 16px",
            backgroundPosition: "0 0, 0 1px",
          }}
        />
      </div>

      {/* API curl hint */}
      <div className="bg-[#f5f0e8] border-2 border-[#2a1f0e]/25 rounded-lg p-4 text-[10px] font-mono space-y-1">
        <p className="text-[#2a1f0e]/55 uppercase tracking-[0.2em] text-[9px] mb-2">Agent verification endpoint</p>
        <p className="break-all text-[#2a1f0e]">
          <span className="text-[#a07830]">$</span> curl https://chit-sigma-khaki.vercel.app/api/receipt/{receipt.id.toString()}
        </p>
        <p className="text-[#2a1f0e]/45 italic">Returns receipt JSON for programmatic settlement verification — no key, no login.</p>
      </div>
    </div>
  );
}

function ReceiptRow({ label, value, full }: { label: string; value: string; full: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    void navigator.clipboard.writeText(full).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }
  return (
    <div className="flex items-start justify-between gap-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-[#2a1f0e]/40 shrink-0 pt-0.5 w-14">
        {label}
      </p>
      <button
        onClick={copy}
        title={full}
        className="text-sm text-right text-[#2a1f0e] hover:text-[#a07830] transition-colors break-all flex items-center gap-1 group"
      >
        {value}
        {copied ? (
          <Check size={10} className="text-emerald-600 shrink-0" />
        ) : (
          <Copy size={10} className="opacity-0 group-hover:opacity-50 shrink-0" />
        )}
      </button>
    </div>
  );
}
