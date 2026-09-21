"use client";

// Envio HyperIndex as the feed data source. One GraphQL query replaces the
// per-factory RPC enumeration (potCount + allPots + 9-field multicall per pot)
// and is immune to RPC log-range limits. Returns null when unconfigured or on
// any failure so callers fall back to direct RPC reads.

export type EnvioPot = {
  address: string;
  chainId: number;
  title: string;
  organizer: string;
  token: string;
  perPerson: string; // base units, decimal string
  partySize: string;
  deadline: string;
  isPrivate: boolean;
  state: string;
  commitCount: string;
};

function endpoint(): string | null {
  const u = process.env.NEXT_PUBLIC_ENVIO_URL;
  return u && u.startsWith("http") ? u : null;
}

export function envioConfigured(): boolean {
  return endpoint() !== null;
}

export async function fetchPublicPots(chainId: number, limit = 100): Promise<EnvioPot[] | null> {
  const url = endpoint();
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query Pots($chainId: numeric!, $limit: Int!) {
          Pot(where: {chainId: {_eq: $chainId}, isPrivate: {_eq: false}}, order_by: {createdAt: desc}, limit: $limit) {
            address title organizer token perPerson partySize deadline isPrivate state commitCount
          }
        }`,
        variables: { chainId: String(chainId), limit },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.errors) return null;
    return (j.data?.Pot ?? []).map((p: Record<string, string>) => ({
      address: p.address,
      chainId,
      title: p.title,
      organizer: p.organizer,
      token: p.token,
      perPerson: String(p.perPerson),
      partySize: String(p.partySize),
      deadline: String(p.deadline),
      isPrivate: false,
      state: p.state,
      commitCount: String(p.commitCount),
    }));
  } catch {
    return null;
  }
}

export async function fetchOrganizedPots(chainId: number, owner: string): Promise<string[] | null> {
  const url = endpoint();
  if (!url) return null;
  try {
    const r = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: `query Mine($chainId: numeric!, $owner: String!) {
          Pot(where: {chainId: {_eq: $chainId}, organizer: {_eq: $owner}}, order_by: {createdAt: desc}, limit: 200) {
            address
          }
        }`,
        variables: { chainId: String(chainId), owner: owner.toLowerCase() },
      }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.errors) return null;
    return (j.data?.Pot ?? []).map((p: { address: string }) => p.address.toLowerCase());
  } catch {
    return null;
  }
}
