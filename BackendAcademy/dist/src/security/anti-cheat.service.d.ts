import { AntiCheatResult } from './interfaces/anti-cheat.interface';
import { CheckSubmissionDto } from './dto/check-submission.dto';
export declare class AntiCheatService {
    private readonly logger;
    analyzeSubmission(dto: CheckSubmissionDto): Promise<AntiCheatResult>;
    analyzeSubmissions(dtos: CheckSubmissionDto[]): Promise<AntiCheatResult[]>;
}
