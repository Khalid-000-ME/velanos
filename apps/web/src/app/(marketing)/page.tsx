import { CenteredHeading } from '@/components/landing/Section';
import { Audiences } from '@/components/landing/Audiences';
import { ClosingCta } from '@/components/landing/ClosingCta';
import { Developers } from '@/components/landing/Developers';
import { Faq } from '@/components/landing/Faq';
import { Hero } from '@/components/landing/Hero';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Outcomes } from '@/components/landing/Outcomes';
import { Stats } from '@/components/landing/Stats';
import { Universe } from '@/components/landing/Universe';
import { VaultTable } from '@/components/VaultTable';
import { api } from '@/lib/api';

export const dynamic = 'force-dynamic';

/**
 * The landing page.
 *
 * One idea per section, in the order a judge needs them: the claim, live proof it is running, how it
 * works, why it is not another guardrail, what an agent may touch, how to plug an agent in, the live
 * vaults, who it is for, and the questions that always come up.
 */
export default async function LandingPage() {
  const [stats, vaultsRes] = await Promise.all([api.stats(), api.vaults()]);
  const vaults = vaultsRes?.vaults ?? [];

  return (
    <>
      <Hero />
      <Stats stats={stats} />
      <HowItWorks />
      <Outcomes />
      <Universe />
      <Developers />

      <section className="content-width py-24">
        <CenteredHeading
          title="Live vaults"
          sub="Every vault under mandate, read straight from the chain. Open one to see every intent its agent has signed."
        />
        <div className="mt-14">
          <VaultTable vaults={vaults} />
        </div>
      </section>

      <Audiences />
      <ClosingCta />
      <Faq />
    </>
  );
}
