import MpFetch from '../../components/mpFetch';
import AddressForm from '../../components/AddressForm';

export default function DashboardPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  return (
    <main className="hero-section">
      <section className="card">
        <MpFetch />
      </section>
      <section className="card" style={{ marginTop: 16 }}>
        <AddressForm />
      </section>
    </main>
  );
}
