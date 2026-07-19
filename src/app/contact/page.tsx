import { Metadata } from 'next';
import Image from 'next/image';
import SiteLayout from '@/components/SiteLayout';

export const metadata: Metadata = {
  title: 'Contact | Four Peaks Observatory',
  description: 'Get in touch with Four Peaks Observatory. Contact us for inquiries about visual astronomy and automated astrophotography.',
  keywords: ['contact', 'astrophotography', 'astronomy', 'observatory', 'Fountain Hills'],
  openGraph: {
    title: 'Contact | Four Peaks Observatory',
    description: 'Get in touch with Four Peaks Observatory for astrophotography and astronomy inquiries.',
    type: 'website',
  }
};

export default function ContactPage() {
  return (
    <SiteLayout>
      <div className="min-h-screen bg-black">
        {/* Background Image - Exact same as GalleryTemplate */}
        <div className="fixed inset-0 z-0">
          <Image
            src="/images/assets/Mauna-Kea-1.jpg"
            alt="Background"
            fill
            className="object-cover opacity-50"
            quality={85}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-black/5 to-black/20" />
        </div>

        {/* Content */}
        <div className="relative z-10 pt-8">
        <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl md:text-4xl font-light text-white mb-3">
              Contact Us
            </h1>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              Have questions about the astronomy and astrophotography hobby? 
              We&apos;d love to hear from you.
            </p>
          </div>

          {/* Contact Form */}
          <div className="bg-white/5 backdrop-blur-md rounded-lg border border-white/20 p-6 shadow-2xl">
            <form 
              action="https://formspree.io/f/xanbblrl" 
              method="POST" 
              className="space-y-4"
              id="contact-form"
            >
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg 
                             text-white placeholder-slate-300 focus:ring-2 focus:ring-amber-500 
                             focus:border-amber-400 transition-all duration-200 backdrop-blur-sm"
                    placeholder="Your full name"
                  />
                </div>
                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg 
                             text-white placeholder-slate-300 focus:ring-2 focus:ring-amber-500 
                             focus:border-amber-400 transition-all duration-200 backdrop-blur-sm"
                    placeholder="your.email@example.com"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="subject" className="block text-sm font-medium text-slate-300 mb-2">
                  Subject *
                </label>
                <input
                  type="text"
                  id="subject"
                  name="subject"
                  required
                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg 
                           text-white placeholder-slate-300 focus:ring-2 focus:ring-amber-500 
                           focus:border-amber-400 transition-all duration-200 backdrop-blur-sm"
                  placeholder="What's this about?"
                />
              </div>

              <div>
                <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
                  Message *
                </label>
                <textarea
                  id="message"
                  name="message"
                  rows={4}
                  required
                  className="w-full px-3 py-2 bg-white/10 border border-white/30 rounded-lg 
                           text-white placeholder-slate-300 focus:ring-2 focus:ring-amber-500 
                           focus:border-amber-400 transition-all duration-200 backdrop-blur-sm resize-vertical"
                  placeholder="Tell us about your inquiry, project, or how we can help..."
                />
              </div>

              <button
                type="submit"
                className="w-full bg-amber-600/80 hover:bg-amber-700/90 text-white font-medium py-2 px-6 
                         rounded-lg transition-colors duration-200 focus:ring-2 focus:ring-amber-500 
                         focus:ring-offset-2 focus:ring-offset-transparent backdrop-blur-sm"
              >
                Send Message
              </button>
            </form>

            {/* Thank you message (initially hidden) */}
            <div id="thank-you-message" className="hidden text-center py-4">
              <div className="text-amber-400 text-lg font-medium mb-2">
                ✓ Message Sent Successfully!
              </div>
              <p className="text-slate-300 text-sm">
                Thank you for reaching out. We&apos;ll get back to you soon.
              </p>
            </div>
          </div>

          {/* Additional Contact Info */}
          <div className="mt-8 grid md:grid-cols-3 gap-4 text-center">
            <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 border border-white/20 shadow-xl">
              <div className="text-amber-400 text-xl mb-2">🔭</div>
              <h3 className="text-base font-medium text-white mb-1">Observatory</h3>
              <p className="text-slate-200 text-xs">
                Located in Fountain Hills, Arizona
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 border border-white/20 shadow-xl">
              <div className="text-amber-400 text-xl mb-2">📸</div>
              <h3 className="text-base font-medium text-white mb-1">Astrophotography</h3>
              <p className="text-slate-200 text-xs">
                Deep space imaging and celestial photography
              </p>
            </div>
            <div className="bg-white/5 backdrop-blur-md rounded-lg p-4 border border-white/20 shadow-xl">
              <div className="text-amber-400 text-xl mb-2">🌟</div>
              <h3 className="text-base font-medium text-white mb-1">Observations</h3>
              <p className="text-slate-200 text-xs">
                Planetary, lunar, solar, deep sky, wide field, terrestrial photography...
              </p>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Form submission script */}
      <script dangerouslySetInnerHTML={{
        __html: `
          document.addEventListener('DOMContentLoaded', function() {
            const form = document.getElementById('contact-form');
            const thankYouMessage = document.getElementById('thank-you-message');
            
            if (form) {
              form.addEventListener('submit', function(e) {
                // Let the form submit naturally to FormSpree
                setTimeout(function() {
                  // After a brief delay, show thank you message
                  form.style.display = 'none';
                  thankYouMessage.classList.remove('hidden');
                }, 100);
              });
            }
          });
        `
      }} />
      </div>
    </SiteLayout>
  );
}
