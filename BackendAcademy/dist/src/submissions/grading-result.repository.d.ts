import { GradingResultEntity } from './entities/grading-result.entity';
export declare class GradingResultRepository {
    private readonly store;
    save(entity: GradingResultEntity): Promise<GradingResultEntity>;
    findById(id: string): Promise<GradingResultEntity | null>;
    findBySubmissionId(submissionId: string): Promise<GradingResultEntity[]>;
    findLatestBySubmissionId(submissionId: string): Promise<GradingResultEntity | null>;
    findByGraderId(graderId: string): Promise<GradingResultEntity[]>;
    delete(id: string): Promise<boolean>;
}
