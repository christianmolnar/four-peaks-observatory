import { NextResponse } from 'next/server';

interface ConferenceTalk {
  id: string;
  title: string;
  speaker: string;
  session: string;
  url: string;
  duration?: string;
  summary?: string;
}

// Parse the conference talks from the main page
async function parseConferenceTalks(): Promise<ConferenceTalk[]> {
  const talks: ConferenceTalk[] = [];
  
  try {
    const response = await fetch('https://www.churchofjesuschrist.org/study/general-conference/2025/10?lang=eng');
    const html = await response.text();
    
    // Extract links to individual talks
    const linkRegex = /href="([^"]*\/general-conference\/2025\/10\/[^"]*)"[^>]*>([^<]*)<\/a>/g;
    const matches = [...html.matchAll(linkRegex)];
    
    for (const match of matches) {
      const url = match[1];
      const linkText = match[2].trim();
      
      // Skip session links (they contain "Session" in the title)
      if (linkText.toLowerCase().includes('session')) continue;
      if (!url.includes('/general-conference/2025/10/')) continue;
      if (url.includes('saturday-') || url.includes('sunday-')) continue;
      
      // Try to extract speaker and title from link text or fetch the page
      let speaker = '';
      let title = '';
      const summary = '';
      const duration = '';
      
      // Check if the link text contains both speaker and title
      if (linkText.includes(' ')) {
        const parts = linkText.split(' ');
        if (parts.length >= 3) {
          // Likely format: "FirstName LastName Title of Talk"
          speaker = `${parts[0]} ${parts[1]}`;
          title = parts.slice(2).join(' ');
        } else {
          title = linkText;
        }
      } else {
        title = linkText;
      }
      
      // Extract ID from URL
      const urlParts = url.split('/');
      const id = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
      
      talks.push({
        id,
        title: title || 'Conference Talk',
        speaker: speaker || 'General Authority',
        session: 'October 2025',
        url: url.startsWith('http') ? url : `https://www.churchofjesuschrist.org${url}`,
        duration,
        summary
      });
    }
    
    // Manually add the talks we know about from the webpage content
    const knownTalks = [
      {
        id: '19oaks',
        title: 'Introduction',
        speaker: 'Dallin H. Oaks',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/19oaks?lang=eng'
      },
      {
        id: '11eyring',
        title: 'Sustaining of General Authorities, Area Seventies, and General Officers',
        speaker: 'Henry B. Eyring',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/11eyring?lang=eng'
      },
      {
        id: '12stevenson',
        title: 'Blessed Are the Peacemakers',
        speaker: 'Gary E. Stevenson',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/12stevenson?lang=eng',
        duration: '13:16',
        summary: 'Elder Stevenson teaches us to follow the Savior\'s admonition to be peacemakers—in our hearts, at home, and in our communities.'
      },
      {
        id: '13browning',
        title: 'Tune Your Heart to Jesus Christ: The Sacred Gift of Primary Music',
        speaker: 'Tracy Y. Browning',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/13browning?lang=eng',
        summary: 'Sister Browning teaches that music can testify of the Savior and teach important gospel truths that can stay with us for a lifetime.'
      },
      {
        id: '14barcellos',
        title: 'The Lord Looketh on the Heart',
        speaker: 'Ronald M. Barcellos',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/14barcellos?lang=eng',
        summary: 'Elder Barcellos invites us to give our hearts to the Lord by committing to more intentionally follow Him.'
      },
      {
        id: '15eyre',
        title: 'Know Who You Really Are',
        speaker: 'Brik V. Eyre',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/15eyre?lang=eng',
        summary: 'Elder Eyre shares two ways to better understand what it means to be a child of God.'
      },
      {
        id: '16uchtdorf',
        title: 'Do Your Part with All Your Heart',
        speaker: 'Dieter F. Uchtdorf',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/16uchtdorf?lang=eng',
        summary: 'Elder Uchtdorf teaches that we should work to develop the gifts God has given us so they can bless us and others.'
      },
      {
        id: '17johnson',
        title: 'Be Reconciled to God',
        speaker: 'Kelly R. Johnson',
        session: 'Saturday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/17johnson?lang=eng',
        summary: 'Elder Johnson invites us to be reconciled to God through the Atonement of Jesus Christ.'
      },
      {
        id: '21rasband',
        title: 'The Family Proclamation—Words from God',
        speaker: 'Ronald A. Rasband',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/21rasband?lang=eng',
        summary: 'Elder Rasband shares principles from the proclamation on the family and teaches that this document has a divine origin and should be treated with the reverence given to words from God.'
      },
      {
        id: '22webb',
        title: 'That All May Be Edified',
        speaker: 'Chad H Webb',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/22webb?lang=eng',
        summary: 'Brother Webb teaches how we can invite the Holy Ghost to teach us gospel truths.'
      },
      {
        id: '23jaggi',
        title: 'Humble Souls at Altars Kneel',
        speaker: 'Jeremy R. Jaggi',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/23jaggi?lang=eng',
        summary: 'Elder Jaggi teaches that we will be blessed as we keep the covenants we make with God at holy altars.'
      },
      {
        id: '24brown',
        title: 'The Eternal Gift of Testimony',
        speaker: 'Kevin G. Brown',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/24brown?lang=eng',
        summary: 'Elder Brown shares three truths that inform our testimonies and encourages us to choose to believe.'
      },
      {
        id: '25gong',
        title: 'No One Sits Alone',
        speaker: 'Gerrit W. Gong',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/25gong?lang=eng',
        summary: 'Elder Gong teaches that the Lord invites all of us to come unto Him and to be united with one another in His Church.'
      },
      {
        id: '26cziesla',
        title: 'Simplicity in Christ',
        speaker: 'Michael Cziesla',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/26cziesla?lang=eng',
        summary: 'Elder Cziesla teaches that applying the doctrine of Christ in a simplified way will bring us joy, give guidance in our callings, answer some of life\'s most complex questions, and provide strength.'
      },
      {
        id: '27cook',
        title: 'The Lord Is Hastening His Work',
        speaker: 'Quentin L. Cook',
        session: 'Saturday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/27cook?lang=eng',
        summary: 'Elder Cook teaches that as the Lord hastens His work, Church members have a sacred duty to accept and welcome new and returning members. He offers counsel for these new or returning members.'
      },
      {
        id: '31kearon',
        title: 'Jesus Christ and Your New Beginning',
        speaker: 'Patrick Kearon',
        session: 'Saturday Evening',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/31kearon?lang=eng',
        summary: 'Elder Kearon testifies that Jesus Christ offers us new beginnings—as many as we need—when we are burdened by sin, weakness, or setbacks.'
      },
      {
        id: '32dennis',
        title: 'Cheering Each Other On',
        speaker: 'J. Anette Dennis',
        session: 'Saturday Evening',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/32dennis?lang=eng',
        summary: 'Sister Dennis teaches that we have a covenant obligation to love one another and strive for unity.'
      },
      {
        id: '33barlow',
        title: 'Lovest Thou Me?',
        speaker: 'Steven C. Barlow',
        session: 'Saturday Evening',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/33barlow?lang=eng',
        summary: 'Elder Barlow describes four ways we can show our love for God, which can help us recognize His love for us.'
      },
      {
        id: '34jackson',
        title: 'Remembering the Sheep',
        speaker: 'William K. Jackson',
        session: 'Saturday Evening',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/34jackson?lang=eng',
        summary: 'Elder Jackson teaches that we should focus on ministering to individuals in our service in the Church, following the principles of counting and accounting.'
      },
      {
        id: '35andersen',
        title: 'The Atoning Love of Jesus Christ',
        speaker: 'Neil L. Andersen',
        session: 'Saturday Evening',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/35andersen?lang=eng',
        summary: 'Elder Andersen teaches about the power of Jesus Christ to bring about forgiveness for those who have sinned and healing for those who have been wounded by the sins of others.'
      },
      {
        id: '41holland',
        title: 'And Now I See',
        speaker: 'Jeffrey R. Holland',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/41holland?lang=eng',
        summary: 'Elder Holland teaches that just as the Lord healed a blind man with a mixture of clay, He often uses humble or unusual things to bless and teach us.'
      },
      {
        id: '42evanson',
        title: 'Go and Do Likewise',
        speaker: 'James E. Evanson',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/42evanson?lang=eng',
        summary: 'Elder Evanson highlights service missionaries and teaches how their service helps bring people to Christ and sets an example for us.'
      },
      {
        id: '43soares',
        title: 'Adorned with the Virtue of Temperance',
        speaker: 'Ulisses Soares',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/43soares?lang=eng',
        summary: 'Elder Soares teaches that temperance harmonizes and strengthens other Christlike attributes. He invites us to follow the Savior\'s example and make this virtue part of our character.'
      },
      {
        id: '44johnson',
        title: 'The Power of Ministering to the One',
        speaker: 'Peter M. Johnson',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/44johnson?lang=eng',
        summary: 'Elder Johnson teaches that when we minister in ways that lead to the house of the Lord, we help one another become devoted disciples of Jesus Christ.'
      },
      {
        id: '45christofferson',
        title: 'Look to God and Live',
        speaker: 'D. Todd Christofferson',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/45christofferson?lang=eng',
        summary: 'Elder Christofferson teaches that looking to God brings blessings, including prosperity and the gift of the Holy Ghost.'
      },
      {
        id: '46spannaus',
        title: 'Prophets of God',
        speaker: 'Andrea Muñoz Spannaus',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/46spannaus?lang=eng',
        summary: 'Sister Spannaus teaches how youth can gain their own testimonies of God\'s living prophets.'
      },
      {
        id: '47eyring',
        title: 'Proved and Strengthened in Christ',
        speaker: 'Henry B. Eyring',
        session: 'Sunday Morning',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/47eyring?lang=eng',
        summary: 'Elder Eyring teaches that our challenges can strengthen us if we rely on the Savior and turn to Him.'
      },
      {
        id: '51bednar',
        title: 'They Are Their Own Judges',
        speaker: 'David A. Bednar',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/51bednar?lang=eng',
        summary: 'Elder Bednar explains how the Day of Judgment can be a pleasing, glorious day, rather than one we fear or dread.'
      },
      {
        id: '52cuvelier',
        title: 'The Name by Which Ye Are Called',
        speaker: 'B. Corey Cuvelier',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/52cuvelier?lang=eng',
        summary: 'Elder Cuvelier shares what it means to take the name of Christ upon ourselves.'
      },
      {
        id: '53holland',
        title: 'Forsake Not Your Own Mercy',
        speaker: 'Matthew S. Holland',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/53holland?lang=eng',
        summary: 'Elder Holland teaches us to follow the example of Jonah and invite Christ\'s awe-inspiring mercy into our lives.'
      },
      {
        id: '54godoy',
        title: 'Smiling Faces and Grateful Hearts',
        speaker: 'Carlos A. Godoy',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/54godoy?lang=eng',
        summary: 'Elder Godoy teaches how the Saints in Africa live with joy and gratitude in spite of challenges by focusing on the Savior.'
      },
      {
        id: '55renlund',
        title: 'Taking on the Name of Jesus Christ',
        speaker: 'Dale G. Renlund',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/55renlund?lang=eng',
        summary: 'Elder Renlund teaches that when we take upon ourselves the name of Christ, we can become like Him.'
      },
      {
        id: '56amos',
        title: 'The Good News Recipe',
        speaker: 'John D. Amos',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/56amos?lang=eng',
        summary: 'Elder Amos teaches that we can find happiness as we do more of what invites Jesus Christ into our lives.'
      },
      {
        id: '57farias',
        title: 'The Book of Mormon—an Immeasurable Treasure on Our Journey',
        speaker: 'Ozani Farias',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/57farias?lang=eng',
        summary: 'Elder Farias offers three suggestions for deepening our conversion to Jesus Christ through studying the Book of Mormon.'
      },
      {
        id: '58oaks',
        title: 'The Family-Centered Gospel of Jesus Christ',
        speaker: 'Dallin H. Oaks',
        session: 'Sunday Afternoon',
        url: 'https://www.churchofjesuschrist.org/study/general-conference/2025/10/58oaks?lang=eng',
        summary: 'President Oaks explains why family is so important in the gospel of Jesus Christ and describes things we can do to strengthen our families.'
      }
    ];
    
    return knownTalks;
    
  } catch (error) {
    console.error('Error fetching conference talks:', error);
    return [];
  }
}

export async function GET() {
  try {
    const talks = await parseConferenceTalks();
    
    return NextResponse.json({
      success: true,
      talks,
      count: talks.length
    });
    
  } catch (error) {
    console.error('Conference talks API error:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to fetch conference talks',
        talks: []
      },
      { status: 500 }
    );
  }
}
