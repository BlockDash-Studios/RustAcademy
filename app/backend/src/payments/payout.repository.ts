import { EntityRepository, Repository } from "typeorm";
import { Payout } from "./entities/payout.entity";

@EntityRepository(Payout)
export class PayoutRepository extends Repository<Payout> {}
