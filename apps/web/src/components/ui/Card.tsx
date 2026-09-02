import React from "react";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "default" | "elevated" | "gold-bordered";
}

export function Card({
  children,
  variant = "default",
  className = "",
  ...props
}: CardProps) {
  const variantStyles = {
    default: "bg-[#101622] border border-[#24314c]",
    elevated: "bg-[#151d2c] border border-[#24314c] shadow-xl shadow-black/40",
    "gold-bordered":
      "bg-[#101622] border border-[#caa95a]/30 shadow-lg shadow-[#caa95a]/5",
  };

  return (
    <div
      className={`rounded-2xl p-6 transition-all duration-200 ${variantStyles[variant]} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`mb-4 flex items-center justify-between ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({
  children,
  className = "",
  ...props
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-lg font-semibold text-[#f8fafc] ${className}`} {...props}>
      {children}
    </h3>
  );
}
