import { CertificateService } from './certificate.service';

function createService() {
  return new CertificateService({
    get: (key: string, fallback: string) => fallback,
  } as any);
}

describe('CertificateService', () => {
  let service: CertificateService;

  beforeEach(() => {
    service = createService();
  });

  it('generates a certificate with expected fields', async () => {
    const cert = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    expect(cert.id).toMatch(/^cert_/);
    expect(cert.userId).toBe('user-1');
    expect(cert.courseId).toBe('course-1');
    expect(cert.courseTitle).toBe('Rust 101');
    expect(cert.xpAwarded).toBe(50);
    expect(cert.status).toBe('active');
    expect(cert.verificationCode).toBeDefined();
    expect(cert.shareableUrl).toContain('/verify/');
    expect(cert.issuedAt).toBeInstanceOf(Date);
  });

  it('is idempotent: returning the same certificate for repeated calls', async () => {
    const first = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    const second = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    expect(second.id).toBe(first.id);
    expect(second.verificationCode).toBe(first.verificationCode);
    expect(second.issuedAt).toBe(first.issuedAt);
  });

  it('creates separate certificates for different users on the same course', async () => {
    const a = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    const b = await service.generateCertificate({
      userId: 'user-2',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    expect(b.id).not.toBe(a.id);
  });

  it('creates separate certificates for the same user on different courses', async () => {
    const a = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    const b = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-2',
      courseTitle: 'Rust 201',
      xpAwarded: 100,
    });

    expect(b.id).not.toBe(a.id);
  });

  it('creates a new certificate after the existing one is revoked', async () => {
    const first = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    service.revokeCertificate(first.id);

    const second = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    // New certificate is created since the old one was revoked
    expect(second.id).not.toBe(first.id);
    expect(second.status).toBe('active');
  });

  it('verifies a valid certificate', async () => {
    const cert = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    const result = service.verifyCertificate(cert.verificationCode);
    expect(result.valid).toBe(true);
    expect(result.certificate?.id).toBe(cert.id);
  });

  it('rejects verification for a revoked certificate', async () => {
    const cert = await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });

    service.revokeCertificate(cert.id);

    const result = service.verifyCertificate(cert.verificationCode);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Certificate has been revoked');
  });

  it('returns issuance summary with correct counts', async () => {
    await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });
    await service.generateCertificate({
      userId: 'user-2',
      courseId: 'course-1',
      courseTitle: 'Rust 101',
      xpAwarded: 50,
    });
    await service.generateCertificate({
      userId: 'user-1',
      courseId: 'course-2',
      courseTitle: 'Rust 201',
      xpAwarded: 100,
    });

    const summary = service.getIssuanceSummary();
    expect(summary.totalIssued).toBe(3);
    expect(summary.totalActive).toBe(3);
    expect(summary.issuedByCourse).toHaveLength(2);
  });
});
