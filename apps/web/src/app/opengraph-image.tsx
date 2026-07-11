import { ImageResponse } from "next/og";

// Site-wide default social/preview card. Generated as a real PNG at build time,
// so it needs no external design asset. Child segments can override with their
// own opengraph-image file.

export const alt = "AccountIQ — GSTR-2B reconciliation & duplicate-payment detection for Indian CAs & SMEs";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "linear-gradient(135deg, #1B3A5C 0%, #15314d 100%)",
          padding: "72px",
          color: "white",
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
          <div
            style={{
              width: "72px",
              height: "72px",
              borderRadius: "16px",
              background: "rgba(255,255,255,0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "34px",
              fontWeight: 800,
            }}
          >
            IQ
          </div>
          <div style={{ fontSize: "40px", fontWeight: 800 }}>AccountIQ</div>
        </div>

        {/* Headline */}
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          <div style={{ fontSize: "60px", fontWeight: 800, lineHeight: 1.1, maxWidth: "1000px" }}>
            Know what deserves your attention before it costs you money.
          </div>
          <div style={{ fontSize: "30px", color: "rgba(255,255,255,0.72)", maxWidth: "980px" }}>
            GSTR-2B reconciliation &amp; duplicate-payment detection for Indian CAs &amp; SMEs.
          </div>
        </div>

        {/* Footer chips */}
        <div style={{ display: "flex", gap: "16px", fontSize: "24px", color: "rgba(255,255,255,0.85)" }}>
          {["GST / ITC risk", "Duplicate payments", "Evidence on every finding"].map((t) => (
            <div
              key={t}
              style={{
                display: "flex",
                border: "1px solid rgba(255,255,255,0.2)",
                borderRadius: "999px",
                padding: "10px 22px",
              }}
            >
              {t}
            </div>
          ))}
        </div>
      </div>
    ),
    { ...size },
  );
}
