import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminService } from './admin.service';
import { LocalizationService } from '../i18n/localization.service';
import { JwtAdminGuard, RolesGuard, Roles, UserRole } from '../auth';

@Controller('admin')
@UseGuards(JwtAdminGuard, RolesGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly l10n: LocalizationService,
  ) {}

  @Get('analytics/summary')
  @Roles(UserRole.ADMIN)
  async getDashboardSummary() {
    const summary = await this.adminService.getDashboardSummary();
    return {
      labels: {
        title: this.l10n.t('admin.dashboard.title'),
        totalUsers: this.l10n.t('admin.dashboard.totalUsers'),
        activeTutors: this.l10n.t('admin.dashboard.activeTutors'),
        totalCourses: this.l10n.t('admin.dashboard.totalCourses'),
        completionRate: this.l10n.t('admin.dashboard.completionRate'),
      },
      data: summary,
    };
  }
}