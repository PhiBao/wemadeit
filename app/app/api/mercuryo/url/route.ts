import { NextResponse } from "next/server";
import { createHash } from "crypto";

// Mercuryo on-ramp: builds a signed widget URL sending to the user's address.
// Needs MERCURYO_WIDGET_ID + MERCURYO_SECRET (server-only). Without them the
// route reports disabled and the UI hides the buy button.
// Signature: SHA512(address + secret + clientIp + merchantTxId), prefixed v2:.

export async function POST(req: Request) {
  const widgetId = process.env.MERCURYO_WIDGET_ID;
  const secret = process.env.MERCURYO_SECRET;
  if (!widgetId || !secret) return NextResponse.json({ disabled: true });

  const { address } = (await req.json()) as { address?: string };
  if (!address || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return NextResponse.json({ error: "bad address" }, { status: 400 });
  }

  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";
  const merchantTxId = `wmi-${Date.now()}-${address.slice(2, 8)}`;
  const sig = createHash("sha512")
    .update(`${address}${secret}${ip}${merchantTxId}`)
    .digest("hex");

  const url =
    `https://exchange.mercuryo.io/?widget_id=${encodeURIComponent(widgetId)}` +
    `&type=buy&address=${encodeURIComponent(address)}` +
    `&merchant_transaction_id=${encodeURIComponent(merchantTxId)}` +
    `&signature=${encodeURIComponent(`v2:${sig}`)}`;
  return NextResponse.json({ url });
}
