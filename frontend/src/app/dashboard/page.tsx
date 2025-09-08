import UserAddress from '../../components/UserAddress';

export default function DashboardPage() {
  // AnimatedBackground is rendered globally in layout.tsx.
  return (
    <main className="hero-section">
      <section className="card">
        <UserAddress />
      </section>
    </main>
  );
}
