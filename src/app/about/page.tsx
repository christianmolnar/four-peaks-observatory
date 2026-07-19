import Image from 'next/image';
import SiteLayout from '@/components/SiteLayout';

export default function AboutPage() {
  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        {/* Background Image */}
        <div className="fixed inset-0 z-0">
          <Image
            src="/images/hero/M42-20x240sec-2-7-2005-2547x1813.jpg"
            alt="Background"
            fill
            className="object-cover opacity-40"
            quality={85}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/30" />
        </div>

        {/* Content */}
        <main className="relative z-10 pt-16 pb-16">
          <div className="max-w-4xl mx-auto px-6">
            {/* Page Title */}
            <div className="text-center mb-16">
              <h1 className="text-3xl md:text-4xl font-light text-white tracking-[0.2em] mb-8">
                ABOUT THE OBSERVATORY
              </h1>
            </div>

            {/* Content Section */}
            <div className="bg-black/70 backdrop-blur-sm rounded-lg border border-white/10 p-8 md:p-12">
              <div className="prose prose-invert max-w-none">
                <p className="text-white/90 text-lg leading-relaxed mb-6">
                  Welcome to Four Peaks Observatory, where we capture the beauty and wonder of the cosmos 
                  from the Sonoran Desert. Located in Fountain Hills, Arizona, our observatory is dedicated 
                  to astrophotography and sharing the magnificent views of deep space objects, our solar system, 
                  and the natural world around us.
                </p>

                <p className="text-white/90 text-lg leading-relaxed mb-6">
                  Our mission is to inspire curiosity about the universe through stunning astronomical imagery 
                  and to make the wonders of space accessible to everyone. From distant galaxies and colorful 
                  nebulae to detailed views of planets and the moon, we strive to bring the cosmos closer to home.
                </p>

                <p className="text-white/90 text-lg leading-relaxed">
                  Whether you&apos;re an astronomy enthusiast, a student, or simply someone who appreciates the 
                  beauty of the night sky, we invite you to explore our galleries and discover the incredible 
                  universe that surrounds us all.
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </SiteLayout>
  );
}
