import type { LetterDocumentInput } from '../types/streaming.types';

interface LetterDocumentDependencies {
  normaliseTypography: (value: string) => string;
}

export function buildLetterDocumentHtml(
  input: LetterDocumentInput,
  deps: LetterDocumentDependencies,
): string {
  const normalise = (value: string | null | undefined): string =>
    typeof value === 'string' ? deps.normaliseTypography(value) : '';

  const sections: string[] = [];
  const mpLines = buildAddressLines({
    name: normalise(input.mpName),
    line1: normalise(input.mpAddress1),
    line2: normalise(input.mpAddress2),
    line3: null,
    city: normalise(input.mpCity),
    county: normalise(input.mpCounty),
    postcode: normalise(input.mpPostcode),
  });
  if (mpLines.length > 0) {
    sections.push(`<p>${mpLines.map((line) => escapeLetterHtml(line)).join('<br />')}</p>`);
  }

  const formattedDate = formatLetterDisplayDate(normalise(input.date));
  if (formattedDate) {
    sections.push(`<p>${escapeLetterHtml(formattedDate)}</p>`);
  }

  const subjectLineHtml = normalise(input.subjectLineHtml).trim();
  if (subjectLineHtml.length > 0) {
    sections.push(subjectLineHtml);
  }

  const letterContentHtml = normalise(input.letterContentHtml);
  if (letterContentHtml) {
    sections.push(letterContentHtml);
  }

  const senderName = normalise(input.senderName).trim();
  const senderLines = buildAddressLines({
    name: null,
    line1: normalise(input.senderAddress1),
    line2: normalise(input.senderAddress2),
    line3: normalise(input.senderAddress3),
    city: normalise(input.senderCity),
    county: normalise(input.senderCounty),
    postcode: normalise(input.senderPostcode),
  });

  const hasAddressDetail = senderLines.some((line) => line.trim().length > 0);
  if (
    hasAddressDetail &&
    shouldAppendSenderAddress(letterContentHtml, senderLines, senderName, deps.normaliseTypography)
  ) {
    sections.push(`<p>${senderLines.map((line) => escapeLetterHtml(line)).join('<br />')}</p>`);
  }

  const telephone = normalise(input.senderTelephone).trim();
  if (telephone.length > 0) {
    sections.push(`<p>Tel: ${escapeLetterHtml(telephone)}</p>`);
  }

  const references = Array.isArray(input.references)
    ? input.references
        .filter((ref) => typeof ref === 'string' && ref.trim().length > 0)
        .map((ref) => deps.normaliseTypography(ref))
    : [];
  if (references.length > 0) {
    sections.push('<p><strong>References</strong></p>');
    sections.push(
      `<ul>${references
        .map((ref) => {
          const trimmed = ref.trim();
          if (!trimmed) return '';
          // Don't escape the URL for the href attribute, but escape the display text
          const displayText = escapeLetterHtml(trimmed);
          return `<li><a href="${trimmed}" target="_blank" rel="noreferrer noopener">${displayText}</a></li>`;
        })
        .filter((entry) => entry.length > 0)
        .join('')}</ul>`,
    );
  }

  return sections.join('');
}

interface AddressLinesInput {
  name?: string | null;
  line1?: string | null;
  line2?: string | null;
  line3?: string | null;
  city?: string | null;
  county?: string | null;
  postcode?: string | null;
}

function buildAddressLines(input: AddressLinesInput): string[] {
  const lines: string[] = [];
  const push = (value?: string | null) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
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
}

function escapeLetterHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatLetterDisplayDate(value: string | null | undefined): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(trimmed);
  if (!isoMatch) {
    return trimmed;
  }
  const [year, month, day] = trimmed.split('-');
  if (!year || !month || !day) return trimmed;
  return `${day}/${month}/${year}`;
}

function shouldAppendSenderAddress(
  letterHtml: string,
  senderLines: string[],
  senderName: string | null | undefined,
  normaliseTypography: (value: string) => string,
): boolean {
  const addressDetail = senderLines.filter((line) => line.trim().length > 0);
  if (addressDetail.length === 0) return false;
  const text = normaliseLetterPlainText(letterHtml, normaliseTypography);
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
}

function normaliseLetterPlainText(
  value: string | null | undefined,
  normaliseTypography: (value: string) => string,
): string {
  if (typeof value !== 'string') return '';
  const normalised = normaliseTypography(value);
  return normalised
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
}
