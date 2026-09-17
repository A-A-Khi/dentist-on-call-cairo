import React from "react";
import Image from "next/image";

type BrandLogoProps = {
  /** login = full mark; nav = compact header mark */
  variant?: "nav" | "login";
  className?: string;
  priority?: boolean;
};

/** Cropped lockup asset on black (1100×649). */
const LOGO_WIDTH = 1100;
const LOGO_HEIGHT = 649;

/**
 * Official Dentist On Call mark (DOC tooth lockup).
 * Source asset: /brand/logo.png
 */
export function BrandLogo({ variant = "nav", className = "", priority = false }: BrandLogoProps) {
  if (variant === "login") {
    return (
      <div
        className={`mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-[#caa95a]/30 bg-black shadow-lg shadow-black/25 ${className}`}
      >
        <Image
          src="/brand/logo.png"
          alt="Dentist On Call"
          width={LOGO_WIDTH}
          height={LOGO_HEIGHT}
          priority={priority}
          className="block h-auto w-full object-contain"
          sizes="(max-width: 640px) 92vw, 28rem"
        />
      </div>
    );
  }

  return (
    <span
      className={`relative inline-flex h-11 w-[6.5rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#caa95a]/30 bg-black px-0.5 shadow-md shadow-black/20 ${className}`}
    >
      <Image
        src="/brand/logo.png"
        alt="Dentist On Call"
        width={LOGO_WIDTH}
        height={LOGO_HEIGHT}
        priority={priority}
        className="h-auto max-h-full w-full object-contain"
        sizes="104px"
      />
    </span>
  );
}
