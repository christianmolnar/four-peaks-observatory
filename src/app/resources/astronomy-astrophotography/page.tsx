import React from 'react';
import ResourcePageTemplate from '@/components/ResourcePageTemplate';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Astronomy & Astrophotography Resources',
  description: 'Curated guides, communities, and tools to help you explore the universe and capture its beauty through astrophotography.',
  keywords: [
    'astronomy guides',
    'astrophotography tutorials',
    'telescope guides',
    'astronomy communities',
    'star photography',
    'deep sky imaging',
    'astronomy tools'
  ],
  openGraph: {
    title: 'Astronomy & Astrophotography Resources - Four Peaks Observatory',
    description: 'Curated resources for astronomy and astrophotography enthusiasts.',
    type: 'website',
  },
};

const resources = [
  {
    category: 'Guides',
    items: [
      {
        name: 'Pixinsight Processing for Beginners',
        link: 'https://youtu.be/4i9ZmvpMZQM?si=uweyi1QqLH2LMl-0',
        description: 'The most basic and effective processing flow. I use this plus some light Adobe Lightroom final editing for all my pictures.'
      },
      {
        name: 'Astronomy Tools',
        link: 'https://astronomy.tools/',
        description: 'Online calculators and tools for planning your night sky sessions.'
      }
    ]
  },
  {
    category: 'Communities',
    items: [
      {
        name: 'SeeStar Official ZWO Group',
        link: 'https://www.facebook.com/groups/seestar/',
        description: 'So many SeeStar FB groups! This is the official ZWO SeeStar community.'
      },
      {
        name: 'ZWO Cameras General Group',
        link: 'https://www.facebook.com/groups/1062849903811306',
        description: 'A good resource and great images posted!'
      },
      {
        name: 'Cloudy Nights Forum',
        link: 'https://www.cloudynights.com/',
        description: 'Active community for astronomy and astrophotography discussions.'
      },
      {
        name: 'r/Astronomy',
        link: 'https://www.reddit.com/r/astronomy/',
        description: "Reddit's hub for astronomy enthusiasts."
      }
    ]
  }
];

export default function AstronomyAstrophotographyPage() {
  return (
    <ResourcePageTemplate
      title="Astronomy & Astrophotography Resources"
      backgroundImage="/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg"
      description="Curated guides, communities, and tools to help you explore the universe and capture its beauty."
      resources={resources}
    />
  );
}