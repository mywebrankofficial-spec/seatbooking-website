export type SeatType = 'standard' | 'recliner';
export type SeatStatus = 'available' | 'taken';

export interface Seat {
  id: string; // e.g. "B4"
  row: string; // "A".."I"
  number: number; // 1..14, left to right when facing the screen
  block: 0 | 1 | 2;
  type: SeatType;
  status: SeatStatus;
  price: number; // EUR
}

export interface HallLayout {
  rows: string[];
  blocks: number[]; // [3, 8, 3]
  seatPitch: number; // m, centre to centre within a block
  rowPitch: number; // m, row to row depth
  rowRise: number; // m, each row is this much higher than the previous
  aisleWidth: number; // m, EXTRA centre-to-centre spacing added at each aisle
  firstRowDistance: number; // m, screen plane (z=0) to the centre of row A seats
  screen: { width: number; height: number; curve: number; bottom: number };
}

export interface Showtime {
  id: string;
  time: string;
  format: '2D' | 'IMAX';
  hallId: string;
}

export interface SeatViewStats {
  distance: number;
  fov: number;
  offset: number;
  side: 'left' | 'right' | 'centre';
  zone: 'UP CLOSE' | 'SWEET SPOT' | 'FULL PICTURE' | 'SIDE VIEW';
}

export interface Cinema {
  id: string;
  name: string;
  hallName: string;
  dateLabel: string;
}

export interface Booking {
  ref: string;
  showtimeId: string;
  seatId: string;
  name: string;
  email: string;
  price: number;
  createdAt: string;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Pixel rectangle in viewport coordinates (like DOMRect). */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface CameraPose {
  position: Vec3;
  target: Vec3;
  up: Vec3;
  fov: number; // vertical fov, degrees (three.js PerspectiveCamera.fov)
}
