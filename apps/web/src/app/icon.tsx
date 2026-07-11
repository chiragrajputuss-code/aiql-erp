import { ImageResponse } from "next/og";

// Generated favicon — the "IQ" monogram on the brand navy. Real PNG, no asset file.

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1B3A5C",
          borderRadius: "7px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontSize: "17px",
          fontWeight: 800,
          fontFamily: "sans-serif",
        }}
      >
        IQ
      </div>
    ),
    { ...size },
  );
}
