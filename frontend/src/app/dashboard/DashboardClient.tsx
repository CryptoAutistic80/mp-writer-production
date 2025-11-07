'use client';

import { useEffect, useState } from 'react';
import MpFetch from '../../components/mpFetch';
import AddressForm from '../../components/AddressForm';
import DashboardWelcome from '../../components/DashboardWelcome';
import StartWritingButton from '../../components/StartWritingButton';
import { fetchMeWithRefresh } from '../../lib/auth';

export default function DashboardClient() {
  const [sharedPostcode, setSharedPostcode] = useState('');
  const [firstName, setFirstName] = useState('User');
  const [credits, setCredits] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await fetchMeWithRefresh();
        if (!cancelled && user) {
          const name = (user.name || '').split(' ')[0] || user.email || 'User';
          setFirstName(name);
          if (typeof user.credits === 'number') setCredits(user.credits);
        }
      } catch {
        // Ignore fetch errors silently
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <main className="hero-section">
      <DashboardWelcome firstName={firstName} credits={credits} />
      <section className="card" style={{ marginTop: 16 }}>
        <MpFetch onPostcodeChange={setSharedPostcode} />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <AddressForm seedPostcode={sharedPostcode} />
      </section>
      <section className="card card-compact" style={{ marginTop: 16 }}>
        <StartWritingButton />
      </section>
    </main>
  );
}
