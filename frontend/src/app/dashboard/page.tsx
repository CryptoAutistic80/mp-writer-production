"use client";

import MpFetch from '../../components/mpFetch';
import AddressForm from '../../components/AddressForm';
import { useState } from 'react';

export default function DashboardPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  const [sharedPostcode, setSharedPostcode] = useState('');
  return (
    <main className="hero-section">
      <section className="card">
        <MpFetch onPostcodeChange={setSharedPostcode} />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <AddressForm seedPostcode={sharedPostcode} />
      </section>
    </main>
  );
}
