import { notFound } from 'next/navigation';
import { getCinema, getSeats, getShowtime, getShowtimes } from '@/lib/api';
import { BookingExperience } from '@/components/ui/BookingExperience';
import { SHOWTIMES } from '@/data/cinema';

export function generateStaticParams() {
  return SHOWTIMES.map((s) => ({ showId: s.id }));
}

export default async function BookPage({ params }: { params: Promise<{ showId: string }> }) {
  const { showId } = await params;
  const showtime = await getShowtime(showId);
  if (!showtime) notFound();
  const [cinema, showtimes, seats] = await Promise.all([getCinema(), getShowtimes(), getSeats(showId)]);
  return <BookingExperience cinema={cinema} showtimes={showtimes} showtimeId={showId} seats={seats} />;
}
