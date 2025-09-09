import { BadGatewayException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type NormalizedAddress = {
  id: string;
  line1: string;
  line2?: string;
  city?: string;
  county?: string;
  postcode: string;
  label: string;
};

function normalizePostcode(input: string) {
  const tight = input.replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{1,2}\d[A-Z\d]?\d[A-Z]{2}$/.test(tight)) return null;
  return `${tight.slice(0, -3)} ${tight.slice(-3)}`;
}

@Injectable()
export class AddressesService {
  constructor(private readonly config: ConfigService) {}

  async lookup(postcode: string): Promise<NormalizedAddress[]> {
    const pc = normalizePostcode(postcode || '');
    if (!pc) return [];

    const getAddressKey = this.config.get<string>('GETADDRESS_API_KEY');
    const debug = this.config.get<string>('ADDRESS_DEBUG') === '1';
    // Single provider: getAddress.io
    if (getAddressKey) {
      const attemptAutocomplete = async (pcParam: string) => {
        const url = `https://api.getaddress.io/autocomplete/${encodeURIComponent(pcParam)}?api-key=${encodeURIComponent(getAddressKey)}`;
        const logUrl = `https://api.getaddress.io/autocomplete/${encodeURIComponent(pcParam)}`;
        if (debug) console.log(`[addresses] GET ${logUrl}`);
        const res = await fetch(url);
        if (debug) console.log(`[addresses] <= ${res.status}`);
        return { res, url: logUrl };
      };

      const getFullAddress = async (id: string) => {
        const url = `https://api.getaddress.io/get/${encodeURIComponent(id)}?api-key=${encodeURIComponent(getAddressKey)}`;
        const logUrl = `https://api.getaddress.io/get/${encodeURIComponent(id)}`;
        if (debug) console.log(`[addresses] GET ${logUrl}`);
        const res = await fetch(url);
        if (debug) console.log(`[addresses] <= ${res.status}`);
        return res;
      };

      try {
        // First try with spaced format; fall back to tight format on 404
        let { res, url } = await attemptAutocomplete(pc);
        if (res.status === 404) {
          const tight = pc.replace(/\s+/g, '');
          ({ res, url } = await attemptAutocomplete(tight));
        }
        if (res.status === 404) {
          if (debug) console.log('[addresses] No results for postcode');
          return [];
        }
        if (!res.ok) {
          const msg = await res.text().catch(() => '');
          if (debug) console.log(`[addresses] Error body: ${msg?.slice?.(0, 300)}`);
          throw new BadGatewayException(`Address provider error${msg ? `: ${msg}` : ''}`);
        }

        const autocompleteData: any = await res.json();
        const suggestions: any[] = Array.isArray(autocompleteData?.suggestions) ? autocompleteData.suggestions : [];
        if (debug) console.log(`[addresses] Found ${suggestions.length} suggestions`);

        // Get full address details for each suggestion
        const addresses: NormalizedAddress[] = [];
        for (const suggestion of suggestions) {
          if (!suggestion.id) continue;
          
          try {
            const fullAddressRes = await getFullAddress(suggestion.id);
            if (!fullAddressRes.ok) continue;
            
            const fullAddress: any = await fullAddressRes.json();
            const line1 = fullAddress.line_1 || fullAddress.building_number + ' ' + fullAddress.thoroughfare || '';
            const line2 = fullAddress.line_2 || '';
            const city = fullAddress.town_or_city || '';
            const county = fullAddress.county || '';
            const postcode = fullAddress.postcode || pc;
            const label = [line1, line2, city, county, postcode].filter(Boolean).join(', ');
            
            addresses.push({
              id: suggestion.id,
              line1: line1.trim(),
              line2: line2.trim(),
              city,
              county,
              postcode,
              label
            } as NormalizedAddress);
          } catch (e) {
            if (debug) console.log(`[addresses] Failed to get full address for ${suggestion.id}:`, e);
            // Continue with next suggestion
          }
        }
        
        if (debug) console.log(`[addresses] Parsed ${addresses.length} addresses`);
        return addresses;
      } catch (e) {
        if (e instanceof BadGatewayException) throw e;
        throw new BadGatewayException('Address provider error');
      }
    }

    // No key configured — return dev-friendly mock so UI works locally
    if (!getAddressKey && process.env.NODE_ENV !== 'production') {
      const mock: NormalizedAddress[] = [
        { id: 'm1', line1: '1 Example Street', line2: '', city: 'Exampletown', county: 'Example County', postcode: pc, label: `1 Example Street, Exampletown, Example County, ${pc}` },
        { id: 'm2', line1: '2 Sample Road', line2: 'Flat 3', city: 'Sampleton', county: 'Sample County', postcode: pc, label: `2 Sample Road, Flat 3, Sampleton, Sample County, ${pc}` },
      ];
      return mock;
    }

    // In production, return empty list
    return [];
  }
}
