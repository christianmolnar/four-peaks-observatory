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
      <div className="w-full flex justify-center">
        <a
          href="https://www.cleardarksky.com/c/MplVllyObWAkey.html"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Image
            src="https://www.cleardarksky.com/c/MplVllyObWAcsk.gif?c=493250"
            alt="Maple Valley Observatory Clear Sky Clock"
            width={600}
            height={250}
            style={{ border: 'none', background: 'transparent', maxWidth: '100%', height: 'auto' }}
            unoptimized // Required for external animated GIF
          />
        </a>
      </div>
    </div>
  );
}
