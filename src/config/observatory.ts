// Observatory Configuration
// Change these values to rebrand for any location/observatory

export const observatoryConfig = {
  // Basic Information
  name: "Four Peaks Observatory",
  tagline: "Capturing Photons Since the 1900s...",
  
  // Location Details
  location: {
    city: "Fountain Hills",
    state: "AZ",
    zipCode: "85268",
    coordinates: {
      lat: 33.6115,
      lng: -111.7190
    }
  },
  
  // Owner Information
  owner: {
    name: "Christian Molnar",
    email: "chrismolhome@hotmail.com", // Update as needed
    socialMedia: {
      facebook: "https://www.facebook.com/christian.molnar.7",
      linkedin: "https://www.linkedin.com/in/christianmolnar/"
    }
  },
  
  // Mission Statement
  mission: "Ever since I was a child, I've been obsessed with capturing photons from the distant past. Armed with modest gear and my love for astronomy and astrophotography, I set out to absorb light particles in all of their raw form and preserve the beauty of distant planets and deep sky objects forever, adding my interpretation in the painstaking processing of each image.",
  
  // Equipment Showcase
  primaryEquipment: "SeeStar S50",
  equipmentDescription: "These photos were taken with the ultra-portable, fully integrated, smart telescope SeeStar S50. A hobby that used to be very expensive and frustrating is now accessible to anyone with the desire to learn and basic technical skills.",
  
  // Clear Sky Clock (if applicable)
  clearSkyClockId: "FntnHllsAZ", // Update for new location
  
  // SEO and Metadata
  seo: {
    description: "Professional astrophotography and terrestrial photography showcasing deep sky objects, planets, and landscapes captured with smart telescope technology.",
    keywords: ["astrophotography", "telescope", "astronomy", "photography", "deep sky", "planets", "SeeStar"],
    author: "Christian Molnar"
  },
  
  // Features/Content Toggles
  features: {
    terrestrialPhotography: true,
    equipmentReviews: true,
    clearSkyIntegration: true,
    printSales: false, // Enable when ready
    blog: false // Currently disabled per requirements
  }
};

// Easy switching between observatories
export const phoenixConfig = {
  ...observatoryConfig,
  name: "Sonoran Observatory", // Example - change as desired
  location: {
    city: "Phoenix",
    state: "AZ",
    zipCode: "85001", // Update with actual
    coordinates: {
      lat: 33.4484,
      lng: -112.0740
    }
  },
  clearSkyClockId: "FntnHllsAZ", // Will need to find Phoenix area ID
};

// You can easily switch by changing this export
export default observatoryConfig;
