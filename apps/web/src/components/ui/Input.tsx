import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, id, className = "", ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-[#94a3b8]">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={`w-full rounded-xl border bg-[#101622] px-3.5 py-2.5 text-sm text-[#f8fafc] placeholder-[#475569] shadow-inner transition-all duration-150 focus:border-[#caa95a] focus:bg-[#151d2c] focus:outline-none focus:ring-1 focus:ring-[#caa95a] disabled:opacity-50 ${
              error ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500" : "border-[#24314c]"
            } ${className}`}
            {...props}
          />
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-[#64748b]">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
