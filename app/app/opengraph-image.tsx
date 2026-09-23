import { ImageResponse } from "next/og";

// Static share image (1200×630): rich previews when pot links travel in
// group chats — the product's distribution loop. Pot-specific images would
// need a server metadata path; brand-level preview is 80% of the value.
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#065f46",
          color: "#ffffff",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <div style={{ fontSize: 96, fontWeight: 900 }}>WeMadeIt 🎉</div>
        <div style={{ fontSize: 40, marginTop: 16, color: "#a7f3d0" }}>
          Money only moves if the group means it.
        </div>
        <div style={{ fontSize: 28, marginTop: 32, color: "#d1fae5" }}>
          Conditional group pots on Monad · Face ID login · AUSD + MON
        </div>
      </div>
    ),
    { ...size }
  );
}
