'use client';

import { useState, useEffect } from 'react';
import Navigation from '@/components/Navigation';

interface ConferenceTalk {
  id: string;
  title: string;
  speaker: string;
  session: string;
  url: string;
  duration?: string;
  summary?: string;
}

export default function ConferencePage() {
  const [talks, setTalks] = useState<ConferenceTalk[]>([]);
  const [filterTerm, setFilterTerm] = useState(''); // For filtering talks list
  const [contentSearchTerm, setContentSearchTerm] = useState(''); // For searching within talk content
  const [selectedTalk, setSelectedTalk] = useState<ConferenceTalk | null>(null);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchConferenceTalks();
  }, []);

  const fetchConferenceTalks = async () => {
    try {
      const response = await fetch('/api/conference-talks');
      const data = await response.json();
      setTalks(data.talks || []);
    } catch (error) {
      console.error('Failed to fetch conference talks:', error);
    }
  };

  const searchInTalk = async (talk: ConferenceTalk, query: string) => {
    if (!query.trim()) return;
    
    setLoading(true);
    try {
      const response = await fetch('/api/conference-search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ talkUrl: talk.url, query })
      });
      
      const results = await response.json();
      setSearchResults(results.matches || []);
    } catch (error) {
      console.error('Search failed:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    if (selectedTalk && contentSearchTerm.trim()) {
      searchInTalk(selectedTalk, contentSearchTerm);
    }
  };

  const filteredTalks = talks.filter(talk => 
    talk.title.toLowerCase().includes(filterTerm.toLowerCase()) ||
    talk.speaker.toLowerCase().includes(filterTerm.toLowerCase())
  );

  return (
    <div 
      className="min-h-screen text-white relative"
      style={{
        backgroundImage: 'url(/images/assets/conf.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
        backgroundAttachment: 'fixed'
      }}
    >
      {/* Dark overlay for better text readability */}
      <div className="absolute inset-0 bg-black/70 z-0"></div>
      
      {/* Content wrapper */}
      <div className="relative z-10">
        <Navigation />
        
        <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-4 text-center text-white">
            October 2025 General Conference
          </h1>
          <p className="text-xl text-center text-yellow-400 mb-8">
            Search conference talks for Sunday School lessons
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Talks List */}
          <div className="bg-black/80 backdrop-blur-sm rounded-lg p-6 border border-yellow-400/20">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">Conference Talks</h2>
            
                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Filter talks by title or speaker..."
                    value={filterTerm}
                    onChange={(e) => setFilterTerm(e.target.value)}
                    className="w-full p-3 bg-black/60 border border-yellow-400/30 rounded-lg text-white placeholder-yellow-300/60 focus:border-yellow-400 focus:outline-none"
                  />
                </div>
                
                <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredTalks.map((talk) => (
                <div
                  key={talk.id}
                  onClick={() => setSelectedTalk(talk)}
                  className={`p-4 rounded-lg cursor-pointer transition-colors border border-yellow-400/20 ${
                    selectedTalk?.id === talk.id
                      ? 'bg-yellow-600 text-black'
                      : 'bg-black/60 hover:bg-black/80 text-white'
                  }`}
                >
                  <h3 className="font-semibold text-white">{talk.title}</h3>
                  <p className="text-sm text-yellow-300">by {talk.speaker}</p>
                  <div className="flex justify-between items-center mt-2">
                    <span className="text-xs text-slate-400">{talk.session}</span>
                    {talk.duration && (
                      <span className="text-xs text-yellow-400">{talk.duration}</span>
                    )}
                  </div>
                  {talk.summary && (
                    <p className="text-xs text-slate-400 mt-1 line-clamp-2">
                      {talk.summary}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Search in Talk */}
          <div className="bg-black/80 backdrop-blur-sm rounded-lg p-6 border border-yellow-400/20">
            <h2 className="text-2xl font-bold mb-4 text-yellow-400">Search in Talk</h2>
            
            {selectedTalk ? (
              <>
                <div className="mb-4 p-4 bg-black/60 rounded-lg border border-yellow-400/20">
                  <h3 className="font-semibold text-white">{selectedTalk.title}</h3>
                  <p className="text-sm text-yellow-300">by {selectedTalk.speaker}</p>
                </div>

                <div className="mb-4">
                  <input
                    type="text"
                    placeholder="Search for words or phrases in this talk..."
                    value={contentSearchTerm}
                    onChange={(e) => setContentSearchTerm(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                    className="w-full p-3 bg-black/60 border border-yellow-400/30 rounded-lg text-white placeholder-yellow-300/60 focus:border-yellow-400 focus:outline-none"
                  />
                  <button
                    onClick={handleSearch}
                    disabled={loading || !contentSearchTerm.trim()}
                    className="w-full mt-2 p-3 bg-yellow-600 hover:bg-yellow-700 disabled:bg-slate-600 text-black font-semibold rounded-lg transition-colors"
                  >
                    {loading ? 'Searching...' : 'Search Talk'}
                  </button>
                </div>

                <div className="mb-4">
                  <a
                    href={selectedTalk.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block p-3 bg-white hover:bg-gray-100 text-black font-semibold rounded-lg transition-colors"
                  >
                    Watch Video & Read Full Text
                  </a>
                </div>

                {/* Search Results */}
                {searchResults.length > 0 && (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    <h3 className="font-semibold text-yellow-400">Search Results:</h3>
                    {searchResults.map((result, index) => (
                      <div key={index} className="p-3 bg-black/60 rounded-lg border border-yellow-400/20">
                        <p className="text-sm text-white">
                          "{result.text}"
                        </p>
                        {result.paragraph && (
                          <p className="text-xs text-yellow-300 mt-1">
                            Section: {result.paragraph}
                          </p>
                        )}
                        {result.timestamp && (
                          <p className="text-xs text-yellow-400 mt-1">
                            Estimated time: {result.timestamp}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {contentSearchTerm && searchResults.length === 0 && !loading && (
                  <p className="text-yellow-200/80 text-center">
                    No matches found for "{contentSearchTerm}"
                  </p>
                )}
              </>
            ) : (
              <p className="text-yellow-200/80 text-center">
                Select a talk from the list to search within it
              </p>
            )}
          </div>
        </div>

        <div className="mt-8 text-center text-yellow-300">
          <p>
            This tool helps you find specific topics and quotes from conference talks
            for your Sunday School lessons. Click on any talk to search within it.
          </p>
        </div>
      </div>
    </div>
    </div>
  );
}
