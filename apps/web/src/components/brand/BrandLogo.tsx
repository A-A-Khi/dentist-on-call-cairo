import React from "react";
import Image from "next/image";

type BrandLogoProps = {
  /** login = full lockup; nav = compact DOC mark */
  variant?: "nav" | "login";
  className?: string;
  priority?: boolean;
};

/** Full lockup on black (wordmark + tagline). */
const LOGO_WIDTH = 1100;
const LOGO_HEIGHT = 649;

/** Cropped DOC mark only (tooth + letterforms). */
const MARK_WIDTH = 995;
const MARK_HEIGHT = 415;

/**
 * Official Dentist On Call mark (DOC tooth lockup).
 * Sources: /brand/logo.png (full), /brand/mark.png (compact)
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
      className={`relative inline-flex h-10 w-[6.25rem] shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[#caa95a]/30 bg-black px-1 shadow-md shadow-black/20 sm:h-11 sm:w-[6.75rem] ${className}`}
    >
      <Image
        src="/brand/mark.png"
        alt="Dentist On Call"
        width={MARK_WIDTH}
        height={MARK_HEIGHT}
        priority={priority}
        className="h-auto max-h-full w-full object-contain"
        sizes="108px"
      />
    </span>
  );
}
