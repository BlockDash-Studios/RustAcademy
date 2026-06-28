import { AntiCheatService } from './anti-cheat.service';
import { CheckSubmissionDto } from './dto/check-submission.dto';
import { AntiCheatResult } from './interfaces/anti-cheat.interface';
export declare class AntiCheatController {
    private readonly antiCheatService;
    constructor(antiCheatService: AntiCheatService);
    check(dto: CheckSubmissionDto): Promise<AntiCheatResult>;
    checkBatch(dtos: CheckSubmissionDto[]): Promise<AntiCheatResult[]>;
}
