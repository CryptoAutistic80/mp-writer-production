export interface LetterRenderInput {
  mpName?: string | null;
  mpAddress1?: string | null;
  mpAddress2?: string | null;
  mpCity?: string | null;
  mpCounty?: string | null;
  mpPostcode?: string | null;
  date?: string | null;
  subjectLineHtml?: string | null;
  letterContentHtml?: string | null;
  senderName?: string | null;
  senderAddress1?: string | null;
  senderAddress2?: string | null;
  senderAddress3?: string | null;
  senderCity?: string | null;
  senderCounty?: string | null;
  senderPostcode?: string | null;
  senderTelephone?: string | null;
  references?: string[] | null;
}

const normaliseField = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

export const composeLetterHtml = (input: LetterRenderInput): string => {
  const sections: string[] = [];

  const fallbackAddress1 = 'House of Commons';
  const fallbackCity = 'London';
  const fallbackPostcode = 'SW1A 0AA';

  const mpName = normaliseField(input.mpName);
  let mpAddress1 = normaliseField(input.mpAddress1);
  let mpAddress2 = normaliseField(input.mpAddress2);
  let mpCity = normaliseField(input.mpCity);
  let mpCounty = normaliseField(input.mpCounty);
  let mpPostcode = normaliseField(input.mpPostcode);

  const hasParliamentaryAddressDetail = [mpAddress1, mpAddress2, mpCity, mpCounty, mpPostcode].some(
    (value) => value.length > 0,
  );

  if (!hasParliamentaryAddressDetail) {
    mpAddress1 = fallbackAddress1;
    mpCity = fallbackCity;
    mpPostcode = fallbackPostcode;
  } else {
    if (!mpAddress1) {
      mpAddress1 = fallbackAddress1;
    }
    if (!mpCity) {
      mpCity = fallbackCity;
    }
    if (!mpPostcode) {
      mpPostcode = fallbackPostcode;
    }
  }

  const mpLines = buildAddressLines({
    name: mpName || null,
    line1: mpAddress1 || null,
    line2: mpAddress2 || null,
    line3: null,
    city: mpCity || null,
    county: mpCounty || null,
    postcode: mpPostcode || null,
  }).filter((line, idx, arr) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    return arr.findIndex((entry) => entry.trim().toLowerCase() === trimmed.toLowerCase()) === idx;
  });

  if (mpLines.length > 0) {
    sections.push(`<p>${mpLines.map(escapeHtml).join('<br />')}</p>`);
  }

  const formattedDate = formatDisplayDate(input.date);
  if (formattedDate) {
    sections.push(`<p>${escapeHtml(formattedDate)}</p>`);
  }

  const subjectLineHtml = typeof input.subjectLineHtml === 'string' ? input.subjectLineHtml.trim() : '';
  if (subjectLineHtml.length > 0) {
    sections.push(subjectLineHtml);
  }

  if (input.letterContentHtml) {
    sections.push(input.letterContentHtml);
  }

  const senderName = typeof input.senderName === 'string' ? input.senderName.trim() : '';
  const senderLines = buildAddressLines({
    name: null,
    line1: input.senderAddress1,
    line2: input.senderAddress2,
    line3: input.senderAddress3,
    city: input.senderCity,
    county: input.senderCounty,
    postcode: input.senderPostcode,
  });

  const hasAddressDetail = senderLines.some((line) => line.trim().length > 0);
  if (hasAddressDetail && shouldAppendSenderAddress(input.letterContentHtml ?? '', senderLines, senderName)) {
    sections.push(`<p>${senderLines.map(escapeHtml).join('<br />')}</p>`);
  }

  const senderTelephone = typeof input.senderTelephone === 'string' ? input.senderTelephone.trim() : '';
  if (senderTelephone.length > 0) {
    sections.push(`<p>Tel: ${escapeHtml(senderTelephone)}</p>`);
  }

  const references = Array.isArray(input.references)
    ? input.references.filter((ref): ref is string => typeof ref === 'string' && ref.trim().length > 0)
    : [];

  if (references.length > 0) {
    sections.push('<p><strong>References</strong></p>');
    sections.push(
      `<ul>${references
        .map((ref) => {
          const trimmed = ref.trim();
          if (!trimmed) return '';
          const escaped = escapeHtml(trimmed);
          return `<li><a href="${escaped}" target="_blank" rel="noreferrer noopener">${escaped}</a></li>`;
        })
        .filter((entry) => entry.length > 0)
        .join('')}</ul>`,
    );
  }

  return sections.join('');
};

export const letterHtmlToPlainText = (value: string): string => normalisePlainText(value);

const buildAddressLines = (input: {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  line3?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
}): string[] => {
  const lines: string[] = [];
  const push = (raw?: string | null) => {
    if (typeof raw !== 'string') return;
    const trimmed = raw.trim();
    if (trimmed.length > 0) {
      lines.push(trimmed);
    }
  };

  push(input.name);
  push(input.line1);
  push(input.line2);
  push(input.line3);

  const city = typeof input.city === 'string' ? input.city.trim() : '';
  const county = typeof input.county === 'string' ? input.county.trim() : '';
  const postcode = typeof input.postcode === 'string' ? input.postcode.trim() : '';

  const hasCity = city.length > 0;
  const hasCounty = county.length > 0;
  const hasPostcode = postcode.length > 0;

  if (hasCity && !hasCounty && hasPostcode) {
    lines.push(`${city} ${postcode}`.trim());
  } else {
    const locality = [city, county].filter((part) => part.length > 0).join(', ');
    if (locality.length > 0) {
      lines.push(locality);
    }
    if (hasPostcode) {
      lines.push(postcode);
    }
  }

  if (!hasCity && !hasCounty && hasPostcode && lines[lines.length - 1] !== postcode) {
    lines.push(postcode);
  }

  return lines;
};

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const formatDisplayDate = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }
  const [year, month, day] = trimmed.split('-');
  if (!year || !month || !day) return trimmed;
  return `${day}/${month}/${year}`;
};

const shouldAppendSenderAddress = (
  letterHtml: string,
  senderLines: string[],
  senderName?: string | null,
): boolean => {
  const addressDetail = senderLines.filter((line) => line.trim().length > 0);
  return addressDetail.length > 0;
};

const normalisePlainText = (value: string | null | undefined): string => {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/(p|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
};
