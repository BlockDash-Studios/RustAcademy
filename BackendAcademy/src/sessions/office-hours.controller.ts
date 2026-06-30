import { Controller, Get, Post, Put, Delete, Body, Param, Query } from '@nestjs/common';
import { OfficeHoursService } from './office-hours.service';
import { CreateOfficeHoursDto } from './dto/create-office-hours.dto';
import { ListOfficeHoursDto } from './dto/list-office-hours.dto';

@Controller('office-hours')
export class OfficeHoursController {
  constructor(private readonly officeHoursService: OfficeHoursService) {}

  @Post()
  async create(@Body() dto: CreateOfficeHoursDto) {
    return this.officeHoursService.create(dto);
  }

  @Get()
  async findAll(@Query() filters?: ListOfficeHoursDto) {
    return this.officeHoursService.findAll(filters);
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.officeHoursService.findById(id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() dto: Partial<CreateOfficeHoursDto>) {
    return this.officeHoursService.update(id, dto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.officeHoursService.remove(id);
  }

  @Post(':id/book')
  async bookSlot(@Param('id') id: string) {
    return this.officeHoursService.bookSlot(id);
  }

  @Post(':id/cancel')
  async cancelBooking(@Param('id') id: string) {
    return this.officeHoursService.cancelBooking(id);
  }
}
