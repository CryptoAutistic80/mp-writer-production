import Link from 'next/link';

export const metadata = {
  title: 'Writing Desk — MPWriter',
};

export default function WritingDeskPage() {
  return (
    <main className="hero-section">
      <section className="card">
        <div className="container">
          <h1 className="section-title">Writing desk</h1>
          <p className="section-sub">Compose your message and we’ll handle the research and draft.</p>
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div className="container">
          <p>
            This space is reserved for the letter composer. In the meantime, you can return to the
            {' '}<Link href="/dashboard">dashboard</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}

