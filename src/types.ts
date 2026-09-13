export type User = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "operator" | "admin";
};
export type Slot = {
  id: string;
  venue_id: string;
  start_at: string;
  end_at: string;
  capacity: number;
  reserved: number;
  price: number;
  credit: number;
  available: number;
  blackout: number;
};
export type Venue = {
  id: string;
  name: string;
  neighborhood: string;
  address: string;
  description: string;
  image: string;
  amenities: string;
  noise: string;
  calls: number;
  accessible: number;
  wifi: number;
  walk: number;
  paused: number;
  status: string;
  policy: string;
  verified_at: string;
  starting_price: number;
  starting_credit: number;
  saved: boolean;
  slots: Slot[];
  arrivals: Arrival[];
  templates: Template[];
};
export type Arrival = {
  id: string;
  code: string;
  status: string;
  price: number;
  fee: number;
  credit: number;
  start_at: string;
  end_at: string;
  customer: string;
};
export type Template = {
  id: string;
  hour: number;
  capacity: number;
  price: number;
  credit: number;
};
export type Booking = {
  id: string;
  venue_id: string;
  venue_name: string;
  address: string;
  image: string;
  slot_id: string;
  status: string;
  price: number;
  fee: number;
  credit: number;
  policy: string;
  code: string;
  qr: string;
  qr_token: string;
  start_at: string;
  end_at: string;
  expires_at: string;
  created_at: string;
};
export type Config = {
  demo: boolean;
  payments: boolean;
  supabaseUrl: string | null;
  supabaseKey: string | null;
};
export type SupportCase = {
  id: string;
  booking_id: string;
  customer: string;
  venue_name: string;
  reason: string;
  notes: string;
  status: string;
};
export type AdminData = {
  venues: Venue[];
  cases: SupportCase[];
  audit: {
    id: string;
    action: string;
    created_at: string;
    target_id: string;
  }[];
  transactions: {
    id: string;
    venue_name: string;
    customer: string;
    status: string;
    price: number;
    fee: number;
    created_at: string;
  }[];
};
