import { SubmissionService } from './submission.service';
import { GradingResultService } from './grading-result.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { UpdateSubmissionDto } from './dto/update-submission.dto';
import { SaveGradingResultDto } from './dto/save-grading-result.dto';
import { SubmissionStatus } from './interfaces/submission-status.enum';
export declare class SubmissionController {
    private readonly submissionService;
    private readonly gradingResultService;
    constructor(submissionService: SubmissionService, gradingResultService: GradingResultService);
    create(dto: CreateSubmissionDto): Promise<import("./submission.entity").SubmissionEntity>;
    findAll(): Promise<import("./submission.entity").SubmissionEntity[]>;
    findByTaskId(taskId: string): Promise<import("./submission.entity").SubmissionEntity[]>;
    findByUserId(userId: string): Promise<import("./submission.entity").SubmissionEntity[]>;
    findByStatus(status: SubmissionStatus): Promise<import("./submission.entity").SubmissionEntity[]>;
    findById(id: string): Promise<import("./submission.entity").SubmissionEntity>;
    update(id: string, dto: UpdateSubmissionDto): Promise<import("./submission.entity").SubmissionEntity>;
    review(id: string, reviewerId: string, status: SubmissionStatus, feedback?: string, score?: number): Promise<import("./submission.entity").SubmissionEntity>;
    remove(id: string): Promise<boolean>;
    saveGradingResult(id: string, dto: SaveGradingResultDto): Promise<import("./entities/grading-result.entity").GradingResultEntity>;
    getGradingResults(id: string): Promise<import("./entities/grading-result.entity").GradingResultEntity[]>;
    getLatestGradingResult(id: string): Promise<import("./entities/grading-result.entity").GradingResultEntity>;
    getGradingResultById(gradeId: string): Promise<import("./entities/grading-result.entity").GradingResultEntity>;
    deleteGradingResult(gradeId: string): Promise<void>;
}
