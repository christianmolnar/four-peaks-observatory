import { NextRequest, NextResponse } from 'next/server';

interface SearchMatch {
  text: string;
  paragraph?: string;
  context?: string;
  timestamp?: string;
}

// Extract duration from the talk page (format like "13:16")
function extractTalkDuration(html: string): number {
  // Look for duration pattern in the HTML - be more flexible
  const durationPatterns = [
    /(\d{1,2}):(\d{2})/g, // Any time format like "3:34" or "13:16"
  ];
  
  for (const pattern of durationPatterns) {
    const matches = [...html.matchAll(pattern)];
    if (matches.length > 0) {
      // Filter out 0:00 and other unwanted matches, look for realistic talk durations
      const validMatches = matches.filter(match => {
        const minutes = parseInt(match[1]) || 0;
        const seconds = parseInt(match[2]) || 0;
        const totalMinutes = minutes + (seconds / 60);
        // Conference talks are typically 3-20 minutes
        return totalMinutes >= 3 && totalMinutes <= 25;
      });
      
      if (validMatches.length > 0) {
        // Take the last valid match (most likely to be the duration)
        const match = validMatches[validMatches.length - 1];
        const minutes = parseInt(match[1]) || 0;
        const seconds = parseInt(match[2]) || 0;
        return minutes + (seconds / 60); // Return total minutes as decimal
      }
    }
  }
  
  // Default assumption: average 12 minutes for conference talks
  return 12; // Return MINUTES
}



// Extract text content from HTML
function extractTextContent(html: string): string {
  // Remove HTML tags and decode entities
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// Split text into paragraphs and sentences
function parseTalkContent(html: string) {
  const paragraphs: Array<{text: string, section?: string}> = [];
  
  // Try to extract structured content with headings
  const headingRegex = /<h[1-6][^>]*>(.*?)<\/h[1-6]>/gi;
  const headings = [...html.matchAll(headingRegex)].map(match => extractTextContent(match[1]));
  
  // Split by paragraphs using various HTML elements
  const paragraphRegex = /<(?:p|div|section|article)[^>]*>(.*?)<\/(?:p|div|section|article)>/gi;
  const matches = [...html.matchAll(paragraphRegex)];
  
  let currentSection = '';
  
  for (const match of matches) {
    const text = extractTextContent(match[1]).trim();
    if (text.length > 20) { // Filter out very short paragraphs
      
      // Check if this might be a heading
      const isHeading = headings.some(heading => 
        heading.length > 0 && text.includes(heading)
      );
      
      if (isHeading && text.length < 100) {
        currentSection = text;
      } else {
        paragraphs.push({
          text,
          section: currentSection || undefined
        });
      }
    }
  }
  
  return paragraphs;
}

// Search for a query within the talk content
function searchInContent(content: Array<{text: string, section?: string}>, query: string, html: string): SearchMatch[] {
  const matches: SearchMatch[] = [];
  const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 2);
  

  
  for (let i = 0; i < content.length; i++) {
    const paragraph = content[i];
    const lowerText = paragraph.text.toLowerCase();
    
    // Check if all search terms are present
    const hasAllTerms = searchTerms.every(term => lowerText.includes(term));
    
    if (hasAllTerms) {
      // Find the specific sentences that contain the search terms
      const sentences = paragraph.text.split(/[.!?]+/).filter(s => s.trim().length > 10);
      
      for (const sentence of sentences) {
        const lowerSentence = sentence.toLowerCase();
        const hasTermsInSentence = searchTerms.some(term => lowerSentence.includes(term));
        
        if (hasTermsInSentence) {
          // Calculate actual text position - find where this sentence appears in the full text
          const fullText = content.map(p => p.text).join(' ');
          const sentencePosition = fullText.toLowerCase().indexOf(sentence.toLowerCase());
          const position = sentencePosition > -1 ? sentencePosition / fullText.length : i / content.length;
          
          const talkMinutes = extractTalkDuration(html); // in minutes
          const estimatedMinutes = Math.floor(position * talkMinutes);
          const estimatedSeconds = Math.floor((position * talkMinutes * 60) % 60);
          const timestamp = `${estimatedMinutes}:${estimatedSeconds.toString().padStart(2, '0')}`;
          
          matches.push({
            text: sentence.trim(),
            paragraph: paragraph.section || `Paragraph ${i + 1}`,
            timestamp: `~${timestamp}`
          });
        }
      }
    }
  }
  
  return matches.slice(0, 10); // Limit to 10 matches
}

export async function POST(request: NextRequest) {
  try {
    const { talkUrl, query } = await request.json();
    
    if (!talkUrl || !query) {
      return NextResponse.json(
        { success: false, error: 'Missing talkUrl or query' },
        { status: 400 }
      );
    }
    
    // Fetch the talk content
    const response = await fetch(talkUrl);
    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Failed to fetch talk content' },
        { status: 500 }
      );
    }
    
    const html = await response.text();
    
    // Parse the content
    const content = parseTalkContent(html);
    
    // Search for matches
    const matches = searchInContent(content, query, html);
    
    return NextResponse.json({
      success: true,
      matches,
      totalParagraphs: content.length,
      query
    });
    
  } catch (error) {
    console.error('Conference search error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Search failed',
        matches: []
      },
      { status: 500 }
    );
  }
}
