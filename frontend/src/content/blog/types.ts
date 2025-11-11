export type AssetSlug = 'constituency-contact-checklist' | 'mp-letter-template';

export type BlogPostFAQ = {
  question: string;
  answer: string;
};

export type BlogPostStep = {
  title: string;
  description: string[];
};

export type BlogPostTemplate = {
  heading: string;
  description: string;
  body: string;
};

export type BlogPostSection = {
  id: string;
  title: string;
  content: string[];
  steps?: BlogPostStep[];
  checklist?: string[];
  template?: BlogPostTemplate;
  callout?: string;
};

export type BlogPostAsset = {
  slug: AssetSlug;
  title: string;
  description: string;
};

export type BlogPost = {
  slug: string;
  title: string;
  heroKicker: string;
  heroDescription: string;
  excerpt: string;
  publishedAt: string;
  updatedAt?: string;
  readingTimeMinutes: number;
  wordCount: number;
  introduction: string[];
  sections: BlogPostSection[];
  faqs: BlogPostFAQ[];
  assets: BlogPostAsset[];
  relatedLinks: Array<{ label: string; href: string }>;
};
