import { Injectable, NotFoundException, ConflictException, InternalServerErrorException } from "@nestjs/common";
import { PayoutRepository } from "./payout.repository";
import { PayoutDto } from "./dto/payout.dto";
import { Payout, PayoutStatus } from "./entities/payout.entity";

@Injectable()
export class PaymentsService {
  constructor(private payoutRepository: PayoutRepository) {}

  async createPayout(payoutDto: PayoutDto): Promise<Payout> {
    // TODO: Add balance check
    // TODO: Add duplicate check

    try {
      const payout = await this.payoutRepository.create(payoutDto);
      return payout;
    } catch (error) {
      throw new InternalServerErrorException("Error creating payout");
    }
  }

  async releasePayout(payoutId: string): Promise<Payout> {
    const payout = await this.payoutRepository.findOne(payoutId);

    if (!payout) {
      throw new NotFoundException(`Payout with ID "${payoutId}" not found`);
    }

    if (payout.status !== PayoutStatus.Pending) {
      throw new ConflictException(
        `Payout with ID "${payoutId}" is not pending`,
      );
    }

    // TODO: Implement payout release logic

    payout.status = PayoutStatus.Released;
    const updated = await this.payoutRepository.save(payout);

    return updated;
  }
}
