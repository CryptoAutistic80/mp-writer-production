import './global.css';

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
        {children}
      </body>
    </html>
  );
}
