import type { Metadata, Viewport } from 'next';
import { StadiumLandingPage } from '@/components/stadium-landing/StadiumLandingPage';

export const metadata: Metadata = {
  title: 'Arena · Every seat, before you buy it',
  description: 'Fly into a real 3D stadium, see the pitch from any seat or skybox, and book it.',
};

export const viewport: Viewport = {
  themeColor: '#eef4f9',
};

export default function StadiumLanding() {
  return <StadiumLandingPage />;
}
