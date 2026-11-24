import type { Metadata } from 'next';
import { BookingConfirmation } from '@/components/booking/BookingConfirmation';

export const metadata: Metadata = {
  title: 'Your ticket · SeatView',
};

export default async function ConfirmPage({
  params,
  searchParams,
}: {
  params: Promise<{ showId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { showId } = await params;
  const { ref } = await searchParams;
  const bookingRef = typeof ref === 'string' && ref.length > 0 ? ref : null;
  return <BookingConfirmation showId={showId} bookingRef={bookingRef} />;
}
