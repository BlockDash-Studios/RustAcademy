import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, relative } from 'path';
import { PromptTemplateService } from './prompt-template.service';

describe('PromptTemplateService reloads', () => {
  let fixtureDirectory: string;
  let configPath: string;
  let configuredPath: string;
  let service: PromptTemplateService;

  beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(process.cwd(), '.prompt-template-test-'));
    configPath = join(fixtureDirectory, 'templates.json');
    configuredPath = relative(process.cwd(), configPath);
    service = new PromptTemplateService({ get: jest.fn(() => configuredPath) } as any);
  });

  afterEach(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('keeps the last valid templates when a later reload is malformed', () => {
    writeFileSync(configPath, JSON.stringify({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [{ version: '2.0.0', description: 'Test', systemPrompt: 'Use the reloaded prompt.', approval: { status: 'approved' } }] },
    }));

    expect(service.reloadTemplates()).toBe(true);
    expect(service.getSystemPrompt('chat_tutor')).toBe('Use the reloaded prompt.');

    writeFileSync(configPath, '{not valid JSON');
    expect(service.reloadTemplates()).toBe(false);
    expect(service.getSystemPrompt('chat_tutor')).toBe('Use the reloaded prompt.');
    expect(service.getTemplateVersion('chat_tutor')).toBe('2.0.0');
  });

  it('rejects a path that escapes the application directory', () => {
    const traversalService = new PromptTemplateService({ get: jest.fn(() => '../templates.json') } as any);

    expect(traversalService.reloadTemplates()).toBe(false);
    expect(traversalService.getTemplateVersion('chat_tutor')).toBe('1.0.0');
  });

  it('does not activate a syntactically valid but structurally invalid config', () => {
    writeFileSync(configPath, JSON.stringify({
      schemaVersion: '1.0.0', templates: { chat_tutor: [{ version: '2.0.0' }] },
    }));

    expect(service.reloadTemplates()).toBe(false);
    expect(service.getTemplateVersion('chat_tutor')).toBe('1.0.0');
  });
});

describe('PromptTemplateService deep schema validation (BA-083 / #651)', () => {
  let fixtureDirectory: string;
  let configPath: string;
  let configuredPath: string;
  let service: PromptTemplateService;

  const validTemplate = () => ({
    version: '2.0.0',
    description: 'A valid description.',
    systemPrompt: 'A valid system prompt.',
    assistantRole: 'Tutor',
    approval: { status: 'approved', approvedBy: 'tester', approvedAt: '2026-01-01T00:00:00.000Z' },
  });

  const writeConfig = (config: unknown): boolean => {
    writeFileSync(configPath, JSON.stringify(config));
    return service.reloadTemplates();
  };

  beforeEach(() => {
    fixtureDirectory = mkdtempSync(join(process.cwd(), '.prompt-template-test-'));
    configPath = join(fixtureDirectory, 'templates.json');
    configuredPath = relative(process.cwd(), configPath);
    service = new PromptTemplateService({ get: jest.fn(() => configuredPath) } as any);
  });

  afterEach(() => {
    rmSync(fixtureDirectory, { recursive: true, force: true });
  });

  it('activates a well-formed external config', () => {
    const ok = writeConfig({
      schemaVersion: '1.2.3',
      templates: { chat_tutor: [validTemplate()] },
    });
    expect(ok).toBe(true);
    expect(service.getTemplateVersion('chat_tutor')).toBe('2.0.0');
  });

  it('rejects an invalid schema version format', () => {
    const ok = writeConfig({
      schemaVersion: 'v1.0',
      templates: { chat_tutor: [validTemplate()] },
    });
    expect(ok).toBe(false);
    expect(service.getTemplateVersion('chat_tutor')).toBe('1.0.0');
  });

  it('rejects a malformed template name', () => {
    const ok = writeConfig({
      schemaVersion: '1.0.0',
      templates: { 'bad name!': [validTemplate()] },
    });
    expect(ok).toBe(false);
  });

  it('rejects an invalid template version format', () => {
    const ok = writeConfig({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [{ ...validTemplate(), version: 'latest' }] },
    });
    expect(ok).toBe(false);
  });

  it('rejects empty required text fields', () => {
    const noDescription = writeConfig({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [{ ...validTemplate(), description: '   ' }] },
    });
    expect(noDescription).toBe(false);

    const noPrompt = writeConfig({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [{ ...validTemplate(), systemPrompt: '' }] },
    });
    expect(noPrompt).toBe(false);
  });

  it('rejects duplicate versions within a template array', () => {
    const ok = writeConfig({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [validTemplate(), { ...validTemplate() }] },
    });
    expect(ok).toBe(false);
  });

  it('rejects an invalid approval status', () => {
    const ok = writeConfig({
      schemaVersion: '1.0.0',
      templates: {
        chat_tutor: [{ ...validTemplate(), approval: { status: 'maybe' } }],
      },
    });
    expect(ok).toBe(false);
  });

  it('rejects array metadata', () => {
    const ok = writeConfig({
      schemaVersion: '1.0.0',
      templates: { chat_tutor: [{ ...validTemplate(), metadata: [] as any }] },
    });
    expect(ok).toBe(false);
  });
});
