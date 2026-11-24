/**
 * planespotters.net: photos by hex.
 *
 * The API terms require showing the photographer's name and a link to the photo page, and a
 * User-Agent with contact details.
 */

export interface Photo {
	photo_url: string;
	photo_credit: string | null;
	photo_link: string | null;
}

export function parsePhoto(payload: unknown): Photo | null {
	const photos = (payload as { photos?: unknown } | null)?.photos;
	if (!Array.isArray(photos) || !photos.length) return null;
	const p = photos[0] as Record<string, any>;
	const thumb = p.thumbnail_large ?? p.thumbnail ?? {};
	if (typeof thumb.src !== "string" || !thumb.src) return null;
	return {
		photo_url: thumb.src,
		photo_credit: typeof p.photographer === "string" ? p.photographer : null,
		photo_link: typeof p.link === "string" ? p.link : null,
	};
}
