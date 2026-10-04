/** The marketing page renders its own full-bleed sections, so this layout adds nothing around them. */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
