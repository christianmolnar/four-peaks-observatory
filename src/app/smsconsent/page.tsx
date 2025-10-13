import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'SMS Consent - Maple Valley Observatory',
  description: 'SMS messaging consent and opt-in information for Maple Valley Observatory alerts',
};

export default function SMSConsentPage() {
  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-8 text-center">
          SMS Messaging Consent
        </h1>
        
        <div className="bg-gray-800 rounded-lg p-8 space-y-6">
          <section>
            <h2 className="text-2xl font-semibold mb-4">Observatory SMS Alerts</h2>
            <p className="text-gray-300 leading-relaxed">
              Maple Valley Observatory provides automated SMS text message alerts about observing 
              conditions, weather forecasts, and astronomical events to help amateur astronomers 
              plan their stargazing sessions.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Consent to Receive Messages</h2>
            <div className="bg-green-900/30 border border-green-600 rounded-lg p-4">
              <p className="text-green-200">
                ✅ <strong>I consent to receive SMS messages from Maple Valley Observatory</strong>
              </p>
              <p className="text-sm text-green-300 mt-2">
                By providing my phone number and requesting SMS alerts, I agree to receive 
                automated text messages about observatory conditions and astronomical events.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Message Information</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Message Types</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Daily observing condition forecasts</li>
                  <li>• Weather alerts and warnings</li>
                  <li>• Astronomical event notifications</li>
                  <li>• Observatory equipment status</li>
                </ul>
              </div>
              <div className="bg-gray-700 rounded-lg p-4">
                <h3 className="font-semibold mb-2">Frequency</h3>
                <ul className="text-sm text-gray-300 space-y-1">
                  <li>• Daily alerts (optional)</li>
                  <li>• Event-based notifications</li>
                  <li>• Maximum 1-3 messages per day</li>
                  <li>• No promotional content</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Your Rights</h2>
            <div className="space-y-3">
              <div className="flex items-start space-x-3">
                <span className="text-blue-400 text-xl">📱</span>
                <div>
                  <h3 className="font-semibold">Opt-Out Anytime</h3>
                  <p className="text-sm text-gray-300">
                    Reply <code className="bg-gray-600 px-1 rounded">STOP</code> to any message to unsubscribe immediately
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-green-400 text-xl">📞</span>
                <div>
                  <h3 className="font-semibold">Help Available</h3>
                  <p className="text-sm text-gray-300">
                    Reply <code className="bg-gray-600 px-1 rounded">HELP</code> for assistance or contact support
                  </p>
                </div>
              </div>
              <div className="flex items-start space-x-3">
                <span className="text-purple-400 text-xl">🔒</span>
                <div>
                  <h3 className="font-semibold">Privacy Protected</h3>
                  <p className="text-sm text-gray-300">
                    Your phone number is never shared and only used for observatory alerts
                  </p>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Message & Data Rates</h2>
            <div className="bg-yellow-900/30 border border-yellow-600 rounded-lg p-4">
              <p className="text-yellow-200 text-sm">
                <strong>Notice:</strong> Message and data rates may apply. Standard SMS charges 
                from your wireless carrier may apply. Check with your carrier for details.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-2xl font-semibold mb-4">Supported Carriers</h2>
            <p className="text-sm text-gray-300">
              SMS alerts are supported by major U.S. carriers including Verizon, AT&T, T-Mobile, 
              Sprint, and most prepaid carriers. International messaging may not be supported.
            </p>
          </section>

          <section className="border-t border-gray-600 pt-6">
            <h2 className="text-xl font-semibold mb-4">Contact Information</h2>
            <div className="text-sm text-gray-300 space-y-2">
              <p><strong>Observatory:</strong> Maple Valley Observatory</p>
              <p><strong>Website:</strong> <Link href="/" className="text-blue-400 hover:underline">maplevalley.com</Link></p>
              <p><strong>Opt-Out:</strong> Reply STOP to any message</p>
              <p><strong>Help:</strong> Reply HELP to any message</p>
            </div>
          </section>

          <div className="text-center pt-6">
            <Link 
              href="/"
              className="inline-block bg-blue-600 hover:bg-blue-700 px-6 py-3 rounded-lg font-semibold transition-colors"
            >
              Return to Observatory
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
