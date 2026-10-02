"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import PasskeyConnect from "../../../components/PasskeyConnect";
import VisibilityBadge from "../../../components/VisibilityBadge";
import { useMera } from "../../../lib/mera-context";
import { ChainGuard } from "../../../components/ChainGuard";
import DynamicLogin from "../../../components/DynamicLogin";
import { dynamicEnabled } from "../../../lib/wagmi";
import { passkeyApprove, passkeyCommit, passkeyCommitSecret, passkeyCall, pactPublic } from "../../../lib/pactWrite";
import { newSecret, secretFromUrl, secretHash, shareUrl } from "../../../lib/inviteSecret";
import { rememberPot, vaultEntry } from "../../../lib/potVault";
import { ensureWalletChain } from "../../../lib/walletGuard";
import { useWalletGuard } from "../../../lib/walletGuard";
import { scorePotLegit } from "../../../lib/assist";

function LegitBadge({
  pot,
  title,
  perPerson,
  size,
}: {
  pot: string;
  title: string;
  perPerson: string;
  size: string;
}) {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const key = `pact.legit.${pot}`;
    const cached = localStorage.getItem(key);
    if (cached) {
      setLabel(cached);
      return;
    }
    if (!title) return;
    scorePotLegit({ title, perPerson, partySize: size, token: "MON" }).then((r) => {
      if (!r) return;
      const text =
        r.label === "looks good" ? `✓ looks legitimate (${Math.round(r.p * 100)}%)` : "⚠ check details";
      localStorage.setItem(key, text);
      setLabel(text);
    });
  }, [pot, title, perPerson, size]);
  if (!label) return null;
  return <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs">{label}</span>;
}
import {
  useAccount,
  useChainId,
  useConnect,
  useReadContract,
  useReadContracts,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { formatUnits } from "viem";
import { potAbi, erc20Abi, factoryAbi } from "../../../lib/abi";
import { AppChainId, useAppChain } from "../../../lib/app-chain";
import { chainFor, decimalsForToken, factoryFor, symbolFor } from "../../../lib/monad";

const ZERO = "0x0000000000000000000000000000000000000000";

function usePot(address: `0x${string}`, chainId: AppChainId) {
  const c = (functionName: "state" | "commitCount" | "partySize" | "perPerson" | "deadline" | "token" | "payee" | "organizer" | "contributors" | "title" | "isPrivate") =>
    ({ address, abi: potAbi, functionName, chainId }) as const;
  return useReadContracts({
    contracts: [
      c("state"),
      c("commitCount"),
      c("partySize"),
      c("perPerson"),
      c("deadline"),
      c("token"),
      c("payee"),
      c("organizer"),
      c("contributors"),
      c("title"),
      c("isPrivate"),
    ],
    query: { refetchInterval: 2000 },
  });
}

/**
 * Tilt fee, read from the FACTORY — PactPot only declares feeBps() on its
 * IPactFactory interface, it does not implement it, so reading it from the pot
 * reverts. release() reads the same factory values at execution time, so the
 * number shown here is exactly what the contract will charge.
 */
function useFactoryFee(chainId: AppChainId) {
  const factory = factoryFor(chainId);
  return useReadContracts({
    contracts: [
      { address: factory, abi: factoryAbi, functionName: "feeBps", chainId },
      { address: factory, abi: factoryAbi, functionName: "feeRecipient", chainId },
    ],
    query: { refetchInterval: 30_000 },
  });
}

export default function PotPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const pot = raw as `0x${string}`;
  const { appChainId, setAppChainId } = useAppChain();
  const { address: me } = useAccount();
  const walletChain = useChainId();
  const { connect, connectors } = useConnect();

  // Deep links carry no chain: probe both and follow the pot wherever it lives.
  // Probe partySize(), NOT title() — title() reverts on pre-v2 pots, so probing
  // by title made every legacy pot look like "not on either chain". partySize()
  // has existed since v1 and returns a uint on both.
  const { data: probe } = useReadContracts({
    contracts: [
      { address: pot, abi: potAbi, functionName: "partySize", chainId: 143 },
      { address: pot, abi: potAbi, functionName: "partySize", chainId: 10143 },
    ],
  });
  const [pMain, pTest] = (probe?.map((d) => d.result) ?? []) as [
    bigint | undefined,
    bigint | undefined,
  ];
  // Prefer the currently selected chain when the pot exists there, else follow
  // the pot to the other chain.
  const onMain = pMain !== undefined;
  const onTest = pTest !== undefined;
  const viewedId: AppChainId = appChainId === 143 ? (onMain ? 143 : onTest ? 10143 : 143) : onTest ? 10143 : onMain ? 143 : 10143;
  useEffect(() => {
    if (viewedId !== appChainId) setAppChainId(viewedId);
  }, [viewedId, appChainId, setAppChainId]);
  const chain = chainFor(viewedId);

  const { data, refetch, isFetching } = usePot(pot, viewedId);
  const { meraAddr } = useMera();
  const viewer = (me ?? meraAddr) as `0x${string}` | undefined;
  const gating = !!me && walletChain !== viewedId; // wagmi txs would land elsewhere

  const { writeContract, data: hash, isPending, error, reset } = useWriteContract();
  const [pkHash, setPkHash] = useState<`0x${string}` | undefined>();
  const [pkBusy, setPkBusy] = useState(false);
  const [pkErr, setPkErr] = useState<string | null>(null);
  const { isSuccess } = useWaitForTransactionReceipt({ hash: hash ?? pkHash });

  const pk = async (fn: () => Promise<`0x${string}`>) => {
    setPkBusy(true);
    setPkErr(null);
    try {
      setPkHash(await fn());
    } catch (e) {
      setPkErr(e instanceof Error ? e.message.slice(0, 200) : "transaction failed");
    } finally {
      setPkBusy(false);
    }
  };

  const { data: myCommitted } = useReadContract({
    address: pot,
    abi: potAbi,
    functionName: "committed",
    args: [viewer!],
    chainId: viewedId,
    query: { enabled: !!viewer },
  });
  const { data: myRefunded } = useReadContract({
    address: pot,
    abi: potAbi,
    functionName: "refunded",
    args: [viewer!],
    chainId: viewedId,
    query: { enabled: !!viewer },
  });
  useEffect(() => {
    if (myCommitted) rememberPot(viewedId, pot, { role: "member" });
  }, [myCommitted, pot, viewedId]);

  const [inviteSecret, setInviteSecret] = useState<`0x${string}` | null>(null);
  useEffect(() => {
    // URL key wins (fresh invite); otherwise recover this device's stored key.
    // Either way the visit is vaulted so the pot stays re-findable.
    const fromUrl = secretFromUrl();
    const fromVault = vaultEntry(viewedId, pot)?.secret ?? null;
    setInviteSecret(fromUrl ?? fromVault);
    rememberPot(viewedId, pot, fromUrl ? { secret: fromUrl } : {});
  }, [pot, viewedId]);
  // useReadContracts defaults to allowFailure:true, so ONE failed call leaves an
  // undefined hole in the array instead of rejecting the query. That hole used to
  // flow straight into `count.toString()` and blow up render — which is why a
  // full refresh showed the error boundary but "Try again" succeeded: the 2s
  // refetch had refilled the hole. Treat an incomplete read set as still-loading
  // and keep polling, so we render a progress state instead of ever throwing.
  const r = useMemo(
    () =>
      (data ?? []).map((d: { result?: unknown; status?: string }) => ({
        result: d?.result,
        failure: !!d && d.status === "failure",
      })),
    [data],
  );
  // Only the fields that have existed since v1 gate completeness. title() and
  // isPrivate() REVERT on pre-v2 pots — that pot generation predates both — and
  // the cross-chain probe uses title(), so requiring them made legacy pots hang
  // on "Loading pot…" forever. The page already falls back for both: a missing
  // title renders as "<perPerson> <sym> × <size>", and a missing isPrivate()
  // means public.
  const complete =
    r.length >= 11 &&
    r[0].result !== undefined &&
    r[1].result !== undefined &&
    r[2].result !== undefined &&
    r[3].result !== undefined &&
    r[4].result !== undefined &&
    r[5].result !== undefined &&
    r[6].result !== undefined &&
    r[8].result !== undefined;
  // Legacy pot: title()/isPrivate() reverted, so these reads have no value.
  // Optional chaining is required — while the query is still in flight `r` is
  // empty, so r[9]/r[10] are undefined and a bare .failure threw.
  const legacy = !!(r[9]?.failure || r[10]?.failure);
  // Never spin forever: say so instead of showing "Loading pot…" indefinitely.
  const [readTimedOut, setReadTimedOut] = useState(false);
  useEffect(() => {
    if (complete) {
      setReadTimedOut(false);
      return;
    }
    const t = setTimeout(() => setReadTimedOut(true), 8000);
    return () => clearTimeout(t);
  }, [complete]);
  // All hooks must be called before ANY early return. The fee read and the
  // wallet guard used to sit below the `if (!complete)` bail-out, so the hook
  // count changed the moment `complete` flipped true — React threw "Rendered
  // fewer hooks than expected" and the error boundary took over. Every hook is
  // now hoisted above the bail-out so hook order is identical on every render.
  const { data: feeData } = useFactoryFee(viewedId);
  const feeBps = feeData?.[0]?.result as bigint | undefined;
  const feeRecipient = feeData?.[1]?.result as `0x${string}` | undefined;
  const { guard, checking, guardErr } = useWalletGuard();
  useEffect(() => {
    if (r[9]?.result) rememberPot(viewedId, pot, { title: r[9].result as string });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r[9]?.result]);

  if (!complete)
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-lg font-semibold">
          {readTimedOut ? "Still can't read this pot" : "Loading pot…"}
        </p>
        <p className="mt-3 text-sm text-gray-600">
          {readTimedOut
            ? "Some values didn't come back from the RPC. This usually clears on retry — the address may be a pot on the other Monad network."
            : "Reading the pot from the chain."}
        </p>
        <div className="mt-5 flex gap-3">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="rounded-xl bg-emerald-700 px-5 py-2 font-semibold text-white disabled:opacity-50"
          >
            {isFetching ? "Retrying…" : "Retry"}
          </button>
          <a href="/" className="rounded-xl border px-5 py-2 font-semibold">
            Back to pots
          </a>
        </div>
      </main>
    );
  const [state, count, size, perPerson, deadline, token, payee, org, contributors, potTitle, priv] =
    r.map((x) => x.result) as [
      number,
      bigint,
      bigint,
      bigint,
      bigint,
      string,
      string,
      string | undefined,
      string[],
      string | undefined,
      boolean | undefined,
    ];
  // Legacy pots (pre-v2) have no title() and no isPrivate(). Absence of
  // isPrivate() means public — those generations could only create public pots
  // (PactFactory.sol:60 createPot passes isPrivate=false).
  const locked = priv === true;
  const potName = potTitle || (legacy ? "Early pot" : "Group pot");
  // Fee comes from the factory, not the pot — PactPot declares feeBps() on its
  // IPactFactory interface but never implements it, so reading it from the pot
  // reverts. release() charges from this same factory value. (Read above the
  // bail-out so hook order never changes.)
  const isOrganizer = !!viewer && !!org && viewer.toLowerCase() === org.toLowerCase();
  const dec = decimalsForToken(token ?? ZERO);
  const sym = symbolFor(token ?? ZERO);
  const human = (v: bigint) => formatUnits(v, dec);
  // Pre-title pots (v1) have no title() — fall back to stake × size.
  const displayTitle =
    potTitle ||
    (perPerson !== undefined && size !== undefined
      ? `${human(perPerson)} ${sym} × ${size.toString()}`
      : potName);

  const full = count >= size;
  const expired = Date.now() / 1000 >= Number(deadline);
  const isNative = token === ZERO;
  const stateLabel = ["Open", "Tilted — paid out", "Refunding"][state] ?? "Unknown";
  const left = Math.max(0, Number(deadline) - Math.floor(Date.now() / 1000));
  const explorer = `${chain.blockExplorers!.default.url}/address/${pot}`;

  // Tilt fee, read from the pot (which mirrors the factory onchain). Shown
  // explicitly so the release button promises the exact net the payee receives.
  const gross = perPerson * size;
  const fee = (gross * (feeBps ?? 0n)) / 10_000n;
  const net = gross - fee;
  const feePct = ((feeBps ?? 0n) * 100n) / 10_000n;

  // Every wagmi write passes the live send-time network check first, so a
  // stale header can never let a transaction escape to the wrong chain.
  const act = (fn: () => void) => {
    reset?.();
    guard(fn);
  };

  // Invite-only pots stay behind login: a stranger opening the link sees the
  // gate, never the roster, progress, or actions. (Onchain data is public by
  // nature; this is the product's access rule, not a cryptographic one.)
  if (locked && !viewer) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Link href="/" className="text-sm underline">
          ← all pots
        </Link>
        <h1 className="mt-2 text-3xl font-black">{displayTitle || "Loading pot…"}</h1>
        <p className="mt-1">
          <VisibilityBadge isPrivate={true} />
        </p>
        <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
          <p className="font-bold">🔒 This is an invite-only pot.</p>
          <p className="mt-1 text-sm text-gray-600">
            Log in to see its progress and take part. Only people with the invite
            link can join.
          </p>
          <div className="mt-4 grid gap-4">
            <PasskeyConnect />
            {dynamicEnabled ? (
              <DynamicLogin />
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="rounded-xl border px-6 py-3 font-semibold"
              >
                Use a wallet app
              </button>
            )}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <Link href="/" className="text-sm underline">
        ← all pots
      </Link>
      <h1 className="mt-2 text-3xl font-black">{displayTitle || "Loading pot…"}</h1>
      <p className="mt-1">
        <VisibilityBadge isPrivate={locked} />
      </p>
      <p className="font-mono text-xs text-gray-500 break-all">{pot}</p>
      <p className="mt-1 text-sm">
        Status: <strong>{stateLabel}</strong>
        <LegitBadge
          pot={pot}
          title={displayTitle}
          perPerson={human(perPerson)}
          size={size.toString()}
        />{" "}
        <a href={explorer} target="_blank" className="underline">
          explorer
        </a>
      </p>

      {/* Progress */}
      <div className="mt-6 rounded-2xl border bg-white p-6 shadow-sm">
        <div className="flex items-end justify-between">
          <p className="text-5xl font-black">
            {count.toString()}
            <span className="text-2xl text-gray-500">/{size.toString()}</span>
          </p>
          <p className="text-right text-sm">
            {human(perPerson)} {sym} each
            <br />
            {expired ? "deadline passed" : `${Math.floor(left / 3600)}h ${Math.floor((left % 3600) / 60)}m left`}
          </p>
        </div>
        <div className="mt-4 h-4 overflow-hidden rounded-full bg-gray-200">
          <div
            className="h-full rounded-full bg-emerald-700 transition-all"
            style={{ width: `${(Number(count) / Number(size)) * 100}%` }}
          />
        </div>
        {full && state === 0 && (
          <p className="mt-3 animate-pulse text-xl font-black text-emerald-800">WE MADE IT 🎉</p>
        )}
      </div>

      {/* Contributors */}
      <div className="mt-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-bold">Committed ({contributors.length})</h2>
        {contributors.length === 0 && <p className="text-sm">Nobody yet — be the first.</p>}
        <ul className="mt-2 grid gap-1 font-mono text-xs">
          {contributors.map((c) => (
            <li key={c}>
              {c} {c === me ? "(you)" : ""}
            </li>
          ))}
        </ul>
      </div>

      {/* Actions */}
      <div className="mt-4 rounded-2xl border bg-white p-6 shadow-sm">
        <ChainGuard />
        {gating ? (
          <p className="mt-2 text-sm font-semibold text-amber-800">
            Switch network above to commit, release, or refund.
          </p>
        ) : !viewer ? (
          <div className="grid gap-4">
            <PasskeyConnect />
            {dynamicEnabled ? (
              <DynamicLogin />
            ) : (
              <button
                onClick={() => connect({ connector: connectors[0] })}
                className="rounded-xl border px-6 py-3 font-semibold"
              >
                Use a wallet app
              </button>
            )}
          </div>
        ) : state === 0 && !full && !expired ? (
          myCommitted ? (
            <p className="font-semibold text-emerald-800">You&apos;re in ✓ — share the link to fill the rest.</p>
          ) : locked && !inviteSecret ? (
            <NoKeyNotice
              pot={pot}
              isOrganizer={isOrganizer}
              viewedId={viewedId}
              viaPasskey={!!meraAddr}
              onRotated={(s) => setInviteSecret(s)}
            />
          ) : isNative ? (
            <button
              onClick={() =>
                meraAddr
                  ? pk(() =>
                      inviteSecret
                        ? passkeyCommitSecret(pot, perPerson, inviteSecret, viewedId)
                        : passkeyCommit(pot, perPerson, viewedId)
                    )
                  : act(() =>
                      inviteSecret
                        ? writeContract({
                            address: pot,
                            abi: potAbi,
                            functionName: "commitWithSecret",
                            args: [inviteSecret],
                            value: perPerson,
                          })
                        : writeContract({
                            address: pot,
                            abi: potAbi,
                            functionName: "commit",
                            value: perPerson,
                          })
                    )
              }
              disabled={isPending || pkBusy || checking}
              className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
            >
                {isPending || pkBusy || checking ? "Committing…" : `Commit ${human(perPerson)} ${sym}`}
            </button>
          ) : (
            <Erc20Commit
              pot={pot}
              token={token as `0x${string}`}
              perPerson={perPerson}
              chainId={viewedId}
              secret={locked ? inviteSecret : null}
              viaPasskey={!!meraAddr}
              viewer={viewer}
              pk={pk}
              pkBusy={pkBusy}
            />
          )
        ) : state === 0 && full ? (
          <button
            onClick={() =>
              meraAddr
                ? pk(() => passkeyCall(pot, "release", viewedId))
                : act(() => writeContract({ address: pot, abi: potAbi, functionName: "release" }))
            }
            disabled={isPending || pkBusy || checking}
            className="rounded-xl bg-emerald-700 px-6 py-3 font-semibold text-white disabled:opacity-50"
          >
            {isPending || pkBusy || checking
              ? "Releasing…"
              : `Release ${human(net)} ${sym} to organizer`}
          </button>
        ) : state === 0 && expired ? (
          <ExpireRefund
            pot={pot}
            me={viewer!}
            myCommitted={!!myCommitted}
            chainId={viewedId}
            viaPasskey={!!meraAddr}
            pk={pk}
          />
        ) : state === 2 ? (
          myCommitted ? (
            myRefunded ? (
              <p className="font-semibold text-emerald-800">Refunded ✓ — nothing left to claim.</p>
            ) : (
              <button
                onClick={() =>
                  meraAddr
                    ? pk(() => passkeyCall(pot, "refund", viewedId))
                    : act(() => writeContract({ address: pot, abi: potAbi, functionName: "refund" }))
                }
                disabled={isPending || pkBusy || checking}
                className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
              >
                {isPending || pkBusy || checking ? "Refunding…" : "Claim my refund"}
              </button>
            )
          ) : (
            <p>Pot missed its goal. Contributors can claim refunds.</p>
          )
        ) : (
          <p>
            Paid out to <span className="font-mono text-xs">{payee}</span>
          </p>
        )}
        {guardErr && <p className="mt-2 text-sm text-amber-800">{guardErr}</p>}
        {error && <p className="mt-2 text-sm text-red-700">{error.message.slice(0, 220)}</p>}
        {pkErr && <p className="mt-2 text-sm text-red-700">{pkErr}</p>}
        {isSuccess && (
          <p className="mt-2 text-sm text-emerald-800">
            Confirmed ✓ <button className="underline" onClick={() => refetch()}>refresh</button>
          </p>
        )}
        {/* Fee transparency: stated before anyone commits, not discovered on the
            explorer afterwards. Read onchain, so it always matches the contract. */}
        {feeBps !== undefined && feeBps > 0n && (
          <p className="mt-3 border-t pt-3 text-xs text-gray-500">
            {full ? (
              <>
                Tilt fee {feePct}% ({human(fee)} {sym}) is taken at release. Organizer
                receives {human(net)} {sym}.{" "}
                {feeRecipient && feeRecipient !== ZERO && (
                  <>
                    Fee goes to{" "}
                    <span className="font-mono">
                      {feeRecipient.slice(0, 6)}…{feeRecipient.slice(-4)}
                    </span>
                    .{" "}
                  </>
                )}
                Set onchain in the factory — not waivable per pot.
              </>
            ) : (
              <>
                If this pot tilts, a {feePct}% fee is taken at release. Refunds are free.
                Set onchain in the factory — not waivable per pot.
              </>
            )}
          </p>
        )}
      </div>

      {/* Share */}
      <div className="mt-4 rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="font-bold">Share this pot</h2>
        <ShareLink pot={pot} locked={locked} secret={inviteSecret} />
      </div>
    </main>
  );
}

function Erc20Commit({
  pot,
  token,
  perPerson,
  chainId,
  secret,
  viaPasskey,
  viewer,
  pk,
  pkBusy,
}: {
  pot: `0x${string}`;
  token: `0x${string}`;
  perPerson: bigint;
  chainId: AppChainId;
  secret: `0x${string}` | null;
  viaPasskey: boolean;
  /** Wallet OR passkey address. Must come from the caller: a Mera session is not
   *  a wagmi connector, so reading useAccount() here lost Face ID users. */
  viewer: `0x${string}` | undefined;
  pk: (fn: () => Promise<`0x${string}`>) => Promise<void>;
  pkBusy: boolean;
}) {
  const { writeContract, isPending, data: txHash } = useWriteContract();
  const { guard, checking, guardErr } = useWalletGuard();
  const { data: allowance, refetch } = useReadContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [viewer!, pot],
    chainId,
    query: { enabled: !!viewer, refetchInterval: 2000 },
  });
  const { isSuccess: txDone } = useWaitForTransactionReceipt({ hash: txHash });
  useEffect(() => {
    if (txDone) refetch();
  }, [txDone, refetch]);
  const ok = (allowance ?? 0n) >= perPerson;
  const approve = () =>
    viaPasskey
      ? pk(async () => {
          const h = await passkeyApprove(token, pot, perPerson, chainId);
          refetch();
          return h;
        })
      : guard(() =>
          writeContract({ address: token, abi: erc20Abi, functionName: "approve", args: [pot, perPerson] })
        );
  const commit = () =>
    viaPasskey
      ? pk(() =>
          secret
            ? passkeyCommitSecret(pot, 0n, secret, chainId)
            : passkeyCommit(pot, 0n, chainId)
        )
      : guard(() =>
          secret
            ? writeContract({
                address: pot,
                abi: potAbi,
                functionName: "commitWithSecret",
                args: [secret],
              })
            : writeContract({ address: pot, abi: potAbi, functionName: "commit" })
        );
  const busy = isPending || checking || pkBusy;
  return (
    <>
      {ok ? (
        <button
          onClick={commit}
          disabled={busy}
          className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Committing…" : "Commit tokens"}
        </button>
      ) : (
        <button
          onClick={approve}
          disabled={busy}
          className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {busy ? "Approving…" : "Approve then commit"}
        </button>
      )}
      {guardErr && <p className="mt-2 text-sm text-amber-800">{guardErr}</p>}
    </>
  );
}

function ExpireRefund({
  pot,
  me,
  myCommitted,
  chainId,
  viaPasskey,
  pk,
}: {
  pot: `0x${string}`;
  me: string;
  myCommitted: boolean;
  chainId: AppChainId;
  viaPasskey: boolean;
  pk: (fn: () => Promise<`0x${string}`>) => Promise<void>;
}) {
  const { writeContract, isPending } = useWriteContract();
  const { guard, checking, guardErr } = useWalletGuard();
  void me;
  const expire = () =>
    viaPasskey
      ? pk(() => passkeyCall(pot, "expire", chainId))
      : guard(() => writeContract({ address: pot, abi: potAbi, functionName: "expire" }));
  const refund = () =>
    viaPasskey
      ? pk(() => passkeyCall(pot, "refund", chainId))
      : guard(() => writeContract({ address: pot, abi: potAbi, functionName: "refund" }));
  const busy = isPending || checking;
  return (
    <div className="grid gap-2">
      <p className="text-sm">Deadline passed without filling. Open refunds, then claim yours.</p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={expire}
          disabled={busy}
          className="rounded-xl bg-gray-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          Open refunds
        </button>
        {myCommitted && (
          <button
            onClick={refund}
            disabled={busy}
            className="rounded-xl border px-6 py-3 font-semibold disabled:opacity-50"
          >
            Claim refund
          </button>
        )}
      </div>
      {guardErr && <p className="text-sm text-amber-800">{guardErr}</p>}
    </div>
  );
}

/**
 * Shown when a logged-in viewer faces a private pot without its invite key.
 * If you can see this page you hold *a* link — but joining needs the key
 * fragment (#s=…), which chat apps and careless copies often strip. So the
 * message names the actual problem per role instead of blaming access.
 */
function NoKeyNotice({
  pot,
  isOrganizer,
  viewedId,
  viaPasskey,
  onRotated,
}: {
  pot: `0x${string}`;
  isOrganizer: boolean;
  viewedId: AppChainId;
  viaPasskey: boolean;
  onRotated: (s: `0x${string}`) => void;
}) {
  const [copied, setCopied] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [rotErr, setRotErr] = useState<string | null>(null);
  const { writeContractAsync } = useWriteContract();
  const stored = vaultEntry(viewedId, pot)?.secret ?? null;

  const copyStored = () => {
    if (!stored || typeof window === "undefined") return;
    navigator.clipboard.writeText(shareUrl(pot, stored));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const rotate = async () => {
    const s = newSecret();
    const h = secretHash(s);
    setRotating(true);
    setRotErr(null);
    try {
      let hash: `0x${string}`;
      if (viaPasskey) {
        hash = await passkeyCall(pot, "rotateSecret", viewedId, [h]);
      } else {
        await ensureWalletChain(viewedId);
        hash = await writeContractAsync({
          address: pot,
          abi: potAbi,
          functionName: "rotateSecret",
          args: [h],
        });
      }
      await pactPublic(viewedId).waitForTransactionReceipt({ hash });
      rememberPot(viewedId, pot, { secret: s });
      onRotated(s);
    } catch (e) {
      setRotErr(e instanceof Error ? e.message.slice(0, 160) : "Rotation failed — try again.");
    } finally {
      setRotating(false);
    }
  };

  if (isOrganizer && stored) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="font-semibold">🔒 You organized this pot — it&apos;s waiting on its invite key.</p>
        <p className="text-gray-600">
          This device still holds your original link. Copy it and share the full version (it ends with{" "}
          <code>#s=…</code>).
        </p>
        <button
          onClick={copyStored}
          className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white"
        >
          {copied ? "Invite link copied ✓" : "Copy invite link"}
        </button>
      </div>
    );
  }

  if (isOrganizer) {
    return (
      <div className="grid gap-2 text-sm">
        <p className="font-semibold">🔒 You organized this pot, but this device doesn&apos;t hold its invite key.</p>
        <p className="text-gray-600">
          Open your original invite link to restore it — or issue a fresh one below. Rotating
          invalidates every previously shared link; committed funds are untouched.
        </p>
        <button
          onClick={rotate}
          disabled={rotating}
          className="rounded-xl bg-emerald-900 px-6 py-3 font-semibold text-white disabled:opacity-50"
        >
          {rotating ? "Issuing new link…" : "Generate a new invite link"}
        </button>
        {rotErr && <p className="text-red-700">{rotErr}</p>}
      </div>
    );
  }

  return (
    <p className="text-sm text-amber-800">
      🔒 This invite link is missing its key — a working invite ends with <code>#s=…</code>. Ask the
      organizer to resend the full link. (Opening this page alone was never enough; joining
      requires the key, verified onchain.)
    </p>
  );
}

function ShareLink({
  pot,
  locked,
  secret,
}: {
  pot: string;
  locked: boolean;
  secret: `0x${string}` | null;
}) {
  const [copied, setCopied] = useState(false);
  if (typeof window === "undefined") return null;
  const url = locked && secret ? shareUrl(pot, secret) : window.location.href.split("#")[0];
  return (
    <div className="mt-2">
      {locked && (
        <p className="mb-1 text-xs text-amber-800">
          {secret
            ? "🔑 This link carries the invite key — only share it with your group."
            : "⚠️ Open this page from your own invite link before sharing: without the key fragment, the link won't admit anyone."}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <input readOnly value={url} className="w-full rounded-lg border px-3 py-2 font-mono text-xs" />
        <button
          onClick={() => {
            navigator.clipboard.writeText(url);
            setCopied(true);
          }}
          className="rounded-lg border px-4 py-2 text-sm font-semibold"
        >
          {copied ? "Copied ✓" : "Copy"}
        </button>
      </div>
    </div>
  );
}
