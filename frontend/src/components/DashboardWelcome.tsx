"use client";

import Link from 'next/link';

type Props = {
  firstName: string;
  credits: number;
};

export default function DashboardWelcome({ firstName, credits }: Props) {
  const formatCredits = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    return rounded.toFixed(2).replace(/\.00$/, '').replace(/(\.\d)0$/, '$1');
  };
  return (
    <section className="card">
      <div className="container dashboard-welcome">
        <div className="welcome-copy">
          <h2 className="section-title">Welcome to your dashboard {firstName}!</h2>
          <p>Please enter your postcode below to locate your MP and select your address.</p>
          <p>Then you are ready to write your letter!</p>
          <p>
            <em className="fineprint">
              (Saved addresses and telephone numbers are encrypted so only you can read them. Singularity Shift Ltd does not access or use these details.)
            </em>
          </p>
        </div>
        <div className="credits-info">
          <Link className="btn-primary btn-wide" href="/credit-shop">
            Visit credit shop
          </Link>
          <div className="credit-balance" aria-label={`You have ${formatCredits(credits)} credits available`}>
            <svg
              className="credit-balance__icon"
              viewBox="0 0 24 24"
              aria-hidden
              focusable="false"
            >
              <path
                d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z"
                fill="currentColor"
                opacity="0.25"
              />
              <path
                d="M12 6v12m0-6h2.25a1.5 1.5 0 100-3H9.75a1.5 1.5 0 110-3H15"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="credit-balance__content">
              <span className="credit-balance__label">Credits</span>
              <span className="credit-balance__value">{formatCredits(credits)}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
