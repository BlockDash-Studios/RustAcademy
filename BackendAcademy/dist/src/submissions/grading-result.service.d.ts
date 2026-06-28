import { GradingResultRepository } from './grading-result.repository';
import { SubmissionService } from './submission.service';
import { GradingResultEntity } from './entities/grading-result.entity';
import { SaveGradingResultDto } from './dto/save-grading-result.dto';
export declare class GradingResultService {
    private readonly gradingResultRepo;
    private readonly submissionService;
    constructor(gradingResultRepo: GradingResultRepository, submissionService: SubmissionService);
    saveResult(submissionId: string, dto: SaveGradingResultDto): Promise<GradingResultEntity>;
    getResultsBySubmission(submissionId: string): Promise<GradingResultEntity[]>;
    getLatestResult(submissionId: string): Promise<GradingResultEntity | null>;
    getResultById(id: string): Promise<GradingResultEntity>;
    getResultsByGrader(graderId: string): Promise<GradingResultEntity[]>;
    deleteResult(id: string): Promise<void>;
    private toSubmissionStatus;
}
