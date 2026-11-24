import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getStadiumEvent } from '@/lib/api';
import { StadiumExperience } from '@/components/venue-ui/StadiumExperience';

export const metadata: Metadata = { title: 'City Derby · Arena' };

export function generateStaticParams() {
  return [{ eventId: 'city-derby' }];
}

export default async function StadiumEventPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const event = await getStadiumEvent(eventId);
  if (!event) notFound();
  return <StadiumExperience eventId={event.id} />;
}
