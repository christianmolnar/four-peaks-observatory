import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

// Load Poppins with emphasis on light weights
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["200", "300", "400", "500", "600", "700"],
  display: "swap",
  preload: true,
  fallback: ['system-ui', 'arial'],
});

export const metadata: Metadata = {
  title: {
    default: "Four Peaks Observatory",
    template: "%s | Four Peaks Observatory",
  },
  description: "Professional astrophotography and celestial imaging from Fountain Hills, Arizona. Explore deep sky objects, nebulas, galaxies, and terrestrial photography through our advanced telescope setups.",
  keywords: [
    "astrophotography",
    "astronomy",
    "telescope",
    "deep sky",
    "nebula",
    "galaxy",
    "Fountain Hills",
    "Washington",
    "observatory",
    "celestial photography",
    "space photography",
    "night sky",
    "SeeStar S50",
    "Meade telescope"
  ],
  authors: [{ name: "Four Peaks Observatory" }],
  creator: "Four Peaks Observatory",
  publisher: "Four Peaks Observatory",
  metadataBase: new URL("https://www.fourpeaksobservatory.com"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://www.fourpeaksobservatory.com",
    siteName: "Four Peaks Observatory",
    title: "Four Peaks Observatory | Astrophotography & Astronomy",
    description: "Astrophotography from Fountain Hills, Arizona. Explore deep sky objects, nebulas, galaxies, and terrestrial photography.",
    images: [
      {
        url: "https://www.fourpeaksobservatory.com/images/og-preview.jpg", // Featured astrophoto
        width: 1200,
        height: 675,
        alt: "North America Nebula - Astrophotography by Four Peaks Observatory",
        type: "image/jpeg",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Four Peaks Observatory | Astrophotography & Astronomy",
    description: "Astrophotography and celestial imaging from Fountain Hills, Arizona.",
    images: ["https://www.fourpeaksobservatory.com/images/og-preview.jpg"],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  icons: {
    icon: [
      {
        url: '/favicon.ico',
        sizes: '16x16',
        type: 'image/x-icon',
      },
      {
        url: '/favicon-32x32.png',
        sizes: '32x32',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/apple-touch-icon.png',
        sizes: '180x180',
        type: 'image/png',
      },
    ],
  },
  verification: {
    // Add your verification codes when you have them
    // google: "your-google-site-verification-code",
    // bing: "your-bing-verification-code",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const structuredData = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": "Four Peaks Observatory",
    "description": "Professional astrophotography and celestial imaging from Fountain Hills, Arizona",
    "url": "https://www.fourpeaksobservatory.com",
    "logo": "https://www.fourpeaksobservatory.com/images/logo/four-peaks-observatory-logo.png",
    "contactPoint": {
      "@type": "ContactPoint",
      "contactType": "general"
    },
    "address": {
      "@type": "PostalAddress",
      "addressLocality": "Fountain Hills",
      "addressRegion": "WA",
      "addressCountry": "US"
    },
    "sameAs": [
      // Add your social media URLs when you have them
      // "https://www.facebook.com/your-page",
      // "https://www.instagram.com/your-account",
      // "https://twitter.com/your-account"
    ]
  };

  return (
    <html lang="en">
      <head>
        {/* Raw Open Graph meta tags for better Facebook compatibility */}
        <meta property="fb:app_id" content="1396805241625567" />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://www.fourpeaksobservatory.com/" />
        <meta property="og:title" content="Four Peaks Observatory | Astrophotography & Astronomy" />
        <meta property="og:description" content="Astrophotography from Fountain Hills, Arizona. Explore deep sky objects, nebulas, galaxies, and terrestrial photography." />
        <meta property="og:image" content="https://www.fourpeaksobservatory.com/images/og-preview.jpg" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="675" />
        <meta property="og:image:type" content="image/jpeg" />
        <meta property="og:site_name" content="Four Peaks Observatory" />
        <meta property="og:locale" content="en_US" />
        
        {/* Twitter Card meta tags */}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Four Peaks Observatory | Astrophotography & Astronomy" />
        <meta name="twitter:description" content="Astrophotography and celestial imaging from Fountain Hills, Arizona." />
        <meta name="twitter:image" content="https://www.fourpeaksobservatory.com/images/og-preview.jpg" />
        
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
      </head>
      <body
        className={`${poppins.variable} antialiased`}
        style={{ fontWeight: 200, fontFamily: 'var(--font-poppins), sans-serif' }}
      >
        {children}
        <SpeedInsights />
        <Analytics />
      </body>
    </html>
  );
}
