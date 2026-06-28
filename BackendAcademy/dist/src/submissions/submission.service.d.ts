import { SubmissionEntity } from './submission.entity';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';
export declare class SubmissionService {
    private readonly submissions;
    create(dto: CreateSubmissionDto): Promise<SubmissionEntity>;
    findAll(): Promise<SubmissionEntity[]>;
    findById(id: string): Promise<SubmissionEntity | null>;
    findByTaskId(taskId: string): Promise<SubmissionEntity[]>;
    findByUserId(userId: string): Promise<SubmissionEntity[]>;
    findByStatus(status: SubmissionStatus): Promise<SubmissionEntity[]>;
    update(id: string, dto: UpdateSubmissionDto): Promise<SubmissionEntity | null>;
    review(id: string, reviewerId: string, status: SubmissionStatus, feedback?: string, score?: number): Promise<SubmissionEntity>;
    remove(id: string): Promise<boolean>;
}
