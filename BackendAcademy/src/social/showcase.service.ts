import { BadRequestException, Injectable } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';
import { FollowService } from './follow.service';
import { ShowcasePost } from './social.types';

let showcaseCounter = 0;

/**
 * Project showcase posts (BE-089).
 *
 * A showcase is a post plus three external references: a source repository, a
 * live demo, and the Soroban contract the project deploys. It is stored with
 * `kind: 'showcase'` and fanned out with that kind intact, which is what lets
 * feed rendering flag it without a second lookup.
 *
 * Contract ids are validated with `StrKey.isValidContract` from the Stellar SDK
 * rather than a hand-rolled regex: a `C…` strkey carries a CRC16 checksum, so
 * shape-only matching accepts ids that differ from a real one by a typo.
 */
@Injectable()
export class ShowcaseService {
  private readonly posts = new Map<string, ShowcasePost>();

  constructor(private readonly followService: FollowService) {}

  create(input: {
    authorId: string;
    title: string;
    repoUrl: string;
    demoUrl: string;
    contractId: string;
  }): ShowcasePost {
    this.assertHttpsUrl(input.repoUrl, 'repoUrl');
    this.assertHttpsUrl(input.demoUrl, 'demoUrl');
    this.assertContractId(input.contractId);

    showcaseCounter += 1;
    const post: ShowcasePost = {
      itemId: `showcase-${showcaseCounter}`,
      authorId: input.authorId,
      kind: 'showcase',
      title: input.title,
      repoUrl: input.repoUrl,
      demoUrl: input.demoUrl,
      contractId: input.contractId,
      createdAt: new Date().toISOString(),
    };

    this.posts.set(post.itemId, post);

    // Fan out with kind preserved so the feed can flag it (BE-089).
    this.followService.fanOut({
      itemId: post.itemId,
      authorId: post.authorId,
      kind: 'showcase',
      createdAt: post.createdAt,
    });

    return post;
  }

  get(itemId: string): ShowcasePost | undefined {
    return this.posts.get(itemId);
  }

  listByAuthor(authorId: string): ShowcasePost[] {
    return [...this.posts.values()].filter((post) => post.authorId === authorId);
  }

  /**
   * Rejects anything that is not an absolute `https:` URL.
   *
   * `http:` is refused too — a showcase link is rendered for other users, so a
   * plaintext link is a downgrade vector rather than a convenience.
   */
  private assertHttpsUrl(value: string, field: 'repoUrl' | 'demoUrl'): void {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException(`${field} must be an absolute URL`);
    }

    if (parsed.protocol !== 'https:') {
      throw new BadRequestException(`${field} must use https`);
    }
  }

  private assertContractId(contractId: string): void {
    if (!StrKey.isValidContract(contractId)) {
      throw new BadRequestException(
        'contractId must be a valid Soroban contract id (a 56-character strkey beginning with C)',
      );
    }
  }
}
