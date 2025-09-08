import MpFetch from '../../components/mpFetch';

export default function DashboardPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  return (
    <main className="hero-section">
      <section className="card">
        <MpFetch />
      </section>
    </main>
  );
}
