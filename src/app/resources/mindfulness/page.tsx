import React from 'react';
import ResourcePageTemplate from '@/components/ResourcePageTemplate';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mindfulness Resources',
  description: 'Discover curated mindfulness, meditation, and wellbeing resources to help you find balance and peace in your life.',
  keywords: [
    'mindfulness',
    'meditation',
    'wellbeing',
    'mental health',
    'stress relief',
    'meditation apps',
    'mindful living'
  ],
  openGraph: {
    title: 'Mindfulness Resources - Four Peaks Observatory',
    description: 'Curated resources for mindfulness, meditation, and wellbeing.',
    type: 'website',
  },
};

const resources = [
  {
    category: 'Meditation',
    items: [
      {
        name: 'Waking Up',
        link: 'https://www.wakingup.com/',
        description: 'The best introduction to mindfulness and meditation I have found, and so much more...'
      }
    ]
  },
  {
    category: 'Wellbeing',
    items: [
      {
        name: 'Grateful.org',
        link: 'https://grateful.org/',
        description: 'Want to be happy? Be grateful. Never a truer statement. Please enjoy and consider supporting the work of the Grateful.org team and Brother David Steindl-Rast.'
      },
      {
        name: 'Mindful.org',
        link: 'https://www.mindful.org/',
        description: 'Articles and resources for living a mindful life.'
      }
    ]
  }
];

export default function MindfulnessPage() {
  return (
    <ResourcePageTemplate
      title="Mindfulness Resources"
      backgroundImage="/images/astrophotography/deep-sky/nebulas/North America and The Pelican.jpg"
      description="Explore meditation, wellbeing, and mindfulness resources to help you find balance and peace."
      resources={resources}
    />
  );
}
