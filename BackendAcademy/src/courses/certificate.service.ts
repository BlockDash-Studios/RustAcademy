import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

/**
 * Represents a generated course completion certificate.
 *
 * Each certificate carries a unique `verificationCode` that can be
 * used by external parties to verify authenticity without needing
 * on-chain access. The `shareableUrl` points to a public verification
 * endpoint (e.g. `/certificates/verify/:code`).
 */
export interface CertificateRecord {
  id: string;
  userId: string;
  courseId: string;
  courseTitle: string;
  userName?: string;
  issuedAt: Date;
  verificationCode: string;
  shareableUrl: string;
  xpAwarded: number;
  completionDate: string;
  status: 'active' | 'revoked';
}

/**
 * Summary of certificate issuance for reporting purposes.
 */
export interface CertificateIssuanceSummary {
  totalIssued: number;
  totalActive: number;
  totalRevoked: number;
  issuedByCourse: Array<{
    courseId: string;
    courseTitle: string;
    count: number;
  }>;
  recentIssuances: CertificateRecord[];
}

/**
 * Handles the full lifecycle of course completion certificates:
 *
 * 1. **Generation** — Creates a verifiable certificate record with a
 *    unique verification code and shareable URL when a course is
 *    completed.
 * 2. **Verification** — Allows external parties to look up and verify
 *    a certificate by its verification code.
 * 3. **Reporting** — Aggregates certificate issuance data for admin
 *    dashboards and audit trails.
 *
 * Certificates are stored in an in-memory store for now; production
 * deployments should persist them via TypeORM or a dedicated
 * certificate microservice.
 */
@Injectable()
export class CertificateService {
  private readonly logger = new Logger(CertificateService.name);
  private readonly certificates: Map<string, CertificateRecord> = new Map();
  private readonly byUser: Map<string, Set<string>> = new Map();
  private readonly byCourse: Map<string, Set<string>> = new Map();
  private readonly byVerificationCode: Map<string, string> = new Map();

  constructor(private readonly configService: ConfigService) {}

  /**
   * Generate a new certificate for a completed course.
   *
   * @returns The newly created certificate record.
   */
  async generateCertificate(params: {
    userId: string;
    courseId: string;
    courseTitle: string;
    userName?: string;
    xpAwarded: number;
  }): Promise<CertificateRecord> {
    const id = `cert_${uuidv4()}`;
    const verificationCode = this.generateVerificationCode();
    const baseUrl = this.configService.get<string>(
      'CERTIFICATE_BASE_URL',
      'https://rustacademy.xyz/certificates',
    );

    const certificate: CertificateRecord = {
      id,
      userId: params.userId,
      courseId: params.courseId,
      courseTitle: params.courseTitle,
      userName: params.userName,
      issuedAt: new Date(),
      verificationCode,
      shareableUrl: `${baseUrl}/verify/${verificationCode}`,
      xpAwarded: params.xpAwarded,
      completionDate: new Date().toISOString(),
      status: 'active',
    };

    this.certificates.set(id, certificate);

    // Maintain secondary indexes for fast lookup
    this.indexByUser(params.userId, id);
    this.indexByCourse(params.courseId, id);
    this.byVerificationCode.set(verificationCode, id);

    this.logger.log(
      `Certificate generated: ${id} for user=${params.userId}, course=${params.courseId}`,
    );

    return certificate;
  }

  /**
   * Retrieve a certificate by its internal ID.
   */
  getCertificate(id: string): CertificateRecord | null {
    return this.certificates.get(id) ?? null;
  }

  /**
   * Retrieve a certificate by its public verification code.
   * This is the primary lookup method for external verification.
   */
  getCertificateByVerificationCode(
    verificationCode: string,
  ): CertificateRecord | null {
    const id = this.byVerificationCode.get(verificationCode);
    if (!id) return null;
    return this.certificates.get(id) ?? null;
  }

  /**
   * List all certificates issued to a specific user.
   */
  listCertificatesByUser(userId: string): CertificateRecord[] {
    const ids = this.byUser.get(userId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.certificates.get(id))
      .filter((c): c is CertificateRecord => c !== undefined);
  }

  /**
   * List all certificates for a specific course.
   */
  listCertificatesByCourse(courseId: string): CertificateRecord[] {
    const ids = this.byCourse.get(courseId);
    if (!ids) return [];
    return Array.from(ids)
      .map((id) => this.certificates.get(id))
      .filter((c): c is CertificateRecord => c !== undefined);
  }

  /**
   * Revoke a certificate (e.g. for academic integrity violations).
   */
  revokeCertificate(id: string): CertificateRecord | null {
    const cert = this.certificates.get(id);
    if (!cert) return null;
    cert.status = 'revoked';
    return cert;
  }

  /**
   * Verify a certificate by its verification code and return a
   * human-readable verification result.
   */
  verifyCertificate(
    verificationCode: string,
  ): {
    valid: boolean;
    certificate?: CertificateRecord;
    reason?: string;
  } {
    const cert = this.getCertificateByVerificationCode(verificationCode);
    if (!cert) {
      return { valid: false, reason: 'Certificate not found' };
    }
    if (cert.status === 'revoked') {
      return { valid: false, certificate: cert, reason: 'Certificate has been revoked' };
    }
    return { valid: true, certificate: cert };
  }

  /**
   * Aggregate certificate issuance data for reporting.
   */
  getIssuanceSummary(): CertificateIssuanceSummary {
    const all = Array.from(this.certificates.values());
    const byCourseMap = new Map<string, { courseId: string; courseTitle: string; count: number }>();

    for (const cert of all) {
      const existing = byCourseMap.get(cert.courseId);
      if (existing) {
        existing.count++;
      } else {
        byCourseMap.set(cert.courseId, {
          courseId: cert.courseId,
          courseTitle: cert.courseTitle,
          count: 1,
        });
      }
    }

    const recentIssuances = [...all]
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .slice(0, 20);

    return {
      totalIssued: all.length,
      totalActive: all.filter((c) => c.status === 'active').length,
      totalRevoked: all.filter((c) => c.status === 'revoked').length,
      issuedByCourse: Array.from(byCourseMap.values()),
      recentIssuances,
    };
  }

  // ── Private helpers ─────────────────────────────────────

  /**
   * Generate a URL-safe verification code. Uses a shorter format than
   * UUID for easier sharing (12 characters, alphanumeric).
   */
  private generateVerificationCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const segments: string[] = [];
    for (let s = 0; s < 3; s++) {
      let segment = '';
      for (let i = 0; i < 4; i++) {
        segment += chars[Math.floor(Math.random() * chars.length)];
      }
      segments.push(segment);
    }
    return segments.join('-');
  }

  private indexByUser(userId: string, certId: string): void {
    let set = this.byUser.get(userId);
    if (!set) {
      set = new Set();
      this.byUser.set(userId, set);
    }
    set.add(certId);
  }

  private indexByCourse(courseId: string, certId: string): void {
    let set = this.byCourse.get(courseId);
    if (!set) {
      set = new Set();
      this.byCourse.set(courseId, set);
    }
    set.add(certId);
  }
}
