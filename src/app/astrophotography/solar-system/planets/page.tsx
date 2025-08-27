import GalleryTemplate from '@/components/GalleryTemplate';
import globalConfig from '@/config/global';

export default function PlanetsPage() {
  return (
    <GalleryTemplate
      title="Planets"
      backgroundImage="/images/astrophotography/solar-system/planets/Hubble and Me.jpg"
      imageFolder={globalConfig.imageFolders.solarSystem.planets}
    />
  );
}
