const STEPS = [
  { icon: '📍', title: 'Enter postcode', desc: 'Find authentic vendors near you' },
  { icon: '🛒', title: 'Choose your tray', desc: 'Full trays, frozen packs, party orders' },
  { icon: '🚗', title: 'Scheduled delivery', desc: 'Delivered when you need it' },
] as const;

/**
 * Three-step explainer block. Light teal panel inset from the page edges so it
 * visually separates from the white vendor rails above and below without
 * needing a heavy divider.
 */
export function HowItWorks() {
  return (
    <section className="mx-4 my-3 rounded-2xl bg-teal-light px-4 py-5">
      <h2 className="mb-4 text-center text-[15px] font-bold text-dark">How Feastpot works</h2>
      <ol className="flex gap-3">
        {STEPS.map((step) => (
          <li key={step.title} className="flex-1 text-center">
            <div className="mb-2 text-3xl" aria-hidden>
              {step.icon}
            </div>
            <div className="text-xs font-bold text-dark">{step.title}</div>
            <div className="mt-0.5 text-[10px] leading-tight text-mid">{step.desc}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
