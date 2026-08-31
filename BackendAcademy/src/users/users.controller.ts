import { Body, Controller, Param, Put } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdateUserPreferencesDto } from './dto/update-preferences.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Put(':userId/preferences')
  async updatePreferences(
    @Param('userId') userId: string,
    @Body() dto: UpdateUserPreferencesDto,
  ): Promise<ReturnType<UsersService['updatePreferences']>> {
    return this.usersService.updatePreferences(userId, dto);
  }
}
