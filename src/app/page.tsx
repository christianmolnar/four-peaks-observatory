import React from 'react';
import Image from 'next/image';
import Navigation from '@/components/Navigation';
import LatestCapturesCarousel from '@/components/LatestCapturesCarousel';
import ClearSkyClockEmbed from '@/components/ClearSkyClockEmbed';
import ObservationModule from '@/components/ObservationModule';
import { globalConfig } from '@/config/global';

export default function Home() {
  const { homepage } = globalConfig;

  return (
    <>
      <Navigation />
      {/* Hero Section with Floating Text */}
      <div className="relative pt-[108px]">
        {/* Hero Image - Smaller height so Latest Captures are clearly visible */}
        <div className="h-[75vh] relative overflow-hidden">
          <Image
            src={homepage.hero.image}
            alt={homepage.hero.alt}
            fill
            className="object-cover"
            priority
            quality={90}
          />
          {/* Lighter overlay for better image visibility */}
          <div className="absolute inset-0 bg-black/10"></div>
        </div>

        {/* Floating Text Overlay - Positioned at bottom */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black via-black/80 to-transparent pb-8 pt-12">
          <div className="max-w-5xl mx-auto px-6 text-center">
            {/* Main Title - Smaller to fit one line */}
            <h1 className="homepage-text text-4xl md:text-5xl lg:text-6xl font-light tracking-wider text-yellow-400 mb-2 uppercase">
              {homepage.hero.title}
            </h1>
            {/* Tagline right under title - back to nav font style */}
            <p className="homepage-text text-base md:text-lg text-gray-300 mb-8 font-light tracking-wide">
              {homepage.hero.tagline}
            </p>
            {/* Description Paragraph - Smaller font */}
            <div className="max-w-3xl mx-auto">
              {homepage.hero.description.map((paragraph, index) => (
                <p key={index} className="homepage-text text-sm md:text-base text-gray-400 leading-relaxed font-light mt-4 first:mt-0">
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Latest Captures Section - Reduced top space and fun copy */}
      <section
        className="py-8 px-6 relative overflow-hidden"
        style={{
          backgroundColor: '#000',
          backgroundImage: `url(${homepage.latestCaptures.backgroundImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        {/* Top gradient overlay for smooth blend */}
        <div className="absolute top-0 left-0 w-full h-24 pointer-events-none" style={{background: 'linear-gradient(to bottom, #000 0%, transparent 100%)', zIndex: 2}} />
        {/* Bottom gradient overlay for smooth blend */}
        <div className="absolute bottom-0 left-0 w-full h-24 pointer-events-none" style={{background: 'linear-gradient(to top, #000 0%, transparent 100%)', zIndex: 2}} />
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center mb-4">
            <h2 className="homepage-text text-4xl md:text-5xl lg:text-6xl font-light tracking-wider text-white mb-2 uppercase">
              {homepage.latestCaptures.title}
            </h2>
            <p className="homepage-text text-lg md:text-xl text-white font-light mb-4 drop-shadow-lg">
              {homepage.latestCaptures.subtitle}
            </p>
            <div className="flex justify-center">
              <div className="flex justify-center pb-2">
                <div className="w-[800px] h-px bg-white"></div>
              </div>
            </div>
          </div>
          <LatestCapturesCarousel />
          {/* Clear Sky Clock Embed */}
          {homepage.latestCaptures.showClearSkyClock && (
            <div className="mt-12">
              <ClearSkyClockEmbed />
              <ObservationModule />
            </div>
          )}
        </div>
      </section>
    </>
  );
}