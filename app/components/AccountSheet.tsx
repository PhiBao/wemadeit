"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBalance, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { useAppChain } from "../lib/app-chain";
import { ausdFor } from "../lib/monad";
import { erc20Abi } from "../lib/abi";
import { passkeyFaucetDrip } from "../lib/pactWrite";

// One account sheet for every login path (Face ID, email, wallet app):
// address + QR + balances + deposit, identical everywhere. No login method
// gets a better or worse version.
const AUSD_FAUCET: Record<number, `0x${string}`> = {
  // Agora's official testnet faucet: requestFunds(address) → 10,000 AUSD.
  10143: "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C",
};

const FAUCET_ABI = [
  {
    type: "function",
    name: "requestFunds",
    stateMutability: "nonpayable",
    inputs: [{ name: "to", type: "address" }],
    outputs: [],
  },
] as const;

export default function AccountSheet({
  open,
  onClose,
  address,
  isMera,
  onLogout,
}: {
  open: boolean;
  onClose: () => void;
  address: `0x${string}`;
  isMera: boolean;
  onLogout: () => void;
}) {
  const { appChainId, chain, isMainnet } = useAppChain();
  const [copied, setCopied] = useState(false);
  const [dripping, setDripping] = useState(false);
  const [dripMsg, setDripMsg] = useState<string | null>(null);

  const { data: mon, refetch: refetchMon } = useBalance({ address, chainId: appChainId });
  const ausd = ausdFor(appChainId);
  const { data: ausdBal, refetch: refetchAusd } = useReadContract({
    address: ausd ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [address],
    chainId: appChainId,
    query: { enabled: !!ausd },
  });

  const { writeContract, data: dripHash, isPending, reset } = useWriteContract();
  const { isSuccess: dripDone } = useWaitForTransactionReceipt({ hash: dripHash });
  useEffect(() => {
    if (dripDone) {
      refetchMon();
      refetchAusd();
      setDripMsg("Sent! 10,000 test AUSD on the way.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dripDone]);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setDripMsg(null);
      reset?.();
    }
  }, [open, reset]);

  if (!open) return null;

  const copy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const drip = async () => {
    setDripping(true);
    setDripMsg(null);
    try {
      if (isMera) {
        await passkeyFaucetDrip(address, appChainId);
        setDripMsg("Sent! 10,000 test AUSD on the way — refresh in a few seconds.");
        setTimeout(() => {
          refetchMon();
          refetchAusd();
        }, 8000);
      } else {
        writeContract({
          address: AUSD_FAUCET[appChainId],
          abi: FAUCET_ABI,
          functionName: "requestFunds",
          args: [address],
        });
      }
    } catch (e) {
      setDripMsg(
        e instanceof Error ? e.message.slice(0, 160) : "Faucet call failed — it may limit drips per address."
      );
    } finally {
      setDripping(false);
    }
  };

  const faucet = AUSD_FAUCET[appChainId] ?? null;
  const explorer = `${chain.blockExplorers!.default.url}/address/${address}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Account & deposit</h2>
          <button onClick={onClose} className="text-gray-500 underline">
            Close
          </button>
        </div>

        <div className="mt-4 flex justify-center rounded-xl bg-white p-3">
          <QRCodeSVG value={address} size={160} />
        </div>

        <p className="mt-3 break-all text-center font-mono text-xs text-gray-700">{address}</p>
        <div className="mt-2 flex gap-2">
          <button
            onClick={copy}
            className="flex-1 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
          >
            {copied ? "Copied ✓" : "Copy address"}
          </button>
          <a href={explorer} target="_blank" className="rounded-xl border px-4 py-2 text-sm font-semibold">
            Explorer
          </a>
        </div>

        <div className="mt-4 grid gap-1 text-sm">
          <p>
            MON: <strong>{mon ? mon.formatted.slice(0, 8) : "…"}</strong>
          </p>
          {ausd && (
            <p>
              AUSD:{" "}
              <strong>{ausdBal !== undefined ? Number(ausdBal) / 1e6 : "…"}</strong>
            </p>
          )}
        </div>

        <h3 className="mt-4 text-sm font-bold">Deposit</h3>
        {faucet ? (
          <div className="mt-1">
            <button
              onClick={drip}
              disabled={dripping || isPending}
              className="w-full rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {dripping || isPending ? "Requesting…" : "🚰 Get 10,000 test AUSD (faucet)"}
            </button>
            {dripMsg && <p className="mt-1 text-xs text-gray-700">{dripMsg}</p>}
          </div>
        ) : (
          <div className="mt-1 grid gap-2">
            <p className="text-xs text-gray-600">
              Send MON or AUSD here from any wallet or exchange — same address, same account.
            </p>
            <button
              disabled
              title="Card buy is coming soon"
              className="w-full cursor-not-allowed rounded-xl bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-500"
            >
              💳 Buy crypto with card — coming soon
            </button>
          </div>
        )}

        <button onClick={onLogout} className="mt-4 w-full text-sm text-gray-500 underline">
          Log out
        </button>
      </div>
    </div>
  );
}
