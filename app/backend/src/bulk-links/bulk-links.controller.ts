<<<<<<< HEAD
import { Controller, Post, UploadedFile, UseInterceptors, Body } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { BulkLinksService } from "./bulk-links.service";
import { parseCSV } from "../utils/csv-parser";

@Controller("bulk-links")
export class BulkLinksController {
  constructor(private readonly service: BulkLinksService) {}

  @Post("csv")
  @UseInterceptors(FileInterceptor("file"))
  async uploadCSV(@UploadedFile() file: Express.Multer.File) {
    const payments = parseCSV(file.buffer);
    return this.service.generateLinks(payments);
  }

  @Post("json")
  async uploadJSON(@Body() payments: Array<{ email: string; amount: number; asset: string }>) {
    return this.service.generateLinks(payments);
  }
}
=======
import {
  Controller,
  Post,
  Body,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { parse } from 'csv-parse/sync';
import { Express } from 'express'; // ✅ FIX 1
import { BulkLinksService } from './bulk-links.service';
import { CreateBulkLinkDto } from './dto/create-bulk-link.dto';

type CsvRow = {
  customerName: string;
  email: string;
  amount: string;
  reference?: string;
};

@Controller('bulk-links')
export class BulkLinksController {
  constructor(private readonly service: BulkLinksService) {}

  // JSON Endpoint
  @Post('json')
  async createFromJson(@Body() body: CreateBulkLinkDto[]) {
    if (!Array.isArray(body)) {
      throw new BadRequestException('Invalid JSON payload');
    }

    return this.service.processBulk(body);
  }

  // CSV Endpoint
  @Post('csv')
  @UseInterceptors(FileInterceptor('file'))
  async createFromCsv(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('CSV file required');
    }

    const rawRecords = parse(file.buffer, {
      columns: true,
      skip_empty_lines: true,
    });

    // ✅ FIX 2: transform + type
    const records: CreateBulkLinkDto[] = (rawRecords as CsvRow[]).map((r) => ({
  customerName: r.customerName,
  email: r.email,
  amount: Number(r.amount),
  reference: r.reference,
}));

    return this.service.processBulk(records);
  }
}
>>>>>>> 40e8c1e (feat(payments): add bulk payment link generation module)
