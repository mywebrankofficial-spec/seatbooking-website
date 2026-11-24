import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'SeatView · See your seat before you book it',
  description: 'Fly through a real 3D cinema hall and check the view, distance and angle from any seat before you book.',
};

export default function Home() {
  return <LandingPage />;
}
