/** Shapes returned by the SkyTracer API (see the repository README, section 4.1). */

/** "receiver": the course receiver in Porto; "adsb.fi": seen only by the adsb.fi network (live only). */
export type Source = "receiver" | "adsb.fi";

/** Flight parameters the course receiver does not decode, from the adsb.fi network. */
export interface ExtraParameters {
	alt_geom_ft: number | null;
	tas_kt: number | null;
	ias_kt: number | null;
	mach: number | null;
	wind_dir_deg: number | null;
	wind_speed_kt: number | null;
	oat_c: number | null;
}

export interface LiveAircraft {
	hex: string;
	source: Source;
	callsign: string | null;
	lat: number;
	lon: number;
	altitude_ft: number | null;
	on_ground: boolean;
	speed_kt: number | null;
	track_deg: number | null;
	vert_rate_fpm: number | null;
	squawk: string | null;
	category: string | null;
	rssi_dbfs: number | null;
	mlat: boolean;
	seen_at: string;
	pos_at: string | null;
	registration: string | null;
	icao_type: string | null;
	type_name: string | null;
	manufacturer: string | null;
	operator: string | null;
	country: string | null;
	photo_url: string | null;
	photo_credit: string | null;
	photo_link: string | null;
	airline_name: string | null;
	airline_icao: string | null;
	airline_iata: string | null;
	origin_icao: string | null;
	origin_iata: string | null;
	origin_name: string | null;
	dest_icao: string | null;
	dest_iata: string | null;
	dest_name: string | null;
	extra: ExtraParameters | null;
	extra_source: "adsb.fi" | null;
}

export interface LiveMessage {
	ts: string;
	aircraft: LiveAircraft[];
}

export interface TrackPoint {
	ts: string;
	lat: number;
	lon: number;
	altitude_ft: number | null;
	speed_kt: number | null;
	track_deg: number | null;
	on_ground: boolean;
}

export type ConnectionStatus = "connecting" | "live" | "reconnecting";

/** GET /aircraft/{hex}: stored data, and the live state when it is being received now. */
export interface KnownAircraft {
	hex: string;
	registration: string | null;
	icao_type: string | null;
	type_name: string | null;
	operator: string | null;
	last_seen: string | null;
	live: LiveAircraft | null;
}

/** GET /replay: stored positions of a time window, with identification and routes (US12). */
export interface ReplayPosition {
	hex: string;
	ts: string;
	callsign: string | null;
	lat: number;
	lon: number;
	altitude_ft: number | null;
	on_ground: boolean;
	speed_kt: number | null;
	track_deg: number | null;
	vert_rate_fpm: number | null;
	squawk: string | null;
	mlat: boolean;
}

export type ReplayIdentity = Pick<
	LiveAircraft,
	"hex" | "registration" | "icao_type" | "type_name" | "manufacturer" | "operator" | "country" | "photo_url" | "photo_credit" | "photo_link"
>;

export type ReplayRoute = { callsign: string } & Pick<
	LiveAircraft,
	| "airline_name" | "airline_icao" | "airline_iata" | "origin_icao" | "origin_iata" | "origin_name"
	| "dest_icao" | "dest_iata" | "dest_name"
>;

export interface ReplayWindow {
	from: string;
	until: string;
	positions: ReplayPosition[];
	aircraft: ReplayIdentity[];
	routes: ReplayRoute[];
}
