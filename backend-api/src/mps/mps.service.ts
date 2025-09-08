import { Injectable } from '@nestjs/common';

type LookupResult = {
  constituency: string;
  mp?: {
    id?: number;
    name?: string;
    party?: string;
    portraitUrl?: string;
  } | null;
};

@Injectable()
export class MpsService {
  private normalizePostcode(input: string): string {
    return input.replace(/\s+/g, '').toUpperCase();
  }

  async lookupByPostcode(postcodeRaw: string): Promise<LookupResult> {
    const postcode = this.normalizePostcode(postcodeRaw);

    // First: fetch constituency via postcodes.io
    const pcRes = await fetch(`https://api.postcodes.io/postcodes/${encodeURIComponent(postcode)}`);
    if (!pcRes.ok) {
      throw new Error('POSTCODE_NOT_FOUND');
    }
    const pcJson: any = await pcRes.json();
    const constituency: string | undefined = pcJson?.result?.parliamentary_constituency;
    if (!constituency) {
      throw new Error('CONSTITUENCY_NOT_FOUND');
    }

    // Second: look up current MP via UK Parliament Members API
    // Best-effort order:
    // 1) Direct search with Constituency param (if respected by API)
    // 2) Fallback: fetch all current members and match by constituency name

    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
    const wanted = norm(constituency);

    let mpData: any = null;

    try {
      const byConst = new URL('https://members-api.parliament.uk/api/Members/Search');
      byConst.searchParams.set('House', '1');
      byConst.searchParams.set('IsCurrentMember', 'true');
      byConst.searchParams.set('Constituency', constituency);
      byConst.searchParams.set('Take', '10');
      const res = await fetch(byConst.toString());
      if (res.ok) {
        const json: any = await res.json().catch(() => ({}));
        const items: any[] = json?.items || json?.results || [];
        const match = items.find((it: any) => {
          const v = it?.value ?? it;
          const from = v?.latestHouseMembership?.membershipFrom || v?.constituency || '';
          return norm(String(from)) === wanted;
        }) || items[0];
        mpData = (match?.value ?? match) || null;
      }
    } catch {}

    if (!mpData) {
      const url = new URL('https://members-api.parliament.uk/api/Members/Search');
      url.searchParams.set('House', '1'); // House of Commons
      url.searchParams.set('IsCurrentMember', 'true');
      url.searchParams.set('Take', '650'); // include all

      const mpRes = await fetch(url.toString());
      if (mpRes.ok) {
        const json: any = await mpRes.json().catch(() => ({}));
        const items: any[] = json?.items || json?.results || [];
        if (Array.isArray(items) && items.length > 0) {
          const match = items.find((it: any) => {
            const v = it?.value ?? it;
            const from = v?.latestHouseMembership?.membershipFrom || v?.constituency || '';
            return norm(String(from)) === wanted;
          });
          mpData = (match?.value ?? match) || null;
        }
      }
    }

    let mp: LookupResult['mp'] = null;
    if (mpData) {
      // Normalise common fields present in Members API results
      const id: number | undefined = mpData?.id ?? mpData?.memberId;
      const name: string | undefined = mpData?.nameDisplayAs || mpData?.nameFull || mpData?.name;
      const party: string | undefined = mpData?.latestParty?.name || mpData?.party || mpData?.latestPartyName;
      const portraitUrl = id ? `https://members-api.parliament.uk/api/Members/${id}/Thumbnail` : undefined;
      mp = { id, name, party, portraitUrl };
    }

    return { constituency, mp };
  }
}
