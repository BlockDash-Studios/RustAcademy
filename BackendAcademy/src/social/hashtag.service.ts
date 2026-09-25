import { Injectable } from '@nestjs/common';
import { HashtagOccurrence, TrendingHashtag } from './social.types';

/**
 * Matches a hashtag: `#` followed by a letter, then letters/digits/underscore.
 *
 * Requiring a leading letter keeps `#1`, `#2026` and bare `#` out of the index.
 * The boundary check is done in `parse` rather than here so `a#rust` (mid-word)
 * is not treated as a tag.
 */
const HASHTAG = /#([a-z][a-z0-9_]*)/gi;

/** Hours after which a single occurrence contributes half of its original weight. */
export const TRENDING_HALF_LIFE_HOURS = 24;

const MS_PER_HOUR = 60 * 60 * 1000;

@Injectable()
export class HashtagService {
  /** tag → occurrences, newest appended. */
  private readonly index = new Map<string, HashtagOccurrence[]>();

  /**
   * Extracts normalised, de-duplicated tags from post text (BE-090).
   *
   * Tags are lower-cased so `#Rust` and `#rust` are one tag, and de-duplicated
   * per post so repeating a tag in one post cannot inflate its trend score.
   */
  parse(text: string): string[] {
    const found = new Set<string>();

    for (const match of text.matchAll(HASHTAG)) {
      const index = match.index ?? 0;
      // Reject mid-word matches like `a#rust`: the character before `#` must be
      // absent or a non-word character.
      const preceding = index > 0 ? text[index - 1] : '';
      if (preceding && /[a-z0-9_]/i.test(preceding)) continue;

      found.add(match[1].toLowerCase());
    }

    return [...found];
  }

  /** Indexes every tag in `text` against `postId`. Returns the tags indexed. */
  indexPost(postId: string, text: string, at: Date = new Date()): string[] {
    const tags = this.parse(text);

    for (const tag of tags) {
      const occurrences = this.index.get(tag) ?? [];
      occurrences.push({ tag, postId, occurredAt: at.toISOString() });
      this.index.set(tag, occurrences);
    }

    return tags;
  }

  getPostCount(tag: string): number {
    return this.index.get(tag.toLowerCase())?.length ?? 0;
  }

  getPosts(tag: string): string[] {
    return (this.index.get(tag.toLowerCase()) ?? []).map((o) => o.postId);
  }

  /**
   * Weight of one occurrence under exponential decay.
   *
   * `0.5 ** (age / halfLife)`: exactly `1` when fresh, exactly `0.5` at one
   * half-life, `0.25` at two. Expressed as a half-life rather than a raw lambda
   * because the half-life is the number a maintainer actually wants to tune, and
   * it makes the expected values in the tests obvious.
   *
   * Occurrences in the future (clock skew) are clamped to weight `1` rather than
   * allowed to score above it.
   */
  decayWeight(occurredAt: Date, now: Date): number {
    const ageHours = (now.getTime() - occurredAt.getTime()) / MS_PER_HOUR;
    if (ageHours <= 0) return 1;
    return 0.5 ** (ageHours / TRENDING_HALF_LIFE_HOURS);
  }

  /**
   * Top-N tags by decayed score (BE-090).
   *
   * `now` is a parameter rather than read from the clock so the decay maths is
   * deterministic under test.
   */
  getTrending(limit = 5, now: Date = new Date()): TrendingHashtag[] {
    const scored: TrendingHashtag[] = [];

    for (const [tag, occurrences] of this.index) {
      let score = 0;
      for (const occurrence of occurrences) {
        score += this.decayWeight(new Date(occurrence.occurredAt), now);
      }
      scored.push({ tag, score, postCount: occurrences.length });
    }

    return scored
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        // Alphabetical tiebreak keeps the endpoint deterministic.
        return a.tag.localeCompare(b.tag);
      })
      .slice(0, limit);
  }
}
