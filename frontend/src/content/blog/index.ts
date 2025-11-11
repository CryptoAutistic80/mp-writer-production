import { howToFindYourMp } from './how-to-find-your-mp';
import { writeAnEffectiveMpLetter } from './write-an-effective-mp-letter';
import { assetLibrary } from './assets';
import type { AssetSlug, BlogPost } from './types';

export const blogPosts: BlogPost[] = [howToFindYourMp, writeAnEffectiveMpLetter];

export const getBlogPost = (slug: string) => blogPosts.find((post) => post.slug === slug);

export const getAssetDownloadPath = (slug: AssetSlug) => assetLibrary[slug].downloadPath;
