type NominatimVendor = {
  placeId: string;
  name: string;
  address: string;
  lat: string | null;
  lon: string | null;
};

const NOMINATIM_EMAIL = process.env.NOMINATIM_EMAIL;

function buildSearchUrl(query: string, limit: number) {
  const params = new URLSearchParams({
    q: query,
    format: 'json',
    addressdetails: '1',
    limit: limit.toString(),
  });
  return `https://nominatim.openstreetmap.org/search?${params.toString()}`;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const R = 3958.8; // miles
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'PropertyManagementAutomationApp/1.0',
      ...(NOMINATIM_EMAIL ? { 'From': NOMINATIM_EMAIL } : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`Nominatim request failed: ${response.status}`);
  }
  return await response.json();
}

export async function searchHVACVendorsFromNominatim(params: {
  address: string;
  radiusMiles?: number;
  limit?: number;
}): Promise<NominatimVendor[]> {
  const limit = params.limit && params.limit > 0 ? params.limit : 20;
  const query = `HVAC contractor near ${params.address}`;
  const searchUrl = buildSearchUrl(query, limit);
  const results = await fetchJson(searchUrl);
  if (!Array.isArray(results)) {
    return [];
  }

  let originLat: number | null = null;
  let originLon: number | null = null;
  if (params.radiusMiles) {
    try {
      const originResults = await fetchJson(buildSearchUrl(params.address, 1));
      if (Array.isArray(originResults) && originResults[0]) {
        const lat = Number(originResults[0].lat);
        const lon = Number(originResults[0].lon);
        if (!Number.isNaN(lat) && !Number.isNaN(lon)) {
          originLat = lat;
          originLon = lon;
        }
      }
    } catch (error) {
      console.warn('[Nominatim] Failed to geocode origin:', error);
    }
  }

  const mapped = results.map((item: any) => ({
    placeId: item.place_id ? String(item.place_id) : '',
    name: item.display_name?.split(',')[0]?.trim() || 'HVAC Vendor',
    address: item.display_name || '',
    lat: item.lat || null,
    lon: item.lon || null,
  }));

  if (params.radiusMiles && originLat !== null && originLon !== null) {
    return mapped.filter((item) => {
      const lat = Number(item.lat);
      const lon = Number(item.lon);
      if (Number.isNaN(lat) || Number.isNaN(lon)) return false;
      return haversineMiles(originLat!, originLon!, lat, lon) <= params.radiusMiles!;
    });
  }

  if (params.radiusMiles) {
    return [];
  }

  return mapped;
}
