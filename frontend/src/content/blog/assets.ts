import type { AssetSlug, BlogPostAsset } from './types';

export const assetLibrary: Record<AssetSlug, BlogPostAsset & { downloadPath: string }> = {
  'constituency-contact-checklist': {
    slug: 'constituency-contact-checklist',
    title: 'Constituency Contact Checklist',
    description: 'A ten-point checklist to confirm every contact detail before you write to your MP.',
    downloadPath: '/assets/templates/constituency-contact-checklist.txt',
  },
  'mp-letter-template': {
    slug: 'mp-letter-template',
    title: 'Persuasive MP Letter Template',
    description: 'A ready-to-customise structure covering opening, evidence, and the specific request you want your MP to action.',
    downloadPath: '/assets/templates/mp-letter-template.txt',
  },
};

export const getAssetBySlug = (slug: AssetSlug) => assetLibrary[slug];
