import { HashtagService, TRENDING_HALF_LIFE_HOURS } from './hashtag.service';

const HOUR = 60 * 60 * 1000;
const at = (hoursAgo: number, from = Date.parse('2026-09-25T12:00:00Z')) =>
  new Date(from - hoursAgo * HOUR);
const NOW = new Date('2026-09-25T12:00:00Z');

describe('HashtagService', () => {
  let service: HashtagService;

  beforeEach(() => {
    service = new HashtagService();
  });

  describe('parsing', () => {
    it('extracts the project tags', () => {
      const tags = service.parse('Learning #rust and #soroban on #stellar for #web3 #rustlang');
      expect(tags.sort()).toEqual(['rust', 'rustlang', 'soroban', 'stellar', 'web3']);
    });

    it('normalises case so one tag is one tag', () => {
      expect(service.parse('#Rust #RUST #rust')).toEqual(['rust']);
    });

    it('de-duplicates within a post so repetition cannot inflate a trend', () => {
      expect(service.parse('#rust #rust #rust')).toEqual(['rust']);
    });

    it('ignores a bare hash and numeric-leading tags', () => {
      expect(service.parse('# #1 #2026')).toEqual([]);
    });

    it('ignores mid-word hashes', () => {
      expect(service.parse('a#rust code#soroban')).toEqual([]);
    });

    it('accepts digits and underscores after the first letter', () => {
      expect(service.parse('#rust2024 #no_std').sort()).toEqual(['no_std', 'rust2024']);
    });

    it('stops a tag at punctuation', () => {
      expect(service.parse('great #rust, really #soroban!').sort()).toEqual([
        'rust',
        'soroban',
      ]);
    });

    it('returns nothing for text without tags', () => {
      expect(service.parse('no tags here')).toEqual([]);
    });
  });

  describe('indexing', () => {
    it('indexes a post under each of its tags', () => {
      service.indexPost('post-1', 'shipping #rust and #soroban', NOW);

      expect(service.getPostCount('rust')).toBe(1);
      expect(service.getPostCount('soroban')).toBe(1);
      expect(service.getPosts('rust')).toEqual(['post-1']);
    });

    it('accumulates across posts', () => {
      service.indexPost('post-1', '#rust', NOW);
      service.indexPost('post-2', '#rust', NOW);

      expect(service.getPostCount('rust')).toBe(2);
      expect(service.getPosts('rust')).toEqual(['post-1', 'post-2']);
    });

    it('looks up case-insensitively', () => {
      service.indexPost('post-1', '#Rust', NOW);
      expect(service.getPostCount('RUST')).toBe(1);
    });

    it('reports zero for an unknown tag', () => {
      expect(service.getPostCount('nope')).toBe(0);
      expect(service.getPosts('nope')).toEqual([]);
    });
  });

  describe('decay maths', () => {
    it('weights a fresh occurrence at 1', () => {
      expect(service.decayWeight(NOW, NOW)).toBe(1);
    });

    it('weights an occurrence at exactly one half-life at 0.5', () => {
      expect(service.decayWeight(at(TRENDING_HALF_LIFE_HOURS), NOW)).toBeCloseTo(0.5, 10);
    });

    it('weights two half-lives at 0.25', () => {
      expect(service.decayWeight(at(TRENDING_HALF_LIFE_HOURS * 2), NOW)).toBeCloseTo(0.25, 10);
    });

    it('weights three half-lives at 0.125', () => {
      expect(service.decayWeight(at(TRENDING_HALF_LIFE_HOURS * 3), NOW)).toBeCloseTo(
        0.125,
        10,
      );
    });

    it('decays monotonically with age', () => {
      const weights = [0, 6, 12, 24, 48, 96].map((h) => service.decayWeight(at(h), NOW));
      for (let i = 1; i < weights.length; i++) {
        expect(weights[i]).toBeLessThan(weights[i - 1]);
      }
    });

    it('clamps a future occurrence to 1 rather than scoring above it', () => {
      const future = new Date(NOW.getTime() + 5 * HOUR);
      expect(service.decayWeight(future, NOW)).toBe(1);
    });
  });

  describe('trending', () => {
    it('ranks a fresh tag above an older one with the same raw count', () => {
      service.indexPost('old-1', '#soroban', at(TRENDING_HALF_LIFE_HOURS * 2));
      service.indexPost('new-1', '#rust', NOW);

      const trending = service.getTrending(5, NOW);

      expect(trending[0].tag).toBe('rust');
      expect(trending[0].score).toBeCloseTo(1, 10);
      expect(trending[1].tag).toBe('soroban');
      expect(trending[1].score).toBeCloseTo(0.25, 10);
      // Raw counts are equal — only decay separates them.
      expect(trending[0].postCount).toBe(trending[1].postCount);
    });

    it('sums decayed weights across occurrences', () => {
      service.indexPost('p1', '#rust', NOW);
      service.indexPost('p2', '#rust', at(TRENDING_HALF_LIFE_HOURS));

      const [rust] = service.getTrending(1, NOW);
      expect(rust.score).toBeCloseTo(1.5, 10);
      expect(rust.postCount).toBe(2);
    });

    it('can rank an older but busier tag above a fresh single post', () => {
      // Four posts at one half-life = 4 * 0.5 = 2.0, versus one fresh post = 1.0.
      for (const id of ['a', 'b', 'c', 'd']) {
        service.indexPost(id, '#soroban', at(TRENDING_HALF_LIFE_HOURS));
      }
      service.indexPost('e', '#rust', NOW);

      const trending = service.getTrending(5, NOW);
      expect(trending[0].tag).toBe('soroban');
      expect(trending[0].score).toBeCloseTo(2, 10);
    });

    it('returns at most the requested top-N', () => {
      service.indexPost('p', '#rust #soroban #stellar #web3 #rustlang', NOW);
      expect(service.getTrending(3, NOW)).toHaveLength(3);
    });

    it('breaks score ties alphabetically so the endpoint is deterministic', () => {
      service.indexPost('p', '#stellar #rust #soroban', NOW);

      const tags = service.getTrending(3, NOW).map((t) => t.tag);
      expect(tags).toEqual(['rust', 'soroban', 'stellar']);
    });

    it('returns an empty list before anything is indexed', () => {
      expect(service.getTrending(5, NOW)).toEqual([]);
    });
  });
});
