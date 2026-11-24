import type { Metadata } from 'next';
import { StadiumConfirmation } from '@/components/booking/stadium/StadiumConfirmation';

export const metadata: Metadata = {
  title: 'Your ticket · Arena',
};

export default async function StadiumConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { eventId } = await params;
  const { ref } = await searchParams;
  const bookingRef = typeof ref === 'string' && ref.length > 0 ? ref : null;
  return <StadiumConfirmation eventId={eventId} bookingRef={bookingRef} />;
}
