import { ImageResponse } from "next/og";

import { DOODLE_H, DOODLE_PATHS, DOODLE_W } from "@/lib/sketch/doodle";

const CARD_WIDTH = 1200;
const CARD_HEIGHT = 630;
const DOODLE_WIDTH = 840;
const DOODLE_HEIGHT = (DOODLE_WIDTH * DOODLE_H) / DOODLE_W;

export function createSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#FBFAF5",
        }}
      >
        <svg
          viewBox={`0 0 ${DOODLE_W} ${DOODLE_H}`}
          width={DOODLE_WIDTH}
          height={DOODLE_HEIGHT}
          fill="none"
          stroke="#6E7DFF"
          strokeWidth={1.9}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          {DOODLE_PATHS.map((d, index) => (
            <path key={index} d={d} />
          ))}
        </svg>
      </div>
    ),
    {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
    },
  );
}
