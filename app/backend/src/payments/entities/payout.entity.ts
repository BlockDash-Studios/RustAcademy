import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from "typeorm";

export enum PayoutStatus {
  Pending = "pending",
  Released = "released",
  Failed = "failed",
}

@Entity()
export class Payout {
  @PrimaryGeneratedColumn("uuid")
  id: string;

  @Column()
  destinationAddress: string;

  @Column()
  amount: number;

  @Column({
    type: "enum",
    enum: PayoutStatus,
    default: PayoutStatus.Pending,
  })
  status: PayoutStatus;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
