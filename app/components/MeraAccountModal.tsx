"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { useBalance, useReadContract } from "wagmi";
import { useMera } from "../lib/mera-context";
import { useAppChain } from "../lib/app-chain";
import { ausdFor } from "../lib/monad";
import { erc20Abi } from "../lib/abi";
import { passkeyDisconnect, shortAddress } from "../lib/mera";
import { passkeyFaucetDrip } from "../lib/pactWrite";

// Account panel for passkey users: address to receive funds, balances, a
// testnet AUSD faucet call, and logout. Dynamic users get Dynamic's own
// panel; this is the passkey equivalent.
export function useMercuryoBuy() {
  const [buying, setBuying] = useState(false);
  const [buyErr, setBuyErr] = useState<string | null>(null);
  const buy = async (address: string) => {
    setBuying(true);
    setBuyErr(null);
    try {
      const r = await fetch("/api/mercuryo/url", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const j = await r.json();
      if (j.disabled) {
        setBuyErr("Card buy is not enabled yet.");
        return;
      }
      if (!r.ok || !j.url) throw new Error("buy unavailable");
      window.open(j.url, "_blank", "noopener");
    } catch {
      setBuyErr("Could not open the buy widget — try again.");
    } finally {
      setBuying(false);
    }
  };
  return { buy, buying, buyErr };
}

export default function MeraAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { meraAddr, setMeraAddr } = useMera();
  const { appChainId, chain, isMainnet } = useAppChain();
  const [copied, setCopied] = useState(false);
  const [dripping, setDripping] = useState(false);
  const [dripMsg, setDripMsg] = useState<string | null>(null);
  const { buy, buying, buyErr } = useMercuryoBuy();

  const addr = meraAddr as `0x${string}` | null;
  const { data: mon } = useBalance({ address: addr ?? undefined, chainId: appChainId });
  const ausd = ausdFor(appChainId);
  const { data: ausdBal, refetch } = useReadContract({
    address: ausd ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [addr!],
    chainId: appChainId,
    query: { enabled: !!addr && !!ausd },
  });

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setDripMsg(null);
    }
  }, [open ]);

  if (!open || !addr) return null;

  const copy = () => {
    navigator.clipboard.writeText(addr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const drip = async () => {
    setDripping(true);
    setDripMsg(null);
    try {
      await passkeyFaucetDrip(addr, appChainId);
      setDripMsg("Sent! 10,000 test AUSD on the way — refresh balances in a few seconds.");
      setTimeout(() => refetch(), 8000);
    } catch (e) {
      setDripMsg(
        e instanceof Error
          ? e.message.slice(0, 160)
          : "Faucet call failed — it may limit drips per address."
      );
    } finally {
      setDripping(false);
    }
  };

  const explorer = `${chain.blockExplorers!.default.url}/address/${addr}`;

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
              <QRCodeSVG value={addr} size={160} />
            </div>

            <p className="mt-3 break-all text-center font-mono text-xs text-gray-700">{addr}</p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={copy}
                className="flex-1 rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white"
              >
                {copied ? "Copied ✓" : "Copy address"}
              </button>
              <a
                href={explorer}
                target="_blank"
                className="rounded-xl border px-4 py-2 text-sm font-semibold"
              >
                Explorer
              </a>
            </div>

            <div className="mt-4 grid gap-1 text-sm">
              <p>
                MON: <strong>{mon ? `${mon.formatted.slice(0, 8)}` : "…"}</strong>
              </p>
              {ausd && (
                <p>
                  AUSD:{" "}
                  <strong>
                    {ausdBal !== undefined ? `${(Number(ausdBal) / 1e6).toLocaleString()}` : "…"}
                  </strong>
                </p>
              )}
            </div>

            <h3 className="mt-4 text-sm font-bold">Deposit</h3>
            {isMainnet ? (
              <div className="mt-1 grid gap-2">
                <p className="text-xs text-gray-600">
                  Send MON or AUSD here from any wallet or exchange — same address,
                  same account.
                </p>
                <button
                  onClick={() => buy(addr)}
                  disabled={buying}
                  className="w-full rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {buying ? "Opening…" : "💳 Buy crypto with card"}
                </button>
                {buyErr && <p className="text-xs text-amber-800">{buyErr}</p>}
              </div>
            ) : (
              <div className="mt-1">
                <button
                  onClick={drip}
                  disabled={dripping}
                  className="w-full rounded-xl bg-emerald-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {dripping ? "Requesting…" : "🚰 Get 10,000 test AUSD (faucet)"}
                </button>
                {dripMsg && <p className="mt-1 text-xs text-gray-700">{dripMsg}</p>}
              </div>
            )}

            <button
              onClick={() => {
                passkeyDisconnect();
                setMeraAddr(null);
                onClose();
              }}
              className="mt-4 w-full text-sm text-gray-500 underline"
            >
              Log out
            </button>
      </div>
    </div>
  );
}
