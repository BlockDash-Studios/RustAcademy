<<<<<<< HEAD
import { saveBulkLinks } from "./bulk-links.repository";
import { v4 as uuid } from "uuid";

export class BulkLinksService {
  async generateLinks(payments: Array<{ email: string; amount: number; asset: string }>) {
    const links = payments.map(p => ({
      id: uuid(),
      email: p.email,
      amount: p.amount,
      asset: p.asset,
      url: `${process.env.APP_URL}/pay/${uuid()}`,
      createdAt: new Date(),
    }));

    await saveBulkLinks(links);
    return links.map(l => l.url);
  }
}
=======
import { Injectable } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { CreateBulkLinkDto } from './dto/create-bulk-link.dto';

type PaymentLinkRecord = {
  id: string;
  customerName: string;
  email: string;
  amount: number;
  reference?: string;
  link: string;
  createdAt: Date;
};

@Injectable()
export class BulkLinksService {
  async processBulk(data: CreateBulkLinkDto[]): Promise<PaymentLinkRecord[]> {
  const links: PaymentLinkRecord[] = data.map((item) => {
    const id = uuidv4();

    return {
      id,
      ...item,
      link: `https://quickex.app/pay/${id}`,
      createdAt: new Date(),
    };
  });

  await this.saveToSupabase(links);

  return links;
}

private async saveToSupabase(records: PaymentLinkRecord[]) {    // Mock (replace later)
    console.log(`Saving ${records.length} records to Supabase`);

    return true;
  }
}
>>>>>>> 40e8c1e (feat(payments): add bulk payment link generation module)
