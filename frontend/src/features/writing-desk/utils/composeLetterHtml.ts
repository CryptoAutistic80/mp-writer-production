export interface LetterRenderInput {
  mpName?: string | null;
  mpAddress1?: string | null;
  mpAddress2?: string | null;
  mpCity?: string | null;
  mpCounty?: string | null;
  mpPostcode?: string | null;
  date?: string | null;
  letterContentHtml?: string | null;
  senderName?: string | null;
  senderAddress1?: string | null;
  senderAddress2?: string | null;
  senderAddress3?: string | null;
  senderCity?: string | null;
  senderCounty?: string | null;
  senderPostcode?: string | null;
  references?: string[] | null;
}

export const composeLetterHtml = (input: LetterRenderInput): string => {
  const sections: string[] = [];
  const mpLines = buildAddressLines({
    name: input.mpName,
    line1: input.mpAddress1,
    line2: input.mpAddress2,
    line3: null,
    city: input.mpCity,
    county: input.mpCounty,
    postcode: input.mpPostcode,
  });

  if (mpLines.length > 0) {
    sections.push(`<p>${mpLines.map(escapeHtml).join('<br />')}</p>`);
  }

  const formattedDate = formatDisplayDate(input.date);
  if (formattedDate) {
    sections.push(`<p>${escapeHtml(formattedDate)}</p>`);
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
  if (addressDetail.length === 0) return false;
  const text = normalisePlainText(letterHtml);
  if (!text) return true;
  const lower = text.toLowerCase();
  const hasAddress = addressDetail.some((line) => lower.includes(line.trim().toLowerCase()));
  if (hasAddress) {
    return false;
  }
  if (typeof senderName === 'string' && senderName.trim().length > 0) {
    const name = senderName.trim().toLowerCase();
    if (!lower.includes(name)) {
      return true;
    }
  }
  return true;
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
