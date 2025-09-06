import './global.css';
import SiteHeader from '../components/SiteHeader';
import SiteFooter from '../components/SiteFooter';
import AnimatedBackground from './components/AnimatedBackground';

export const metadata = {
  title: 'MPWriter — Your voice, clearly heard.',
  description:
    'Craft researched, respectful letters to your MP in minutes with MPWriter.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <AnimatedBackground />
        <div className="page-wrap">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
      </body>
    </html>
  );
}
