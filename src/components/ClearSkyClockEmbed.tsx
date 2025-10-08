// This component embeds the Maple Valley Observatory Clear Sky Clock using an iframe.
import React from 'react';
import Image from 'next/image';

export default function ClearSkyClockEmbed() {
  return (
    <div className="w-full flex flex-col items-center py-8">
      <h3
        className="text-xl md:text-2xl font-light tracking-wider text-white mb-2 uppercase"
        style={{ letterSpacing: '0.08em' }}
      >
        MAPLE VALLEY OBSERVATORY CLEAR SKY CLOCK
      </h3>
      <div className="flex justify-center pb-2">
        <div className="w-[800px] h-px bg-white"></div>
      </div>
      <div className="w-full flex justify-center px-4">
        <a
          href="https://www.cleardarksky.com/c/MplVllyObWAkey.html"
          target="_blank"
          rel="noopener noreferrer"
          className="block max-w-full"
        >
          <Image
            src="https://www.cleardarksky.com/c/MplVllyObWAcsk.gif?c=493250"
            alt="Maple Valley Observatory Clear Sky Clock"
            width={960}
            height={400}
            className="w-full max-w-4xl h-auto"
            style={{ 
              border: 'none', 
              background: 'transparent',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)'
            }}
            unoptimized // Required for external animated GIF
          />
        </a>
      </div>
    </div>
  );
}
