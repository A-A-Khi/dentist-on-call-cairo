import React from "react";

export function GlassBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      <div className="absolute inset-0 bg-[var(--bg-main)]" />
      <div className="glass-orb glass-orb-gold absolute -top-32 start-1/2 h-[28rem] w-[28rem] -translate-x-1/2" />
      <div className="glass-orb glass-orb-blue absolute top-1/3 -end-24 h-80 w-80" />
      <div className="glass-orb glass-orb-gold-soft absolute -bottom-32 -start-16 h-96 w-96" />
      <div className="glass-orb glass-orb-emerald absolute bottom-1/4 end-1/3 h-64 w-64" />
    </div>
  );
}
