import React from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  endAdornment?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, endAdornment, id, className = "", ...props }, ref) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, "-") : undefined);

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label htmlFor={inputId} className="block text-xs font-medium text-secondary">
            {label}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            className={`glass-input w-full rounded-xl px-3.5 py-2.5 text-sm transition-all duration-150 focus:outline-none focus:ring-1 focus:ring-[#caa95a] disabled:opacity-50 ${
              endAdornment ? "pe-11" : ""
            } ${
              error ? "border-rose-500/80 focus:border-rose-500 focus:ring-rose-500" : ""
            } ${className}`}
            {...props}
          />
          {endAdornment ? (
            <div className="absolute inset-y-0 end-0 flex items-center pe-2.5">{endAdornment}</div>
          ) : null}
        </div>
        {error && <p className="text-xs text-rose-400">{error}</p>}
        {helperText && !error && <p className="text-xs text-muted">{helperText}</p>}
      </div>
    );
  }
);

Input.displayName = "Input";
