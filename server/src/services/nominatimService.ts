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
  limit?: number;
}): Promise<NominatimVendor[]> {
  const limit = params.limit && params.limit > 0 ? params.limit : 5;
  const query = `HVAC contractor near ${params.address}`;
  const searchUrl = buildSearchUrl(query, limit);
  const results = await fetchJson(searchUrl);
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map((item: any) => ({
    placeId: item.place_id ? String(item.place_id) : '',
    name: item.display_name?.split(',')[0]?.trim() || 'HVAC Vendor',
    address: item.display_name || '',
    lat: item.lat || null,
    lon: item.lon || null,
  }));
}
