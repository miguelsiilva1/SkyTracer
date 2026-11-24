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
