import { NotificationsService, BatchConfig, DedupConfig } from './notifications.service';
import { CreateNotificationDto } from './dto/create-notification.dto';
import {
  NotificationPriority,
  INotificationProvider,
  DeliveryResult,
  DeliveryContext,
  NOTIFICATION_PROVIDERS,
} from './interfaces/notification-provider.interface';
import { Notification } from './interfaces/notifications.interface';

// ── Helpers ────────────────────────────────────────────────

function createMockProvider(
  id = 'email',
  shouldFail = false,
): INotificationProvider {
  const sendFn = jest.fn(
    async (_n: Notification, _c: DeliveryContext): Promise<DeliveryResult> => ({
      success: !shouldFail,
      message: shouldFail ? 'delivery failed' : 'delivered',
      deliveredAt: new Date(),
    }),
  );
  return {
    providerId: id,
    providerName: `Mock ${id}`,
    send: sendFn,
    healthCheck: jest.fn(async () => true),
  };
}

function createMockL10n() {
  return { t: jest.fn((key: string) => key) } as any;
}

function createDto(overrides: Partial<CreateNotificationDto> = {}): CreateNotificationDto {
  return {
    userId: 'u1',
    type: 'in-app',
    title: 'Test',
    message: 'msg',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════
// Task 1: Notification Deduplication Keys
// ═══════════════════════════════════════════════════════════

describe('Notification deduplication (Task 1)', () => {
  let service: NotificationsService;

  beforeEach(() => {
    service = new NotificationsService(createMockL10n());
  });

  it('creates a notification when no eventKey is provided', () => {
    const n = service.create(createDto());
    expect(n.id).not.toBe('__duplicate__');
    expect(service.findAll()).toHaveLength(1);
  });

  it('creates a notification with a new eventKey', () => {
    const n = service.create(createDto({ eventKey: 'sub-graded:sub-1' }));
    expect(n.id).not.toBe('__duplicate__');
    expect(n.eventKey).toBe('sub-graded:sub-1');
    expect(service.findAll()).toHaveLength(1);
  });

  it('rejects a duplicate eventKey within the dedup window', () => {
    const dto = createDto({ eventKey: 'dup:1' });
    const first = service.create(dto);
    const second = service.create(dto);
    expect(first.id).not.toBe('__duplicate__');
    expect(second.id).toBe('__duplicate__');
    expect(service.findAll()).toHaveLength(1);
  });

  it('allows the same eventKey after the dedup window expires', async () => {
    service.configureDedup({ windowMs: 50 });
    const dto = createDto({ eventKey: 'expire:1' });
    service.create(dto);
    await new Promise((r) => setTimeout(r, 80));
    const second = service.create(dto);
    expect(second.id).not.toBe('__duplicate__');
    expect(service.findAll()).toHaveLength(2);
  });

  it('allows different eventKeys concurrently', () => {
    const n1 = service.create(createDto({ eventKey: 'key-a' }));
    const n2 = service.create(createDto({ eventKey: 'key-b' }));
    expect(n1.id).not.toBe('__duplicate__');
    expect(n2.id).not.toBe('__duplicate__');
    expect(service.findAll()).toHaveLength(2);
  });

  it('passes through duplicates when dedup is disabled', () => {
    service.configureDedup({ enabled: false });
    const dto = createDto({ eventKey: 'no-dedup' });
    const first = service.create(dto);
    const second = service.create(dto);
    expect(first.id).not.toBe('__duplicate__');
    expect(second.id).not.toBe('__duplicate__');
    expect(service.findAll()).toHaveLength(2);
  });

  it('returns a sentinel notification on duplicate', () => {
    const dto = createDto({ eventKey: 'sentinel', title: 'Original' });
    service.create(dto);
    const dup = service.create({ ...dto, title: 'Changed' });
    expect(dup.id).toBe('__duplicate__');
    expect(dup.eventKey).toBe('sentinel');
    expect(dup.isRead).toBe(true);
    expect(service.findAll()[0].title).toBe('Original');
  });

  it('configureDedup updates config', () => {
    service.configureDedup({ windowMs: 120_000, enabled: false });
    const cfg = service.getDedupConfig();
    expect(cfg.windowMs).toBe(120_000);
    expect(cfg.enabled).toBe(false);
  });

  it('getDedupWindowSize tracks active keys', () => {
    service.configureDedup({ enabled: true, windowMs: 60_000 });
    expect(service.getDedupWindowSize()).toBe(0);
    service.create(createDto({ eventKey: 'k1' }));
    expect(service.getDedupWindowSize()).toBe(1);
    service.create(createDto({ eventKey: 'k2' }));
    expect(service.getDedupWindowSize()).toBe(2);
  });

  it('dedup window purges expired keys', async () => {
    service.configureDedup({ windowMs: 30 });
    service.create(createDto({ eventKey: 'short' }));
    expect(service.getDedupWindowSize()).toBe(1);
    await new Promise((r) => setTimeout(r, 50));
    service.create(createDto({ eventKey: 'new' }));
    expect(service.getDedupWindowSize()).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════
// Task 2: Hardened email template interpolation
// ═══════════════════════════════════════════════════════════

describe('Email template hardening (Task 2)', () => {
  let escapeHtml: (raw: string) => string;
  let sanitiseTemplateValue: (value: string) => string;
  let stripDangerousHtml: (raw: string) => string;
  let EmailService: any;

  beforeAll(async () => {
    const mod = await import('./email.service');
    escapeHtml = mod.escapeHtml;
    sanitiseTemplateValue = mod.sanitiseTemplateValue;
    stripDangerousHtml = mod.stripDangerousHtml;
    EmailService = mod.EmailService;
  });

  describe('escapeHtml', () => {
    it('escapes ampersand', () => {
      expect(escapeHtml('a & b')).toBe('a &amp; b');
    });

    it('escapes angle brackets and forward slashes', () => {
      expect(escapeHtml('<b>bold</b>')).toBe('&lt;b&gt;bold&lt;&#x2F;b&gt;');
    });

    it('escapes double quotes', () => {
      expect(escapeHtml('say "hello"')).toBe('say &quot;hello&quot;');
    });

    it('escapes single quotes', () => {
      expect(escapeHtml("it's")).toBe("it&#x27;s");
    });

    it('escapes forward slash', () => {
      expect(escapeHtml('a/b')).toBe('a&#x2F;b');
    });

    it('returns clean text unchanged', () => {
      expect(escapeHtml('Hello World 123')).toBe('Hello World 123');
    });

    it('escapes multiple special chars', () => {
      expect(escapeHtml('<script>alert("xss")</script>')).toBe(
        '&lt;script&gt;alert(&quot;xss&quot;)&lt;&#x2F;script&gt;',
      );
    });
  });

  describe('stripDangerousHtml', () => {
    it('removes script tags', () => {
      expect(stripDangerousHtml('Hello <script>alert("xss")</script> World')).toBe('Hello  World');
    });

    it('removes script tags with attributes', () => {
      expect(stripDangerousHtml('A <script type="text/javascript" src="evil.js"></script> B')).toBe('A  B');
    });

    it('removes iframe tags', () => {
      expect(stripDangerousHtml('X <iframe src="evil.com"></iframe> Y')).toBe('X  Y');
    });

    it('removes object tags', () => {
      expect(stripDangerousHtml('X <object data="evil.swf"></object> Y')).toBe('X  Y');
    });

    it('removes embed tags', () => {
      expect(stripDangerousHtml('X <embed src="evil.swf"> Y')).toBe('X  Y');
    });

    it('strips javascript: URIs', () => {
      expect(stripDangerousHtml('click javascript:alert(1)')).toBe('click alert(1)');
    });

    it('handles case-insensitive script tags', () => {
      expect(stripDangerousHtml('<SCRIPT>alert(1)</SCRIPT>')).toBe('');
    });

    it('preserves safe HTML', () => {
      const input = '<b>Hello</b> <i>World</i>';
      expect(stripDangerousHtml(input)).toBe(input);
    });
  });

  describe('sanitiseTemplateValue', () => {
    it('strips and escapes dangerous content', () => {
      const result = sanitiseTemplateValue('<script>alert("xss")</script>Hello & goodbye');
      expect(result).not.toContain('<script>');
      expect(result).toContain('&amp;');
    });

    it('passes through safe text unchanged', () => {
      expect(sanitiseTemplateValue('Hello World')).toBe('Hello World');
    });

    it('escapes HTML entities in user names', () => {
      expect(sanitiseTemplateValue("O'Brien & Co")).toBe("O&#x27;Brien &amp; Co");
    });
  });

  describe('EmailService.renderTemplate', () => {
    let emailService: InstanceType<typeof EmailService>;

    beforeEach(() => {
      emailService = new EmailService();
    });

    it('replaces known placeholders with field values', () => {
      const result = emailService.renderTemplate(
        'Hello {{name}}, welcome to {{courseName}}!',
        { name: 'Alice', courseName: 'Rust 101' },
      );
      expect(result).toBe('Hello Alice, welcome to Rust 101!');
    });

    it('escapes HTML in field values', () => {
      const result = emailService.renderTemplate(
        'Hello {{name}}!',
        { name: '<img src=x onerror=alert(1)>' },
      );
      expect(result).not.toContain('<img');
      expect(result).toContain('&lt;img');
    });

    it('uses FALLBACKS for missing known fields', () => {
      expect(emailService.renderTemplate('Hello {{name}}!', {})).toBe(
        'Hello RustAcademy Learner!',
      );
    });

    it('uses [keyName] for unknown missing fields', () => {
      expect(emailService.renderTemplate('Score: {{unknownField}}', {})).toBe(
        'Score: [unknownField]',
      );
    });

    it('does not replace single-brace placeholders', () => {
      const result = emailService.renderTemplate(
        'Single {brace} stays, {{name}} replaced',
        { name: 'Bob' },
      );
      expect(result).toBe('Single {brace} stays, Bob replaced');
    });

    it('handles template with no placeholders', () => {
      expect(emailService.renderTemplate('No placeholders.', { name: 'A' })).toBe(
        'No placeholders.',
      );
    });
  });
});

// ═══════════════════════════════════════════════════════════
// Task 3: Concurrency-safe notification batching
// ═══════════════════════════════════════════════════════════

describe('Batch concurrency safety (Task 3)', () => {
  let service: NotificationsService;

  beforeEach(() => {
    service = new NotificationsService(createMockL10n());
    service.configureBatch({
      enabled: true,
      maxBatchSize: 5,
      batchWindowMs: 50_000, // large window so timer-based flush doesn't fire during tests
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const ctx: DeliveryContext = {
    userId: 'u1',
    priority: NotificationPriority.LOW,
  };

  function enqueue(count: number, keyPrefix = 'k') {
    const items: Notification[] = [];
    for (let i = 0; i < count; i++) {
      items.push(service.create(createDto({ eventKey: `${keyPrefix}${i}` })));
    }
    return items;
  }

  it('flushes when batch reaches maxBatchSize', async () => {
    const items = enqueue(5);
    for (const n of items) {
      await service.deliver(n, ctx);
    }
    // The 5th delivery triggers flush
    expect(service.getPendingBatchCount()).toBe(0);
  });

  it('returns empty result when batch is empty', async () => {
    const result = await service.flushBatch();
    expect(result.totalCount).toBe(0);
    expect(result.batchId).toBe('');
    expect(result.results).toHaveLength(0);
  });

  it('atomic swap: concurrent flushes do not double-deliver', async () => {
    // Manually populate the batch directly
    const items = enqueue(3, 'race');
    for (const n of items) {
      await service.deliver(n, ctx);
    }

    // Fire two flushes concurrently
    const p1 = service.flushBatch(ctx);
    const p2 = service.flushBatch(ctx);
    const [r1, r2] = await Promise.all([p1, p2]);

    const flushed = r1.totalCount > 0 ? r1 : r2;
    const skipped = r1.totalCount === 0 ? r1 : r2;

    expect(flushed.totalCount).toBe(3);
    expect(skipped.totalCount).toBe(0);
    expect(skipped.results).toHaveLength(0);
  });

  it('enqueues new notifications during an active flush', async () => {
    const items = enqueue(3, 'during');
    for (const n of items) {
      await service.deliver(n, ctx);
    }

    // Start flush (captures batch snapshot)
    const flushPromise = service.flushBatch(ctx);

    // Batch should now be empty (atomically claimed)
    expect(service.getPendingBatchCount()).toBe(0);

    // Enqueue more while flush is in progress
    const n4 = service.create(createDto({ eventKey: 'during-after' }));
    await service.deliver(n4, ctx);

    await flushPromise;

    // The new item should be in pending, not flushed with first batch
    expect(service.getPendingBatchCount()).toBe(1);
  });

  it('batch timer is cleared after flush', async () => {
    const n1 = service.create(createDto({ eventKey: 'timer1' }));
    await service.deliver(n1, ctx);

    expect(service.getPendingBatchCount()).toBe(1);

    await service.flushBatch(ctx);
    expect(service.getPendingBatchCount()).toBe(0);
  });

  it('size boundary: exactly maxBatchSize triggers flush', async () => {
    const items = enqueue(5, 'sz');
    for (let i = 0; i < 4; i++) {
      await service.deliver(items[i], ctx);
    }
    expect(service.getPendingBatchCount()).toBe(4);

    await service.deliver(items[4], ctx);
    expect(service.getPendingBatchCount()).toBe(0);
  });

  it('below size boundary: notifications stay queued', async () => {
    const items = enqueue(3, 'below');
    for (const n of items) {
      await service.deliver(n, ctx);
    }
    expect(service.getPendingBatchCount()).toBe(3);
  });
});
